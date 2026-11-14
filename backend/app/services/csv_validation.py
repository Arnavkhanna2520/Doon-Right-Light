"""Validation and cleaning of ground-audit CSV uploads.

Errors remove a row from the cleaned output. Warnings keep the row but flag it.
Nothing is silently 'fixed' except: header names are normalised, whitespace is
trimmed, and unrecognised category values are set to 'unknown' (with a warning).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from ..config import STUDY_AREA
from ..models import ACTIVITY, DIRECTION, FIXTURE_STATUS, ROAD_TYPES, SHIELDING

REQUIRED = ["location", "latitude", "longitude", "road_type", "measured_at"]
OPTIONAL = [
    "lux", "zone", "weather", "fixture_status", "fixture_wattage", "shielding", "light_direction",
    "pedestrian_activity", "vehicle_activity", "safety_critical", "safety_context", "notes",
]
COLUMNS = REQUIRED + OPTIONAL

ALIASES = {
    "location_name": "location", "site": "location", "name": "location",
    "lat": "latitude", "lon": "longitude", "lng": "longitude", "long": "longitude",
    "road": "road_type", "road_class": "road_type",
    "lux_measurement": "lux", "illuminance": "lux", "lux_reading": "lux",
    "date_time": "measured_at", "datetime": "measured_at", "date_and_time": "measured_at",
    "timestamp": "measured_at", "measurement_date": "measured_at",
    "weather_conditions": "weather",
    "wattage": "fixture_wattage", "shielding_information": "shielding",
    "lighting_direction": "light_direction", "direction": "light_direction",
    "pedestrians": "pedestrian_activity", "vehicles": "vehicle_activity",
    "additional_observations": "notes", "observations": "notes", "remarks": "notes",
    "ward": "zone", "area": "zone",
}
ENUMS = {
    "fixture_status": FIXTURE_STATUS, "shielding": SHIELDING, "light_direction": DIRECTION,
    "pedestrian_activity": ACTIVITY, "vehicle_activity": ACTIVITY,
}
ENUM_SYNONYMS = {
    "not_working": "non_functional", "broken": "non_functional", "off": "non_functional",
    "faulty": "non_functional", "nonfunctional": "non_functional", "ok": "working", "on": "working",
    "functional": "working", "fully_shielded": "full", "shielded": "full", "unshielded": "none",
    "partially_shielded": "partial", "down": "downward", "up": "upward", "side": "sideways",
    "med": "medium", "moderate": "medium", "none_observed": "low",
}
DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%Y-%m-%d", "%d/%m/%Y",
    "%d-%m-%Y",
]
TRUE = {"1", "true", "yes", "y"}
FALSE = {"0", "false", "no", "n", ""}
IMPLAUSIBLE_LUX = 500.0  # warning only: far above typical night-time street readings; check units


def norm_header(h: str) -> str:
    key = "_".join(h.strip().lower().replace("-", " ").replace("/", " ").replace("(", " ").replace(")", " ").split())
    return ALIASES.get(key, key)


def parse_datetime(v: str) -> datetime | None:
    v = v.strip().replace("Z", "")
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def _num(v: str) -> float | None:
    try:
        f = float(v.replace(",", ""))
    except ValueError:
        return None
    return f if f == f and abs(f) != float("inf") else None


def template_csv() -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNS)
    w.writerow([
        "EXAMPLE ROW - replace with your own measurement", "30.0000", "78.0000", "residential",
        "2026-01-15 21:30", "12.5", "Example zone", "clear", "working", "45", "partial", "downward",
        "medium", "low", "no", "", "Reading at 1 m height, sensor horizontal",
    ])
    return buf.getvalue()


def xlsx_to_csv(raw: bytes) -> bytes:
    """Turn the first sheet of an Excel workbook into CSV bytes, so it goes through the same checks as a CSV."""
    from openpyxl import load_workbook

    try:
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception as e:  # not a valid .xlsx file
        raise ValueError("This file could not be read as an Excel workbook (.xlsx).") from e
    ws = wb.worksheets[0]
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in ws.iter_rows(values_only=True):
        cells = []
        for v in row:
            if v is None:
                cells.append("")
            elif isinstance(v, datetime):
                cells.append(v.strftime("%Y-%m-%d %H:%M"))
            elif isinstance(v, bool):
                cells.append("yes" if v else "no")
            elif isinstance(v, float) and v.is_integer():
                cells.append(str(int(v)))
            else:
                cells.append(str(v))
        if any(c.strip() for c in cells):
            w.writerow(cells)
    wb.close()
    return buf.getvalue().encode("utf-8")


def template_xlsx() -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    ws = wb.active
    ws.title = "Survey"
    for row in csv.reader(io.StringIO(template_csv())):
        ws.append(row)
    for c in ws[1]:
        c.font = Font(bold=True)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = max(12, len(str(col[0].value)) + 2)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def validate_csv(raw: bytes, max_rows: int = 20000, now: datetime | None = None) -> dict:
    """Validate raw CSV bytes. Returns a report dict with `cleaned_rows`."""
    now = now or datetime.now()
    issues: list[dict] = []

    def add(row: int | None, column: str, severity: str, code: str, message: str) -> None:
        issues.append({"row": row, "column": column, "severity": severity, "code": code, "message": message})

    def fatal(code: str, message: str) -> dict:
        add(None, "", "error", code, message)
        return _report(0, [], issues, {}, 0, [])

    if b"\x00" in raw[:4096]:
        return fatal("not_text", "This does not look like a text CSV file.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return fatal("encoding", "File is not UTF-8 encoded. Re-save it as 'CSV UTF-8'.")
    if not text.strip():
        return fatal("empty", "The file is empty.")

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header_raw = next(reader)
    except (StopIteration, csv.Error):
        return fatal("empty", "The file has no header row.")
    header = [norm_header(h) for h in header_raw]
    if len(set(header)) != len(header):
        dup = sorted({h for h in header if header.count(h) > 1})
        return fatal("duplicate_columns", f"Duplicate column(s) after normalising names: {', '.join(dup)}.")
    missing_cols = [c for c in REQUIRED if c not in header]
    if missing_cols:
        return fatal("missing_columns", f"Required column(s) missing: {', '.join(missing_cols)}.")
    unknown_cols = [h for h in header if h and h not in COLUMNS]
    for c in unknown_cols:
        add(None, c, "warning", "unknown_column", f"Column '{c}' is not recognised and will be ignored.")

    cleaned: list[dict] = []
    seen: dict[tuple, int] = {}
    missing_counts = {c: 0 for c in OPTIONAL if c in header}
    total = 0
    duplicates = 0

    try:
        for line_no, cells in enumerate(reader, start=2):
            if not any(c.strip() for c in cells):
                continue
            total += 1
            if total > max_rows:
                add(None, "", "error", "too_many_rows", f"File has more than {max_rows} data rows; split it.")
                total -= 1
                break
            if len(cells) != len(header):
                add(line_no, "", "error", "column_count",
                    f"Row has {len(cells)} values but the header has {len(header)} columns.")
                continue
            row = {h: c.strip() for h, c in zip(header, cells) if h in COLUMNS}
            out: dict = {}
            bad = False

            for c in REQUIRED:
                if not row.get(c):
                    add(line_no, c, "error", "missing_required", f"Required value '{c}' is missing.")
                    bad = True
            if bad:
                continue

            out["location"] = row["location"][:200]
            lat, lon = _num(row["latitude"]), _num(row["longitude"])
            if lat is None or not -90 <= lat <= 90:
                add(line_no, "latitude", "error", "bad_latitude", f"Latitude '{row['latitude']}' is not a valid number.")
                bad = True
            if lon is None or not -180 <= lon <= 180:
                add(line_no, "longitude", "error", "bad_longitude",
                    f"Longitude '{row['longitude']}' is not a valid number.")
                bad = True
            dt = parse_datetime(row["measured_at"])
            if dt is None:
                add(line_no, "measured_at", "error", "bad_datetime",
                    f"Date/time '{row['measured_at']}' not understood. Use YYYY-MM-DD HH:MM.")
                bad = True

            lux = None
            if row.get("lux"):
                lux = _num(row["lux"])
                if lux is None:
                    add(line_no, "lux", "error", "bad_lux", f"Lux '{row['lux']}' is not a number.")
                    bad = True
                elif lux < 0:
                    add(line_no, "lux", "error", "negative_lux", "Lux cannot be negative.")
                    bad = True
            watt = None
            if row.get("fixture_wattage"):
                watt = _num(row["fixture_wattage"])
                if watt is None:
                    add(line_no, "fixture_wattage", "error", "bad_wattage",
                        f"Wattage '{row['fixture_wattage']}' is not a number.")
                    bad = True
                elif watt <= 0 or watt > 2000:
                    add(line_no, "fixture_wattage", "warning", "odd_wattage",
                        f"Wattage {watt:g} W is outside the usual range; value dropped.")
                    watt = None
            if bad:
                continue

            rt = row["road_type"].lower().replace(" ", "_").replace("-", "_")
            if rt not in ROAD_TYPES:
                add(line_no, "road_type", "warning", "unknown_road_type",
                    f"Road type '{row['road_type']}' not recognised; stored as 'other'. "
                    f"Allowed: {', '.join(ROAD_TYPES)}.")
                rt = "other"
            out.update(latitude=round(lat, 6), longitude=round(lon, 6), road_type=rt,
                       measured_at=dt.strftime("%Y-%m-%d %H:%M:%S"), lux=lux, fixture_wattage=watt)

            for col, allowed in ENUMS.items():
                v = row.get(col, "").lower().replace(" ", "_").replace("-", "_")
                v = ENUM_SYNONYMS.get(v, v)
                if not v:
                    v = "unknown"
                elif v not in allowed:
                    add(line_no, col, "warning", "unknown_value",
                        f"'{row[col]}' is not a recognised {col} value; stored as 'unknown'.")
                    v = "unknown"
                out[col] = v

            sc = row.get("safety_critical", "").lower()
            if sc in TRUE:
                out["safety_critical"] = True
            elif sc in FALSE:
                out["safety_critical"] = False
            else:
                add(line_no, "safety_critical", "warning", "unknown_value",
                    f"'{row['safety_critical']}' is not yes/no; stored as 'no'.")
                out["safety_critical"] = False
            out["safety_context"] = row.get("safety_context", "")[:200]
            out["zone"] = row.get("zone", "")[:120]
            out["weather"] = row.get("weather", "")[:60]
            out["notes"] = row.get("notes", "")[:2000]

            for c in missing_counts:
                if not row.get(c):
                    missing_counts[c] += 1

            # consistency checks (warnings)
            if not (STUDY_AREA["min_lat"] <= lat <= STUDY_AREA["max_lat"]
                    and STUDY_AREA["min_lon"] <= lon <= STUDY_AREA["max_lon"]):
                add(line_no, "latitude", "warning", "outside_study_area",
                    "Coordinates fall outside the approximate Dehradun study area. Check for swapped lat/lon.")
            if dt > now + timedelta(days=1):
                add(line_no, "measured_at", "warning", "future_date", "Measurement date is in the future.")
            if 7 <= dt.hour < 17 and (dt.hour, dt.minute, dt.second) != (0, 0, 0):
                add(line_no, "measured_at", "warning", "daytime",
                    "Measurement time is during daylight hours; night-time readings are expected.")
            if lux is not None and lux > IMPLAUSIBLE_LUX:
                add(line_no, "lux", "warning", "implausible_lux",
                    f"{lux:g} lux is unusually high for night-time street lighting. Check the meter range/units.")
            if out["fixture_status"] == "non_functional" and lux is not None and lux > 5:
                add(line_no, "lux", "warning", "inconsistent",
                    "Fixture marked non-functional but lux is above 5; the light may come from other sources.")
            if out["light_direction"] == "upward" and out["shielding"] == "full":
                add(line_no, "shielding", "warning", "inconsistent",
                    "Fixture marked fully shielded but directed upward; please re-check.")

            key = (out["location"].lower(), out["latitude"], out["longitude"], out["measured_at"])
            if key in seen:
                duplicates += 1
                add(line_no, "", "warning", "duplicate",
                    f"Duplicate of row {seen[key]} (same location, coordinates and time); removed.")
                continue
            seen[key] = line_no
            out["_row"] = line_no
            cleaned.append(out)
    except csv.Error as exc:
        add(None, "", "error", "malformed", f"CSV could not be parsed: {exc}.")

    return _report(total, cleaned, issues, missing_counts, duplicates, unknown_cols)


def _report(total, cleaned, issues, missing_counts, duplicates, unknown_cols) -> dict:
    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]
    error_rows = {i["row"] for i in errors if i["row"] is not None}
    return {
        "summary": {
            "total_rows": total,
            "valid_rows": len(cleaned),
            "rejected_rows": len(error_rows),
            "duplicate_rows": duplicates,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "missing_values": missing_counts,
            "ignored_columns": unknown_cols,
            "can_import": bool(cleaned),
        },
        "issues": issues[:500],
        "issues_truncated": len(issues) > 500,
        "preview": [{k: v for k, v in r.items() if k != "_row"} for r in cleaned[:20]],
        "cleaned_rows": cleaned,
    }


def cleaned_to_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        r = dict(r)
        r["safety_critical"] = "yes" if r.get("safety_critical") else "no"
        for k in ("lux", "fixture_wattage"):
            if r.get(k) is None:
                r[k] = ""
        w.writerow(r)
    return buf.getvalue()
