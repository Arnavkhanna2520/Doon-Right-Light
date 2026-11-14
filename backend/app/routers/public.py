"""Public, read-only API: metadata, map features, statistics, analysis, calculator. Recommendations are staff-only."""
from __future__ import annotations

import json
import statistics

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models as m
from ..security import get_optional_user, require_staff
from ..config import STUDY_AREA
from ..db import get_db
from ..integrations import black_marble
from ..services import energy, hotspots, pdf
from ..services.classification import BASIS_LABELS, LABELS
from ..services.queries import Filters, features, obs_dict, stats
from ..services.recommendations import ACTIONS

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    origin_counts = dict(db.execute(select(m.Observation.data_origin, func.count()).group_by(m.Observation.data_origin)).all())
    zones = [z for (z,) in db.execute(select(m.Location.zone).distinct().order_by(m.Location.zone)) if z]
    return {
        "study_area": STUDY_AREA,
        "enums": {
            "road_types": m.ROAD_TYPES, "classifications": LABELS, "verification": m.VERIFICATION,
            "data_origins": m.DATA_ORIGINS, "report_categories": m.REPORT_CATEGORIES,
            "report_statuses": m.REPORT_STATUSES, "fixture_status": m.FIXTURE_STATUS,
            "shielding": m.SHIELDING, "direction": m.DIRECTION, "activity": m.ACTIVITY,
            "threshold_basis": BASIS_LABELS, "roles": m.ROLES, "actions": ACTIONS,
        },
        "zones": zones,
        "observation_counts": origin_counts,
        "has_demo_data": origin_counts.get("demo", 0) > 0,
        "has_real_data": any(v for k, v in origin_counts.items() if k != "demo"),
        "satellite": black_marble.status(),
    }


@router.get("/locations")
def list_locations(f: Filters = Depends(), db: Session = Depends(get_db)):
    feats = features(db, f)
    return {"count": len(feats), "items": feats}


@router.get("/locations/{location_id}")
def location_detail(location_id: int, db: Session = Depends(get_db), user: m.User | None = Depends(get_optional_user)):
    loc = db.get(m.Location, location_id)
    if not loc:
        raise HTTPException(404, "Location not found.")
    return {
        "id": loc.id, "name": loc.name, "latitude": loc.latitude, "longitude": loc.longitude, "zone": loc.zone,
        "road_type": loc.road_type, "safety_critical": loc.safety_critical, "safety_context": loc.safety_context,
        "data_origin": loc.data_origin,
        "observations": [obs_dict(o) for o in loc.observations[:50]],
        # Recommendations are for staff only; the public sees the measurement, not the action list.
        "recommendations": [rec_dict(r) for r in sorted(loc.recommendations, key=lambda r: -r.priority_score)] if user else [],
    }


@router.get("/stats")
def get_stats(f: Filters = Depends(), db: Session = Depends(get_db)):
    data = stats(features(db, f))
    rq = select(m.CitizenReport.status, func.count()).group_by(m.CitizenReport.status)
    by_status = dict(db.execute(rq).all())
    by_cat = dict(db.execute(select(m.CitizenReport.category, func.count()).group_by(m.CitizenReport.category)).all())
    demo_reports = db.scalar(select(func.count()).select_from(m.CitizenReport).where(m.CitizenReport.is_demo)) or 0
    data["reports"] = {
        "total": sum(by_status.values()),
        "demo": demo_reports,
        "faulty_streetlight_reports": by_cat.get("broken_streetlight", 0),
        "by_status": [{"key": s, "count": by_status.get(s, 0)} for s in m.REPORT_STATUSES],
        "by_category": [{"key": c, "count": by_cat.get(c, 0)} for c in m.REPORT_CATEGORIES],
    }
    return data


@router.get("/thresholds")
def thresholds(db: Session = Depends(get_db)):
    rows = db.scalars(select(m.Threshold).order_by(m.Threshold.road_type)).all()
    return {
        "items": [
            {"road_type": t.road_type, "min_lux": t.min_lux, "max_lux": t.max_lux, "basis": t.basis,
             "basis_label": BASIS_LABELS.get(t.basis, t.basis), "source_note": t.source_note,
             "updated_at": t.updated_at.isoformat(timespec="minutes")}
            for t in rows
        ],
        "unconfigured": [r for r in m.ROAD_TYPES if r not in {t.road_type for t in rows}],
    }


# ---------------------------------------------------------------- analysis
def _hotspot_rows(db: Session, f: Filters, radius_m: float) -> dict:
    feats = [x for x in features(db, f) if x["latest"]["lux"] is not None]
    res = hotspots.getis_ord_gi_star(
        [x["latitude"] for x in feats], [x["longitude"] for x in feats], [x["latest"]["lux"] for x in feats], radius_m
    )
    for r in res["results"]:
        x = feats[r.pop("index")]
        r.update(id=x["id"], name=x["name"], latitude=x["latitude"], longitude=x["longitude"], zone=x["zone"],
                 lux=x["latest"]["lux"], data_origin=x["latest"]["data_origin"],
                 verification_status=x["latest"]["verification_status"])
    res["contains_demo"] = any(x["latest"]["data_origin"] == "demo" for x in feats)
    return res


@router.get("/analysis/hotspots")
def analysis_hotspots(radius_m: float = Query(500, ge=50, le=5000), f: Filters = Depends(),
                      db: Session = Depends(get_db)):
    return _hotspot_rows(db, f, radius_m)


@router.get("/analysis/summary")
def analysis_summary(f: Filters = Depends(), db: Session = Depends(get_db)):
    feats = features(db, f)
    by_road: dict[str, list[float]] = {}
    for x in feats:
        if x["latest"]["lux"] is not None:
            by_road.setdefault(x["road_type"], []).append(x["latest"]["lux"])

    def box(v: list[float]) -> dict:
        v = sorted(v)
        q = statistics.quantiles(v, n=4) if len(v) >= 2 else [v[0]] * 3
        return {"n": len(v), "min": v[0], "q1": round(q[0], 2), "median": round(q[1], 2), "q3": round(q[2], 2),
                "max": v[-1], "mean": round(sum(v) / len(v), 2)}

    n = len(feats) or 1
    with_lux = sum(1 for x in feats if x["latest"]["lux"] is not None)
    verified = sum(1 for x in feats if x["latest"]["verification_status"] != "unverified"
                   and x["latest"]["data_origin"] != "demo")
    repeat = sum(1 for x in feats if x["observation_count"] >= 2)
    demo = sum(1 for x in feats if x["latest"]["data_origin"] == "demo")
    lux_values = [x["latest"]["lux"] for x in feats if x["latest"]["lux"] is not None]
    edges = [0, 1, 2, 5, 10, 20, 30, 50, 100]
    hist = []
    for lo, hi in zip(edges, edges[1:] + [None]):
        cnt = sum(1 for v in lux_values if v >= lo and (hi is None or v < hi))
        hist.append({"bin": f"{lo}-{hi}" if hi else f"{lo}+", "count": cnt})
    return {
        "lux_by_road_type": [{"road_type": k, **box(v)} for k, v in sorted(by_road.items())],
        "lux_histogram": hist,
        "data_quality": {
            "locations": len(feats),
            "with_lux_pct": round(with_lux / n * 100, 1),
            "verified_real_pct": round(verified / n * 100, 1),
            "repeat_visit_pct": round(repeat / n * 100, 1),
            "demo_pct": round(demo / n * 100, 1),
        },
        "stats": stats(feats),
    }


# ---------------------------------------------------------- recommendations
def rec_dict(r: m.Recommendation) -> dict:
    return {
        "id": r.id, "location_id": r.location_id, "action": r.action, "title": r.title, "rationale": r.rationale,
        "evidence": json.loads(r.evidence_json or "[]"), "evidence_level": r.evidence_level,
        "safety_hold": r.safety_hold, "priority_score": r.priority_score, "priority_level": r.priority_level,
        "status": r.status, "generated_at": r.generated_at.isoformat(timespec="minutes"),
    }


@router.get("/recommendations")
def list_recommendations(
    level: str | None = None, action: str | None = None, zone: str | None = None,
    evidence_level: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), _: m.User = Depends(require_staff),
):
    stmt = select(m.Recommendation, m.Location).join(m.Location)
    if level:
        stmt = stmt.where(m.Recommendation.priority_level == level)
    if action:
        stmt = stmt.where(m.Recommendation.action == action)
    if evidence_level:
        stmt = stmt.where(m.Recommendation.evidence_level == evidence_level)
    if zone:
        stmt = stmt.where(m.Location.zone == zone)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(
        stmt.order_by(m.Recommendation.priority_score.desc(), m.Recommendation.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = []
    for r, loc in rows:
        d = rec_dict(r)
        d["location"] = {"id": loc.id, "name": loc.name, "zone": loc.zone, "road_type": loc.road_type,
                         "latitude": loc.latitude, "longitude": loc.longitude,
                         "safety_critical": loc.safety_critical, "safety_context": loc.safety_context}
        items.append(d)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ------------------------------------------------------------------ energy
@router.post("/energy/estimate", response_model=energy.EnergyResult)
def energy_estimate(body: energy.EnergyInput):
    return energy.estimate(body)


@router.post("/energy/estimate.pdf")
def energy_estimate_pdf(body: energy.EnergyInput):
    data = pdf.energy_pdf(body, energy.estimate(body))
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="energy-estimate.pdf"'})


@router.get("/satellite/status")
def satellite_status():
    return black_marble.status()
