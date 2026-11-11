"""Command-line helpers.

  python -m app.cli create-admin EMAIL [--role admin|auditor|moderator]
  python -m app.cli seed-demo [--if-present | --if-empty]
  python -m app.cli purge-demo
  python -m app.cli reset-password EMAIL
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

from fastapi import HTTPException
from sqlalchemy import select

from . import models as m
from .db import SessionLocal
from .security import hash_password, validate_password_strength
from .seed import purge_demo, seed_demo


def main() -> None:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    ca = sub.add_parser("create-admin", help="create a staff user (password is prompted, or read from DRL_NEW_PASSWORD)")
    ca.add_argument("email")
    ca.add_argument("--role", default="admin", choices=m.ROLES)
    ca.add_argument("--name", default="")
    sd = sub.add_parser("seed-demo", help="load clearly-labelled synthetic demonstration data")
    sd.add_argument("--if-present", action="store_true", help="only refresh demo data that is already loaded")
    sd.add_argument("--if-empty", action="store_true", help="only load demo data when the database has no locations at all")
    sub.add_parser("purge-demo", help="remove all demonstration data")
    rp = sub.add_parser("reset-password", help="set a new password for a staff user (prompted, or read from DRL_NEW_PASSWORD)")
    rp.add_argument("email")
    a = p.parse_args()
    with SessionLocal() as db:
        if a.cmd == "create-admin":
            email = a.email.strip().lower()
            if db.scalar(select(m.User.id).where(m.User.email == email)):
                sys.exit(f"User {email} already exists.")
            pw = os.environ.get("DRL_NEW_PASSWORD") or getpass.getpass("Password: ")
            try:
                validate_password_strength(pw)
            except HTTPException as e:
                sys.exit(e.detail)
            db.add(m.User(email=email, full_name=a.name, role=a.role, password_hash=hash_password(pw)))
            db.commit()
            print(f"Created {a.role} {email}")
        elif a.cmd == "seed-demo":
            if a.if_present and not db.scalar(select(m.Location.id).where(m.Location.data_origin == "demo")):
                print("No demo data loaded; nothing to refresh.")
                return
            if a.if_empty and db.scalar(select(m.Location.id).limit(1)):
                print("Locations already exist; demo data not loaded.")
                return
            print(seed_demo(db))
            db.commit()
        elif a.cmd == "reset-password":
            u = db.scalar(select(m.User).where(m.User.email == a.email.strip().lower()))
            if not u:
                sys.exit(f"No user {a.email}.")
            pw = os.environ.get("DRL_NEW_PASSWORD") or getpass.getpass("New password: ")
            try:
                validate_password_strength(pw)
            except HTTPException as e:
                sys.exit(e.detail)
            u.password_hash = hash_password(pw)
            u.is_active = True
            db.commit()
            print(f"Password reset for {u.email}")
        elif a.cmd == "purge-demo":
            print(purge_demo(db))
            db.commit()


if __name__ == "__main__":
    main()
