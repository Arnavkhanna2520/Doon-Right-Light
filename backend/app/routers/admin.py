"""Staff-only API: report moderation, observations, locations, thresholds, users, audit log, demo data."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models as m
from ..config import get_settings
from ..db import get_db
from ..security import (audit, hash_password, require_admin, require_auditor, require_moderator, require_staff,
                        validate_password_strength)
from ..services import classification, recommendations
from ..services.queries import obs_dict
from .auth import user_dict

router = APIRouter(prefix="/api/admin", tags=["admin"])


def paginate(db: Session, stmt, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return total, rows


# ----------------------------------------------------------------- reports
def report_dict(r: m.CitizenReport, full: bool = True) -> dict:
    d = {
        "id": r.id, "public_id": r.public_id, "category": r.category, "description": r.description,
        "location_text": r.location_text, "latitude": r.latitude, "longitude": r.longitude,
        "status": r.status, "has_photo": bool(r.photo_path), "duplicate_of_id": r.duplicate_of_id,
        "is_demo": r.is_demo, "created_at": r.created_at.isoformat(timespec="minutes"),
        "updated_at": r.updated_at.isoformat(timespec="minutes"), "public_note": r.public_note,
    }
    if full:
        d.update(contact_name=r.contact_name, contact_info=r.contact_info, admin_note=r.admin_note)
    return d


@router.get("/reports")
def list_reports(
    status: str | None = None, category: str | None = None, q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: m.User = Depends(require_moderator),
):
    stmt = select(m.CitizenReport).order_by(m.CitizenReport.created_at.desc())
    if status:
        stmt = stmt.where(m.CitizenReport.status == status)
    if category:
        stmt = stmt.where(m.CitizenReport.category == category)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(m.CitizenReport.public_id.ilike(like), m.CitizenReport.description.ilike(like),
                              m.CitizenReport.location_text.ilike(like)))
    total, rows = paginate(db, stmt, page, page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": [report_dict(r) for r in rows]}


class ReportUpdate(BaseModel):
    status: str | None = None
    admin_note: str | None = Field(None, max_length=2000)
    public_note: str | None = Field(None, max_length=500)


@router.patch("/reports/{report_id}")
def update_report(report_id: int, body: ReportUpdate, request: Request, db: Session = Depends(get_db),
                  user: m.User = Depends(require_moderator)):
    r = db.get(m.CitizenReport, report_id)
    if not r:
        raise HTTPException(404, "Report not found.")
    changes = []
    if body.status is not None and body.status != r.status:
        if body.status not in m.REPORT_STATUSES:
            raise HTTPException(422, "Unknown status.")
        changes.append(f"status {r.status} -> {body.status}")
        r.status = body.status
    if body.admin_note is not None:
        r.admin_note = body.admin_note
        changes.append("admin note updated")
    if body.public_note is not None:
        r.public_note = body.public_note
        changes.append("public note updated")
    r.updated_at = m.utcnow()
    audit(db, request, user, "report_updated", "citizen_report", r.id, "; ".join(changes))
    db.commit()
    return report_dict(r)


@router.get("/reports/{report_id}/photo")
def report_photo(report_id: int, db: Session = Depends(get_db), _: m.User = Depends(require_moderator)):
    r = db.get(m.CitizenReport, report_id)
    if not r or not r.photo_path:
        raise HTTPException(404, "No photo for this report.")
    base = get_settings().upload_dir.resolve()
    path = (base / r.photo_path).resolve()
    if base not in path.parents or not path.is_file():
        raise HTTPException(404, "Photo file missing.")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


# ------------------------------------------------------------ observations
@router.get("/observations")
def list_observations(
    classification_: str | None = Query(None, alias="classification"), verification: str | None = None,
    origin: str | None = None, q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: m.User = Depends(require_staff),
):
    stmt = select(m.Observation).join(m.Location).order_by(m.Observation.measured_at.desc(), m.Observation.id)
    if classification_:
        stmt = stmt.where(m.Observation.classification == classification_)
    if verification:
        stmt = stmt.where(m.Observation.verification_status == verification)
    if origin:
        stmt = stmt.where(m.Observation.data_origin == origin)
    if q:
        stmt = stmt.where(m.Location.name.ilike(f"%{q}%"))
    total, rows = paginate(db, stmt, page, page_size)
    items = []
    for o in rows:
        d = obs_dict(o)
        d["location"] = {"id": o.location.id, "name": o.location.name, "zone": o.location.zone,
                         "road_type": o.location.road_type, "safety_critical": o.location.safety_critical}
        items.append(d)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


class ObservationUpdate(BaseModel):
    verification_status: str | None = None
    lux: float | None = Field(None, ge=0, le=100000)
    fixture_status: str | None = None
    shielding: str | None = None
    light_direction: str | None = None
    notes: str | None = Field(None, max_length=2000)


@router.patch("/observations/{obs_id}")
def update_observation(obs_id: int, body: ObservationUpdate, request: Request, db: Session = Depends(get_db),
                       user: m.User = Depends(require_auditor)):
    o = db.get(m.Observation, obs_id)
    if not o:
        raise HTTPException(404, "Observation not found.")
    data = body.model_dump(exclude_unset=True)
    allowed = {"verification_status": m.VERIFICATION, "fixture_status": m.FIXTURE_STATUS,
               "shielding": m.SHIELDING, "light_direction": m.DIRECTION}
    for k, vals in allowed.items():
        if k in data and data[k] not in vals:
            raise HTTPException(422, f"Invalid value for {k}.")
    if data.get("verification_status") in ("verified", "expert_verified") and o.data_origin == "demo":
        raise HTTPException(409, "Demo records cannot be marked as verified observations.")
    for k, v in data.items():
        setattr(o, k, v)
    classification.apply(o, o.location.road_type, classification.load_rules(db))
    audit(db, request, user, "observation_updated", "observation", o.id, str(data))
    db.flush()
    recommendations.regenerate(db)
    db.commit()
    return obs_dict(o)


@router.delete("/observations/{obs_id}")
def delete_observation(obs_id: int, request: Request, db: Session = Depends(get_db),
                       user: m.User = Depends(require_auditor)):
    o = db.get(m.Observation, obs_id)
    if not o:
        raise HTTPException(404, "Observation not found.")
    loc = o.location
    db.delete(o)
    db.flush()
    db.refresh(loc)
    if not loc.observations:
        db.delete(loc)
    audit(db, request, user, "observation_deleted", "observation", obs_id)
    db.flush()
    recommendations.regenerate(db)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------- locations
class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    zone: str = Field("", max_length=120)
    road_type: str = "other"
    safety_critical: bool = False
    safety_context: str = Field("", max_length=200)
    # optional first observation
    measured_at: datetime | None = None
    lux: float | None = Field(None, ge=0, le=100000)
    fixture_status: str = "unknown"
    fixture_wattage: float | None = Field(None, gt=0, le=2000)
    shielding: str = "unknown"
    light_direction: str = "unknown"
    pedestrian_activity: str = "unknown"
    vehicle_activity: str = "unknown"
    notes: str = Field("", max_length=2000)


class LocationUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    zone: str | None = Field(None, max_length=120)
    road_type: str | None = None
    safety_critical: bool | None = None
    safety_context: str | None = Field(None, max_length=200)


@router.post("/locations", status_code=201)
def create_location(body: LocationIn, request: Request, db: Session = Depends(get_db),
                    user: m.User = Depends(require_auditor)):
    if body.road_type not in m.ROAD_TYPES:
        raise HTTPException(422, "Unknown road type.")
    for k, vals in (("fixture_status", m.FIXTURE_STATUS), ("shielding", m.SHIELDING),
                    ("light_direction", m.DIRECTION), ("pedestrian_activity", m.ACTIVITY),
                    ("vehicle_activity", m.ACTIVITY)):
        if getattr(body, k) not in vals:
            raise HTTPException(422, f"Invalid value for {k}.")
    loc = m.Location(name=body.name.strip(), latitude=body.latitude, longitude=body.longitude, zone=body.zone.strip(),
                     road_type=body.road_type, safety_critical=body.safety_critical,
                     safety_context=body.safety_context.strip(), data_origin="ground_measured")
    db.add(loc)
    db.flush()
    o = m.Observation(
        location_id=loc.id, measured_at=(body.measured_at or datetime.now()).replace(tzinfo=None), lux=body.lux,
        fixture_status=body.fixture_status, fixture_wattage=body.fixture_wattage, shielding=body.shielding,
        light_direction=body.light_direction, pedestrian_activity=body.pedestrian_activity,
        vehicle_activity=body.vehicle_activity, notes=body.notes, data_origin="ground_measured",
        verification_status="unverified", created_by=user.id,
    )
    classification.apply(o, loc.road_type, classification.load_rules(db))
    db.add(o)
    audit(db, request, user, "location_created", "location", loc.id, loc.name)
    db.flush()
    recommendations.regenerate(db)
    db.commit()
    return {"id": loc.id}


@router.patch("/locations/{location_id}")
def update_location(location_id: int, body: LocationUpdate, request: Request, db: Session = Depends(get_db),
                    user: m.User = Depends(require_auditor)):
    loc = db.get(m.Location, location_id)
    if not loc:
        raise HTTPException(404, "Location not found.")
    data = body.model_dump(exclude_unset=True)
    if "road_type" in data and data["road_type"] not in m.ROAD_TYPES:
        raise HTTPException(422, "Unknown road type.")
    for k, v in data.items():
        setattr(loc, k, v)
    rules = classification.load_rules(db)
    for o in loc.observations:
        classification.apply(o, loc.road_type, rules)
    audit(db, request, user, "location_updated", "location", loc.id, str(data))
    db.flush()
    recommendations.regenerate(db)
    db.commit()
    return {"ok": True}


@router.delete("/locations/{location_id}")
def delete_location(location_id: int, request: Request, db: Session = Depends(get_db),
                    user: m.User = Depends(require_auditor)):
    loc = db.get(m.Location, location_id)
    if not loc:
        raise HTTPException(404, "Location not found.")
    db.delete(loc)
    audit(db, request, user, "location_deleted", "location", location_id, loc.name)
    db.commit()
    return {"ok": True}


# -------------------------------------------------------------- thresholds
class ThresholdIn(BaseModel):
    min_lux: float = Field(ge=0, le=10000)
    max_lux: float = Field(gt=0, le=10000)
    basis: str = "local_policy"
    source_note: str = Field(min_length=5, max_length=500)


@router.put("/thresholds/{road_type}")
def set_threshold(road_type: str, body: ThresholdIn, request: Request, db: Session = Depends(get_db),
                  user: m.User = Depends(require_admin)):
    if road_type not in m.ROAD_TYPES:
        raise HTTPException(404, "Unknown road type.")
    if body.basis not in m.THRESHOLD_BASIS:
        raise HTTPException(422, "Unknown basis.")
    if body.max_lux <= body.min_lux:
        raise HTTPException(422, "Maximum must be greater than minimum.")
    t = db.scalar(select(m.Threshold).where(m.Threshold.road_type == road_type))
    if not t:
        t = m.Threshold(road_type=road_type, min_lux=body.min_lux, max_lux=body.max_lux)
        db.add(t)
    t.min_lux, t.max_lux, t.basis, t.source_note = body.min_lux, body.max_lux, body.basis, body.source_note.strip()
    t.updated_at = m.utcnow()
    db.flush()
    n = classification.reclassify_all(db)
    db.flush()
    recommendations.regenerate(db)
    audit(db, request, user, "threshold_set", "threshold", road_type,
          f"{body.min_lux}-{body.max_lux} lux; {body.basis}; {body.source_note}")
    db.commit()
    return {"ok": True, "reclassified": n}


@router.delete("/thresholds/{road_type}")
def delete_threshold(road_type: str, request: Request, db: Session = Depends(get_db),
                     user: m.User = Depends(require_admin)):
    t = db.scalar(select(m.Threshold).where(m.Threshold.road_type == road_type))
    if not t:
        raise HTTPException(404, "No threshold for this road type.")
    db.delete(t)
    db.flush()
    n = classification.reclassify_all(db)
    db.flush()
    recommendations.regenerate(db)
    audit(db, request, user, "threshold_deleted", "threshold", road_type)
    db.commit()
    return {"ok": True, "reclassified": n}


# ---------------------------------------------------------- recommendations
class RecUpdate(BaseModel):
    status: str


@router.patch("/recommendations/{rec_id}")
def update_recommendation(rec_id: int, body: RecUpdate, request: Request, db: Session = Depends(get_db),
                          user: m.User = Depends(require_staff)):
    r = db.get(m.Recommendation, rec_id)
    if not r:
        raise HTTPException(404, "Recommendation not found.")
    if body.status not in m.REC_STATUSES:
        raise HTTPException(422, "Unknown status.")
    r.status = body.status
    audit(db, request, user, "recommendation_updated", "recommendation", r.id, body.status)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------- users
class UserIn(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str = Field("", max_length=120)
    password: str = Field(max_length=200)
    role: str = "moderator"


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=120)
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(None, max_length=200)


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: m.User = Depends(require_admin)):
    return {"items": [user_dict(u) for u in db.scalars(select(m.User).order_by(m.User.id))]}


@router.post("/users", status_code=201)
def create_user(body: UserIn, request: Request, db: Session = Depends(get_db),
                user: m.User = Depends(require_admin)):
    if body.role not in m.ROLES:
        raise HTTPException(422, "Unknown role.")
    validate_password_strength(body.password)
    email = body.email.strip().lower()
    if db.scalar(select(m.User.id).where(m.User.email == email)):
        raise HTTPException(409, "A user with this email already exists.")
    u = m.User(email=email, full_name=body.full_name.strip(), role=body.role,
               password_hash=hash_password(body.password))
    db.add(u)
    db.flush()
    audit(db, request, user, "user_created", "user", u.id, f"{email} ({body.role})")
    db.commit()
    return user_dict(u)


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db),
                user: m.User = Depends(require_admin)):
    u = db.get(m.User, user_id)
    if not u:
        raise HTTPException(404, "User not found.")
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] not in m.ROLES:
        raise HTTPException(422, "Unknown role.")
    if u.id == user.id and (data.get("is_active") is False or data.get("role", "admin") != "admin"):
        raise HTTPException(409, "You cannot deactivate or demote your own account.")
    if data.get("password"):
        validate_password_strength(data["password"])
        u.password_hash = hash_password(data.pop("password"))
    data.pop("password", None)
    for k, v in data.items():
        setattr(u, k, v)
    audit(db, request, user, "user_updated", "user", u.id, ", ".join(body.model_dump(exclude_unset=True).keys()))
    db.commit()
    return user_dict(u)


# --------------------------------------------------------------- audit log
@router.get("/audit-logs")
def audit_logs(action: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
               db: Session = Depends(get_db), _: m.User = Depends(require_admin)):
    stmt = select(m.AuditLog).order_by(m.AuditLog.created_at.desc(), m.AuditLog.id.desc())
    if action:
        stmt = stmt.where(m.AuditLog.action == action)
    total, rows = paginate(db, stmt, page, page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": [
        {"id": a.id, "user_email": a.user_email, "action": a.action, "entity": a.entity, "entity_id": a.entity_id,
         "detail": a.detail, "created_at": a.created_at.isoformat(timespec="seconds")} for a in rows]}


# --------------------------------------------------------------- demo data
@router.post("/demo-data")
def load_demo(request: Request, db: Session = Depends(get_db), user: m.User = Depends(require_admin)):
    from ..seed import seed_demo

    counts = seed_demo(db)
    audit(db, request, user, "demo_data_loaded", "demo", "", str(counts))
    db.commit()
    return counts


@router.delete("/demo-data")
def purge_demo(request: Request, db: Session = Depends(get_db), user: m.User = Depends(require_admin)):
    from ..seed import purge_demo as _purge

    counts = _purge(db)
    audit(db, request, user, "demo_data_removed", "demo", "", str(counts))
    db.commit()
    return counts
