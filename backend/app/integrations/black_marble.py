"""NASA Black Marble (VNP46A2) integration via Google Earth Engine - OPTIONAL.

Status: this module is an integration point. It is NOT active unless a Google
Earth Engine service account is configured, and the fetch path below has not
been exercised against live Earth Engine in this repository's test suite.
The website reports this status honestly on the Analysis page.

What the product is
  VNP46A2: daily, moonlight- and atmosphere-corrected night-time radiance,
  15 arc-second grid (about 500 m), from January 2012.
  https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/
  Earth Engine id: NASA/VIIRS/002/VNP46A2

What it cannot tell you
  It records light travelling UP to the satellite at roughly 01:30 local time.
  One pixel covers many streetlights, shops and homes. It cannot establish
  glare, fixture direction, ground-level lux, or the state of any single light.

How to enable
  1. Register a Google Cloud project for Earth Engine (free for research/education).
  2. Create a service account, grant it Earth Engine access, download its JSON key.
  3. pip install earthengine-api
  4. Set DRL_GEE_SERVICE_ACCOUNT and DRL_GEE_KEY_FILE.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

from ..config import STUDY_AREA, get_settings

PRODUCT = "NASA/VIIRS/002/VNP46A2"
BAND = "Gap_Filled_DNB_BRDF_Corrected_NTL"
LIMITATIONS = [
    "Pixel size is about 500 m: one value covers many light sources.",
    "Measures upward radiance only, not light reaching the road or entering homes.",
    "Overpass is around 01:30 local time; evening conditions are not observed.",
    "The sensor is weakly sensitive to blue light, so white LED lighting is under-recorded.",
    "Cloud cover (especially June-September) removes many nights.",
    "Cannot confirm glare, fixture direction or the performance of an individual streetlight.",
]


class NotConfigured(RuntimeError):
    pass


def status() -> dict:
    s = get_settings()
    configured = bool(s.gee_service_account and s.gee_key_file and Path(s.gee_key_file).exists())
    try:
        import ee  # noqa: F401

        library = True
    except ImportError:
        library = False
    return {
        "product": PRODUCT,
        "band": BAND,
        "resolution": "15 arc-seconds (about 500 m)",
        "configured": configured and library,
        "library_installed": library,
        "credentials_present": configured,
        "message": (
            "Earth Engine credentials are configured." if configured and library else
            "Satellite radiance is not integrated in this deployment. No satellite values are shown. "
            "Set DRL_GEE_SERVICE_ACCOUNT and DRL_GEE_KEY_FILE and install earthengine-api to enable it."
        ),
        "limitations": LIMITATIONS,
        "source_url": "https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A2/",
    }


def monthly_mean_radiance(start: date, end: date) -> list[dict]:
    """Mean radiance over the study-area bounding box per month.

    Raises NotConfigured unless Earth Engine credentials are present.
    """
    st = status()
    if not st["configured"]:
        raise NotConfigured(st["message"])
    import ee

    s = get_settings()
    ee.Initialize(ee.ServiceAccountCredentials(s.gee_service_account, s.gee_key_file))
    region = ee.Geometry.Rectangle(
        [STUDY_AREA["min_lon"], STUDY_AREA["min_lat"], STUDY_AREA["max_lon"], STUDY_AREA["max_lat"]]
    )
    col = ee.ImageCollection(PRODUCT).filterDate(start.isoformat(), end.isoformat()).select(BAND)

    def per_month(m):
        m = ee.Date(m)
        img = col.filterDate(m, m.advance(1, "month")).mean()
        val = img.reduceRegion(ee.Reducer.mean(), region, 500, maxPixels=1e9).get(BAND)
        return ee.Feature(None, {"month": m.format("YYYY-MM"), "radiance": val})

    n_months = (end.year - start.year) * 12 + end.month - start.month + 1
    months = ee.List.sequence(0, n_months - 1).map(lambda i: ee.Date(start.isoformat()).advance(i, "month"))
    feats = ee.FeatureCollection(months.map(per_month)).getInfo()["features"]
    return [f["properties"] for f in feats if f["properties"].get("radiance") is not None]
