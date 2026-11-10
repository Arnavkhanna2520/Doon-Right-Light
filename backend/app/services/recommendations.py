"""Rule-based recommendations with the evidence shown for each.

Safety rule: at a location flagged safety-critical (junction, crossing,
hospital, bus stop ...) the engine never proposes lowering light levels. It
issues a 'safety assessment required' hold instead.

Unverified measurements only produce 'verify with a ground measurement'
(or a fault check), never a change to the lighting.
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Location, Observation, Recommendation
from .classification import ThresholdRule, load_rules

ACTIONS = {
    "repair_fixture": "Inspect and repair or replace the faulty fixture",
    "improve_lighting": "Improve lighting on this dark stretch",
    "install_shielding": "Install appropriate shielding",
    "correct_direction": "Correct the lighting direction",
    "review_wattage": "Review fixture wattage against the road class",
    "consider_dimming": "Consider a late-night dimming schedule",
    "safety_assessment": "Safety assessment required before any change",
    "verify_measurement": "Conduct additional ground measurements",
}
REDUCTION_ACTIONS = {"review_wattage", "consider_dimming"}
ACTIVITY_WEIGHT = {"low": 0.4, "medium": 0.7, "high": 1.0, "unknown": 0.6}
CONFIDENCE = {"expert_verified": 1.0, "verified": 0.85, "unverified": 0.5}


def severity(obs: Observation, rule: ThresholdRule | None) -> float:
    if obs.classification == "non_functional":
        return 1.0
    if rule is None or obs.lux is None:
        return 0.3
    if obs.classification == "insufficient" and rule.min_lux > 0:
        return max(0.1, min(1.0, (rule.min_lux - obs.lux) / rule.min_lux))
    if obs.classification == "potential_excessive" and rule.max_lux > 0:
        return max(0.1, min(1.0, (obs.lux - rule.max_lux) / rule.max_lux))
    return 0.0


def priority(obs: Observation, loc: Location, rule: ThresholdRule | None) -> tuple[float, str]:
    """score = severity x exposure x confidence x 100 (documented on the Methodology page)."""
    sev = severity(obs, rule)
    exposure = max(ACTIVITY_WEIGHT.get(obs.pedestrian_activity, 0.6), ACTIVITY_WEIGHT.get(obs.vehicle_activity, 0.6))
    if loc.safety_critical and obs.classification in ("insufficient", "non_functional"):
        exposure = min(1.0, exposure * 1.25)
    score = round(sev * exposure * CONFIDENCE.get(obs.verification_status, 0.5) * 100, 1)
    level = "high" if score >= 50 else "medium" if score >= 25 else "low"
    return score, level


def evidence_for(obs: Observation, loc: Location) -> list[str]:
    ev = [f"Classification: {obs.classification.replace('_', ' ')}. {obs.classification_basis}"]
    ev.append(f"Measured {obs.measured_at:%d %b %Y %H:%M}" + (f", {obs.lux:g} lux" if obs.lux is not None else ""))
    ev.append(f"Fixture: {obs.fixture_status.replace('_', ' ')}"
              + (f", {obs.fixture_wattage:g} W" if obs.fixture_wattage else "")
              + f", shielding {obs.shielding}, direction {obs.light_direction}")
    ev.append(f"Activity: pedestrians {obs.pedestrian_activity}, vehicles {obs.vehicle_activity}")
    ev.append(f"Data origin: {obs.data_origin.replace('_', ' ')}; verification: "
              f"{obs.verification_status.replace('_', ' ')}")
    if loc.safety_critical:
        ev.append(f"Safety-critical location{': ' + loc.safety_context if loc.safety_context else ''}")
    return ev


def build_for(obs: Observation, loc: Location, rule: ThresholdRule | None) -> list[dict]:
    """Return recommendation dicts for the latest observation at a location."""
    recs: list[tuple[str, str]] = []
    cls = obs.classification
    verified = obs.verification_status in ("verified", "expert_verified")

    if cls == "non_functional":
        recs.append(("repair_fixture", "The fixture was recorded as not working."))
    elif cls == "needs_investigation":
        recs.append(("verify_measurement", "There is not enough information to classify this location."))
    elif not verified:
        recs.append(("verify_measurement",
                     "This measurement has not been verified. Repeat it before acting on the classification."))
    elif cls == "insufficient":
        recs.append(("improve_lighting", "Measured light is below the configured range for this road type."))
        if obs.fixture_status == "obstructed":
            recs.append(("repair_fixture", "The fixture is obstructed (for example by foliage); clear it first."))
    elif cls == "potential_excessive":
        if obs.shielding in ("none", "partial"):
            recs.append(("install_shielding", f"Shielding recorded as '{obs.shielding}'; light is likely escaping "
                                              "sideways or upward."))
        if obs.light_direction in ("upward", "sideways"):
            recs.append(("correct_direction", f"Light direction recorded as '{obs.light_direction}'."))
        if loc.safety_critical:
            recs.append(("safety_assessment",
                         "Light is above the configured range, but this is a safety-critical location. "
                         "No reduction is suggested without an on-site safety assessment."))
        else:
            recs.append(("review_wattage", "Measured light is above the configured range for this road type."))
            low = obs.pedestrian_activity == "low" and obs.vehicle_activity == "low"
            if low:
                recs.append(("consider_dimming", "Recorded pedestrian and vehicle activity are both low."))
    elif cls == "adequate":
        if obs.shielding == "none" or obs.light_direction == "upward":
            recs.append(("install_shielding" if obs.shielding == "none" else "correct_direction",
                         "Light level is within range, but the fixture lets light escape above the horizontal."))

    score, level = priority(obs, loc, rule)
    ev = evidence_for(obs, loc)
    level_of_evidence = "demo" if obs.data_origin == "demo" else "verified" if verified else "unverified"
    out = []
    for action, why in recs:
        # Hard safety guard: never emit a reduction action for a safety-critical location.
        if loc.safety_critical and action in REDUCTION_ACTIONS:
            continue
        out.append({
            "action": action, "title": ACTIONS[action], "rationale": why, "evidence": ev,
            "evidence_level": level_of_evidence, "safety_hold": action == "safety_assessment",
            "priority_score": score if action != "verify_measurement" else min(score, 24.9),
            "priority_level": level if action != "verify_measurement" else ("medium" if score >= 25 else "low"),
        })
    return out


def regenerate(db: Session) -> int:
    """Rebuild open recommendations; keep the status a reviewer already set."""
    rules = load_rules(db)
    kept = {
        (r.location_id, r.action): r.status
        for r in db.scalars(select(Recommendation).where(Recommendation.status != "open"))
    }
    db.query(Recommendation).delete()
    n = 0
    for loc in db.scalars(select(Location).options(selectinload(Location.observations))):
        if not loc.observations:
            continue
        obs = loc.observations[0]  # latest (relationship ordered by measured_at desc)
        for r in build_for(obs, loc, rules.get(loc.road_type)):
            db.add(Recommendation(
                location_id=loc.id, observation_id=obs.id, action=r["action"], title=r["title"],
                rationale=r["rationale"], evidence_json=json.dumps(r["evidence"]),
                evidence_level=r["evidence_level"], safety_hold=r["safety_hold"],
                priority_score=r["priority_score"], priority_level=r["priority_level"],
                status=kept.get((loc.id, r["action"]), "open"),
            ))
            n += 1
    return n
