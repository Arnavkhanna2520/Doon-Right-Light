"""End-to-end API behaviour: auth, permissions, uploads, reports, exports, data integrity."""
import io

from PIL import Image
from sqlalchemy import select

from app import models as m
from app.seed import seed_demo
from tests.conftest import GOOD_CSV, PASSWORD, login


def png_bytes(exif: bool = False) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 150, 20)).save(buf, "PNG")
    return buf.getvalue()


def set_threshold(admin, road="residential", lo=5, hi=15, basis="local_policy"):
    r = admin.put(f"/api/admin/thresholds/{road}", json={"min_lux": lo, "max_lux": hi, "basis": basis,
                                                         "source_note": "Test value entered by test suite"})
    assert r.status_code == 200, r.text


def upload(auditor, content=GOOD_CSV, name="audit.csv"):
    return auditor.post("/api/datasets/validate", files={"file": (name, content, "text/csv")},
                        data={"data_origin": "ground_measured", "source_note": "unit test", "collected_on": "2026-01-10"})


# ------------------------------------------------------------------ auth
def test_login_logout_and_me(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/session").json() == {"user": None}
    assert client.post("/api/auth/login", json={"email": "admin@example.org", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "ADMIN@example.org ", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["role"] == "admin"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/auth/me").json()["email"] == "admin@example.org"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_passwords_are_hashed(db):
    u = db.scalar(select(m.User).where(m.User.email == "admin@example.org"))
    assert PASSWORD not in u.password_hash and u.password_hash.startswith("$2")


def test_login_is_rate_limited(client):
    codes = [client.post("/api/auth/login", json={"email": "x@example.org", "password": "nope"}).status_code
             for _ in range(12)]
    assert codes[:10] == [401] * 10 and codes[-1] == 429


def test_tampered_session_cookie_is_rejected(client):
    client.cookies.set("drl_session", "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0.")
    assert client.get("/api/auth/me").status_code == 401


def test_role_permissions(admin, auditor, moderator, client):
    for path in ("/api/admin/reports", "/api/admin/users", "/api/admin/audit-logs", "/api/datasets",
                 "/api/exports/observations.csv", "/api/exports/report.pdf"):
        assert client.get(path).status_code == 401, path
    assert moderator.get("/api/admin/reports").status_code == 200
    assert auditor.get("/api/admin/reports").status_code == 403
    assert moderator.get("/api/admin/users").status_code == 403
    assert auditor.get("/api/admin/audit-logs").status_code == 403
    assert upload(moderator).status_code == 403
    assert moderator.put("/api/admin/thresholds/residential", json={
        "min_lux": 1, "max_lux": 2, "basis": "local_policy", "source_note": "nope nope"}).status_code == 403
    assert admin.get("/api/admin/users").status_code == 200


def test_admin_user_management(admin):
    assert admin.post("/api/admin/users", json={"email": "new@example.org", "password": "short",
                                                "role": "auditor"}).status_code == 422
    r = admin.post("/api/admin/users", json={"email": "new@example.org", "password": "Another-Pass-77",
                                             "role": "auditor"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert admin.post("/api/admin/users", json={"email": "new@example.org", "password": "Another-Pass-77",
                                                "role": "auditor"}).status_code == 409
    assert admin.patch(f"/api/admin/users/{uid}", json={"is_active": False}).status_code == 200
    c = login.__globals__["TestClient"](admin.app)
    assert c.post("/api/auth/login", json={"email": "new@example.org", "password": "Another-Pass-77"}).status_code == 401
    me = admin.get("/api/auth/me").json()["id"]
    assert admin.patch(f"/api/admin/users/{me}", json={"is_active": False}).status_code == 409


# --------------------------------------------------- upload -> classify -> recommend
def test_csv_upload_validate_import_flow(admin, auditor, client):
    set_threshold(admin)                     # residential 5-15
    r = upload(auditor)
    assert r.status_code == 201, r.text
    ds = r.json()
    assert ds["valid_count"] == 5 and ds["report"]["summary"]["can_import"]
    assert len(ds["report"]["preview"]) == 5
    cleaned = auditor.get(f"/api/datasets/{ds['id']}/cleaned.csv")
    assert cleaned.status_code == 200 and cleaned.text.splitlines()[0].startswith("location,latitude")
    r = auditor.post(f"/api/datasets/{ds['id']}/import")
    assert r.json() == {"imported_observations": 5, "new_locations": 5}
    assert auditor.post(f"/api/datasets/{ds['id']}/import").status_code == 409  # no double import

    feats = {f["name"]: f for f in client.get("/api/locations").json()["items"]}
    assert feats["Test Road A"]["latest"]["classification"] == "insufficient"
    assert feats["Test Road B"]["latest"]["classification"] == "potential_excessive"
    assert feats["Test Road D"]["latest"]["classification"] == "non_functional"
    assert feats["Test Road E"]["latest"]["classification"] == "adequate"
    # junction has no threshold configured -> never guessed
    assert feats["Test Junction C"]["latest"]["classification"] == "needs_investigation"
    assert all(f["latest"]["verification_status"] == "unverified" for f in feats.values())
    assert all(f["latest"]["data_origin"] == "ground_measured" for f in feats.values())

    # unverified data -> only 'verify' or fault-check recommendations
    recs = client.get("/api/recommendations?page_size=100").json()["items"]
    assert {r["action"] for r in recs} <= {"verify_measurement", "repair_fixture"}

    # verify B (excess) and the junction; add a junction threshold
    obs = {o["location"]["name"]: o for o in auditor.get("/api/admin/observations").json()["items"]}
    for name in ("Test Road B", "Test Junction C"):
        assert auditor.patch(f"/api/admin/observations/{obs[name]['id']}",
                             json={"verification_status": "verified"}).status_code == 200
    set_threshold(admin, "junction", 20, 50)
    recs = client.get("/api/recommendations?page_size=100").json()["items"]
    by_loc = {}
    for r in recs:
        by_loc.setdefault(r["location"]["name"], set()).add(r["action"])
    assert {"install_shielding", "correct_direction", "review_wattage", "consider_dimming"} <= by_loc["Test Road B"]
    assert "safety_assessment" in by_loc["Test Junction C"]
    assert not by_loc["Test Junction C"] & {"review_wattage", "consider_dimming"}
    assert all(r["evidence"] for r in recs)

    st = client.get("/api/stats").json()
    assert st["kpis"]["monitored_locations"] == 5 and st["kpis"]["demo_locations"] == 0
    assert client.get("/api/stats?classification=insufficient").json()["kpis"]["monitored_locations"] == 1
    assert client.get("/api/locations?classification=verified_issue").json()["count"] == 2
    assert client.get("/api/locations?q=junction").json()["count"] == 1
    assert client.get("/api/locations?date_to=2025-12-31").json()["count"] == 0


def test_upload_rejects_wrong_files(auditor):
    assert upload(auditor, name="data.xlsx").status_code == 415
    assert upload(auditor, content="x" * (6 * 1024 * 1024)).status_code == 413
    r = upload(auditor, content="foo,bar\n1,2\n")
    assert r.status_code == 201 and r.json()["report"]["summary"]["can_import"] is False
    assert auditor.post(f"/api/datasets/{r.json()['id']}/import").status_code == 422


def test_no_threshold_means_no_classification_guess(auditor, client):
    ds = upload(auditor).json()
    auditor.post(f"/api/datasets/{ds['id']}/import")
    classes = {f["latest"]["classification"] for f in client.get("/api/locations").json()["items"]}
    assert classes == {"needs_investigation", "non_functional"}
    assert client.get("/api/thresholds").json()["items"] == []


# ------------------------------------------------------------ demo integrity
def test_demo_data_is_labelled_and_cannot_be_verified(admin, auditor, client, db):
    counts = admin.post("/api/admin/demo-data").json()
    assert counts["locations"] == 100
    meta = client.get("/api/meta").json()
    assert meta["has_demo_data"] and not meta["has_real_data"]
    feats = client.get("/api/locations").json()["items"]
    assert len(feats) == 100 and all(f["latest"]["data_origin"] == "demo" for f in feats)
    assert all("demo point" in f["name"] for f in feats)
    assert {f["zone"] for f in feats} >= {"Rajpur Road", "Araghar", "Clock Tower"}
    assert all(t["basis"] == "demo_placeholder" for t in client.get("/api/thresholds").json()["items"])
    assert client.get("/api/locations?classification=verified_issue").json()["count"] == 0
    assert client.get("/api/locations?include_demo=false").json()["count"] == 0
    assert all(r["evidence_level"] == "demo"
               for r in client.get("/api/recommendations?page_size=100").json()["items"])
    oid = feats[0]["latest"]["id"]
    assert auditor.patch(f"/api/admin/observations/{oid}", json={"verification_status": "verified"}).status_code == 409
    hot = client.get("/api/analysis/hotspots?radius_m=1500").json()
    assert hot["status"] == "ok" and hot["contains_demo"] is True
    assert admin.delete("/api/admin/demo-data").json()["locations_removed"] == 100
    assert client.get("/api/locations").json()["count"] == 0
    assert client.get("/api/thresholds").json()["items"] == []


def test_demo_seed_does_not_overwrite_real_threshold(admin, db):
    set_threshold(admin, "residential", 3, 9, "verified_standard")
    seed_demo(db)
    db.commit()
    t = db.scalar(select(m.Threshold).where(m.Threshold.road_type == "residential"))
    assert (t.min_lux, t.max_lux, t.basis) == (3, 9, "verified_standard")


# ---------------------------------------------------------- citizen reports
REPORT = {"category": "broken_streetlight", "description": "The streetlight outside the park gate is not working.",
          "location_text": "Park gate, test colony", "latitude": "30.3200", "longitude": "78.0300",
          "elapsed_ms": "9000"}


def test_citizen_report_lifecycle(client, moderator):
    r = client.post("/api/reports", data={**REPORT, "contact_name": "A Resident", "contact_info": "a@example.org",
                                          "consent": "true"},
                    files={"photo": ("p.png", png_bytes(), "image/png")})
    assert r.status_code == 201, r.text
    pid = r.json()["public_id"]
    assert pid.startswith("DRL-") and r.json()["status"] == "submitted"

    t = client.get(f"/api/reports/track/{pid.lower()}").json()
    assert t["status"] == "submitted" and "contact" not in str(t) and "description" not in t
    assert client.get("/api/reports/public").json()["items"] == []          # unverified -> not public
    assert client.get("/api/reports/track/DRL-NOPE0000").status_code == 404

    item = moderator.get("/api/admin/reports").json()["items"][0]
    assert item["contact_info"] == "a@example.org" and item["has_photo"]
    assert client.get(f"/api/admin/reports/{item['id']}/photo").status_code == 401
    photo = moderator.get(f"/api/admin/reports/{item['id']}/photo")
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(photo.content)).getexif() == {}             # metadata stripped

    r = moderator.patch(f"/api/admin/reports/{item['id']}", json={"status": "verified",
                                                                  "public_note": "Forwarded to the lighting team."})
    assert r.json()["status"] == "verified"
    assert moderator.patch(f"/api/admin/reports/{item['id']}", json={"status": "nonsense"}).status_code == 422
    pub = client.get("/api/reports/public").json()["items"]
    assert len(pub) == 1 and set(pub[0]) == {"public_id", "category", "status", "is_demo", "latitude", "longitude",
                                             "submitted_at"}
    assert pub[0]["latitude"] == 30.32
    assert client.get(f"/api/reports/track/{pid}").json()["public_note"] == "Forwarded to the lighting team."


def test_citizen_report_validation_and_duplicates(client):
    assert client.post("/api/reports", data={**REPORT, "category": "nope"}).status_code == 422
    assert client.post("/api/reports", data={**REPORT, "description": "short"}).status_code == 422
    assert client.post("/api/reports", data={"category": "other", "description": "No location given at all.",
                                             "elapsed_ms": "9000"}).status_code == 422
    assert client.post("/api/reports", data={**REPORT, "contact_info": "x@example.org"}).status_code == 422  # no consent
    assert client.post("/api/reports", data=REPORT,
                       files={"photo": ("evil.png", b"<script>alert(1)</script>", "image/png")}).status_code == 415
    a = client.post("/api/reports", data=REPORT)
    b = client.post("/api/reports", data={**REPORT, "latitude": "30.3202"})
    assert a.json()["possible_duplicate"] is False and b.json()["possible_duplicate"] is True


def test_citizen_report_spam_protection(client, db):
    bot = client.post("/api/reports", data={**REPORT, "website": "http://spam.example"})
    assert bot.status_code == 201                                   # bot is told nothing
    assert db.scalar(select(m.CitizenReport)) is None                # ...and nothing is stored
    fast = client.post("/api/reports", data={**REPORT, "elapsed_ms": "300"})
    assert fast.status_code == 201 and db.scalar(select(m.CitizenReport)) is None
    codes = [client.post("/api/reports", data={**REPORT, "latitude": str(30.1 + i)}).status_code for i in range(6)]
    assert codes[-1] == 429 and 201 in codes


def test_ip_is_not_stored_raw(client, db):
    client.post("/api/reports", data=REPORT)
    r = db.scalar(select(m.CitizenReport))
    assert len(r.submitter_hash) == 64 and "testclient" not in r.submitter_hash


# ----------------------------------------------------------------- exports
def test_exports(admin, moderator, client):
    admin.post("/api/admin/demo-data")
    r = moderator.get("/api/exports/observations.csv")
    assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
    lines = r.text.splitlines()
    assert "synthetic demonstration records" in lines[0] and len(lines) == 100 + 2
    assert moderator.get("/api/exports/hotspots.csv?radius_m=1500").text.count("\n") > 90
    assert moderator.get("/api/exports/recommendations.csv").status_code == 200
    rep = moderator.get("/api/exports/citizen-reports.csv")
    assert "contact" not in rep.text.splitlines()[1]
    pdf = moderator.get("/api/exports/report.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 5000
    e = client.post("/api/energy/estimate.pdf", json={"fixtures": 10, "current_wattage": 120, "proposed_wattage": 90,
                                                      "hours_per_day": 11, "days": 365, "tariff": 6})
    assert e.status_code == 200 and e.content[:5] == b"%PDF-"
    logs = admin.get("/api/admin/audit-logs").json()
    assert logs["total"] >= 6 and any(a["action"] == "export" for a in logs["items"])


def test_energy_endpoint(client):
    r = client.post("/api/energy/estimate", json={"fixtures": 100, "current_wattage": 120, "proposed_wattage": 90,
                                                  "hours_per_day": 11, "days": 365, "tariff": 6.5})
    assert r.json()["saved_kwh"] == 12045.0 and r.json()["percent_reduction"] == 25.0
    bad = client.post("/api/energy/estimate", json={"fixtures": -1, "current_wattage": 120, "proposed_wattage": 90,
                                                    "hours_per_day": 11, "days": 365, "tariff": 6.5})
    assert bad.status_code == 422 and isinstance(bad.json()["detail"], str)


# ------------------------------------------------------------------- misc
def test_security_headers_and_unknown_api(client):
    r = client.get("/api/health")
    assert r.json() == {"status": "ok"}
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert client.get("/api/does-not-exist").status_code == 404


def test_satellite_integration_reports_honest_status(client):
    s = client.get("/api/satellite/status").json()
    assert s["configured"] is False and "not integrated" in s["message"]
    assert any("500 m" in x for x in s["limitations"])


def test_manual_location_and_safety_flag(admin, auditor, client):
    set_threshold(admin)
    r = auditor.post("/api/admin/locations", json={"name": "Manual site", "latitude": 30.33, "longitude": 78.04,
                                                   "road_type": "residential", "lux": 30, "shielding": "none"})
    assert r.status_code == 201
    lid = r.json()["id"]
    d = client.get(f"/api/locations/{lid}").json()
    assert d["observations"][0]["classification"] == "potential_excessive"
    assert auditor.patch(f"/api/admin/locations/{lid}", json={"safety_critical": True,
                                                              "safety_context": "School gate"}).status_code == 200
    assert auditor.delete(f"/api/admin/locations/{lid}").status_code == 200
    assert client.get(f"/api/locations/{lid}").status_code == 404
