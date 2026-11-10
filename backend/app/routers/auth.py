from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import (COOKIE_NAME, audit, client_ip, create_token, get_current_user, get_optional_user, hash_password, limiter,
                        validate_password_strength, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


def user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    limiter.check(f"login:{client_ip(request)}", s.login_rate_limit, 15 * 60)
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else None)
    if not ok or not user or not user.is_active:
        audit(db, request, None, "login_failed", "user", "", body.email[:100])
        db.commit()
        raise HTTPException(401, "Incorrect email or password.")
    response.set_cookie(
        COOKIE_NAME, create_token(user), max_age=s.session_hours * 3600, httponly=True,
        secure=s.secure_cookies, samesite="lax", path="/",
    )
    audit(db, request, user, "login", "user", user.id)
    db.commit()
    return user_dict(user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_dict(user)


@router.get("/session")
def session(user: User | None = Depends(get_optional_user)):
    """Who is signed in, if anyone. Always 200 so anonymous visitors do not log a console error."""
    return {"user": user_dict(user) if user else None}


@router.post("/change-password")
def change_password(body: PasswordChange, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    validate_password_strength(body.new_password)
    user = db.get(User, user.id)
    user.password_hash = hash_password(body.new_password)
    audit(db, request, user, "password_changed", "user", user.id)
    db.commit()
    return {"ok": True}
