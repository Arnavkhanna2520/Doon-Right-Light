"""Getis-Ord Gi* hotspot statistic on ground lux measurements.

Gi* asks, for each point: is the sum of values in my neighbourhood (including
me) higher or lower than expected if values were spread at random? The result
is a z-score. |z| >= 1.96 is conventionally 'significant at 95%'.

Caveats shown in the UI: needs enough points (we require 30), results depend
on the chosen distance band, and many simultaneous tests inflate false positives.
"""
from __future__ import annotations

import numpy as np

MIN_POINTS = 30
EARTH_RADIUS_M = 6_371_000.0


def haversine_matrix(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la = np.radians(lat)[:, None]
    lo = np.radians(lon)[:, None]
    dlat = la - la.T
    dlon = lo - lo.T
    a = np.sin(dlat / 2) ** 2 + np.cos(la) * np.cos(la.T) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def label(z: float) -> str:
    az = abs(z)
    kind = "hot" if z > 0 else "cold"
    if az >= 2.58:
        return f"{kind}_99"
    if az >= 1.96:
        return f"{kind}_95"
    if az >= 1.65:
        return f"{kind}_90"
    return "not_significant"


def getis_ord_gi_star(lat: list[float], lon: list[float], values: list[float], radius_m: float = 500.0) -> dict:
    n = len(values)
    if n < MIN_POINTS:
        return {
            "status": "insufficient_data",
            "message": f"Hotspot analysis needs at least {MIN_POINTS} locations with a lux reading; {n} available.",
            "n": n,
            "results": [],
        }
    x = np.asarray(values, dtype=float)
    s = x.std(ddof=0)
    if s == 0:
        return {"status": "no_variation", "message": "All values are identical; no hotspots can be computed.",
                "n": n, "results": []}
    d = haversine_matrix(np.asarray(lat, dtype=float), np.asarray(lon, dtype=float))
    w = (d <= radius_m).astype(float)  # binary distance band, includes self (the * in Gi*)
    wsum = w.sum(axis=1)
    w2sum = (w**2).sum(axis=1)
    mean = x.mean()
    num = w @ x - mean * wsum
    den = s * np.sqrt(np.clip((n * w2sum - wsum**2) / (n - 1), 0, None))
    with np.errstate(divide="ignore", invalid="ignore"):
        z = np.where(den > 0, num / den, 0.0)
    results = [
        {"index": i, "z": round(float(z[i]), 3), "neighbours": int(wsum[i]) - 1, "label": label(float(z[i]))}
        for i in range(n)
    ]
    return {
        "status": "ok",
        "n": n,
        "radius_m": radius_m,
        "mean": round(float(mean), 3),
        "std": round(float(s), 3),
        "isolated": int((wsum <= 1).sum()),
        "results": results,
    }
