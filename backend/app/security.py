"""Authentication, authorisation, rate limiting and audit helpers."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuditLog, User

COOKIE_NAME = "drl_session"
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-shape check: always runs bcrypt, even for unknown users."""
    hashed = password_hash.encode() if password_hash else _DUMMY_HASH
    try:
        ok = bcrypt.checkpw(password.encode("utf-8")[:72], hashed)
    except ValueError:
        ok = False
    return ok and password_hash is not None


def validate_password_strength(password: str) -> None:
    if len(password) < 10:
        raise HTTPException(422, "Password must be at least 10 characters long.")
    if password.lower() == password or not any(c.isdigit() for c in password):
        raise HTTPException(422, "Password must include an upper-case letter and a digit.")


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(hours=s.session_hours)}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def client_ip(request: Request) -> str:
    s = get_settings()
    if s.trust_proxy:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def ip_fingerprint(request: Request) -> str:
    """Salted hash of the client IP. The raw IP is never stored with a report."""
    s = get_settings()
    return hashlib.sha256(f"{s.secret_key}:{client_ip(request)}".encode()).hexdigest()


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    if not user or not user.is_active:
        return None
    return user


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required.")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role != "admin" and user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to do this.")
        return user

    return dep


require_admin = require_roles()  # admin only
require_auditor = require_roles("auditor")
require_moderator = require_roles("moderator")
require_staff = require_roles("auditor", "moderator")


class RateLimiter:
    """Sliding-window limiter stored in the database, so limits survive restarts
    and are shared by every server process using the same database.
    Keys are stored as salted SHA-256 hashes, never as raw IP addresses."""

    def _hash(self, key: str) -> str:
        return hashlib.sha256(f"{get_settings().secret_key}|{key}".encode()).hexdigest()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        from sqlalchemy import delete, func, select

        from .db import SessionLocal
        from .models import RateLimitHit, utcnow

        now = utcnow()
        since = now - timedelta(seconds=window_seconds)
        h = self._hash(key)
        with SessionLocal() as db:
            db.execute(delete(RateLimitHit).where(RateLimitHit.created_at < now - timedelta(days=1)))
            count, oldest = db.execute(
                select(func.count(RateLimitHit.id), func.min(RateLimitHit.created_at))
                .where(RateLimitHit.key_hash == h, RateLimitHit.created_at >= since)).one()
            if count >= limit:
                db.commit()
                retry = int(window_seconds - (now - oldest).total_seconds()) + 1 if oldest else window_seconds
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many requests. Please try again later.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            db.add(RateLimitHit(key_hash=h, created_at=now))
            db.commit()

    def reset(self) -> None:
        from sqlalchemy import delete

        from .db import SessionLocal
        from .models import RateLimitHit

        with SessionLocal() as db:
            db.execute(delete(RateLimitHit))
            db.commit()


limiter = RateLimiter()


def audit(db: Session, request: Request | None, user: User | None, action: str,
          entity: str = "", entity_id: object = "", detail: str = "") -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "",
            action=action,
            entity=entity,
            entity_id=str(entity_id),
            detail=detail[:2000],
            ip=client_ip(request) if request else "",
        )
    )
