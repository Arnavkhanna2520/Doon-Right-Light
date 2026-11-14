"""Survey upload (CSV or Excel): validate -> preview -> download cleaned -> import; list uploaded files."""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..config import get_settings
from ..db import get_db
from ..security import audit, require_auditor, require_staff
from ..services import classification, csv_validation, recommendations

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


def dataset_dict(d: m.Dataset, with_report: bool = False, uploader: str | None = None, records: int | None = None) -> dict:
    out = {
        "uploaded_by": uploader, "records": records,
        "id": d.id, "filename": d.filename, "status": d.status, "data_origin": d.data_origin,
        "source_note": d.source_note, "collected_on": d.collected_on, "row_count": d.row_count,
        "valid_count": d.valid_count, "error_count": d.error_count, "warning_count": d.warning_count,
        "duplicate_count": d.duplicate_count, "created_at": d.created_at.isoformat(timespec="minutes"),
    }
    if with_report:
        out["report"] = json.loads(d.report_json or "{}")
    return out


@router.get("/template.csv")
def template():
    return Response(csv_validation.template_csv(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="lighting-audit-template.csv"'})


@router.get("/template.xlsx")
def template_excel():
    return Response(csv_validation.template_xlsx(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="lighting-audit-template.xlsx"'})


@router.get("")
def list_datasets(db: Session = Depends(get_db), _: m.User = Depends(require_staff)):
    rows = list(db.scalars(select(m.Dataset).order_by(m.Dataset.created_at.desc()).limit(100)))
    emails = dict(db.execute(select(m.User.id, m.User.email)).all())
    counts = dict(db.execute(select(m.Observation.dataset_id, func.count(m.Observation.id))
                             .where(m.Observation.dataset_id.is_not(None)).group_by(m.Observation.dataset_id)).all())
    return {"items": [dataset_dict(d, uploader=emails.get(d.uploaded_by), records=counts.get(d.id, 0)) for d in rows]}


@router.post("/validate", status_code=201)
def validate(
    request: Request,
    file: UploadFile = File(...),
    data_origin: str = Form("ground_measured"),
    source_note: str = Form("", max_length=500),
    collected_on: str = Form("", max_length=40),
    db: Session = Depends(get_db),
    user: m.User = Depends(require_auditor),
):
    s = get_settings()
    name = (file.filename or "upload.csv")[:255]
    is_excel = name.lower().endswith(".xlsx")
    if not (is_excel or name.lower().endswith(".csv")):
        raise HTTPException(415, "Only .csv or .xlsx (Excel) files are accepted.")
    if data_origin not in ("ground_measured", "imported"):
        raise HTTPException(422, "Data origin must be 'ground_measured' or 'imported'.")
    raw = file.file.read(s.max_csv_mb * 1024 * 1024 + 1)
    if len(raw) > s.max_csv_mb * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {s.max_csv_mb} MB.")
    if is_excel:
        try:
            raw = csv_validation.xlsx_to_csv(raw)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    report = csv_validation.validate_csv(raw, s.max_csv_rows)
    cleaned = report.pop("cleaned_rows")
    sm = report["summary"]
    d = m.Dataset(
        filename=name, data_origin=data_origin, source_note=source_note.strip(), collected_on=collected_on.strip(),
        row_count=sm["total_rows"], valid_count=sm["valid_rows"], error_count=sm["error_count"],
        warning_count=sm["warning_count"], duplicate_count=sm["duplicate_rows"],
        report_json=json.dumps(report), cleaned_csv=csv_validation.cleaned_to_csv(cleaned), uploaded_by=user.id,
    )
    db.add(d)
    db.flush()
    audit(db, request, user, "dataset_validated", "dataset", d.id,
          f"{name}: {sm['valid_rows']}/{sm['total_rows']} valid, {sm['error_count']} errors")
    db.commit()
    return dataset_dict(d, with_report=True)


@router.get("/{dataset_id}")
def get_dataset(dataset_id: int, db: Session = Depends(get_db), _: m.User = Depends(require_staff)):
    d = db.get(m.Dataset, dataset_id)
    if not d:
        raise HTTPException(404, "Dataset not found.")
    return dataset_dict(d, with_report=True)


@router.get("/{dataset_id}/cleaned.csv")
def cleaned(dataset_id: int, db: Session = Depends(get_db), _: m.User = Depends(require_staff)):
    d = db.get(m.Dataset, dataset_id)
    if not d:
        raise HTTPException(404, "Dataset not found.")
    return Response(d.cleaned_csv, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="cleaned-dataset-{d.id}.csv"'})


@router.post("/{dataset_id}/import")
def import_dataset(dataset_id: int, request: Request, db: Session = Depends(get_db),
                   user: m.User = Depends(require_auditor)):
    d = db.get(m.Dataset, dataset_id)
    if not d:
        raise HTTPException(404, "Dataset not found.")
    if d.status != "validated":
        raise HTTPException(409, f"Dataset is already {d.status}.")
    rows = csv_validation.validate_csv(d.cleaned_csv.encode(), get_settings().max_csv_rows)["cleaned_rows"]
    if not rows:
        raise HTTPException(422, "This dataset has no valid rows to import.")
    rules = classification.load_rules(db)
    existing = {
        (loc.name.lower(), round(loc.latitude, 5), round(loc.longitude, 5)): loc
        for loc in db.scalars(select(m.Location).where(m.Location.data_origin != "demo"))
    }
    new_locs = new_obs = 0
    for r in rows:
        key = (r["location"].lower(), round(r["latitude"], 5), round(r["longitude"], 5))
        loc = existing.get(key)
        if loc is None:
            loc = m.Location(name=r["location"], latitude=r["latitude"], longitude=r["longitude"], zone=r["zone"],
                             road_type=r["road_type"], safety_critical=r["safety_critical"],
                             safety_context=r["safety_context"], data_origin=d.data_origin, dataset_id=d.id)
            db.add(loc)
            db.flush()
            existing[key] = loc
            new_locs += 1
        o = m.Observation(
            location_id=loc.id, measured_at=datetime.strptime(r["measured_at"], "%Y-%m-%d %H:%M:%S"),
            lux=r["lux"], weather=r["weather"], fixture_status=r["fixture_status"],
            fixture_wattage=r["fixture_wattage"], shielding=r["shielding"], light_direction=r["light_direction"],
            pedestrian_activity=r["pedestrian_activity"], vehicle_activity=r["vehicle_activity"], notes=r["notes"],
            data_origin=d.data_origin, verification_status="unverified", dataset_id=d.id, created_by=user.id,
        )
        classification.apply(o, loc.road_type, rules)
        db.add(o)
        new_obs += 1
    d.status = "imported"
    db.flush()
    db.expire_all()
    recommendations.regenerate(db)
    audit(db, request, user, "dataset_imported", "dataset", d.id, f"{new_obs} observations, {new_locs} new locations")
    db.commit()
    return {"imported_observations": new_obs, "new_locations": new_locs}


@router.delete("/{dataset_id}")
def discard_dataset(dataset_id: int, request: Request, db: Session = Depends(get_db),
                    user: m.User = Depends(require_auditor)):
    d = db.get(m.Dataset, dataset_id)
    if not d:
        raise HTTPException(404, "Dataset not found.")
    if d.status == "imported":
        raise HTTPException(409, "An imported dataset cannot be discarded; remove its observations instead.")
    d.status = "discarded"
    audit(db, request, user, "dataset_discarded", "dataset", d.id)
    db.commit()
    return {"ok": True}
