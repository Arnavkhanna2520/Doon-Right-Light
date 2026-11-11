"""Pure logic: classification, energy, CSV validation, Gi*, recommendations."""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app import models as m
from app.services import csv_validation as cv
from app.services import energy, hotspots
from app.services.classification import ThresholdRule, classify
from app.services.recommendations import REDUCTION_ACTIONS, build_for, priority

RULE = ThresholdRule(5, 15, "local_policy", "test")


@pytest.mark.parametrize("lux,status,rule,expected", [
    (2, "working", RULE, "insufficient"),
    (5, "working", RULE, "adequate"),
    (15, "working", RULE, "adequate"),
    (15.1, "working", RULE, "potential_excessive"),
    (50, "non_functional", RULE, "non_functional"),
    (None, "working", RULE, "needs_investigation"),
    (10, "working", None, "needs_investigation"),
])
def test_classify(lux, status, rule, expected):
    assert classify(lux, status, rule)[0] == expected


def test_classify_never_claims_official_standard_for_demo_threshold():
    _, basis = classify(30, "working", ThresholdRule(5, 15, "demo_placeholder"))
    assert "NOT an official standard" in basis


def test_energy_formula():
    r = energy.estimate(energy.EnergyInput(fixtures=100, current_wattage=120, proposed_wattage=90,
                                           hours_per_day=11, days=365, tariff=6.5))
    assert r.current_kwh == pytest.approx(100 * 0.120 * 11 * 365)   # 48,180
    assert r.proposed_kwh == pytest.approx(100 * 0.090 * 11 * 365)  # 36,135
    assert r.saved_kwh == pytest.approx(12045.0)
    assert r.saved_cost == pytest.approx(12045.0 * 6.5)
    assert r.percent_reduction == 25.0


def test_energy_rejects_bad_input():
    with pytest.raises(ValidationError):
        energy.EnergyInput(fixtures=0, current_wattage=100, proposed_wattage=50, hours_per_day=10, days=1, tariff=1)
    with pytest.raises(ValidationError):
        energy.EnergyInput(fixtures=1, current_wattage=100, proposed_wattage=50, hours_per_day=25, days=1, tariff=1)


def test_csv_header_aliases_and_clean_rows():
    from tests.conftest import GOOD_CSV
    rep = cv.validate_csv(GOOD_CSV.encode(), now=datetime(2026, 2, 1))
    s = rep["summary"]
    assert s["total_rows"] == 5 and s["valid_rows"] == 5 and s["error_count"] == 0
    row_d = rep["cleaned_rows"][3]
    assert row_d["fixture_status"] == "non_functional" and row_d["lux"] is None
    assert rep["cleaned_rows"][2]["safety_critical"] is True
    assert s["missing_values"]["lux"] == 1


def test_csv_detects_errors_duplicates_and_inconsistencies():
    raw = (
        "location,latitude,longitude,road_type,measured_at,lux,fixture_status\n"
        "A,30.32,78.03,residential,2026-01-10 21:30,5,working\n"
        "A,30.32,78.03,residential,2026-01-10 21:30,5,working\n"       # duplicate
        "B,abc,78.03,residential,2026-01-10 21:30,5,working\n"         # bad latitude
        "C,30.32,78.03,residential,not-a-date,5,working\n"             # bad date
        "D,30.32,78.03,residential,2026-01-10 21:30,-4,working\n"      # negative lux
        ",30.32,78.03,residential,2026-01-10 21:30,5,working\n"        # missing location
        "E,78.03,30.32,residential,2026-01-10 21:30,5,working\n"       # swapped coords -> warning
        "F,30.32,78.03,motorway,2026-01-10 13:00,900,sparkly\n"        # unknown values, daytime, high lux
        "G,30.32,78.03,residential,2026-01-10 21:30,30,non_functional\n"  # inconsistent
        "H,30.32,78.03,residential,2026-01-10 21:30,5\n"               # wrong column count
    )
    rep = cv.validate_csv(raw.encode(), now=datetime(2026, 2, 1))
    codes = {i["code"] for i in rep["issues"]}
    assert {"duplicate", "bad_latitude", "bad_datetime", "negative_lux", "missing_required", "outside_study_area",
            "unknown_road_type", "unknown_value", "daytime", "implausible_lux", "inconsistent",
            "column_count"} <= codes
    s = rep["summary"]
    assert s["total_rows"] == 10 and s["duplicate_rows"] == 1 and s["rejected_rows"] == 5
    assert [r["location"] for r in rep["cleaned_rows"]] == ["A", "E", "F", "G"]
    f = next(r for r in rep["cleaned_rows"] if r["location"] == "F")
    assert f["road_type"] == "other" and f["fixture_status"] == "unknown"


@pytest.mark.parametrize("raw,code", [
    (b"", "empty"),
    (b"\x00\x01\x02binary", "not_text"),
    (b"\xff\xfe\xfa", "encoding"),
    (b"location,latitude\nA,1\n", "missing_columns"),
])
def test_csv_rejects_unusable_files(raw, code):
    rep = cv.validate_csv(raw)
    assert rep["summary"]["can_import"] is False
    assert rep["issues"][0]["code"] == code


def test_cleaned_csv_round_trips():
    from tests.conftest import GOOD_CSV
    first = cv.validate_csv(GOOD_CSV.encode(), now=datetime(2026, 2, 1))["cleaned_rows"]
    again = cv.validate_csv(cv.cleaned_to_csv(first).encode(), now=datetime(2026, 2, 1))
    assert again["summary"]["error_count"] == 0
    strip = lambda rows: [{k: v for k, v in r.items() if k != "_row"} for r in rows]  # noqa: E731
    assert strip(again["cleaned_rows"]) == strip(first)


def test_gi_star_needs_enough_points():
    assert hotspots.getis_ord_gi_star([30.0] * 5, [78.0] * 5, [1, 2, 3, 4, 5])["status"] == "insufficient_data"


def test_gi_star_finds_planted_cluster():
    lat, lon, val = [], [], []
    for i in range(6):
        for j in range(6):
            lat.append(30.30 + i * 0.002)
            lon.append(78.00 + j * 0.002)
            val.append(80.0 if i < 2 and j < 2 else 5.0 + (i + j) % 3)
    res = hotspots.getis_ord_gi_star(lat, lon, val, radius_m=320)
    assert res["status"] == "ok" and res["n"] == 36
    z = {(round(lat[r["index"]], 3), round(lon[r["index"]], 3)): r for r in res["results"]}
    assert z[(30.30, 78.0)]["label"] == "hot_99"
    assert z[(30.31, 78.01)]["label"] == "not_significant" or z[(30.31, 78.01)]["z"] < 0


def test_gi_star_matches_hand_calculation():
    # 30 points far apart except points 0 and 1 (about 111 m apart): each neighbourhood = {self, other}
    lat = [30.0, 30.001] + [31.0 + i for i in range(28)]
    lon = [78.0] * 30
    x = [10.0, 20.0] + [1.0] * 28
    res = hotspots.getis_ord_gi_star(lat, lon, x, radius_m=200)
    n, mean = 30, sum(x) / 30
    s = (sum(v * v for v in x) / n - mean**2) ** 0.5
    expected = (30 - mean * 2) / (s * ((n * 2 - 4) / (n - 1)) ** 0.5)
    assert res["results"][0]["z"] == pytest.approx(expected, abs=1e-3)
    assert res["results"][0]["neighbours"] == 1


def _obs(**kw):
    base = dict(lux=40.0, fixture_status="working", shielding="none", light_direction="upward",
                pedestrian_activity="low", vehicle_activity="low", verification_status="verified",
                data_origin="ground_measured", classification="potential_excessive", classification_basis="x",
                measured_at=datetime(2026, 1, 1, 22, 0), fixture_wattage=120.0)
    base.update(kw)
    return m.Observation(**base)


def test_recommendations_for_verified_excess():
    loc = m.Location(name="L", road_type="residential", safety_critical=False, safety_context="")
    actions = {r["action"] for r in build_for(_obs(), loc, RULE)}
    assert actions == {"install_shielding", "correct_direction", "review_wattage", "consider_dimming"}


def test_safety_critical_location_never_gets_a_reduction():
    loc = m.Location(name="J", road_type="junction", safety_critical=True, safety_context="Junction")
    recs = build_for(_obs(), loc, RULE)
    actions = {r["action"] for r in recs}
    assert not actions & REDUCTION_ACTIONS
    assert "safety_assessment" in actions
    assert next(r for r in recs if r["action"] == "safety_assessment")["safety_hold"] is True


def test_unverified_measurement_only_asks_for_verification():
    loc = m.Location(name="L", road_type="residential", safety_critical=False, safety_context="")
    recs = build_for(_obs(verification_status="unverified"), loc, RULE)
    assert [r["action"] for r in recs] == ["verify_measurement"]
    assert recs[0]["priority_level"] != "high"


def test_priority_formula():
    loc = m.Location(name="L", road_type="residential", safety_critical=False, safety_context="")
    # severity = min(1,(40-15)/15)=1 ; exposure low=0.4 ; confidence verified=0.85 -> 34
    assert priority(_obs(), loc, RULE) == (34.0, "medium")
    dead = _obs(classification="non_functional", pedestrian_activity="high", verification_status="expert_verified")
    assert priority(dead, loc, RULE) == (100.0, "high")


def test_rate_limit_survives_restart():
    from fastapi import HTTPException

    from app.security import RateLimiter
    first = RateLimiter()
    for _ in range(3):
        first.check("unit:1.2.3.4", 3, 60)
    restarted = RateLimiter()  # a new process sees the same database
    with pytest.raises(HTTPException) as e:
        restarted.check("unit:1.2.3.4", 3, 60)
    assert e.value.status_code == 429
    restarted.check("unit:5.6.7.8", 3, 60)  # other clients are unaffected
