"""Synthetic demonstration data.

Everything created here is flagged data_origin='demo' (or is_demo for reports)
and is shown in the interface with a DEMO DATA label. Points sit on a jittered
grid, have generic names ('Demo site D-014') and do NOT represent real
measurements, real fixtures or real complaints in Dehradun.
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
LAT0, LAT1, LON0, LON1 = 30.285, 30.355, 77.985, 78.075
ROWS, COLS = 8, 12


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
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            idx += 1
            lat = LAT0 + (row + 0.5 + rng.uniform(-0.35, 0.35)) * (LAT1 - LAT0) / ROWS
            lon = LON0 + (col + 0.5 + rng.uniform(-0.35, 0.35)) * (LON1 - LON0) / COLS
            zone = f"Demo Zone {'ABCDEF'[(row // 4) * 3 + col // 4]}"
            rt = rng.choice(roads)
            critical = rt == "junction" or rng.random() < 0.08
            loc = m.Location(
                name=f"Demo site D-{idx:03d}", latitude=round(lat, 6), longitude=round(lon, 6), zone=zone,
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
                    notes="Synthetic demonstration record. Not a real measurement.", data_origin="demo",
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
            location_text=f"Demo location {i}", latitude=round(rng.uniform(LAT0, LAT1), 5),
            longitude=round(rng.uniform(LON0, LON1), 5), status=st, is_demo=True,
            created_at=created, updated_at=created + timedelta(days=rng.randint(0, 6)),
        ))
    db.flush()
    db.expire_all()
    n_rec = recommendations.regenerate(db)
    return {"locations": ROWS * COLS, "observations": n_obs, "reports": len(statuses), "recommendations": n_rec}
