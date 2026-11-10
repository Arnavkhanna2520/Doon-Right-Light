"""Shared read queries: one 'feature' per location with its latest observation."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time

from fastapi import Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Location, Observation, Recommendation
from .classification import LABELS

ISSUE_CLASSES = ("potential_excessive", "insufficient", "non_functional")
MAX_FEATURES = 5000


class Filters:
    """Query-string filters shared by the map, dashboard, analysis and exports."""

    def __init__(
        self,
        zone: str | None = Query(None, max_length=120),
        classification: str | None = Query(None, max_length=40),
        verification: str | None = Query(None, max_length=20),
        origin: str | None = Query(None, max_length=20),
        road_type: str | None = Query(None, max_length=20),
        priority: str | None = Query(None, max_length=10),
        q: str | None = Query(None, max_length=100),
        date_from: date | None = None,
        date_to: date | None = None,
        include_demo: bool = True,
    ):
        self.zone, self.classification, self.verification = zone, classification, verification
        self.origin, self.road_type, self.priority, self.q = origin, road_type, priority, q
        self.date_from, self.date_to, self.include_demo = date_from, date_to, include_demo


def obs_dict(o: Observation) -> dict:
    return {
        "id": o.id, "measured_at": o.measured_at.isoformat(timespec="minutes"), "lux": o.lux,
        "weather": o.weather, "fixture_status": o.fixture_status, "fixture_wattage": o.fixture_wattage,
        "shielding": o.shielding, "light_direction": o.light_direction,
        "pedestrian_activity": o.pedestrian_activity, "vehicle_activity": o.vehicle_activity,
        "notes": o.notes, "data_origin": o.data_origin, "verification_status": o.verification_status,
        "classification": o.classification, "classification_label": LABELS.get(o.classification, o.classification),
        "classification_basis": o.classification_basis, "dataset_id": o.dataset_id,
    }


def features(db: Session, f: Filters) -> list[dict]:
    stmt = select(Location).options(selectinload(Location.observations)).order_by(Location.id)
    if f.zone:
        stmt = stmt.where(Location.zone == f.zone)
    if f.road_type:
        stmt = stmt.where(Location.road_type == f.road_type)
    if f.q:
        stmt = stmt.where(Location.name.ilike(f"%{f.q.replace('%', '').replace('_', ' ')}%"))
    start = datetime.combine(f.date_from, time.min) if f.date_from else None
    end = datetime.combine(f.date_to, time.max) if f.date_to else None

    prio = {}
    for loc_id, level, score in db.execute(
        select(Recommendation.location_id, Recommendation.priority_level, Recommendation.priority_score)
    ):
        if score >= prio.get(loc_id, ("", -1))[1]:
            prio[loc_id] = (level, score)

    out: list[dict] = []
    for loc in db.scalars(stmt.limit(MAX_FEATURES)):
        obs_list = [o for o in loc.observations
                    if (not start or o.measured_at >= start) and (not end or o.measured_at <= end)]
        if not obs_list:
            continue
        o = obs_list[0]
        if not f.include_demo and o.data_origin == "demo":
            continue
        if f.origin and o.data_origin != f.origin:
            continue
        if f.verification and o.verification_status != f.verification:
            continue
        is_verified = o.verification_status in ("verified", "expert_verified")
        if f.classification == "verified_issue":
            if not (o.classification in ISSUE_CLASSES and is_verified and o.data_origin != "demo"):
                continue
        elif f.classification and o.classification != f.classification:
            continue
        level, score = prio.get(loc.id, ("none", 0.0))
        if f.priority and level != f.priority:
            continue
        out.append({
            "id": loc.id, "name": loc.name, "latitude": loc.latitude, "longitude": loc.longitude,
            "zone": loc.zone, "road_type": loc.road_type, "safety_critical": loc.safety_critical,
            "safety_context": loc.safety_context, "observation_count": len(loc.observations),
            "priority_level": level, "priority_score": score, "latest": obs_dict(o),
        })
    return out


def stats(feats: list[dict]) -> dict:
    c_class = Counter(f["latest"]["classification"] for f in feats)
    c_origin = Counter(f["latest"]["data_origin"] for f in feats)
    c_verif = Counter(f["latest"]["verification_status"] for f in feats)
    c_prio = Counter(f["priority_level"] for f in feats)
    c_road = Counter(f["road_type"] for f in feats)
    by_zone: dict[str, Counter] = defaultdict(Counter)
    lux_zone: dict[str, list[float]] = defaultdict(list)
    monthly: dict[str, Counter] = defaultdict(Counter)
    monthly_lux: dict[str, list[float]] = defaultdict(list)
    watt_class: dict[str, list[float]] = defaultdict(list)
    for f in feats:
        o = f["latest"]
        z = f["zone"] or "Unassigned"
        by_zone[z][o["classification"]] += 1
        m = o["measured_at"][:7]
        monthly[m][o["classification"]] += 1
        if o["lux"] is not None:
            lux_zone[z].append(o["lux"])
            monthly_lux[m].append(o["lux"])
        if o["fixture_wattage"]:
            watt_class[o["classification"]].append(o["fixture_wattage"])
    avg = lambda v: round(sum(v) / len(v), 2) if v else None  # noqa: E731
    return {
        "kpis": {
            "monitored_locations": len(feats),
            "potential_excessive": c_class["potential_excessive"],
            "insufficient": c_class["insufficient"],
            "non_functional": c_class["non_functional"],
            "adequate": c_class["adequate"],
            "needs_investigation": c_class["needs_investigation"],
            "high_priority": c_prio["high"],
            "demo_locations": c_origin["demo"],
            "real_locations": len(feats) - c_origin["demo"],
        },
        "by_classification": [{"key": k, "label": LABELS[k], "count": c_class[k]} for k in LABELS],
        "by_origin": [{"key": k, "count": v} for k, v in sorted(c_origin.items())],
        "by_verification": [{"key": k, "count": v} for k, v in sorted(c_verif.items())],
        "by_priority": [{"key": k, "count": c_prio[k]} for k in ("high", "medium", "low", "none")],
        "by_road_type": [{"key": k, "count": v} for k, v in sorted(c_road.items())],
        "by_zone": [
            {"zone": z, "total": sum(c.values()), "avg_lux": avg(lux_zone[z]), **{k: c[k] for k in LABELS}}
            for z, c in sorted(by_zone.items())
        ],
        "monthly": [
            {"month": m, "total": sum(c.values()), "avg_lux": avg(monthly_lux[m]), **{k: c[k] for k in LABELS}}
            for m, c in sorted(monthly.items())
        ],
        "wattage_by_classification": [
            {"key": k, "label": LABELS[k], "avg_wattage": avg(v), "fixtures": len(v), "total_watts": round(sum(v), 1)}
            for k, v in sorted(watt_class.items())
        ],
    }
