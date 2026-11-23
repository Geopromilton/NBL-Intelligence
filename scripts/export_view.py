"""Export the public, read-only website snapshot (GitHub Pages).

Run where the engines and project data are available:
    python scripts/export_view.py --site siddanahalli --out view/snapshot

It writes the GET responses the web client needs, a grid of prepared WaterPlan
runs (persons per flat 2-6 x dry/expected/wet rain) and prepared answers for the
suggested questions (offline router: numbers straight from the engines).
Local folder paths are removed before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from nbl_intelligence import registry, twin  # noqa: E402
from nbl_intelligence.ai import agent  # noqa: E402
from nbl_intelligence.api import app  # noqa: E402
from nbl_intelligence.engines import waterplan  # noqa: E402

SUGGESTED = [
    "Can the site stay net zero discharge with 6 persons per flat in a dry decade?",
    "Where should we drill the first borewell, and why there?",
    "Which recharge depth tier keeps the most cloudburst water?",
    "Do AquaTwin and WaterPlan agree on the site numbers?",
    "How many tanker trips a day will RO concentrate need at full occupancy?",
    "What field tests would most reduce uncertainty before design approval?",
]
_DRIVE = re.compile(r"[A-Za-z]:\\\\[^\"]*?(?=\")")


def scrub(obj):
    """Remove absolute local paths (D:\\..., /home/...) from any string."""
    if isinstance(obj, dict):
        return {k: scrub(v) for k, v in obj.items() if k not in ("path", "root", "log", "command")}
    if isinstance(obj, list):
        return [scrub(v) for v in obj]
    if isinstance(obj, str):
        s = re.sub(r"[A-Za-z]:\\[^\s;,|]*", "(local folder)", obj)
        return re.sub(r"/(home|sessions|tmp|mnt)/[^\s;,|]*", "(local folder)", s)
    return obj


def write(out: Path, rel: str, data) -> None:
    p = out / f"{rel}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(scrub(data), separators=(",", ":"), default=str), encoding="utf-8")


# Tools the website AI can use. Their results are prepared here, so the browser
# never needs the engines. Project documents are not published (no search_documents).
WEB_TOOLS = ("site_brief", "drilling_sites", "borewell_checks", "admt_zones", "confidence_panel", "recharge_points",
             "cloudburst_tiers", "modflow_scenarios", "assumption_register", "rainfall_outlook", "integrity_checks", "decisions")


def web_ai_pack(site: str) -> dict:
    from nbl_intelligence.ai import tools as T
    results = {name: json.loads(json.dumps(scrub(T.call(name, site, {})), default=str)) for name in WEB_TOOLS}
    desc = [f"- {n}({', '.join(f'{k}: {v}' for k, v in T.TOOLS[n]['params'].items()) or 'no arguments'}): {T.TOOLS[n]['description']}" for n in WEB_TOOLS]
    desc.append("- run_water_plan(persons_per_flat: 2-6, rain_case: expected | dry | wet): NBL-WaterPlan closed-loop daily water balance over 10 years "
                "for 141 flats, prepared for each persons-per-flat value and rain case. Returns labelled totals (demand, supply by source, unmet, "
                "tanker, spill/net-zero, recharge, reliability). Other inputs need the desktop app.")
    rules = agent.RULES + ("\n\nYou are running on the public NBL-Intelligence website. Project documents are not published here, "
                           "so you cannot search them; say that the desktop app can when a question needs them.")
    s = registry.get(site)
    brief = {"site": s.get("name"), "location": s.get("location"), "status": s.get("status"), "concept": s.get("concept")}
    return {"system": rules + "\n\nCurrent site: " + json.dumps(brief) + "\n\nTools:\n" + "\n".join(desc),
            "tools": results, "prepared": date.today().isoformat()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="siddanahalli")
    ap.add_argument("--out", default="view/snapshot")
    a = ap.parse_args()
    out, site = Path(a.out), a.site
    c = TestClient(app)

    def get(path):
        r = c.get(path)
        r.raise_for_status()
        return r.json()

    health = get("/api/health")
    health["ai"] = {"key_set": False, "model": "public view"}
    health["snapshot"] = date.today().isoformat()
    write(out, "health", health)
    write(out, "sites", get("/api/sites"))
    for rel in ("", "/explore", "/recharge", "/integrity", "/decisions", "/plan/defaults", "/assumptions"):
        write(out, f"sites/{site}{rel}", get(f"/api/sites/{site}{rel}"))
    write(out, f"sites/{site}/chats", [])
    write(out, f"sites/{site}/runs", [])
    write(out, f"sites/{site}/twin", twin.scene(site))
    for ppf in range(2, 7):
        for case in ("dry", "expected", "wet"):
            res = waterplan.run_plan(site, {"persons_per_flat": ppf, "rain_case": case})
            res["daily"] = waterplan.thin_daily(res, 3)
            res["run_id"] = None
            write(out, f"sites/{site}/plangrid/{ppf}_{case}", res)
    demo = {}
    for q in SUGGESTED:
        events = list(agent.offline(site, q, reason="public view"))
        fin = events[-1]
        fin["final"]["answer"] = fin["final"]["answer"].replace(
            "_Offline answer: the AI service was not used (public view). The numbers come straight from the engines._",
            "_Prepared answer for the public view: numbers straight from the engines. The desktop app adds live NVIDIA reasoning._")
        demo[q] = {"events": [e for e in events if e["type"] in ("tool", "tool_result")], "final": fin}
    write(out, f"sites/{site}/demo_answers", demo)
    write(out, f"sites/{site}/ai_tools", web_ai_pack(site))
    n = sum(1 for _ in out.rglob("*.json"))
    print(f"Snapshot written: {n} files in {out}")


if __name__ == "__main__":
    main()
