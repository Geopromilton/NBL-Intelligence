"""Adapter to NBL-AquaTwin (groundwater engine).

Reads AquaTwin's site packs and run folders without changing them, and can
start a new AquaTwin run as a background job with AquaTwin's own command
(run_aquatwin.py). Every table returned carries its source file and the
AquaTwin status stamp.
"""
from __future__ import annotations

import math
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

from .. import registry, settings

STAMP = "PRE-DRILLING ASSUMPTION-DRIVEN SCENARIO - NOT YET CALIBRATED WITH ON-SITE BOREHOLE OR AQUIFER-TEST DATA"

SCENARIO_NAMES = {
    "S6": "S6 Demand only (borewell pumping, no recharge measures)",
    "S1": "S1 Direct use of roof water (avoided abstraction)",
    "S2": "S2 Roof water to recharge shafts",
    "S3": "S3 Biopool overflow recharge",
    "S4": "S4 Diffuse recharge on permeable paths",
    "S5": "S5 Combined (S1 + S2 + S3 + S4)",
}
TIER_NAMES = {
    "CB1": "Shallow tier (layer 1, 0-20 m)",
    "CB2": "Medium tier (layer 2, 20-60 m)",
    "CB3": "Medium-to-deep tier (layers 3-4, 60-175 m)",
    "CB4": "Deeper tier (layer 5, 175-250 m; experimental)",
    "CBALL": "All tiers together",
}
BOUNDARY_NAMES = {"B1_GHB": "Open boundary (water can leave the model edge)", "B2_closed": "Closed boundary"}


def _clean(v: Any) -> Any:
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        try:
            return _clean(v.item())
        except Exception:
            return str(v)
    return v


def records(df: pd.DataFrame) -> list[dict[str, Any]]:
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict(orient="records")]


def root() -> Path:
    return settings.aquatwin_root()


def site_name(site_id: str) -> str:
    return registry.get(site_id).get("engines", {}).get("aquatwin", {}).get("site", site_id)


def site_dir(site_id: str) -> Path:
    return root() / "sites" / site_name(site_id)


def available(site_id: str) -> bool:
    return site_dir(site_id).exists()


def list_runs(site_id: str) -> list[dict[str, Any]]:
    runs_dir = site_dir(site_id) / "runs"
    out = []
    if not runs_dir.exists():
        return out
    for d in sorted(runs_dir.iterdir()):
        if not d.is_dir() or d.name.startswith("_"):
            continue
        man = d / "manifest.yaml"
        info: dict[str, Any] = {"run_id": d.name, "modules": [], "created": None}
        if man.exists():
            try:
                m = yaml.safe_load(man.read_text(encoding="utf-8")) or {}
                info["created"] = m.get("created")
                info["modules"] = list((m.get("modules") or {}).keys())
                info["evidence_stage"] = m.get("evidence_stage")
            except Exception:
                pass
        info["has_outputs"] = sorted(p.name for p in (d / "outputs").iterdir()) if (d / "outputs").exists() else []
        out.append(info)
    return out


def run_id(site_id: str) -> str | None:
    configured = registry.get(site_id).get("engines", {}).get("aquatwin", {}).get("run")
    if configured and (site_dir(site_id) / "runs" / configured).exists():
        return configured
    full = [r for r in list_runs(site_id) if "M0" in r["has_outputs"]]
    return full[-1]["run_id"] if full else None


def run_dir(site_id: str) -> Path | None:
    rid = run_id(site_id)
    return site_dir(site_id) / "runs" / rid if rid else None


def _out(site_id: str, *parts: str) -> Path | None:
    rd = run_dir(site_id)
    return rd.joinpath("outputs", *parts) if rd else None


def _src(path: Path | None) -> str:
    if path is None:
        return "not available"
    try:
        return "NBL-AquaTwin: " + str(path.relative_to(root())).replace("/", "\\")
    except ValueError:
        return str(path)


def _csv(path: Path | None) -> pd.DataFrame | None:
    if path is None or not path.exists():
        return None
    try:
        return pd.read_csv(path)
    except Exception:
        return None


def site_config(site_id: str) -> dict[str, Any]:
    p = site_dir(site_id) / "site_config.yaml"
    if not p.exists():
        return {}
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def studio(site_id: str) -> dict[str, Any]:
    p = site_dir(site_id) / "studio" / "studio.yaml"
    if not p.exists():
        return {}
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


# ---------------------------------------------------------------- summaries
def run_summary(site_id: str) -> dict[str, Any]:
    rd = run_dir(site_id)
    if rd is None:
        return {"available": False}
    man = yaml.safe_load((rd / "manifest.yaml").read_text(encoding="utf-8")) if (rd / "manifest.yaml").exists() else {}
    mods = man.get("modules") or {}
    return {
        "available": True,
        "run_id": rd.name,
        "created": man.get("created"),
        "framework_version": man.get("framework_version"),
        "evidence_stage": man.get("evidence_stage"),
        "status_stamp": man.get("status_stamp", STAMP),
        "modules": {k: (v or {}).get("status") for k, v in mods.items()},
        "source": _src(rd / "manifest.yaml"),
        "version": aquatwin_version(),
    }


def aquatwin_version() -> str | None:
    p = root() / "CHANGELOG.md"
    if not p.exists():
        return None
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines()[::-1]:
        m = re.match(r"##\s.*?Version\s+([\d.]+)", line)
        if m:
            return m.group(1)
    return None


def confidence_panel(site_id: str) -> dict[str, Any]:
    rd = run_dir(site_id)
    p = rd / "report" / "confidence_panel.csv" if rd else None
    df = _csv(p)
    return {"rows": records(df) if df is not None else [], "source": _src(p),
            "note": "Each layer is reported separately; the layers are never combined into one score."}


def drilling_sites(site_id: str) -> dict[str, Any]:
    """Priority list of borewell sites (v03) merged with the locked predictions."""
    sd = site_dir(site_id)
    p = next(iter(sd.glob("00_raw_readonly/**/_sites_v03.csv")), None)
    df = _csv(p)
    sites = records(df) if df is not None else []
    preds = locked_predictions(site_id)
    by_site: dict[str, list] = {}
    for r in preds.get("records", []):
        by_site.setdefault(str(r.get("site")), []).append(
            {"item": r.get("item"), "predicted": r.get("predicted"), "proposed_depth_m": r.get("proposed_depth_m")})
    for s in sites:
        s["predictions"] = by_site.get(str(s.get("Site")), [])
    return {"sites": sites, "source": _src(p), "provenance": "calculated",
            "status": "Unvalidated - no on-site borehole yet", "stamp": STAMP,
            "order_note": "Current priority: A first, then B; C is the reserve. D and E are alternates to A; F and G are noted zones, not for drilling."}


def zones(site_id: str) -> dict[str, Any]:
    sd = site_dir(site_id)
    p = next(iter(sd.glob("00_raw_readonly/**/Table_zones_with_transformer_flag.csv")), None)
    df = _csv(p)
    return {"zones": records(df) if df is not None else [], "source": _src(p)}


def borewells(site_id: str) -> dict[str, Any]:
    bw = (site_config(site_id).get("borewells") or {})
    rows = []
    for k, v in bw.items():
        if isinstance(v, dict) and ("E" in v or "strikes_m" in v):
            rows.append({"id": k, **{kk: vv for kk, vv in v.items() if kk not in ("records", "excluded_records")}})
    return {"borewells": rows, "reference_max_depth_m": bw.get("reference_max_depth_m"),
            "note": "Off-site reference borewells; driller/owner reported information only (not measured by NBL).",
            "source": _src(site_dir(site_id) / "site_config.yaml")}


def recharge_points(site_id: str) -> dict[str, Any]:
    p = site_dir(site_id) / "06_interpretation" / "rz_candidates.csv"
    df = _csv(p)
    return {"points": records(df) if df is not None else [], "source": _src(p),
            "note": "Recharge zone points (RZ-n) from storability results and ADMT interpretation across the four depth tiers; separate from the A-G borewell labels. Unvalidated."}


def locked_predictions(site_id: str) -> dict[str, Any]:
    d = site_dir(site_id) / "predictions_locked"
    files = sorted(d.glob("predictions_*.json")) if d.exists() else []
    rid = run_id(site_id)
    pick = [f for f in files if rid and rid in f.name] or files[-1:]
    if not pick:
        return {"records": [], "source": "not available"}
    import json
    data = json.loads(pick[-1].read_text(encoding="utf-8"))
    data["source"] = _src(pick[-1])
    return data


def cloudburst_tiers(site_id: str, boundary: str | None = None) -> dict[str, Any]:
    p = _out(site_id, "M7d", "M7d_tier_effects.csv")
    df = _csv(p)
    if df is None:
        return {"rows": [], "source": _src(p)}
    if boundary:
        df = df[df["boundary"] == boundary]
    keep = ["set", "inj_site", "scenario", "label", "boundary", "V_runoff_m3", "overflow_pct", "held_unsat_pct",
            "to_aquifer_pct", "retained_1y_pct", "boundary_loss_1y_pct", "retained_5y_pct", "head_benefit_1y_m",
            "mean_delay_d", "cb_storm_mm"]
    df = df[[c for c in keep if c in df.columns]].copy()
    summary = (df.groupby(["scenario", "boundary"], as_index=False)
                 .agg(sites=("inj_site", "nunique"), to_aquifer_pct=("to_aquifer_pct", "median"),
                      held_unsat_pct=("held_unsat_pct", "median"), overflow_pct=("overflow_pct", "median"),
                      retained_1y_pct=("retained_1y_pct", "median"), boundary_loss_1y_pct=("boundary_loss_1y_pct", "median"),
                      head_benefit_1y_m=("head_benefit_1y_m", "median"), storm_mm=("cb_storm_mm", "median")))
    summary["tier"] = summary["scenario"].map(TIER_NAMES).fillna(summary["scenario"])
    summary["boundary_text"] = summary["boundary"].map(BOUNDARY_NAMES).fillna(summary["boundary"])
    return {"summary": records(summary.round(3)), "rows": records(df.round(3)), "source": _src(p),
            "label": "Single design storm (event) · median over recharge points · central parameter set",
            "stamp": STAMP}


def modflow_scenarios(site_id: str) -> dict[str, Any]:
    p = _out(site_id, "M7", "M7_scenario_effects.csv")
    df = _csv(p)
    if df is None:
        return {"summary": [], "source": _src(p)}
    df = df[df["converged"] == True]  # noqa: E712
    g = df.groupby(["scenario", "boundary"])
    def q(col, f):
        return g[col].quantile(f) if col in df.columns else None
    summary = pd.DataFrame({
        "runs": g.size(),
        "water_made_available_10yr_m3_p50": q("water_made_available_10yr_m3", .5),
        "site_recharge_10yr_m3_p50": q("site_recharge_10yr_m3", .5),
        "abstraction_avoided_10yr_m3_p50": q("abstraction_avoided_10yr_m3", .5),
        "drawdown_well_end_m_p10": q("drawdown_well_end_m", .1),
        "drawdown_well_end_m_p50": q("drawdown_well_end_m", .5),
        "drawdown_well_end_m_p90": q("drawdown_well_end_m", .9),
        "recharge_retained_vs_S6_pct_p50": q("recharge_retained_vs_S6_pct", .5),
        "residents_in_model": g["residents"].median() if "residents" in df.columns else None,
    }).reset_index()
    order = {k: i for i, k in enumerate(SCENARIO_NAMES)}
    summary["order"] = summary["scenario"].map(order)
    summary = summary.sort_values(["boundary", "order"]).drop(columns="order")
    summary["scenario_text"] = summary["scenario"].map(SCENARIO_NAMES)
    summary["boundary_text"] = summary["boundary"].map(BOUNDARY_NAMES).fillna(summary["boundary"])
    return {"summary": records(summary.round(2)), "source": _src(p),
            "label": "Totals over 10 years · median (p50) of converged MODFLOW parameter sets · uncalibrated",
            "stamp": STAMP}


def admt_quality(site_id: str) -> dict[str, Any]:
    rd = run_dir(site_id)
    p = rd / "report" / "M0_report.md" if rd else None
    text = p.read_text(encoding="utf-8", errors="ignore") if p and p.exists() else ""
    return {"text": text, "source": _src(p)}


def rainfall_evidence(site_id: str) -> dict[str, Any]:
    p = _out(site_id, "E1", "E1_evidence.json")
    if p is None or not p.exists():
        return {"source": "not available"}
    import json
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    return {"evidence": data, "source": _src(p)}


def report_text(site_id: str, name: str = "RUN_SUMMARY.md", limit: int = 12000) -> dict[str, Any]:
    rd = run_dir(site_id)
    p = rd / "report" / name if rd else None
    if p is None or not p.exists():
        return {"text": "", "source": "not available"}
    return {"text": p.read_text(encoding="utf-8", errors="ignore")[:limit], "source": _src(p)}


def assumptions(site_id: str) -> dict[str, Any]:
    d = site_dir(site_id) / "02_assumptions"
    regs = sorted(d.glob("assumption_register_v*.yaml")) if d.exists() else []
    if not regs:
        return {"entries": [], "source": "not available"}
    p = regs[-1]
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    keep = ("id", "key", "type", "parameter", "low", "central", "high", "unit", "status", "field_measurement_to_test", "source")
    entries = [{k: _clean(e.get(k)) for k in keep} for e in data.get("entries", [])]
    return {"version": data.get("version"), "status": data.get("status"), "approval": data.get("approval"),
            "entries": entries, "source": _src(p)}


# ---------------------------------------------------------------- decisions
_ROW = re.compile(r"^\|\s*(D-\d+)\s*\|\s*([^|]*)\|\s*(.*?)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$")


def decisions(site_id: str) -> dict[str, Any]:
    p = root() / "docs" / "decisions" / "decision_log.md"
    rows: list[dict[str, Any]] = []
    if p.exists():
        text = p.read_text(encoding="utf-8", errors="ignore")
        for line in text.splitlines():
            m = _ROW.match(line)
            if m:
                rows.append({"id": m.group(1), "date": m.group(2).strip(), "decision": m.group(3).strip(),
                             "reason": m.group(4).strip(), "by": m.group(5).strip(), "status": m.group(6).strip(),
                             "engine": "NBL-AquaTwin"})
        for m in re.finditer(r"^## (D-\d+)\s*-\s*([^\n]*?)\s*-\s*([^\n]*)\n(.*?)(?=^## |\Z)", text, re.S | re.M):
            rows.append({"id": m.group(1), "date": m.group(2).strip(), "decision": m.group(3).strip(),
                         "reason": m.group(4).strip()[:600], "by": "NBL-AquaTwin build", "status": "recorded",
                         "engine": "NBL-AquaTwin"})
    return {"decisions": rows, "source": _src(p)}


# ---------------------------------------------------------------- run jobs
def start_run(site_id: str, modules: list[str] | None = None, extra: list[str] | None = None) -> dict[str, Any]:
    """Start AquaTwin's own pipeline as a background process (it can take about an hour)."""
    script = root() / "run_aquatwin.py"
    if not script.exists():
        raise FileNotFoundError(str(script))
    py = settings.load().get("aquatwin_python") or ("" if settings.FROZEN else sys.executable)
    if not py:
        import shutil as _sh
        py = _sh.which("python") or _sh.which("py") or ""
    if not py:
        raise FileNotFoundError("Python for AquaTwin runs is not set (Settings > Engines > Python for long AquaTwin runs)")
    logs = settings.state_dir("jobs")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log = logs / f"aquatwin_{site_id}_{stamp}.log"
    cmd = [py, str(script), "--site", site_name(site_id)]
    if modules:
        cmd += ["--modules", *modules]
    if extra:
        cmd += extra
    flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    fh = open(log, "w", encoding="utf-8")
    proc = subprocess.Popen(cmd, cwd=str(root()), stdout=fh, stderr=subprocess.STDOUT, creationflags=flags)
    return {"job": f"aquatwin-{stamp}", "pid": proc.pid, "log": str(log), "command": " ".join(cmd),
            "note": "AquaTwin runs in its own process; a full run took about 54 minutes on 19 Oct 2026."}
