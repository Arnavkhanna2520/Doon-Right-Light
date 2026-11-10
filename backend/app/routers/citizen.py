"""Public citizen reporting. Reports stay unverified until a moderator reviews them."""
from __future__ import annotations

import io
import math
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..config import get_settings
from ..db import get_db
from ..security import client_ip, ip_fingerprint, limiter

router = APIRouter(prefix="/api/reports", tags=["citizen reports"])

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no look-alike characters
DUPLICATE_RADIUS_M = 60
DUPLICATE_DAYS = 14
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def new_public_id() -> str:
    return "DRL-" + "".join(secrets.choice(ALPHABET) for _ in range(8))


def distance_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6_371_000 * math.asin(math.sqrt(a))


def save_photo(upload: UploadFile) -> str:
    """Validate by decoding the image, then re-encode it.

    Re-encoding strips EXIF metadata (including GPS position and device details)
    and guarantees the stored file is a real image, whatever its name claimed.
    """
    s = get_settings()
    raw = upload.file.read(s.max_photo_mb * 1024 * 1024 + 1)
    if len(raw) > s.max_photo_mb * 1024 * 1024:
        raise HTTPException(413, f"Photo is larger than {s.max_photo_mb} MB.")
    try:
        img = Image.open(io.BytesIO(raw))
        if img.format not in ALLOWED_FORMATS:
            raise HTTPException(415, "Photo must be a JPEG, PNG or WebP image.")
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(415, "The uploaded file is not a valid image.") from None
    img = img.convert("RGB")
    img.thumbnail((1600, 1600))
    name = f"{secrets.token_hex(16)}.jpg"
    (s.upload_dir / "reports").mkdir(parents=True, exist_ok=True)
    img.save(s.upload_dir / "reports" / name, "JPEG", quality=82)
    return f"reports/{name}"


@router.post("", status_code=201)
def submit_report(
    request: Request,
    category: str = Form(...),
    description: str = Form(..., min_length=10, max_length=2000),
    location_text: str = Form("", max_length=300),
    latitude: float | None = Form(None, ge=-90, le=90),
    longitude: float | None = Form(None, ge=-180, le=180),
    contact_name: str = Form("", max_length=120),
    contact_info: str = Form("", max_length=200),
    consent: bool = Form(False),
    website: str = Form("", max_length=200),  # honeypot: humans never see or fill this field
    elapsed_ms: int = Form(0),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    s = get_settings()
    if website.strip() or 0 < elapsed_ms < 2500:
        # Looks automated. Answer as if accepted so the bot learns nothing; store nothing.
        return {"public_id": new_public_id(), "status": "submitted", "possible_duplicate": False}
    if category not in m.REPORT_CATEGORIES:
        raise HTTPException(422, "Please choose an issue category.")
    if (latitude is None) != (longitude is None):
        raise HTTPException(422, "Provide both latitude and longitude, or neither.")
    if latitude is None and not location_text.strip():
        raise HTTPException(422, "Please describe the location or drop a pin on the map.")
    if (contact_name.strip() or contact_info.strip()) and not consent:
        raise HTTPException(422, "Please tick the consent box to share contact details, or leave them blank.")

    # Counted only once the submission is well-formed, so honest typing mistakes do not use up the allowance.
    limiter.check(f"report:{client_ip(request)}", s.report_rate_limit, 3600)

    duplicate = None
    if latitude is not None:
        since = m.utcnow() - timedelta(days=DUPLICATE_DAYS)
        candidates = db.scalars(
            select(m.CitizenReport).where(
                m.CitizenReport.category == category, m.CitizenReport.created_at >= since,
                m.CitizenReport.latitude.is_not(None), m.CitizenReport.status != "rejected",
                m.CitizenReport.latitude.between(latitude - 0.001, latitude + 0.001),
                m.CitizenReport.longitude.between(longitude - 0.001, longitude + 0.001),
            ).order_by(m.CitizenReport.created_at)
        )
        for c in candidates:
            if distance_m(latitude, longitude, c.latitude, c.longitude) <= DUPLICATE_RADIUS_M:
                duplicate = c
                break

    photo_path = save_photo(photo) if photo is not None and photo.filename else ""
    for _ in range(5):
        pid = new_public_id()
        if not db.scalar(select(m.CitizenReport.id).where(m.CitizenReport.public_id == pid)):
            break
    report = m.CitizenReport(
        public_id=pid, category=category, description=description.strip(), location_text=location_text.strip(),
        latitude=latitude, longitude=longitude, photo_path=photo_path,
        contact_name=contact_name.strip(), contact_info=contact_info.strip(),
        duplicate_of_id=(duplicate.duplicate_of_id or duplicate.id) if duplicate else None,
        submitter_hash=ip_fingerprint(request),
    )
    db.add(report)
    db.commit()
    return {"public_id": report.public_id, "status": report.status, "possible_duplicate": duplicate is not None}


@router.get("/track/{public_id}")
def track(public_id: str, request: Request, db: Session = Depends(get_db)):
    limiter.check(f"track:{client_ip(request)}", 60, 3600)
    r = db.scalar(select(m.CitizenReport).where(m.CitizenReport.public_id == public_id.strip().upper()))
    if not r:
        raise HTTPException(404, "No report found with that ID.")
    return {
        "public_id": r.public_id, "category": r.category, "status": r.status,
        "submitted_at": r.created_at.isoformat(timespec="minutes"),
        "updated_at": r.updated_at.isoformat(timespec="minutes"),
        "public_note": r.public_note, "possible_duplicate": r.duplicate_of_id is not None,
    }


@router.get("/public")
def public_reports(db: Session = Depends(get_db)):
    """Reviewed reports for the public map. Coordinates are rounded (about 100 m) and
    no description, photo or contact detail is exposed."""
    rows = db.scalars(
        select(m.CitizenReport).where(
            m.CitizenReport.status.in_(m.PUBLIC_REPORT_STATUSES), m.CitizenReport.latitude.is_not(None)
        ).order_by(m.CitizenReport.created_at.desc()).limit(1000)
    )
    return {"items": [
        {"public_id": r.public_id, "category": r.category, "status": r.status, "is_demo": r.is_demo,
         "latitude": round(r.latitude, 3), "longitude": round(r.longitude, 3),
         "submitted_at": r.created_at.date().isoformat()}
        for r in rows
    ]}
