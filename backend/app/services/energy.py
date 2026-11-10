"""Energy estimate. Energy (kWh) = Power (kW) x operating hours."""
from __future__ import annotations

from pydantic import BaseModel, Field


class EnergyInput(BaseModel):
    fixtures: int = Field(gt=0, le=1_000_000)
    current_wattage: float = Field(gt=0, le=5000)
    proposed_wattage: float = Field(ge=0, le=5000)
    hours_per_day: float = Field(gt=0, le=24)
    days: int = Field(gt=0, le=3660)
    tariff: float = Field(ge=0, le=1000, description="Currency units per kWh")


class EnergyResult(BaseModel):
    current_kwh: float
    proposed_kwh: float
    saved_kwh: float
    current_cost: float
    proposed_cost: float
    saved_cost: float
    percent_reduction: float
    note: str = (
        "Estimate based only on the values you entered. It ignores driver losses, "
        "dimming profiles, outages and tariff slabs. It is not a measured saving."
    )


def estimate(i: EnergyInput) -> EnergyResult:
    hours = i.hours_per_day * i.days
    current = i.fixtures * i.current_wattage / 1000 * hours
    proposed = i.fixtures * i.proposed_wattage / 1000 * hours
    saved = current - proposed
    pct = (saved / current * 100) if current else 0.0
    r = lambda v: round(v, 2)  # noqa: E731
    return EnergyResult(
        current_kwh=r(current),
        proposed_kwh=r(proposed),
        saved_kwh=r(saved),
        current_cost=r(current * i.tariff),
        proposed_cost=r(proposed * i.tariff),
        saved_cost=r(saved * i.tariff),
        percent_reduction=r(pct),
    )
