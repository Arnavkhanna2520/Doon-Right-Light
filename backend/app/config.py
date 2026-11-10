"""Application settings, read from environment variables (see .env.example)."""
from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

# Approximate bounding box of the Dehradun study area. Used only to WARN about
# coordinates that look out of place and to frame the map. It is not an
# administrative boundary.
STUDY_AREA = {
    "name": "Dehradun, Uttarakhand, India",
    "center": [30.3165, 78.0322],
    "min_lat": 30.20,
    "max_lat": 30.46,
    "min_lon": 77.85,
    "max_lon": 78.20,
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DRL_", extra="ignore")

    env: str = "development"  # development | production | test
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'doon.db'}"
    secret_key: str = ""
    session_hours: int = 8
    cookie_secure: bool | None = None  # default: True in production
    trust_proxy: bool = False  # honour X-Forwarded-For (set true behind Render/Nginx)
    cors_origins: str = ""  # comma separated; empty = same-origin only

    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    max_photo_mb: int = 5
    max_csv_mb: int = 5
    max_csv_rows: int = 20000

    report_rate_limit: int = 5  # public submissions per IP per hour
    login_rate_limit: int = 10  # attempts per IP per 15 minutes

    admin_email: str = ""  # optional first-run bootstrap
    admin_password: str = ""

    frontend_dist: Path = REPO_DIR / "frontend" / "dist"

    # Optional Google Earth Engine integration (NASA Black Marble)
    gee_service_account: str = ""
    gee_key_file: str = ""

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.secret_key:
        if s.is_production:
            raise RuntimeError("DRL_SECRET_KEY must be set in production.")
        # Development convenience: random key per process (sessions reset on restart).
        s.secret_key = secrets.token_urlsafe(48)
    if s.database_url.startswith("postgres://"):
        s.database_url = s.database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif s.database_url.startswith("postgresql://"):
        s.database_url = s.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if s.database_url.startswith("sqlite:///"):
        Path(s.database_url.replace("sqlite:///", "", 1)).parent.mkdir(parents=True, exist_ok=True)
    s.upload_dir.mkdir(parents=True, exist_ok=True)
    return s
