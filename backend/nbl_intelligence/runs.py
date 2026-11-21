"""Run records and decisions kept by NBL-Intelligence.

Every plan run is saved with a fingerprint of its inputs and results (SHA-256),
the engine versions, and a review status. Decisions combine the AquaTwin
decision log (read-only) with decisions made in NBL-Intelligence.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from .settings import state_dir


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _canon(x: Any) -> bytes:
    return json.dumps(x, sort_keys=True, default=str).encode("utf-8")


def save_run(site: str, engine: str, name: str, inputs: dict[str, Any], result: dict[str, Any], by: str = "user") -> dict[str, Any]:
    slim = {k: v for k, v in result.items() if k != "daily"}
    fp = hashlib.sha256(_canon({"site": site, "engine": engine, "inputs": inputs, "result": slim})).hexdigest()
    created = _now()
    rid = f"NBI-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{fp[:6]}"
    rec = {"run_id": rid, "site": site, "engine": engine, "name": name or "Scenario", "created": created, "by": by,
           "inputs": inputs, "result": slim, "fingerprint": fp, "review": {"status": "pending"}}
    d = state_dir("runs", site)
    (d / f"{rid}.json").write_text(json.dumps(rec, indent=2, default=str), encoding="utf-8")
    if result.get("daily"):
        (d / f"{rid}.daily.json").write_text(json.dumps(result["daily"]), encoding="utf-8")
    return rec


def list_runs(site: str) -> list[dict[str, Any]]:
    d = state_dir("runs", site)
    out = []
    for p in sorted(d.glob("NBI-*.json")):
        if p.name.endswith(".daily.json"):
            continue
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return out[::-1]


def get_run(site: str, rid: str, daily: bool = False) -> dict[str, Any]:
    d = state_dir("runs", site)
    p = d / f"{rid}.json"
    if not p.exists():
        raise KeyError(rid)
    rec = json.loads(p.read_text(encoding="utf-8"))
    if daily and (d / f"{rid}.daily.json").exists():
        rec["daily"] = json.loads((d / f"{rid}.daily.json").read_text(encoding="utf-8"))
    return rec


def review_run(site: str, rid: str, status: str, reviewer: str, note: str = "") -> dict[str, Any]:
    d = state_dir("runs", site)
    p = d / f"{rid}.json"
    rec = json.loads(p.read_text(encoding="utf-8"))
    rec["review"] = {"status": status, "reviewer": reviewer, "note": note, "at": _now()}
    p.write_text(json.dumps(rec, indent=2, default=str), encoding="utf-8")
    return rec


# ------------------------------------------------------------- decisions
def _dec_file(site: str):
    return state_dir("decisions") / f"{site}.json"


def list_decisions(site: str) -> list[dict[str, Any]]:
    p = _dec_file(site)
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


def add_decision(site: str, decision: str, reason: str, by: str, status: str = "adopted",
                 origin: str = "NBL-Intelligence", evidence: list | None = None) -> dict[str, Any]:
    items = list_decisions(site)
    n = len(items) + 1
    rec = {"id": f"NBI-D-{n:03d}", "date": datetime.now().strftime("%Y-%m-%d"), "decision": decision, "reason": reason,
           "by": by, "status": status, "engine": origin, "evidence": evidence or [], "recorded": _now()}
    items.append(rec)
    _dec_file(site).write_text(json.dumps(items, indent=2, default=str), encoding="utf-8")
    return rec
