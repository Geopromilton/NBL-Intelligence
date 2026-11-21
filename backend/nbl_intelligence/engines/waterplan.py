"""Adapter to NBL-WaterPlan (water-balance engine).

WaterPlan runs in the same process (a 10-year daily plan takes about two
seconds). The adapter turns a raw WaterPlan result into labelled values:
period (per day / per year / over the run), case (expected / dry / wet) and
treatment (before / after reverse osmosis), with WaterPlan named as source.
"""
from __future__ import annotations

import sys
from typing import Any

from .. import registry, settings

RAIN_CASES = ("expected", "dry", "wet")


def _import():
    src = str(settings.waterplan_root() / "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    from nblwaterplan import site_runner  # type: ignore
    from nblwaterplan.plan import PlanSpec  # type: ignore
    return site_runner, PlanSpec


def site_name(site_id: str) -> str:
    return registry.get(site_id).get("engines", {}).get("waterplan", {}).get("site", site_id)


def available(site_id: str) -> bool:
    return (settings.waterplan_root() / "sites" / site_name(site_id)).exists()


def version() -> str | None:
    p = settings.waterplan_root() / "pyproject.toml"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("version"):
                return line.split("=")[1].strip().strip('"')
    return None


def default_plan(site_id: str) -> dict[str, Any]:
    sr, _ = _import()
    return sr.default_plan(site_name(site_id)).model_dump()


def site_config(site_id: str) -> dict[str, Any]:
    import yaml
    p = settings.waterplan_root() / "sites" / site_name(site_id) / "site_config.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else {}


def rain_summary(site_id: str, start_year: int = 2026, years: int = 10) -> dict[str, Any]:
    sr, _ = _import()
    out = sr.rain_summary(site_name(site_id), start_year, years)
    out["source"] = "NBL-WaterPlan rain outlook from the IMD 0.25 deg daily record 1901-2025"
    out["label"] = "mm per year · mean over the planning period for each case"
    return out


def _rain_target(site_id: str, case: str | None, mm: float | None, start_year: int, years: int) -> tuple[float | None, str]:
    if mm:
        return float(mm), f"{mm:.0f} mm/yr set by the user"
    case = (case or "expected").lower()
    if case == "expected":
        return None, "Expected case (median of drawn futures)"
    rs = rain_summary(site_id, start_year, years)
    target = rs["mean_mm_by_case"].get(case)
    return target, f"{case.title()} case ({'P10' if case == 'dry' else 'P90'} of drawn futures, {target} mm/yr mean)"


def run_plan(site_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Run a WaterPlan plan and return labelled results.

    inputs: any PlanSpec field, plus rain_case = expected | dry | wet.
    """
    sr, PlanSpec = _import()
    base = default_plan(site_id)
    spec_in = {k: v for k, v in inputs.items() if k in base and v is not None}
    years = int(spec_in.get("years", base["years"]))
    start = int(spec_in.get("start_year", base["start_year"]))
    rain_mm, rain_text = _rain_target(site_id, inputs.get("rain_case"), inputs.get("rain_mm_per_year"), start, years)
    spec_in["rain_mm_per_year"] = rain_mm
    spec_in.setdefault("name", inputs.get("name") or "Plan")
    spec = PlanSpec(**{**base, **spec_in})
    raw = sr.run_plan(site_name(site_id), spec)
    case = "fixed" if inputs.get("rain_mm_per_year") else (inputs.get("rain_case") or "expected").lower()
    return package(raw, rain_text, case)


def package(raw: dict[str, Any], rain_text: str, case: str = "expected") -> dict[str, Any]:
    t = raw["totals_m3"]
    mean = (raw.get("rain") or {}).get("mean_mm_per_year")
    short = f"{case} rain" + (f", {mean:.0f} mm/yr mean" if mean else "")
    days = max(int(raw["days"]), 1)
    years = days / 365.25
    sc = raw["scenario"]
    people = sc["flats"] * sc["persons_per_flat"]
    full_use = people * sc["litres_per_person_day"] / 1000.0

    def v(name, value, unit, period, case_label=None, treatment=None, prov="calculated", note=None):
        return {"name": name, "value": round(float(value), 2) if isinstance(value, (int, float)) else value, "unit": unit,
                "period": period, "case": short if case_label in (None, rain_text) else case_label, "treatment": treatment, "provenance": prov,
                "source": "NBL-WaterPlan closed-loop daily engine", "note": note}

    demand = t["demand"]
    supplied = t["supplied"]
    kpis = [
        v("Total demand", demand, "m3", f"over {years:.0f} years", rain_text),
        v("Average demand", demand / days, "m3/day", "per day, averaged over the run (includes build-up years)", rain_text),
        v("Flats use at full occupancy", full_use, "m3/day", "per day, full occupancy", "design", "after treatment",
          "assumption", f"{sc['flats']:.0f} flats x {sc['persons_per_flat']:.0f} persons x {sc['litres_per_person_day']:.0f} L/day"),
        v("Unmet demand", t["unmet"], "m3", f"over {years:.0f} years", rain_text),
        v("Reliability", raw["metrics"]["reliability"] * 100, "% of days fully supplied", f"over {years:.0f} years", rain_text),
        v("Rainwater used", t["rain_supply"], "m3", f"over {years:.0f} years", rain_text, "after treatment"),
        v("Treated wastewater reused", t["reuse_supply"], "m3", f"over {years:.0f} years", rain_text, "after treatment"),
        v("Borewell water used", t["borewell_supply"], "m3", f"over {years:.0f} years", rain_text, "after treatment"),
        v("Borewell water used, average", t["borewell_supply"] / years, "m3/yr", "per year, averaged", rain_text, "after treatment"),
        v("RO concentrate to tanker", t["tanker_concentrate"], "m3", f"over {years:.0f} years", rain_text, "removed by treatment"),
        v("RO concentrate to tanker, average", t["tanker_concentrate"] / days, "m3/day", "per day, averaged", rain_text, "removed by treatment"),
        v("Sludge to tanker", t["tanker_sludge"], "m3", f"over {years:.0f} years", rain_text, "removed by treatment"),
        v("Water leaving the lease (spill)", t["spill"], "m3", f"over {years:.0f} years", rain_text, None, "calculated",
          "Net zero discharge means this stays at or near zero"),
        v("Recharge through recharge wells", t["recharge_wells"], "m3", f"over {years:.0f} years", rain_text),
        v("Treated-water tank overflow", t["treated_water_overflow"], "m3", f"over {years:.0f} years", rain_text),
    ]
    shares = {}
    if supplied > 0:
        shares = {"rain": t["rain_supply"] / supplied, "reuse": t["reuse_supply"] / supplied, "borewell": t["borewell_supply"] / supplied}
    rain = raw.get("rain") or {}
    return {
        "scenario": sc,
        "people_full_occupancy": people,
        "start": raw["start"], "end": raw["end"], "days": days,
        "rain_case": rain_text,
        "rain_case_short": short,
        "rain": rain,
        "totals_m3": t,
        "metrics": raw["metrics"],
        "capacities": raw.get("capacities"),
        "kpis": kpis,
        "supply_shares": {k: round(x, 4) for k, x in shares.items()},
        "net_zero_discharge": t["spill"] <= 1.0,
        "daily": raw.get("daily"),
        "standard": "One grade: every source is filtered or RO-treated before use",
        "source": "NBL-WaterPlan " + (version() or ""),
    }


def thin_daily(result: dict[str, Any], step: int = 7) -> dict[str, Any]:
    d = result.get("daily") or {}
    return {k: v[::step] for k, v in d.items()}
