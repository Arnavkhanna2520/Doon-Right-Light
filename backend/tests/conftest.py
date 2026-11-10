import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="drl-test-")
os.environ.update(
    DRL_ENV="test", DRL_DATABASE_URL=f"sqlite:///{_tmp}/test.db", DRL_UPLOAD_DIR=f"{_tmp}/uploads",
    DRL_SECRET_KEY="test-secret-key-not-for-production-use-0123456789", DRL_FRONTEND_DIST=f"{_tmp}/no-dist",
    DRL_REPORT_RATE_LIMIT="5",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import models as m  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import hash_password, limiter  # noqa: E402

PASSWORD = "Correct-Horse-42"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    with SessionLocal() as db:
        for email, role in (("admin@example.org", "admin"), ("auditor@example.org", "auditor"),
                            ("moderator@example.org", "moderator")):
            db.add(m.User(email=email, role=role, password_hash=hash_password(PASSWORD)))
        db.commit()
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def client():
    return TestClient(app)


def login(role: str = "admin") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": f"{role}@example.org", "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture
def admin():
    return login("admin")


@pytest.fixture
def auditor():
    return login("auditor")


@pytest.fixture
def moderator():
    return login("moderator")


GOOD_CSV = (
    "Location,Latitude,Longitude,Road Type,Date Time,Lux Measurement,Fixture Status,Fixture Wattage,Shielding,"
    "Lighting Direction,Pedestrian Activity,Vehicle Activity,Safety Critical,Additional Observations\n"
    "Test Road A,30.3200,78.0300,residential,2026-01-10 21:30,2.0,working,45,none,upward,low,low,no,first\n"
    "Test Road B,30.3210,78.0310,residential,2026-01-10 21:40,40.0,working,120,none,upward,low,low,no,bright\n"
    "Test Junction C,30.3220,78.0320,junction,2026-01-10 21:50,90.0,working,120,none,sideways,low,low,yes,jn\n"
    "Test Road D,30.3230,78.0330,residential,2026-01-10 22:00,,not working,45,,,,,no,dead lamp\n"
    "Test Road E,30.3240,78.0340,residential,2026-01-10 22:10,8.0,working,45,full,downward,medium,low,no,fine\n"
)
