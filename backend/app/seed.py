"""Synthetic demonstration data.

Everything created here is flagged data_origin='demo' (or is_demo for reports)
and is shown in the interface with a DEMO DATA label.

Points are scattered around the approximate centres of real Dehradun
localities so the map and area comparisons look the way they will with real
surveys. The PLACES are real; every VALUE (lux, fixture, activity, complaint)
is invented. Nothing here is a measurement, a fixture record or a complaint
from that locality, and each record says so in its name and notes.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import models as m
from .services import classification, recommendations

DEMO_NOTE = "ILLUSTRATIVE DEMO VALUE - not taken from IS 1944 or any standard. Replace with a verified value."
DEMO_THRESHOLDS = {  # invented purely so the demo can show every classification
    "arterial": (15, 40), "sub_arterial": (10, 30), "collector": (8, 25), "residential": (4, 15),
    "pedestrian": (5, 20), "junction": (20, 50), "other": (4, 25),
}
ROAD_WEIGHTS = [("residential", 34), ("collector", 20), ("sub_arterial", 14), ("arterial", 12),
                ("junction", 10), ("pedestrian", 6), ("other", 4)]
# Approximate locality centres (looked up from a places search, Nov 2026; Rajpur Road is a mid-road estimate).
AREAS = [
    ("Rajpur Road", 30.3480, 78.0610), ("Araghar", 30.3069, 78.0499), ("Clock Tower", 30.3243, 78.0418),
    ("Paltan Bazaar", 30.3201, 78.0352), ("ISBT", 30.2892, 77.9987), ("Prem Nagar", 30.3340, 77.9602),
    ("Dalanwala", 30.3117, 78.0577), ("Ballupur", 30.3331, 78.0113), ("Sahastradhara Road", 30.3541, 78.0823),
    ("Doon IT Park", 30.3616, 78.0825),
]
POINTS_PER_AREA = 10
SPREAD = 0.0042  # about 450 m
LAT0, LAT1, LON0, LON1 = 30.285, 30.36, 77.96, 78.085


def purge_demo(db: Session) -> dict:
    n_loc = db.execute(delete(m.Location).where(m.Location.data_origin == "demo")).rowcount
    n_rep = db.execute(delete(m.CitizenReport).where(m.CitizenReport.is_demo)).rowcount
    n_thr = db.execute(delete(m.Threshold).where(m.Threshold.basis == "demo_placeholder")).rowcount
    db.flush()
    db.expire_all()
    classification.reclassify_all(db)
    db.flush()
    recommendations.regenerate(db)
    return {"locations_removed": n_loc, "reports_removed": n_rep, "demo_thresholds_removed": n_thr}


def seed_demo(db: Session, seed: int = 2520) -> dict:
    purge_demo(db)
    rng = random.Random(seed)
    existing = {t.road_type for t in db.scalars(select(m.Threshold))}
    for rt, (lo, hi) in DEMO_THRESHOLDS.items():
        if rt not in existing:  # never overwrite a real, administrator-entered threshold
            db.add(m.Threshold(road_type=rt, min_lux=lo, max_lux=hi, basis="demo_placeholder", source_note=DEMO_NOTE))
    db.flush()
    rules = classification.load_rules(db)
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    roads = [r for r, w in ROAD_WEIGHTS for _ in range(w)]
    n_obs = 0
    for area, clat, clon in AREAS:
        for idx in range(1, POINTS_PER_AREA + 1):
            lat = clat + rng.uniform(-SPREAD, SPREAD)
            lon = clon + rng.uniform(-SPREAD, SPREAD)
            zone = area
            rt = rng.choice(roads)
            critical = rt == "junction" or rng.random() < 0.08
            loc = m.Location(
                name=f"{area} - demo point {idx:02d}", latitude=round(lat, 6), longitude=round(lon, 6), zone=zone,
                road_type=rt, safety_critical=critical,
                safety_context=("Demo junction" if rt == "junction" else "Demo crossing / bus stop") if critical else "",
                data_origin="demo",
            )
            db.add(loc)
            db.flush()
            lo, hi = DEMO_THRESHOLDS[rt]
            profile = rng.choices(["adequate", "excess", "dark", "broken", "nolux"], [45, 20, 20, 8, 7])[0]
            for k in range(rng.choice([1, 1, 2, 3])):
                when = (now - timedelta(days=rng.randint(2, 175) + k * 9)).replace(hour=rng.choice([20, 21, 22, 23, 0, 1]),
                                                                                   minute=rng.choice([0, 15, 30, 45]))
                status, lux = "working", None
                if profile == "adequate":
                    lux = rng.uniform(lo * 1.05, hi * 0.95)
                elif profile == "excess":
                    lux = rng.uniform(hi * 1.15, hi * 2.4)
                elif profile == "dark":
                    lux = rng.uniform(lo * 0.1, lo * 0.85)
                    status = rng.choice(["working", "working", "obstructed", "flickering"])
                elif profile == "broken":
                    lux, status = rng.uniform(0, 0.8), "non_functional"
                o = m.Observation(
                    location_id=loc.id, measured_at=when, lux=None if lux is None else round(lux, 1),
                    weather=rng.choice(["clear", "clear", "hazy", "overcast"]), fixture_status=status,
                    fixture_wattage=rng.choice([36, 45, 70, 90, 120]),
                    shielding=rng.choice(["none", "partial"] if profile == "excess" else ["full", "partial", "none"]),
                    light_direction=rng.choice(["downward", "sideways", "upward"] if profile == "excess"
                                               else ["downward", "downward", "sideways"]),
                    pedestrian_activity=rng.choice(["low", "medium", "high"]),
                    vehicle_activity=rng.choice(["low", "medium", "high"]),
                    notes="Invented demo value. Not a real measurement at this place.", data_origin="demo",
                    verification_status=rng.choices(["verified", "expert_verified", "unverified"], [50, 15, 35])[0],
                )
                classification.apply(o, rt, rules)
                db.add(o)
                n_obs += 1
    statuses = ["submitted", "submitted", "under_review", "under_review", "verified", "verified", "verified",
                "in_progress", "in_progress", "resolved", "resolved", "resolved", "rejected", "submitted"]
    for i, st in enumerate(statuses, start=1):
        created = now - timedelta(days=rng.randint(1, 120), hours=rng.randint(0, 20))
        db.add(m.CitizenReport(
            public_id=f"DRL-DEMO{i:04d}", category=rng.choice(m.REPORT_CATEGORIES),
            description="DEMO REPORT - synthetic example created to demonstrate the review workflow. "
                        "It does not describe a real complaint.",
            location_text=f"Demo report near {AREAS[i % len(AREAS)][0]}",
            latitude=round(AREAS[i % len(AREAS)][1] + rng.uniform(-SPREAD, SPREAD), 5),
            longitude=round(AREAS[i % len(AREAS)][2] + rng.uniform(-SPREAD, SPREAD), 5), status=st, is_demo=True,
            created_at=created, updated_at=created + timedelta(days=rng.randint(0, 6)),
        ))
    db.flush()
    db.expire_all()
    n_rec = recommendations.regenerate(db)
    return {"locations": len(AREAS) * POINTS_PER_AREA, "observations": n_obs, "reports": len(statuses), "recommendations": n_rec}
