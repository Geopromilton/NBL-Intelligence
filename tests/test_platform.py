"""NBL-Intelligence tests: engines, integrity, AI loop (scripted model), knowledge, reports, API."""
import json

import pytest

from nbl_intelligence import consistency, knowledge, provenance, registry, reports, runs, settings, twin, updater
from nbl_intelligence.ai import agent, nvidia, tools
from nbl_intelligence.engines import aquatwin, waterplan

SITE = "siddanahalli"
HAS_DATA = settings.aquatwin_root().exists() and settings.waterplan_root().exists()
data = pytest.mark.skipif(not HAS_DATA, reason="engine folders not on this machine")


def test_registry_has_siddanahalli():
    s = registry.get(SITE)
    assert s["name"] == "Siddanahalli"
    assert s["controls"]["persons_per_flat"]["min"] == 2 and s["controls"]["persons_per_flat"]["max"] == 6
    assert registry.fact(SITE, "flats") == 141


@data
def test_aquatwin_adapter_reads_run():
    rs = aquatwin.run_summary(SITE)
    assert rs["available"] and rs["run_id"].startswith("SID-")
    ds = aquatwin.drilling_sites(SITE)["sites"]
    assert [d["Site"] for d in ds][:3] == ["A", "B", "C"]
    assert ds[0]["Role"] == "Priority 1"
    assert {"BW-1", "BW-2", "BW-3"} <= {b["id"] for b in aquatwin.borewells(SITE)["borewells"]}
    cb = aquatwin.cloudburst_tiers(SITE)
    assert {r["scenario"] for r in cb["summary"]} >= {"CB1", "CB2", "CB3", "CB4"}
    assert aquatwin.modflow_scenarios(SITE)["summary"]


@data
def test_waterplan_labels_and_bounds():
    r = waterplan.run_plan(SITE, {"persons_per_flat": 6, "rain_case": "dry"})
    assert r["scenario"]["persons_per_flat"] == 6
    assert "Dry" in r["rain_case"]
    for k in r["kpis"]:
        assert k["period"] and k["source"].startswith("NBL-WaterPlan")
    names = {k["name"] for k in r["kpis"]}
    assert {"Average demand", "Water leaving the lease (spill)", "RO concentrate to tanker, average"} <= names


@data
def test_more_people_need_more_water():
    a = waterplan.run_plan(SITE, {"persons_per_flat": 2})
    b = waterplan.run_plan(SITE, {"persons_per_flat": 6})
    assert b["totals_m3"]["demand"] > a["totals_m3"]["demand"] * 2


@data
def test_integrity_flags_known_differences():
    c = consistency.run(SITE)
    st = {x["id"]: x["status"] for x in c["checks"]}
    assert "flats" not in st                 # flat count (141) confirmed by the architect; no longer a check
    assert st["area"] == "differs"           # AquaTwin Studio card still shows the older 4.35 ha
    assert st["roof"] == "agree"             # AquaTwin run SID-20261127-100657 uses 13,620 m2
    assert st["residents"] == "agree"        # and 564 residents (registers v4 / v3)
    assert st["reservoir"] == "agree"
    assert st["rain"] == "note"


def test_wording_rule():
    assert "low-grade" not in provenance.clean_wording("a low-grade supply").lower()


@data
def test_twin_scene():
    s = twin.scene(SITE)
    assert s["terrain"]["nx"] > 10 and len(s["boundary"]) >= 4
    assert len(s["drilling_sites"]) == 7 and s["admt"]["x"]
    assert set(s["block"]["readings"]) == {"I-POS", "I-NEU", "I-NEG"}


def test_utm_matches_aquatwin():
    # site A: AquaTwin gives E 816352.8, N 1426738.2 for 12.889735 N, 77.914848 E
    e, n = twin.to_utm(12.889735, 77.914848)
    assert abs(e - 816352.8) < 1.0 and abs(n - 1426738.2) < 1.0


@data
def test_knowledge_search():
    knowledge.build(SITE)
    hits = knowledge.search(SITE, "transformer noise")
    assert hits and hits[0]["passage"]


@data
def test_offline_agent_answers_with_engine_numbers(monkeypatch):
    monkeypatch.setattr(nvidia, "get_key", lambda: (None, "not set"))
    evs = list(agent.run(SITE, "Can we stay net zero with 6 persons per flat in a dry decade?"))
    fin = [e for e in evs if e["type"] == "final"][0]
    assert fin["offline"] and fin["trace"][0]["tool"] == "run_water_plan"
    assert "Net zero discharge" in fin["final"]["answer"]


def _script_model(monkeypatch, script):
    seen = []

    def fake_stream(messages, model=None):
        seen.append(messages)
        text = script[len(seen) - 1]
        for i in range(0, len(text), 7):          # arrive in small pieces, like a real stream
            yield text[i:i + 7]
    monkeypatch.setattr(nvidia, "get_key", lambda: ("nvapi-test", "test"))
    monkeypatch.setattr(nvidia, "models_to_try", lambda: ["scripted"])
    monkeypatch.setattr(nvidia, "chat_stream", fake_stream)
    return seen


@data
def test_reasoning_loop_with_scripted_model(monkeypatch):
    """The NVIDIA model is replaced by a script: it calls two tools, then streams the answer."""
    seen = _script_model(monkeypatch, [
        json.dumps({"tool": "drilling_sites", "args": {}, "why": "need the priority list"}),
        "```json\n" + json.dumps({"tool": "run_water_plan", "args": {"persons_per_flat": 9, "rain_case": "dry"}}) + "\n```",
        json.dumps({"final": {"answer": "Drill at **A** first.\nThe low-grade supply wording must not appear.",
                              "numbers": [{"name": "Zone score", "value": 9, "unit": "", "provenance": "calculated", "source": "AquaTwin"}],
                              "evidence": [{"source": "_sites_v03.csv"}], "what_would_change": "First borehole log",
                              "suggested_decision": {"decision": "Drill site A first to at least 350 m", "reason": "Highest zone score"},
                              "confidence": "medium"}}),
    ])
    evs = list(agent.run(SITE, "Where do we drill first?"))
    assert [e["tool"] for e in evs if e["type"] == "tool"] == ["drilling_sites", "run_water_plan"]
    streamed = "".join(e["text"] for e in evs if e["type"] == "delta")
    assert streamed.startswith("Drill at **A** first.\nThe")
    fin = evs[-1]
    assert fin["type"] == "final" and not fin["offline"]
    assert "low-grade" not in fin["final"]["answer"]
    assert fin["final"]["suggested_decision"]["decision"].startswith("Drill site A")
    assert '"persons_per_flat":6' in seen[2][-1]["content"].replace(" ", "")   # clamped to 2-6
    assert "Hard rules" in seen[0][0]["content"]


@data
def test_model_reply_format_is_repaired(monkeypatch):
    _script_model(monkeypatch, [
        "Sure! I will look at the drilling sites {tool: drilling_sites}",
        json.dumps({"final": {"answer": "Restated answer."}}),
    ])
    evs = list(agent.run(SITE, "Where do we drill?"))
    assert any(e["type"] == "status" and "restate" in e["text"] for e in evs)
    assert evs[-1]["final"]["answer"] == "Restated answer."


def test_partial_answer_decoder():
    buf = '{"final": {"answer": "Line one\\nquote \\"x\\" \\u00b3 and'
    assert agent.partial_answer(buf) == 'Line one\nquote "x" \u00b3 and'
    assert agent.partial_answer('{"tool": "x"') is None


@data
def test_ai_falls_back_to_offline_when_service_fails(monkeypatch):
    monkeypatch.setattr(nvidia, "get_key", lambda: ("nvapi-test", "test"))
    monkeypatch.setattr(nvidia, "models_to_try", lambda: ["m1", "m2"])

    def boom(messages, model=None):
        raise nvidia.AIError("unreachable")
        yield ""
    monkeypatch.setattr(nvidia, "chat_stream", boom)
    fin = list(agent.run(SITE, "Where should we drill?"))[-1]
    assert fin["offline"] and "unreachable" in fin["final"]["answer"]


@data
def test_runs_and_decisions_roundtrip():
    res = waterplan.run_plan(SITE, {})
    rec = runs.save_run(SITE, "NBL-WaterPlan", "test", {}, res)
    assert len(rec["fingerprint"]) == 64
    assert runs.review_run(SITE, rec["run_id"], "approved", "tester")["review"]["status"] == "approved"
    d = runs.add_decision(SITE, "Test decision", "test", "tester")
    assert d["id"].startswith("NBI-D-")


@data
def test_report_builds():
    p = reports.build(SITE)
    import docx
    doc = docx.Document(str(p))
    assert len(doc.tables) >= 9
    fonts = {r.font.name for para in doc.paragraphs for r in para.runs if r.font.name}
    assert fonts == {"Times New Roman"}


@data
def test_api_endpoints(client):
    for u in ["/api/health", "/api/sites", f"/api/sites/{SITE}", f"/api/sites/{SITE}/explore", f"/api/sites/{SITE}/recharge",
              f"/api/sites/{SITE}/integrity", f"/api/sites/{SITE}/decisions", f"/api/sites/{SITE}/plan/defaults"]:
        assert client.get(u).status_code == 200, u
    r = client.post(f"/api/sites/{SITE}/plan/run", json={"persons_per_flat": 7})
    assert r.status_code == 422   # outside the 2-6 range
    r = client.post(f"/api/sites/{SITE}/plan/run", json={"persons_per_flat": 5, "rain_case": "wet"})
    assert r.status_code == 200 and r.json()["run_id"]


def test_version_compare():
    assert updater._vt("v1.10.0") > updater._vt("1.9.3")
    assert updater._vt("1.1.0") == (1, 1, 0)


def test_launcher_swaps_pending_update(tmp_path, monkeypatch):
    import importlib.machinery
    import importlib.util
    path = str(__import__("pathlib").Path(__file__).resolve().parents[1] / "packaging" / "launch.pyw")
    loader = importlib.machinery.SourceFileLoader("launch", path)
    launch = importlib.util.module_from_spec(importlib.util.spec_from_loader("launch", loader))
    loader.exec_module(launch)
    (tmp_path / "app").mkdir(); (tmp_path / "app" / "VERSION").write_text("1.0.0")
    (tmp_path / "app_pending").mkdir(); (tmp_path / "app_pending" / "VERSION").write_text("1.1.0")
    monkeypatch.setattr(launch, "APP", tmp_path / "app")
    monkeypatch.setattr(launch, "PENDING", tmp_path / "app_pending")
    monkeypatch.setattr(launch, "PREVIOUS", tmp_path / "app_previous")
    monkeypatch.setattr(launch, "LOG", tmp_path / "launcher.log")
    launch.swap_in_update()
    assert (tmp_path / "app" / "VERSION").read_text() == "1.1.0"
    assert (tmp_path / "app_previous" / "VERSION").read_text() == "1.0.0"
    assert not (tmp_path / "app_pending").exists()


def test_retired_models_replaced_and_thinking_streamed(monkeypatch, tmp_path):
    from nbl_intelligence import settings
    from nbl_intelligence.ai import agent, nvidia
    f = tmp_path / "settings.json"
    f.write_text('{"ai": {"model": "deepseek-ai/deepseek-v4.1-flash", "max_tokens": 4000}}', encoding="utf-8")
    monkeypatch.setattr(settings, "SETTINGS_FILE", f)
    ai = settings.load()["ai"]
    assert ai["model"] == "nvidia/nemotron-3.5-super-vl-120b-a12b" and ai["max_tokens"] >= 8000 and ai["thinking"] is True

    def fake_stream(msgs, model=None):
        yield nvidia.Thought("Check the plan first.")
        yield '{"final": {"answer": "Net zero holds."}}'
    monkeypatch.setattr(nvidia, "chat_stream", fake_stream)
    gen = agent._step([{"role": "user", "content": "x"}])
    events = []
    try:
        while True:
            events.append(next(gen))
    except StopIteration as stop:
        text, model = stop.value
    assert {"type": "thinking", "text": "Check the plan first."} in events
    assert "Net zero holds." in text and "Check the plan" not in text


def test_parse_tolerates_raw_line_breaks_in_answer():
    from nbl_intelligence.ai import agent
    obj = agent.parse('{"final": {"answer": "Line one\nLine two", "confidence": "high"}}')
    assert obj["final"]["answer"] == "Line one\nLine two"


def test_parse_ignores_extra_closing_brace():
    from nbl_intelligence.ai import agent
    obj = agent.parse('{"final": {"answer": "A\nB", "confidence": "low"}}}')
    assert obj["final"]["answer"] == "A\nB"


def test_version_files_agree():
    """The VERSION file (release tag) and the program's own version must match, or the updater loops."""
    from pathlib import Path
    import nbl_intelligence
    root = Path(__file__).resolve().parents[1]
    assert (root / "VERSION").read_text().strip() == nbl_intelligence.__version__
