"""CSV and PDF exports for signed-in staff."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models as m
from ..db import get_db
from ..security import audit, require_moderator, require_staff
from ..services import pdf
from ..services.classification import LABELS
from ..services.queries import Filters, features, stats
from .public import _hotspot_rows, get_stats, list_recommendations, thresholds

router = APIRouter(prefix="/api/exports", tags=["exports"])

NOTE = ("# Doon Right-Light export. Rows with data_origin=demo are synthetic demonstration records, "
        "not observations of Dehradun. Check verification_status before citing any row.")


def _csv(name: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    buf.write(NOTE + "\n")
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        # neutralise spreadsheet formula injection in free-text cells
        w.writerow([("'" + c) if isinstance(c, str) and c[:1] in "=+-@" else c for c in r])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _filters_text(f: Filters) -> str:
    parts = [f"{k}={v}" for k, v in (("zone", f.zone), ("classification", f.classification),
                                      ("verification", f.verification), ("origin", f.origin),
                                      ("road_type", f.road_type), ("priority", f.priority)) if v]
    if not f.include_demo:
        parts.append("demo data excluded")
    return ", ".join(parts) or "none"


def _period(f: Filters) -> str:
    return f"{f.date_from or 'earliest record'} to {f.date_to or 'latest record'}"


@router.get("/observations.csv")
def observations_csv(request: Request, f: Filters = Depends(), db: Session = Depends(get_db),
                     user: m.User = Depends(require_staff)):
    feats = features(db, f)
    rows = [[x["id"], x["name"], x["zone"], x["latitude"], x["longitude"], x["road_type"],
             "yes" if x["safety_critical"] else "no", o["measured_at"], o["lux"], o["fixture_status"],
             o["fixture_wattage"], o["shielding"], o["light_direction"], o["pedestrian_activity"],
             o["vehicle_activity"], o["classification"], o["classification_basis"], o["data_origin"],
             o["verification_status"], x["priority_level"], x["priority_score"], o["notes"]]
            for x in feats for o in [x["latest"]]]
    audit(db, request, user, "export", "observations.csv", "", _filters_text(f))
    db.commit()
    return _csv("lighting-observations.csv", [
        "location_id", "location", "zone", "latitude", "longitude", "road_type", "safety_critical", "measured_at",
        "lux", "fixture_status", "fixture_wattage", "shielding", "light_direction", "pedestrian_activity",
        "vehicle_activity", "classification", "classification_basis", "data_origin", "verification_status",
        "priority_level", "priority_score", "notes"], rows)


@router.get("/hotspots.csv")
def hotspots_csv(request: Request, radius_m: float = Query(500, ge=50, le=5000), f: Filters = Depends(),
                 db: Session = Depends(get_db), user: m.User = Depends(require_staff)):
    res = _hotspot_rows(db, f, radius_m)
    rows = [[r["id"], r["name"], r["zone"], r["latitude"], r["longitude"], r["lux"], r["z"], r["neighbours"],
             r["label"], r["data_origin"], r["verification_status"]] for r in res["results"]]
    audit(db, request, user, "export", "hotspots.csv", "", f"radius {radius_m} m")
    db.commit()
    return _csv("hotspot-analysis.csv", ["location_id", "location", "zone", "latitude", "longitude", "lux",
                                         "gi_star_z", "neighbours_in_band", "result", "data_origin",
                                         "verification_status"], rows)


@router.get("/recommendations.csv")
def recommendations_csv(request: Request, db: Session = Depends(get_db), user: m.User = Depends(require_staff)):
    rows = db.execute(select(m.Recommendation, m.Location).join(m.Location)
                      .order_by(m.Recommendation.priority_score.desc())).all()
    audit(db, request, user, "export", "recommendations.csv")
    db.commit()
    return _csv("recommendations.csv", ["location", "zone", "road_type", "safety_critical", "action", "rationale",
                                        "priority_level", "priority_score", "evidence_level", "status"],
                [[loc.name, loc.zone, loc.road_type, "yes" if loc.safety_critical else "no", r.title, r.rationale,
                  r.priority_level, r.priority_score, r.evidence_level, r.status] for r, loc in rows])


@router.get("/citizen-reports.csv")
def reports_csv(request: Request, db: Session = Depends(get_db), user: m.User = Depends(require_moderator)):
    """Contact details are deliberately excluded from exports."""
    rows = db.scalars(select(m.CitizenReport).order_by(m.CitizenReport.created_at.desc())).all()
    audit(db, request, user, "export", "citizen-reports.csv")
    db.commit()
    return _csv("citizen-reports.csv", ["report_id", "category", "status", "location_text", "latitude", "longitude",
                                        "description", "possible_duplicate", "is_demo", "submitted_at", "updated_at"],
                [[r.public_id, r.category, r.status, r.location_text, r.latitude, r.longitude, r.description,
                  "yes" if r.duplicate_of_id else "no", "yes" if r.is_demo else "no",
                  r.created_at.isoformat(timespec="minutes"), r.updated_at.isoformat(timespec="minutes")]
                 for r in rows])


@router.get("/report.pdf")
def report_pdf(
    request: Request,
    sections: str = Query("overview,locations,hotspots,complaints,recommendations", max_length=200),
    radius_m: float = Query(500, ge=50, le=5000),
    f: Filters = Depends(), db: Session = Depends(get_db), user: m.User = Depends(require_staff),
):
    wanted = {s.strip() for s in sections.split(",") if s.strip()}
    feats = features(db, f)
    recs = list_recommendations(level=None, action=None, zone=f.zone, evidence_level=None, page=1, page_size=100,
                                db=db)["items"]
    data = pdf.summary_pdf(
        period=_period(f), filters_text=_filters_text(f), feats=feats, st=stats(feats),
        hot=_hotspot_rows(db, f, radius_m) if "hotspots" in wanted else None,
        reports=get_stats(f, db)["reports"] if "complaints" in wanted else None,
        recs=recs, thresholds=thresholds(db)["items"], sections=wanted,
    )
    audit(db, request, user, "export", "report.pdf", "", ",".join(sorted(wanted)))
    db.commit()
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="doon-right-light-report.pdf"'})


_ = LABELS  # re-exported for templates
