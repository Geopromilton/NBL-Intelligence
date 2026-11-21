"""Tools the AI may call. Each tool reads or runs one of the engines.

The AI never calculates numbers itself; it calls these tools and reports what
they return, with the source each tool gives.
"""
from __future__ import annotations

import json
from typing import Any, Callable

from .. import consistency, knowledge, registry, runs
from ..engines import aquatwin, waterplan

ToolFn = Callable[..., Any]
TOOLS: dict[str, dict[str, Any]] = {}


def tool(name: str, description: str, params: dict[str, str] | None = None):
    def wrap(fn: ToolFn) -> ToolFn:
        TOOLS[name] = {"fn": fn, "description": description, "params": params or {}}
        return fn
    return wrap


def _limit(rows: list, n: int) -> list:
    return rows[:n]


@tool("site_brief", "Shared facts of the site from the NBL-Intelligence registry, each with unit, source and provenance; plus placeholders still to replace by field tests.")
def site_brief(site: str) -> dict[str, Any]:
    s = registry.get(site)
    return {"name": s.get("name"), "location": s.get("location"), "status": s.get("status"), "concept": s.get("concept"),
            "facts": s.get("facts"), "placeholders_to_replace": s.get("placeholders_to_replace")}


@tool("drilling_sites", "Borewell drilling sites A-G from the ADMT interpretation (priority list v03) with zone scores, depths, basis and the locked pre-drilling predictions.")
def drilling_sites(site: str) -> dict[str, Any]:
    d = aquatwin.drilling_sites(site)
    for s in d["sites"]:
        s["predictions"] = [{"item": p["item"], "predicted": (p["predicted"] or "")[:400], "depth": p["proposed_depth_m"]} for p in s["predictions"][:4]]
    return d


@tool("borewell_checks", "Off-site reference borewells BW-1, BW-2, BW-3 (reported depths, water strikes, status) used to cross-check the ADMT survey.")
def borewell_checks(site: str) -> dict[str, Any]:
    return aquatwin.borewells(site)


@tool("admt_zones", "ADMT anomaly zones (Z01...) with line, depth range, score, crossing support and transformer flag.", {"min_score": "optional integer, only zones with score >= this"})
def admt_zones(site: str, min_score: int | None = None) -> dict[str, Any]:
    z = aquatwin.zones(site)
    rows = z["zones"]
    if min_score is not None:
        rows = [r for r in rows if (r.get("Score") or 0) >= int(min_score)]
    keep = ("Zone", "Line", "Top_m", "Bottom_m", "Score", "Target_type", "Crossings_supporting", "Transformer_affected", "At_line_end")
    return {"zones": [{k: r.get(k) for k in keep} for r in rows][:40], "source": z["source"]}


@tool("confidence_panel", "AquaTwin confidence panel for the current run: data quality, class membership, spatial support, evidence stage, plausibility, model and surrogate status.")
def confidence_panel(site: str) -> dict[str, Any]:
    return aquatwin.confidence_panel(site)


@tool("recharge_points", "Recharge zone points RZ-1... found from storability results and ADMT interpretation across the four depth tiers.")
def recharge_points(site: str) -> dict[str, Any]:
    d = aquatwin.recharge_points(site)
    keep = ("Site", "Role", "Tiers_found", "Readings_found", "Zone_nearest", "Zone_depth_m", "Zone_score", "Dist_boundary_m", "Dist_transformer_m", "Depth_confidence", "Status")
    d["points"] = [{k: p.get(k) for k in keep} for p in d["points"]]
    return d


@tool("cloudburst_tiers", "MODFLOW cloudburst recharge results by depth tier (shallow, medium, medium-to-deep, deeper): share reaching the aquifer, held in dry rock, overflow, retained after 1 year, head benefit.")
def cloudburst_tiers(site: str) -> dict[str, Any]:
    d = aquatwin.cloudburst_tiers(site)
    d.pop("rows", None)
    return d


@tool("modflow_scenarios", "10-year MODFLOW scenario results S6 (demand only), S1 direct use, S2 roof to shafts, S3 biopool, S4 diffuse paths, S5 combined: water made available, recharge, drawdown at the well (p10/p50/p90).")
def modflow_scenarios(site: str) -> dict[str, Any]:
    return aquatwin.modflow_scenarios(site)


@tool("assumption_register", "AquaTwin assumption register (latest version): each assumption with low/central/high, status and the field test that would replace it.")
def assumption_register(site: str) -> dict[str, Any]:
    d = aquatwin.assumptions(site)
    d["entries"] = d["entries"][:40]
    return d


@tool("run_water_plan", "Run the NBL-WaterPlan closed-loop daily water balance for a scenario and return labelled totals (demand, supply by source, unmet, tanker, spill/net-zero, recharge, reliability).",
      {"persons_per_flat": "2-6", "flats": "number of flats (default 141)", "rain_case": "expected | dry | wet",
       "rain_mm_per_year": "optional fixed annual rain in mm", "years": "1-30 (default 10)",
       "reservoir_m3": "optional", "borewell_m3_per_day": "optional", "ro_recovery": "optional 0.3-0.95",
       "litres_per_person_day": "optional", "years_to_full_occupancy": "optional"})
def run_water_plan(site: str, **kw: Any) -> dict[str, Any]:
    if "persons_per_flat" in kw and kw["persons_per_flat"] is not None:
        kw["persons_per_flat"] = max(2, min(6, float(kw["persons_per_flat"])))
    res = waterplan.run_plan(site, kw)
    rec = runs.save_run(site, "NBL-WaterPlan", f"AI: {kw.get('rain_case') or 'expected'} rain, {res['scenario']['persons_per_flat']:.0f} persons/flat",
                        kw, res, by="NBL-Intelligence AI")
    return {"run_id": rec["run_id"], "scenario": res["scenario"], "rain_case": res["rain_case"],
            "rain_mean_mm_per_year": (res.get("rain") or {}).get("mean_mm_per_year"),
            "kpis": res["kpis"], "supply_shares": res["supply_shares"], "net_zero_discharge": res["net_zero_discharge"],
            "standard": res["standard"], "source": res["source"]}


@tool("rainfall_outlook", "Rainfall record (IMD 1901-2025) and the planning outlook: mean, driest/wettest year, trend, and dry/expected/wet case means for the planning period.")
def rainfall_outlook(site: str, start_year: int = 2026, years: int = 10) -> dict[str, Any]:
    return waterplan.rain_summary(site, int(start_year), int(years))


@tool("integrity_checks", "Check whether the site registry, NBL-AquaTwin and NBL-WaterPlan agree on key numbers (area, flats, people, roof, reservoir, borewells, rainfall basis).")
def integrity_checks(site: str) -> dict[str, Any]:
    return consistency.run(site)


@tool("decisions", "Decision log: AquaTwin decisions (D-001...) and NBL-Intelligence decisions, optionally filtered by a word.", {"query": "optional word to filter"})
def decisions(site: str, query: str | None = None) -> dict[str, Any]:
    rows = aquatwin.decisions(site)["decisions"] + runs.list_decisions(site)
    if query:
        q = query.lower()
        rows = [r for r in rows if q in json.dumps(r).lower()]
    return {"decisions": [{k: (r.get(k) or "")[:300] if isinstance(r.get(k), str) else r.get(k) for k in ("id", "date", "decision", "reason", "by", "status", "engine")} for r in rows][-40:]}


@tool("search_documents", "Search the project's own documents (desk study, scope, ADMT field protocol and report, AquaTwin reports and user guide, WaterPlan docs) and return the best passages with file names.", {"query": "words to search"})
def search_documents(site: str, query: str) -> dict[str, Any]:
    return {"passages": [{**p, "passage": p["passage"][:900]} for p in knowledge.search(site, query, k=5)]}


@tool("aquatwin_report", "Text of an AquaTwin run report section.", {"name": "RUN_SUMMARY.md, M0_report.md, E1_report.md, M4_report.md, M6_report.md, M7_report.md, M7d_report.md, OUT_report.md"})
def aquatwin_report(site: str, name: str = "RUN_SUMMARY.md") -> dict[str, Any]:
    return aquatwin.report_text(site, name, limit=7000)


def describe() -> str:
    lines = []
    for name, t in TOOLS.items():
        ps = ", ".join(f"{k}: {v}" for k, v in t["params"].items())
        lines.append(f"- {name}({ps or 'no arguments'}): {t['description']}")
    return "\n".join(lines)


def call(name: str, site: str, args: dict[str, Any] | None) -> Any:
    if name not in TOOLS:
        raise KeyError(f"Unknown tool {name}")
    args = {k: v for k, v in (args or {}).items() if k != "site"}
    return TOOLS[name]["fn"](site, **args)


def compact(obj: Any, limit: int = 7000) -> str:
    s = json.dumps(obj, default=str, separators=(",", ":"))
    return s if len(s) <= limit else s[:limit] + '..."(truncated)"'
