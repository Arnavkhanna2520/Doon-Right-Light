"""PDF report generation (ReportLab). Every report states period, sources, method and limitations."""
from __future__ import annotations

import io
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .classification import LABELS

NAVY = colors.HexColor("#0f1b2d")
AMBER = colors.HexColor("#b45309")
GREY = colors.HexColor("#5b6777")

_ss = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=_ss["Title"], textColor=NAVY, fontSize=20, alignment=0, spaceAfter=4)
H2 = ParagraphStyle("h2", parent=_ss["Heading2"], textColor=NAVY, fontSize=13, spaceBefore=12, spaceAfter=6)
BODY = ParagraphStyle("body", parent=_ss["BodyText"], fontSize=9.5, leading=13)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, textColor=GREY, leading=11)
WARN = ParagraphStyle("warn", parent=BODY, textColor=AMBER, fontName="Helvetica-Bold")

METHOD = (
    "Each location is classified from its most recent ground observation in the reporting period. "
    "A fixture recorded as not working is 'non-functional'. Otherwise the lux reading is compared with the "
    "range configured for the road type; with no reading or no configured range the location 'requires "
    "investigation'. Priority = severity x exposure x confidence (0-100). Hotspots use the Getis-Ord Gi* "
    "statistic with a fixed distance band."
)
LIMITS = [
    "Coverage is limited to surveyed locations; absence of a marker does not mean absence of a problem.",
    "Single readings vary with moonlight, weather, traffic and nearby shop lighting.",
    "Thresholds are those configured in the platform; check their recorded basis before relying on them.",
    "Citizen reports are leads to be verified, not measurements.",
    "Recommendations are options for a qualified engineer to assess, not instructions. No reduction of "
    "lighting should be made at safety-critical locations without an on-site safety assessment.",
]


def _p(text: str, style=BODY) -> Paragraph:
    return Paragraph(escape(str(text)), style)


def _table(rows: list[list], widths=None, header=True) -> Table:
    data = [[_p(c, SMALL if i else ParagraphStyle("th", parent=SMALL, textColor=colors.white))
             if not isinstance(c, Paragraph) else c for c in r] for i, r in enumerate(rows)]
    if not header:
        data = [[_p(c, SMALL) for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#c9d1dc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY),
                  ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f5f8")])]
    t.setStyle(TableStyle(style))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(18 * mm, 10 * mm, "Doon Right-Light - street lighting audit platform for Dehradun")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _build(story: list, title: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title=title, author="Doon Right-Light")
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def energy_pdf(i, r) -> bytes:
    story = [
        _p("Energy savings estimate", H1),
        _p(f"Generated {datetime.now():%d %b %Y %H:%M}", SMALL),
        _p("ESTIMATE ONLY - based entirely on the assumptions entered by the user. Not a measured saving.", WARN),
        _p("Inputs", H2),
        _table([["Input", "Value"], ["Number of fixtures", f"{i.fixtures:,}"],
                ["Current wattage", f"{i.current_wattage:g} W"], ["Proposed wattage", f"{i.proposed_wattage:g} W"],
                ["Operating hours per day", f"{i.hours_per_day:g}"], ["Operating days", f"{i.days:,}"],
                ["Tariff", f"{i.tariff:g} per kWh"]], [70 * mm, 60 * mm]),
        _p("Results", H2),
        _table([["Measure", "Current", "Proposed", "Difference"],
                ["Energy (kWh)", f"{r.current_kwh:,.2f}", f"{r.proposed_kwh:,.2f}", f"{r.saved_kwh:,.2f}"],
                ["Cost", f"{r.current_cost:,.2f}", f"{r.proposed_cost:,.2f}", f"{r.saved_cost:,.2f}"],
                ["Reduction", "", "", f"{r.percent_reduction:g} %"]], [45 * mm, 40 * mm, 40 * mm, 40 * mm]),
        _p("Method", H2),
        _p("Energy (kWh) = fixtures x wattage (kW) x operating hours per day x operating days. "
           "Cost = energy x tariff."),
        _p("Limitations", H2),
        _p(r.note),
        _p("Lower wattage is not automatically appropriate. Any change must keep light levels within the "
           "applicable road-lighting standard and must not be applied at safety-critical locations without "
           "an on-site assessment."),
    ]
    return _build(story, "Energy savings estimate")


def summary_pdf(*, period: str, filters_text: str, feats: list[dict], st: dict, hot: dict | None,
                reports: dict | None, recs: list[dict], thresholds: list[dict], sections: set[str]) -> bytes:
    k = st["kpis"]
    story: list = [
        _p("Doon Right-Light - lighting audit report", H1),
        _p(f"Generated {datetime.now():%d %b %Y %H:%M}  |  Reporting period: {period}  |  Filters: {filters_text}",
           SMALL),
    ]
    if k["demo_locations"]:
        story.append(_p(
            f"CONTAINS DEMO DATA: {k['demo_locations']} of {k['monitored_locations']} locations are synthetic "
            "demonstration records. They are not observations of Dehradun and must not be cited as findings.", WARN))
    story += [
        _p("Data sources", H2),
        _p("Ground observations uploaded to the platform (origin and verification status are listed per record); "
           "citizen reports submitted through the public form; base map (c) OpenStreetMap contributors. "
           "No satellite radiance values are included in this report."),
    ]
    if "overview" in sections:
        story += [_p("Overview", H2), _table(
            [["Measure", "Count"], ["Monitored locations", k["monitored_locations"]],
             ["Potential excessive lighting", k["potential_excessive"]], ["Insufficient lighting", k["insufficient"]],
             ["Non-functional streetlights", k["non_functional"]], ["Adequately illuminated", k["adequate"]],
             ["Requires investigation", k["needs_investigation"]], ["High-priority locations", k["high_priority"]]],
            [90 * mm, 40 * mm])]
        if st["by_zone"]:
            story += [_p("By zone", H2), _table(
                [["Zone", "Locations", "Excessive", "Insufficient", "Non-functional", "Adequate", "Avg lux"]] +
                [[z["zone"], z["total"], z["potential_excessive"], z["insufficient"], z["non_functional"],
                  z["adequate"], "" if z["avg_lux"] is None else z["avg_lux"]] for z in st["by_zone"]],
                [45 * mm, 20 * mm, 22 * mm, 24 * mm, 26 * mm, 20 * mm, 17 * mm])]
        story += [_p("Thresholds in force", H2)]
        if thresholds:
            story.append(_table(
                [["Road type", "Range (lux)", "Basis", "Source"]] +
                [[t["road_type"], f"{t['min_lux']:g} - {t['max_lux']:g}", t["basis_label"], t["source_note"]]
                 for t in thresholds], [30 * mm, 28 * mm, 50 * mm, 66 * mm]))
        else:
            story.append(_p("No thresholds are configured. All measured locations are 'requires investigation'."))
    if "locations" in sections:
        story += [_p("Location-wise audit", H2)]
        rows = [["Location", "Zone", "Road", "Lux", "Classification", "Origin / verification", "Measured"]]
        for f in feats[:400]:
            o = f["latest"]
            rows.append([f["name"], f["zone"], f["road_type"], "" if o["lux"] is None else f"{o['lux']:g}",
                         LABELS.get(o["classification"], o["classification"]),
                         f"{o['data_origin']} / {o['verification_status']}".replace("_", " "),
                         o["measured_at"][:10]])
        story.append(_table(rows, [38 * mm, 26 * mm, 20 * mm, 12 * mm, 34 * mm, 28 * mm, 18 * mm]))
        if len(feats) > 400:
            story.append(_p(f"Showing 400 of {len(feats)} locations. Use the CSV export for the full list.", SMALL))
    if "hotspots" in sections and hot is not None:
        story += [_p("Hotspot analysis (Getis-Ord Gi*)", H2)]
        if hot["status"] != "ok":
            story.append(_p(hot.get("message", "Not available.")))
        else:
            sig = [r for r in hot["results"] if r["label"] != "not_significant"]
            story.append(_p(
                f"{hot['n']} locations with lux readings, distance band {hot['radius_m']:g} m. "
                f"{len(sig)} locations are statistically significant at 90% or above. "
                "A 'hot' cluster means higher ground lux than expected by chance; it does not by itself mean "
                "the lighting is excessive."))
            if sig:
                story.append(_table(
                    [["Location", "Zone", "Lux", "z-score", "Result"]] +
                    [[r["name"], r["zone"], f"{r['lux']:g}", r["z"], r["label"].replace("_", " ") + "%"]
                     for r in sorted(sig, key=lambda r: -abs(r["z"]))[:60]],
                    [60 * mm, 40 * mm, 18 * mm, 20 * mm, 36 * mm]))
    if "complaints" in sections and reports is not None:
        story += [_p("Citizen report summary", H2),
                  _p(f"Total reports: {reports['total']}"
                     + (f" (including {reports['demo']} demo reports)" if reports["demo"] else "") +
                     ". Reports are unverified until reviewed by an authorised person."),
                  _table([["Status", "Count"]] + [[s["key"].replace("_", " "), s["count"]]
                                                  for s in reports["by_status"]], [70 * mm, 30 * mm]),
                  Spacer(1, 6),
                  _table([["Category", "Count"]] + [[c["key"].replace("_", " "), c["count"]]
                                                    for c in reports["by_category"]], [70 * mm, 30 * mm])]
    if "recommendations" in sections:
        story += [_p("Recommendations (highest priority first)", H2)]
        if not recs:
            story.append(_p("No recommendations for the selected data."))
        else:
            story.append(_table(
                [["Priority", "Location", "Suggested action", "Why", "Evidence"]] +
                [[f"{r['priority_level']} ({r['priority_score']:g})", r["location"]["name"], r["title"],
                  r["rationale"], r["evidence_level"]] for r in recs[:80]],
                [22 * mm, 36 * mm, 42 * mm, 56 * mm, 18 * mm]))
    story += [_p("Methodology", H2), _p(METHOD), _p("Limitations", H2)]
    story += [_p(f"- {x}") for x in LIMITS]
    return _build(story, "Doon Right-Light lighting audit report")
