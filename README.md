# Doon Right-Light

**The right light, in the right place, at the right time.**

Doon Right-Light is a street lighting audit and light pollution monitoring platform for Dehradun, Uttarakhand. It records ground-level lighting measurements, classifies each surveyed location as over-lit, under-lit, non-functional or adequate, collects citizen reports, and turns the result into a ranked, evidence-backed list of sites for authorities to check.

The aim is not to remove streetlights. It is to light streets properly and stop paying for light that goes into the sky.

> **Data honesty.** This repository contains **no real measurements of Dehradun**. The site works out of the box with clearly labelled demo data: the demo points sit around real Dehradun areas (Rajpur Road, Araghar, Clock Tower and others), but every value is invented. It ships with **no lux limits**: thresholds must be entered by an administrator from a cited source. Satellite data is an optional integration that is **off** unless you configure it.

## Features

| Area | What it does |
| --- | --- |
| Home page | Interactive night-sky hero (drag to shield the streetlights and watch the stars return), then the problem, the method and how to take part |
| Guide | A plain-language page explaining every page in three steps, linked from each page header |
| Themes | Night (default) and light modes with a switch in the navigation bar; the choice is remembered |
| Public and staff areas | The main menu holds only public pages (Dashboard, Map, Analysis, Recommendations, Calculator, Guide, Report an issue). Staff pages (Upload data, Records, Reports, Admin) appear in a separate Staff bar after signing in, filtered by role |
| Dashboard | One-sentence summary, four cards (places checked, too bright, too dim, not working) and four charts: overall condition, the 10 areas needing most attention, condition in every area, residents' reports. All driven by shared filters |
| Interactive map | OpenStreetMap + Leaflet. Markers are drawn as points of light whose glow reflects the condition; a dotted outer ring marks demo data. Night, light and street basemaps. Popups show measurement, fixture, verification and suggested action. Layer control, lux heatmap, legend, search, filters |
| Analysis | Clusters of bright lights and of dark spots, grouped by area (Getis-Ord Gi\* within 500 m, explained on the Methodology page), and a chart of how bright the places are |
| Upload data (staff) | Excel (.xlsx) or CSV upload with an Excel or CSV template; every row checked (missing values, duplicates, wrong types, inconsistent values), preview, cleaned-data download, import |
| Records (staff) | Every uploaded file (when, by whom, rows saved) and a searchable list of all readings, filterable by file |
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

**Windows, one click:** download [`run-on-windows.bat`](run-on-windows.bat), put it in any folder and double-click it. It downloads or updates the project, installs dependencies, creates your admin account on first run, loads demo data and opens `http://localhost:8000`. (Needs Git, Python and Node.js installed.)

**Manual steps:**

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

### Forgotten passwords

An administrator can set a new temporary password for any other staff account in **Admin > Staff accounts > Reset password**. If the only administrator is locked out, run this on the server:

```
python -m app.cli reset-password you@example.org
```

## Environment variables

`DRL_LOAD_DEMO=true` (set in `render.yaml`) loads the labelled demo data on the first start only, when the database is empty. Set it to `false` once real data is imported.


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

Download the template from the Upload data page: `GET /api/datasets/template.xlsx` (Excel) or `GET /api/datasets/template.csv`. Excel files are read from their first sheet and checked exactly like a CSV.

Required: `location`, `latitude`, `longitude`, `road_type`, `measured_at`.
Optional: `lux`, `zone`, `weather`, `fixture_status`, `fixture_wattage`, `shielding`, `light_direction`, `pedestrian_activity`, `vehicle_activity`, `safety_critical`, `safety_context`, `notes`.

Common header variants (`Lux Measurement`, `Date Time`, `Lighting Direction`…) are recognised. Errors reject a row; warnings keep it and flag it.

## Data sources and attribution

| Source | Use | Status in this repository |
| --- | --- | --- |
| Ground lux surveys | The core evidence | You collect and upload them |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map data, © OpenStreetMap contributors | Active |
| [CARTO basemaps](https://carto.com/attributions) | Night and light map styles (the default), © CARTO | Active; check CARTO's terms before commercial or high-traffic use |
| [NASA Black Marble VNP46A2](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/) | City-wide night-time radiance, about 500 m | **Not integrated by default** |
| IS 1944 (BIS) | Source for thresholds | Not included; enter values yourself |

### Satellite data (future work, hidden from the site)

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

Known limits: rate-limit counts are kept in the database (as salted hashes, not IP addresses), so they survive restarts and are shared between processes. There is no email-based password reset; administrators reset staff passwords (see above).

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
- Demo data is synthetic and labelled. Coordinates for some demo areas are approximate and not independently verified.
- Satellite data (NASA Black Marble) is not connected and is hidden from the site. The integration code is kept, switched off, as future work.
- The production setup was tested against PostgreSQL 16 (migrations, demo seeding, sign-in, exports, rate limits), but the Docker image and the Render blueprint have not yet been run on Render itself.

## Licence

Released under the MIT Licence. See `LICENSE`.
