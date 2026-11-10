# Doon Right-Light

**The right light, in the right place, at the right time.**

Doon Right-Light is a street lighting audit and light pollution monitoring platform for Dehradun, Uttarakhand. It records ground-level lighting measurements, classifies each surveyed location as over-lit, under-lit, non-functional or adequate, collects citizen reports, and turns the result into a ranked, evidence-backed list of sites for authorities to check.

The aim is not to remove streetlights. It is to light streets properly and stop paying for light that goes into the sky.

> **Data honesty.** This repository contains **no real measurements of Dehradun**. The site works out of the box with clearly labelled synthetic demo data. It ships with **no lux limits**: thresholds must be entered by an administrator from a cited source. Satellite data is an optional integration that is **off** unless you configure it.

## Features

| Area | What it does |
| --- | --- |
| Home page | Explains the problem, the method and how to take part |
| Dashboard | KPI cards and charts (condition, zone comparison, monthly trend, priority, energy estimate, citizen reports), all driven by shared filters |
| Interactive map | OpenStreetMap + Leaflet. Marker shape shows the lighting condition; hollow markers are demo data. Popups show measurement, fixture, verification and suggested action. Layer control, lux heatmap, legend, search, filters |
| Analysis | Lux distributions, road-type comparison, data-quality indicators, Getis-Ord Gi\* hotspots, and a plain statement of what satellite data can and cannot show |
| Lighting audit | CSV upload with validation (missing values, duplicates, wrong types, inconsistent values), preview, cleaned-data download, import |
| Citizen reporting | Public form with optional map pin and photo, report ID, status tracking, duplicate linking, spam protection |
| Admin panel | Report moderation, observation verification, locations, thresholds, staff accounts, activity log, demo-data controls |
| Recommendations | Rule-based, safety-aware suggestions with the evidence for each |
| Energy calculator | Energy and cost estimate from user-entered assumptions, with PDF export |
| Reports | CSV and PDF exports that state period, sources, method and limitations |

## Architecture

```
frontend/   React 19 + TypeScript + Vite + Tailwind CSS 4 + Leaflet + Recharts
backend/    FastAPI + SQLAlchemy 2 + Alembic + ReportLab + NumPy
            SQLite by default, PostgreSQL through DRL_DATABASE_URL
```

In production the FastAPI app serves the built frontend, so the whole site is **one service on one origin**. That keeps the session cookie simple (no CORS) and makes deployment a single container.

```
backend/app/
  main.py              app, security headers, error handling, static hosting
  config.py            settings from environment variables
  models.py            Users, Locations, Observations, Thresholds, CitizenReports,
                       Datasets, Recommendations, AuditLogs
  security.py          bcrypt hashing, JWT session cookie, roles, rate limiter, audit helper
  routers/             public, auth, citizen, datasets, admin, exports
  services/            classification, csv_validation, hotspots (Gi*), recommendations,
                       energy, pdf, queries
  integrations/        black_marble.py (optional Google Earth Engine)
  seed.py, cli.py      demo data and command-line helpers
backend/alembic/       database migrations
backend/tests/         44 automated tests
```

## Run it locally

Requirements: Python 3.11+ and Node.js 20+.

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head                                   # creates backend/data/doon.db
python -m app.cli create-admin you@example.org         # prompts for a password
python -m app.cli seed-demo                            # optional: labelled demo data
uvicorn app.main:app --reload --port 8000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                                            # http://localhost:5173 (proxies /api to :8000)
```

To run it the way production does, build the frontend (`npm run build`) and open `http://localhost:8000`.

API documentation is available at `http://localhost:8000/api/docs` in development.

## Environment variables

All variables are prefixed `DRL_`. See [`.env.example`](.env.example).

| Variable | Purpose | Default |
| --- | --- | --- |
| `DRL_ENV` | `development` or `production` | `development` |
| `DRL_SECRET_KEY` | Signs session cookies. **Required in production** | random per process in development |
| `DRL_DATABASE_URL` | Database connection string | SQLite file in `backend/data/` |
| `DRL_TRUST_PROXY` | Read the client IP from `X-Forwarded-For` | `false` |
| `DRL_CORS_ORIGINS` | Extra allowed origins if the frontend is hosted separately | none |
| `DRL_ADMIN_EMAIL`, `DRL_ADMIN_PASSWORD` | Creates the first administrator once, if no users exist | none |
| `DRL_REPORT_RATE_LIMIT` | Public reports per IP per hour | `5` |
| `DRL_MAX_PHOTO_MB`, `DRL_MAX_CSV_MB` | Upload size limits | `5` |
| `DRL_UPLOAD_DIR` | Where report photos are stored | `backend/data/uploads` |
| `DRL_GEE_SERVICE_ACCOUNT`, `DRL_GEE_KEY_FILE` | Optional Earth Engine credentials | none |

## Roles

| Role | Can do |
| --- | --- |
| Administrator | Everything, including thresholds, staff accounts, activity log and demo data |
| Auditor | Upload and import surveys, add locations, verify or delete observations, export |
| Moderator | Review citizen reports, export |

Residents need no account to submit or track a report.

## Data model and provenance

Every observation carries two labels that are shown throughout the interface:

- **`data_origin`**: `demo`, `ground_measured`, `imported` or `satellite`
- **`verification_status`**: `unverified`, `verified` or `expert_verified`

Rules enforced in code and covered by tests:

- Imported data starts as **unverified**.
- Demo records **cannot** be marked as verified.
- Citizen reports are hidden from the public map until a moderator reviews them, and are then shown with coordinates rounded to about 100 m and without description, photo or contact details.
- Loading demo data never overwrites a real threshold.

## How classification works

Applied in order to the latest observation at each location:

1. Fixture recorded as not working → **non-functional**
2. No lux reading, or no threshold configured for the road type → **requires investigation**
3. Lux below the configured range → **insufficient**
4. Lux above the configured range → **potential excessive**
5. Otherwise → **adequate**

**Thresholds.** None are built in. An administrator enters the adequate lux range per road type in *Admin → Thresholds*, with its basis and source. The Indian reference is IS 1944 (Code of practice for lighting of public thoroughfares, BIS). Obtain the applicable edition and enter values from it. The demo data uses invented placeholder ranges that are labelled as such on every screen.

**Priority** = severity × exposure × confidence × 100. Details are on the site's Methodology page.

**Safety rule.** At a location flagged safety-critical (junction, crossing, hospital, bus stop), the engine never suggests lowering light. It asks for an on-site safety assessment. Unverified readings only produce a request to re-measure.

## CSV format for surveys

Download the template from the Lighting audit page or `GET /api/datasets/template.csv`.

Required: `location`, `latitude`, `longitude`, `road_type`, `measured_at`.
Optional: `lux`, `zone`, `weather`, `fixture_status`, `fixture_wattage`, `shielding`, `light_direction`, `pedestrian_activity`, `vehicle_activity`, `safety_critical`, `safety_context`, `notes`.

Common header variants (`Lux Measurement`, `Date Time`, `Lighting Direction`…) are recognised. Errors reject a row; warnings keep it and flag it.

## Data sources and attribution

| Source | Use | Status in this repository |
| --- | --- | --- |
| Ground lux surveys | The core evidence | You collect and upload them |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Base map tiles, © OpenStreetMap contributors | Active |
| [NASA Black Marble VNP46A2](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/) | City-wide night-time radiance, about 500 m | **Not integrated by default** |
| IS 1944 (BIS) | Source for thresholds | Not included; enter values yourself |

### Satellite data

`backend/app/integrations/black_marble.py` is an integration point for Black Marble through Google Earth Engine (`NASA/VIIRS/002/VNP46A2`). It is inactive unless you install `earthengine-api` and set `DRL_GEE_SERVICE_ACCOUNT` and `DRL_GEE_KEY_FILE`. The site shows the integration status honestly on the Analysis page. **The fetch function has not been run against live Earth Engine**, and no page displays satellite values yet; treat it as a starting point.

Satellite radiance records light travelling upward at about 01:30, one value per roughly 500 m. It cannot establish glare, fixture direction, ground-level lux or the state of any single streetlight.

## Security and privacy

- Passwords hashed with bcrypt; never stored or logged in plain text
- Session in a signed, HTTP-only, `SameSite=Lax` cookie (`Secure` in production)
- Role checks on every staff endpoint; login and public submissions are rate limited
- Server-side validation of every input; safe, generic error messages
- Photos are decoded and re-encoded on upload, which rejects non-images and strips EXIF/GPS metadata; size and type limits apply
- Report photos and contact details are served to moderators only and excluded from exports
- The reporter's IP address is not stored; only a salted one-way hash is kept for spam control
- Security headers including a Content Security Policy; CSV exports neutralise spreadsheet formulas
- Activity log of sign-ins, reviews, imports, exports and configuration changes
- Secrets come from environment variables; nothing sensitive is in the frontend bundle

Known limits: the rate limiter is in-memory, so it is per process; put a shared store behind it before running several instances. There is no email verification or password reset flow; administrators set and reset staff passwords.

## Tests

```bash
cd backend && python -m pytest          # 44 tests
cd frontend && npm run build            # type-check and production build
```

The backend suite covers classification, the energy formula, CSV validation, Gi\* (including a hand calculation), recommendation safety rules, authentication, role permissions, the upload-to-recommendation flow, the citizen report lifecycle, spam protection, exports and demo-data integrity. GitHub Actions runs both on every push.

## Deployment

The simplest route is one Docker web service plus managed PostgreSQL.

**Render (blueprint included)**

1. Push this repository to GitHub.
2. In Render: *New → Blueprint* and select the repository. `render.yaml` creates the web service and a PostgreSQL database and generates `DRL_SECRET_KEY`.
3. Set `DRL_ADMIN_EMAIL` and `DRL_ADMIN_PASSWORD` when prompted. Sign in, then change the password in *Admin → Data and account*.
4. Migrations run automatically on start (`alembic upgrade head`).

**Any Docker host**

```bash
docker build -t doon-right-light .
docker run -p 8000:8000 -e DRL_SECRET_KEY=change-me -e DRL_DATABASE_URL=postgresql://... doon-right-light
```

**Hosting limitations to know about**

- Free web services sleep when idle and have no persistent disk. Use PostgreSQL for data. Uploaded report **photos are lost on redeploy** unless you attach a disk and point `DRL_UPLOAD_DIR` at it.
- SQLite is fine for local use and demos, not for a free host without a disk.
- Map tiles come from OpenStreetMap's public tile servers, which are for light use. For real traffic, use a tile provider or host your own.
- Supabase works as the PostgreSQL provider: paste its connection string into `DRL_DATABASE_URL`.

**What has and has not been verified.** The application was built, run and tested locally on SQLite, including browser checks of every page. The Docker image, the Render blueprint and the PostgreSQL path are provided but were **not** deployed or run as part of development, so expect to do a first-deploy check.

## Limitations

- Coverage is limited to surveyed locations. No marker means "not surveyed".
- A single lux reading varies with moonlight, weather and traffic. Repeat visits matter.
- Energy figures are estimates from nameplate wattage, not metered consumption.
- Citizen reports are leads, not measurements.
- This is a student project, not an official service of any government body.

## Licence

No licence has been chosen yet. Add one (for example MIT) before inviting outside contributions.
