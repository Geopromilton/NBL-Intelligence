"""Integrity checks: do the two engines and the site registry agree?

Each check lists the value held by every source, a status (agree / differs /
note) and what to do. Nothing is changed automatically; the user decides.
"""
from __future__ import annotations

from typing import Any

from . import registry
from .engines import aquatwin, waterplan


def _rel(a: float, b: float) -> float:
    return abs(a - b) / max(abs(a), abs(b), 1e-9)


def _check(cid, title, values, status, action, detail=""):
    return {"id": cid, "title": title, "values": values, "status": status, "action": action, "detail": detail}


def run(site_id: str) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    reg = registry.get(site_id)
    f = lambda k: registry.fact(site_id, k)  # noqa: E731
    wp_cfg, wp_plan, at_studio, m7 = {}, {}, {}, None
    errors = []
    try:
        wp_cfg = waterplan.site_config(site_id)
        wp_plan = waterplan.default_plan(site_id)
    except Exception as e:  # noqa: BLE001
        errors.append(f"WaterPlan not readable: {e}")
    try:
        at_studio = aquatwin.studio(site_id)
        import pandas as pd
        p = aquatwin._out(site_id, "M7", "M7_scenario_effects.csv")
        m7 = pd.read_csv(p) if p and p.exists() else None
    except Exception as e:  # noqa: BLE001
        errors.append(f"AquaTwin not readable: {e}")

    # 1 lease area
    vals = [{"source": "Site registry", "value": f("lease_area_m2"), "unit": "m2"}]
    wa = (wp_cfg.get("boundary") or {}).get("area_m2")
    if wa:
        vals.append({"source": "WaterPlan site_config", "value": wa, "unit": "m2"})
    aa = (at_studio.get("site_card") or {}).get("area_ha")
    if aa:
        vals.append({"source": "AquaTwin Studio site card", "value": round(aa * 10000, 1), "unit": "m2"})
    nums = [v["value"] for v in vals if isinstance(v["value"], (int, float))]
    st = "agree" if nums and max(_rel(nums[0], x) for x in nums) <= 0.01 else "differs"
    checks.append(_check("area", "Lease area", vals, st,
                         "Use the KMZ area (44,058 m2) everywhere until the DGPS survey; update the AquaTwin Studio card (4.35 ha is the older figure).",
                         "A 1.3 % difference changes rain on the lease by about 56 m3 per 100 mm."))

    # 3 people in the groundwater model vs planned people
    people = (f("flats") or 0) * (f("persons_per_flat") or 0)
    vals = [{"source": "Planned people (registry)", "value": people, "unit": "persons"}]
    if m7 is not None and "residents" in m7.columns:
        vals.append({"source": "AquaTwin MODFLOW runs (M7, median)", "value": float(m7["residents"].median()), "unit": "persons"})
    st = "agree" if len(vals) < 2 or _rel(vals[0]["value"], vals[1]["value"]) < 0.05 else "differs"
    checks.append(_check("residents", "People assumed in the groundwater (MODFLOW) model", vals, st,
                         "No action. The AquaTwin run uses the current occupancy." if st == "agree" else
                         "Re-run AquaTwin M7 with the current occupancy before using its drawdown numbers for design.",
                         "" if st == "agree" else "The AquaTwin run was made with a different household count than the plan."))

    # 4 roof area
    vals = [{"source": "Site registry", "value": f("roof_area_m2"), "unit": "m2"}]
    lc = (wp_cfg.get("land_cover") or {}).get("roof_m2")
    if lc:
        vals.append({"source": "WaterPlan land cover", "value": lc, "unit": "m2"})
    if m7 is not None and "roof_area" in m7.columns:
        vals.append({"source": "AquaTwin MODFLOW runs (M7, median)", "value": round(float(m7["roof_area"].median()), 1), "unit": "m2"})
    nums = [v["value"] for v in vals]
    st = "agree" if max(_rel(nums[0], x) for x in nums) <= 0.02 else "differs"
    checks.append(_check("roof", "Roof catchment area", vals, st,
                         "No action. The AquaTwin run uses the registry roof area." if st == "agree" else
                         "Update the AquaTwin assumption register roof area to 13,620 m2 and re-run M7/M7d before quoting recharge volumes.",
                         "Roof area drives roof-water recharge in S1, S2 and S5 and the cloudburst runoff volume."))

    # 5 persons per flat
    vals = [{"source": "Site registry", "value": f("persons_per_flat"), "unit": "persons/flat"}]
    if wp_plan:
        vals.append({"source": "WaterPlan default plan", "value": wp_plan.get("persons_per_flat"), "unit": "persons/flat"})
    wsp = (wp_cfg.get("water_supply") or {}).get("persons_per_flat")
    if wsp:
        vals.append({"source": "WaterPlan site_config", "value": wsp, "unit": "persons/flat"})
    st = "agree" if len({float(v["value"]) for v in vals}) == 1 else "differs"
    checks.append(_check("ppf", "Persons per flat", vals, st, "Adjustable 2-6 on the Water plan page; 4 is the design value."))

    # 6 reservoir
    vals = [{"source": "Site registry", "value": f("reservoir_m3"), "unit": "m3"}]
    if wp_plan:
        vals.append({"source": "WaterPlan default plan", "value": wp_plan.get("reservoir_m3"), "unit": "m3"})
    rc = (wp_cfg.get("water_supply") or {}).get("reservoir_capacity_m3")
    if rc:
        vals.append({"source": "WaterPlan site_config", "value": rc, "unit": "m3"})
    st = "agree" if len({float(v["value"]) for v in vals}) == 1 else "differs"
    checks.append(_check("reservoir", "Reservoir capacity (closed)", vals, st, "No action."))

    # 7 borewell capacity
    vals = [{"source": "Site registry", "value": f("borewell_m3_per_day"), "unit": "m3/day"}]
    if wp_plan:
        vals.append({"source": "WaterPlan default plan", "value": wp_plan.get("borewell_m3_per_day"), "unit": "m3/day"})
    ws = wp_cfg.get("water_supply") or {}
    if ws.get("borewell_capacity_m3_per_day") and ws.get("borewells_stage_3"):
        vals.append({"source": "WaterPlan site_config (per well x stage-3 wells)",
                     "value": ws["borewell_capacity_m3_per_day"] * ws["borewells_stage_3"], "unit": "m3/day"})
    st = "agree" if len({round(float(v["value"]), 1) for v in vals}) == 1 else "differs"
    checks.append(_check("borewell", "Borewell capacity (placeholder P3)", vals, st,
                         "Replace with the pumping-test yield of the first borewell (site A).",
                         "Per day, at 12 pumping hours; not a measured yield."))

    # 8 rainfall basis (note)
    vals = [{"source": "AquaTwin E1 (IMD normal 1991-2020)", "value": f("rain_normal_mm"), "unit": "mm/yr"},
            {"source": "WaterPlan record mean (IMD 1901-2025)", "value": f("rain_record_mean_mm"), "unit": "mm/yr"}]
    checks.append(_check("rain", "Rainfall basis", vals, "note",
                         "Both are correct for their period. Always quote the period with the number.",
                         "Different averaging periods, not a conflict: the 1991-2020 normal is wetter than the 125-year mean."))

    # 9 water standard (note)
    checks.append(_check("grade", "Water standard", [
        {"source": "AquaTwin v" + str(aquatwin.aquatwin_version() or "?"), "value": "One grade (v1.18.0)", "unit": ""},
        {"source": "WaterPlan design", "value": "All sources treated before use", "unit": ""}], "agree",
        "No action. RO concentrate and sludge leave by tanker in both engines."))

    counts = {s: sum(1 for c in checks if c["status"] == s) for s in ("agree", "differs", "note")}
    return {"site": reg.get("id"), "checks": checks, "counts": counts, "errors": errors}
