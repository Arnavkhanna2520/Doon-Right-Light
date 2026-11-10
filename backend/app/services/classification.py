"""Lighting classification.

Rule order (documented on the Methodology page):
  1. Fixture reported non-functional            -> non_functional
  2. No lux reading                             -> needs_investigation
  3. No threshold configured for the road type  -> needs_investigation
  4. lux < min                                  -> insufficient
  5. lux > max                                  -> potential_excessive
  6. otherwise                                  -> adequate

The platform never invents official lux limits. Thresholds come from the
`thresholds` table, each with a recorded basis and source.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Observation, Threshold

LABELS = {
    "potential_excessive": "Potential excessive lighting",
    "insufficient": "Insufficient lighting",
    "non_functional": "Non-functional streetlight",
    "adequate": "Adequately illuminated",
    "needs_investigation": "Requires investigation",
}
BASIS_LABELS = {
    "demo_placeholder": "illustrative demo threshold (NOT an official standard)",
    "verified_standard": "verified standard",
    "local_policy": "local policy value",
}


@dataclass(frozen=True)
class ThresholdRule:
    min_lux: float
    max_lux: float
    basis: str = "local_policy"
    source_note: str = ""


def classify(lux: float | None, fixture_status: str, rule: ThresholdRule | None) -> tuple[str, str]:
    """Return (classification, human-readable basis)."""
    if fixture_status == "non_functional":
        return "non_functional", "Fixture recorded as non-functional."
    if lux is None:
        return "needs_investigation", "No lux measurement available; requires ground measurement."
    if rule is None:
        return (
            "needs_investigation",
            "No threshold configured for this road type; requires expert assessment.",
        )
    basis = BASIS_LABELS.get(rule.basis, rule.basis)
    rng = f"{rule.min_lux:g}-{rule.max_lux:g} lux, {basis}"
    if lux < rule.min_lux:
        return "insufficient", f"{lux:g} lux is below the configured range ({rng})."
    if lux > rule.max_lux:
        return "potential_excessive", f"{lux:g} lux is above the configured range ({rng})."
    return "adequate", f"{lux:g} lux is within the configured range ({rng})."


def load_rules(db: Session) -> dict[str, ThresholdRule]:
    return {
        t.road_type: ThresholdRule(t.min_lux, t.max_lux, t.basis, t.source_note)
        for t in db.scalars(select(Threshold))
    }


def apply(obs: Observation, road_type: str, rules: dict[str, ThresholdRule]) -> None:
    obs.classification, obs.classification_basis = classify(obs.lux, obs.fixture_status, rules.get(road_type))


def reclassify_all(db: Session) -> int:
    """Recompute every observation after thresholds change."""
    rules = load_rules(db)
    n = 0
    for obs in db.scalars(select(Observation)):
        apply(obs, obs.location.road_type, rules)
        n += 1
    return n
