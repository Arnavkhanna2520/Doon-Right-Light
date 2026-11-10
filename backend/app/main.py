"""Doon Right-Light API and (in production) static frontend host."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError, ProgrammingError

from . import models as m
from .config import get_settings
from .db import SessionLocal
from .routers import admin, auth, citizen, datasets, exports, public
from .security import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("drl")
settings = get_settings()

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org; font-src 'self' data:; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
)


def bootstrap_admin() -> None:
    """Create the first administrator from DRL_ADMIN_EMAIL / DRL_ADMIN_PASSWORD, once."""
    if not (settings.admin_email and settings.admin_password):
        return
    with SessionLocal() as db:
        try:
            if db.scalar(select(func.count()).select_from(m.User)):
                return
        except (OperationalError, ProgrammingError):
            log.warning("Database tables missing. Run: alembic upgrade head")
            return
        db.add(m.User(email=settings.admin_email.strip().lower(), full_name="Administrator", role="admin",
                      password_hash=hash_password(settings.admin_password)))
        db.commit()
        log.info("Bootstrap administrator created: %s", settings.admin_email)


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap_admin()
    yield


app = FastAPI(
    title="Doon Right-Light API",
    description="Street lighting audit and light pollution monitoring platform for Dehradun.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/api/openapi.json",
)

if settings.cors_list:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
    if not request.url.path.startswith("/api/docs"):
        h.setdefault("Content-Security-Policy", CSP)
    if settings.is_production:
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith("/api/"):
        h.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        field = ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path"))
        errors.append({"field": field, "message": e["msg"]})
    first = errors[0] if errors else {"field": "", "message": "Invalid input."}
    msg = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return JSONResponse({"detail": msg, "errors": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)


for r in (public.router, auth.router, citizen.router, datasets.router, admin.router, exports.router):
    app.include_router(r)


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(rest: str):
    raise HTTPException(404, "Unknown API endpoint.")


PUBLIC_PAGES = ["", "dashboard", "map", "analysis", "audit", "report", "recommendations", "calculator",
                "downloads", "methodology", "privacy"]


@app.get("/robots.txt", include_in_schema=False)
def robots(request: Request):
    base = str(request.base_url).rstrip("/")
    return PlainTextResponse(f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /login\n"
                             f"Sitemap: {base}/sitemap.xml\n")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap(request: Request):
    base = str(request.base_url).rstrip("/")
    urls = "".join(f"<url><loc>{base}/{p}</loc></url>" for p in PUBLIC_PAGES)
    return Response(f'<?xml version="1.0" encoding="UTF-8"?>'
                    f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
                    media_type="application/xml")


# ---- static frontend (built with `npm run build` in /frontend) ----
dist = settings.frontend_dist
if (dist / "index.html").is_file():
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = (dist / path).resolve()
        if path and dist.resolve() in target.parents and target.is_file():
            return FileResponse(target)
        # Client-side routes: serve the app shell. Unknown routes render the in-app 404 page.
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
else:
    log.info("Frontend build not found at %s; serving API only.", dist)
