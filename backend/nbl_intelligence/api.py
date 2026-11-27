"""NBL-Intelligence API - shared by the desktop window and the browser."""
from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import APP_NAME, __version__, consistency, knowledge, registry, reports, runs, settings, twin, updater
from .ai import agent, nvidia
from .engines import aquatwin, waterplan

app = FastAPI(title=APP_NAME, version=__version__)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])


def _site(site: str) -> str:
    try:
        return registry.get(site)["id"]
    except registry.SiteNotFound:
        raise HTTPException(404, f"Unknown site {site}")


@app.exception_handler(FileNotFoundError)
def _fnf(_, exc):
    return JSONResponse({"detail": f"File not found: {exc}"}, status_code=404)


# ------------------------------------------------------------- system
@app.get("/api/health")
def health() -> dict[str, Any]:
    key, where = nvidia.get_key()
    s = settings.load()
    return {"app": APP_NAME, "version": __version__, "mode": updater.mode(), "ai": {"key_set": bool(key), "where": where, "model": s["ai"]["model"],
            "fallback_model": s["ai"]["fallback_model"]},
            "engines": {"aquatwin": {"root": s["aquatwin_root"], "found": settings.aquatwin_root().exists(), "version": aquatwin.aquatwin_version()},
                        "waterplan": {"root": s["waterplan_root"], "found": settings.waterplan_root().exists(), "version": waterplan.version() if settings.waterplan_root().exists() else None}}}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    s = settings.load()
    key, where = nvidia.get_key()
    return {**s, "ai_key": {"set": bool(key), "masked": nvidia.mask(key), "where": where}, "settings_file": str(settings.SETTINGS_FILE)}


class SettingsIn(BaseModel):
    aquatwin_root: str | None = None
    waterplan_root: str | None = None
    project_folders: dict[str, str] | None = None
    aquatwin_python: str | None = None
    theme: str | None = None
    ai: dict[str, Any] | None = None


@app.put("/api/settings")
def put_settings(body: SettingsIn) -> dict[str, Any]:
    settings.save({k: v for k, v in body.model_dump().items() if v is not None})
    return get_settings()


class KeyIn(BaseModel):
    key: str = Field(min_length=8)


@app.post("/api/ai/key")
def set_key(body: KeyIn) -> dict[str, Any]:
    where = nvidia.set_key(body.key)
    return {"saved": True, "where": where}


@app.delete("/api/ai/key")
def del_key() -> dict[str, Any]:
    nvidia.delete_key()
    return {"deleted": True}


@app.post("/api/ai/test")
def test_ai() -> dict[str, Any]:
    return nvidia.test_connection()


@app.get("/api/ai/models")
def ai_models() -> dict[str, Any]:
    return nvidia.list_models()


# ------------------------------------------------------------- updates
@app.get("/api/update/check")
def update_check() -> dict[str, Any]:
    return {k: v for k, v in updater.check().items() if not k.startswith("_")}


@app.post("/api/update/apply")
def update_apply() -> dict[str, Any]:
    try:
        return updater.apply()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/update/rollback")
def update_rollback() -> dict[str, Any]:
    try:
        return updater.rollback()
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.post("/api/update/restart")
def update_restart() -> dict[str, Any]:
    try:
        updater.restart_soon()
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    return {"restarting": True}


# ------------------------------------------------------------- sites
@app.get("/api/sites")
def sites() -> list[dict[str, Any]]:
    out = []
    for s in registry.list_sites():
        sid = s["id"]
        s["engines"] = {"aquatwin": aquatwin.available(sid), "waterplan": waterplan.available(sid)}
        out.append(s)
    return out


@app.get("/api/sites/{site}")
def site(site: str) -> dict[str, Any]:
    sid = _site(site)
    return {**registry.get(sid), "aquatwin_run": aquatwin.run_summary(sid)}


@app.get("/api/sites/{site}/twin")
def site_twin(site: str, rebuild: bool = False) -> Any:
    sid = _site(site)
    twin.scene(sid, rebuild=rebuild)
    return FileResponse(registry.site_folder(sid) / "twin" / "scene.json", media_type="application/json")


# ------------------------------------------------------------- explore (AquaTwin)
@app.get("/api/sites/{site}/explore")
def explore(site: str) -> dict[str, Any]:
    sid = _site(site)
    return {"run": aquatwin.run_summary(sid), "drilling_sites": aquatwin.drilling_sites(sid), "borewells": aquatwin.borewells(sid),
            "confidence": aquatwin.confidence_panel(sid), "zones": aquatwin.zones(sid)}


@app.get("/api/sites/{site}/recharge")
def recharge(site: str) -> dict[str, Any]:
    sid = _site(site)
    cb = aquatwin.cloudburst_tiers(sid)
    cb.pop("rows", None)
    return {"points": aquatwin.recharge_points(sid), "cloudburst": cb, "modflow": aquatwin.modflow_scenarios(sid)}


@app.get("/api/sites/{site}/assumptions")
def assumptions(site: str) -> dict[str, Any]:
    sid = _site(site)
    return {"aquatwin": aquatwin.assumptions(sid), "placeholders": registry.get(sid).get("placeholders_to_replace", [])}


@app.get("/api/sites/{site}/aquatwin/runs")
def aquatwin_runs(site: str) -> list[dict[str, Any]]:
    return aquatwin.list_runs(_site(site))


class AquaRunIn(BaseModel):
    modules: list[str] | None = None


@app.post("/api/sites/{site}/aquatwin/start")
def aquatwin_start(site: str, body: AquaRunIn) -> dict[str, Any]:
    return aquatwin.start_run(_site(site), body.modules)


# ------------------------------------------------------------- plan (WaterPlan)
@app.get("/api/sites/{site}/plan/defaults")
def plan_defaults(site: str) -> dict[str, Any]:
    sid = _site(site)
    return {"plan": waterplan.default_plan(sid), "controls": registry.get(sid).get("controls", {}),
            "rain": waterplan.rain_summary(sid)}


class PlanIn(BaseModel):
    name: str | None = None
    rain_case: str | None = "expected"
    rain_mm_per_year: float | None = None
    persons_per_flat: float | None = Field(default=None, ge=2, le=6)
    flats: float | None = Field(default=None, gt=0, le=2000)
    litres_per_person_day: float | None = None
    years: int | None = Field(default=None, ge=1, le=30)
    start_year: int | None = None
    years_to_full_occupancy: float | None = None
    reservoir_m3: float | None = None
    roof_chambers_m3: float | None = None
    treated_tank_m3: float | None = None
    borewell_m3_per_day: float | None = None
    ro_recovery: float | None = None
    recharge_wells_m3_per_day: float | None = None
    save: bool = True


@app.post("/api/sites/{site}/plan/run")
def plan_run(site: str, body: PlanIn) -> dict[str, Any]:
    sid = _site(site)
    inputs = body.model_dump(exclude={"save"}, exclude_none=True)
    try:
        res = waterplan.run_plan(sid, inputs)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"WaterPlan could not run this plan: {e}")
    rec = runs.save_run(sid, "NBL-WaterPlan", body.name or "Scenario", inputs, res) if body.save else None
    res["daily"] = waterplan.thin_daily(res, 3)
    res["run_id"] = rec["run_id"] if rec else None
    return res


@app.get("/api/sites/{site}/runs")
def list_runs(site: str) -> list[dict[str, Any]]:
    return runs.list_runs(_site(site))


@app.get("/api/sites/{site}/runs/{rid}")
def get_run(site: str, rid: str) -> dict[str, Any]:
    try:
        rec = runs.get_run(_site(site), rid, daily=True)
    except KeyError:
        raise HTTPException(404, rid)
    if rec.get("daily"):
        rec["daily"] = {k: v[::3] for k, v in rec["daily"].items()}
    return rec


class ReviewIn(BaseModel):
    status: str = Field(pattern="^(approved|rejected|needs-review)$")
    reviewer: str = "Hydrogeologist"
    note: str = ""


@app.post("/api/sites/{site}/runs/{rid}/review")
def review(site: str, rid: str, body: ReviewIn) -> dict[str, Any]:
    return runs.review_run(_site(site), rid, body.status, body.reviewer, body.note)


# ------------------------------------------------------------- integrity / decisions
@app.get("/api/sites/{site}/integrity")
def integrity(site: str) -> dict[str, Any]:
    return consistency.run(_site(site))


@app.get("/api/sites/{site}/decisions")
def decisions(site: str) -> dict[str, Any]:
    sid = _site(site)
    return {"platform": runs.list_decisions(sid)[::-1], "aquatwin": aquatwin.decisions(sid)["decisions"][::-1]}


class DecisionIn(BaseModel):
    decision: str = Field(min_length=3)
    reason: str = ""
    by: str = "Hydrogeologist"
    status: str = "adopted"
    evidence: list[Any] = []


@app.post("/api/sites/{site}/decisions")
def add_decision(site: str, body: DecisionIn) -> dict[str, Any]:
    return runs.add_decision(_site(site), body.decision, body.reason, body.by, body.status, evidence=body.evidence)


# ------------------------------------------------------------- knowledge
@app.get("/api/sites/{site}/knowledge")
def knowledge_lib(site: str) -> dict[str, Any]:
    return knowledge.library(_site(site))


@app.get("/api/sites/{site}/knowledge/search")
def knowledge_search(site: str, q: str) -> list[dict[str, Any]]:
    return knowledge.search(_site(site), q, k=10)


@app.post("/api/sites/{site}/knowledge/rebuild")
def knowledge_rebuild(site: str) -> dict[str, Any]:
    return knowledge.build(_site(site))


# ------------------------------------------------------------- AI
class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    chat_id: str | None = None
    history: list[dict[str, str]] = []


@app.post("/api/sites/{site}/ask")
def ask(site: str, body: AskIn) -> dict[str, Any]:
    sid = _site(site)
    events = list(agent.run(sid, body.question, body.history))
    final = next((e for e in events if e["type"] == "final"), None)
    if final:
        final["chat_id"] = agent.save_exchange(sid, body.chat_id, body.question, final)
    return {"events": events, "final": final}


@app.post("/api/sites/{site}/ask/stream")
def ask_stream(site: str, body: AskIn) -> StreamingResponse:
    sid = _site(site)

    def gen():
        for ev in agent.run(sid, body.question, body.history):
            if ev["type"] == "final":
                ev["chat_id"] = agent.save_exchange(sid, body.chat_id, body.question, ev)
            yield f"data: {json.dumps(ev, default=str)}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/sites/{site}/chats")
def chats(site: str) -> list[dict[str, Any]]:
    return agent.list_chats(_site(site))


@app.get("/api/sites/{site}/chats/{cid}")
def chat(site: str, cid: str) -> dict[str, Any]:
    try:
        return agent.get_chat(_site(site), cid)
    except FileNotFoundError:
        raise HTTPException(404, cid)


# ------------------------------------------------------------- reports
class ReportIn(BaseModel):
    run_id: str | None = None
    include_ai_chat: str | None = None


@app.post("/api/sites/{site}/report")
def report(site: str, body: ReportIn) -> dict[str, Any]:
    sid = _site(site)
    notes = None
    if body.include_ai_chat:
        try:
            c = agent.get_chat(sid, body.include_ai_chat)
            notes = [{"question": t["question"], "answer": t["answer"]["final"]["answer"]} for t in c["turns"]]
        except Exception:
            notes = None
    p = reports.build(sid, body.run_id, notes)
    return {"file": p.name, "path": str(p), "url": f"/api/sites/{sid}/reports/{p.name}"}


@app.get("/api/sites/{site}/reports")
def list_reports(site: str) -> list[dict[str, Any]]:
    d = settings.state_dir("reports", _site(site))
    return [{"file": p.name, "url": f"/api/sites/{site}/reports/{p.name}", "bytes": p.stat().st_size} for p in sorted(d.glob("*.docx"), reverse=True)]


@app.get("/api/sites/{site}/reports/{name}")
def get_report(site: str, name: str) -> FileResponse:
    p = settings.state_dir("reports", _site(site)) / name
    if not p.exists() or p.suffix != ".docx" or "/" in name or "\\" in name:
        raise HTTPException(404, name)
    return FileResponse(p, filename=name)


# ------------------------------------------------------------- web client
if (settings.WEB_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=settings.WEB_DIST / "assets"), name="assets")


_NC = {"Cache-Control": "no-cache, must-revalidate"}

@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    f = (settings.WEB_DIST / path).resolve()
    if path and f.is_file() and settings.WEB_DIST.resolve() in f.parents:
        return FileResponse(f, headers=_NC if f.suffix == ".html" else None)
    idx = settings.WEB_DIST / "index.html"
    if idx.exists():
        return FileResponse(idx, headers=_NC)
    return JSONResponse({"app": APP_NAME, "note": "Web client not built. API docs at /docs"})
