"""NBL-Intelligence reasoning loop.

The NVIDIA model plans, chooses engine tools, reads their results and writes
the answer. Protocol: on each step the model replies with one JSON object,
either a tool call or the final answer. This works with any chat model on the
NVIDIA catalog (no special function-calling support needed).

If no AI service can be reached, a built-in offline router still answers the
common questions by calling the same tools, and says that it is offline.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any, Iterator

from .. import provenance, registry, settings
from . import nvidia, tools

RULES = """You are NBL-Intelligence, the water intelligence model of Nature Based Living (Vijayanagar Eco-Village Pvt Ltd).
You support a hydrogeologist and water masterplanner. You reason; two engines calculate:
- NBL-AquaTwin: ADMT geophysical survey interpretation, 3D model, borewell sites, recharge tiers, MODFLOW scenarios.
- NBL-WaterPlan: daily closed-loop water balance, demand build-up, storage, treatment, tanker, net zero discharge.

Hard rules:
1. Never invent or estimate a number. Every number in your answer must come from a tool result in this conversation. If no tool gives it, say what is missing.
2. Label every number: its period (per day, per year, over N years, single event), its case (expected/average, dry, wet, peak, design) and, for water, whether before or after treatment.
3. Never call any water supply "low-grade" or grade supplies. NBL uses one high-quality standard: every source is filtered or RO-treated before use; RO concentrate and sludge leave by tanker.
4. The site is at evidence Stage A (no on-site borehole). Groundwater results are untested scenarios. The three ADMT readings (positive, neutral, negative) are carried in parallel; none is adopted until borehole evidence.
5. Purple in ADMT sections is very low quasi-resistivity (clay-like or saline), not water; the water-bearing signal is in the blue shades.
6. Use plain, precise English. Units with a slash (m3/day, mm/yr), not negative powers. Concentrations in mg/L for water, mg/kg for soil.
7. Suggest a decision only when the evidence supports one; the user approves or rejects it.

Reply on EVERY step with exactly one JSON object and nothing else:
  To call a tool:  {"tool": "<name>", "args": {...}, "why": "<one short sentence>"}
  To finish:       {"final": {"answer": "<markdown answer>",
                              "numbers": [{"name": "...", "value": ..., "unit": "...", "period": "...", "case": "...", "provenance": "calculated|imported|assumption|placeholder|measured|forecast", "source": "..."}],
                              "evidence": [{"source": "...", "detail": "..."}],
                              "what_would_change": "<the field test or data that would change this answer>",
                              "suggested_decision": null or {"decision": "...", "reason": "..."},
                              "confidence": "low|medium|high"}}
Call tools before answering whenever numbers or site facts are involved. You may call several tools, one per step. Keep the answer focused; use short sections or a table when comparing."""


def system_prompt(site: str) -> str:
    s = registry.get(site)
    brief = {"site": s.get("name"), "location": s.get("location"), "status": s.get("status"), "concept": s.get("concept")}
    return (RULES + "\n\nCurrent site: " + json.dumps(brief) + f"\nToday: {datetime.now():%d %b %Y}\n\nTools:\n" + tools.describe())


_JSON = re.compile(r"\{.*\}", re.S)


def parse(text: str) -> dict[str, Any] | None:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    for cand in (t, *(_JSON.findall(t)[:1])):
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def _sources_from(result: Any) -> list[str]:
    out = []
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == "source" and isinstance(v, str):
                    out.append(v)
                else:
                    walk(v)
        elif isinstance(x, list):
            for v in x[:50]:
                walk(v)
    walk(result)
    return sorted(set(out))[:8]


_ANS = re.compile(r'"answer"\s*:\s*"')


def partial_answer(buf: str) -> str | None:
    """Decode the "answer" string of a final JSON reply that is still arriving."""
    t = buf.lstrip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
    if not t.startswith("{"):
        return None
    f = t.find('"final"')
    m = _ANS.search(t)
    if f < 0 or not m or m.start() < f:
        return None
    out, i, raw = [], m.end(), t
    esc = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "/": "/", "r": "", "b": "", "f": ""}
    while i < len(raw):
        ch = raw[i]
        if ch == "\\":
            if i + 1 >= len(raw):
                break
            nx = raw[i + 1]
            if nx == "u":
                if i + 6 > len(raw):
                    break
                try:
                    out.append(chr(int(raw[i + 2:i + 6], 16)))
                except ValueError:
                    pass
                i += 6
                continue
            out.append(esc.get(nx, nx))
            i += 2
            continue
        if ch == '"':
            break
        out.append(ch)
        i += 1
    return "".join(out)


def _step(msgs: list[dict[str, str]]):
    """One model turn, streamed. Yields delta events; returns (text, model)."""
    cfg = settings.load()["ai"]
    errors = []
    for model in nvidia.models_to_try():
        buf, sent, started = "", 0, False
        try:
            if not cfg.get("stream", True):
                r = nvidia.chat(msgs, model=model)
                return r["text"], model
            for piece in nvidia.chat_stream(msgs, model=model):
                started = True
                buf += piece
                ans = partial_answer(buf)
                if ans is not None and len(ans) > sent:
                    yield {"type": "delta", "text": ans[sent:]}
                    sent = len(ans)
            if buf.strip():
                return buf.strip(), model
            errors.append(f"{model}: empty reply")
        except nvidia.AIError as e:
            if started:
                raise
            errors.append(f"{model}: {e}")
    raise nvidia.AIError(" | ".join(errors))


def run(site: str, question: str, history: list[dict[str, str]] | None = None) -> Iterator[dict[str, Any]]:
    """Yield events: status, tool, tool_result, delta, final."""
    cfg = settings.load()["ai"]
    msgs: list[dict[str, str]] = [{"role": "system", "content": system_prompt(site)}]
    for h in (history or [])[-6:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            msgs.append({"role": h["role"], "content": h["content"][:3000]})
    msgs.append({"role": "user", "content": question})
    trace: list[dict[str, Any]] = []
    key, _ = nvidia.get_key()
    if not key and "integrate.api.nvidia.com" in cfg["base_url"]:
        yield from offline(site, question, reason="No NVIDIA API key is set (Settings).")
        return
    yield {"type": "status", "text": "Reasoning"}
    repaired = False
    steps = int(cfg.get("max_steps", 6))
    for step in range(steps + 1):
        if step == steps:
            msgs.append({"role": "user", "content": "Give the final JSON answer now, using only the tool results above."})
        try:
            text, model = yield from _step(msgs)
        except nvidia.AIError as e:
            yield from offline(site, question, reason=str(e), trace=trace)
            return
        obj = parse(text)
        if obj is None:
            if not repaired and ("{" in text or step == 0):
                repaired = True
                yield {"type": "status", "text": "Asking the model to restate its reply"}
                msgs.append({"role": "assistant", "content": text[:3000]})
                msgs.append({"role": "user", "content": "That reply was not one valid JSON object. Reply again with exactly one JSON object: a tool call or the final answer."})
                continue
            yield _final({"answer": text, "confidence": "low"}, trace, model)
            return
        if "final" in obj:
            yield _final(obj["final"] if isinstance(obj["final"], dict) else {"answer": str(obj["final"])}, trace, model)
            return
        name = obj.get("tool")
        if not name or step == steps:
            yield _final({"answer": obj.get("answer") or text}, trace, model)
            return
        args = obj.get("args") or {}
        yield {"type": "tool", "tool": name, "args": args, "why": obj.get("why", ""), "model": model}
        try:
            result = tools.call(name, site, args)
            srcs = _sources_from(result)
            trace.append({"tool": name, "args": args, "sources": srcs, "ok": True})
            yield {"type": "tool_result", "tool": name, "ok": True, "sources": srcs}
            content = tools.compact(result)
        except Exception as e:  # noqa: BLE001
            trace.append({"tool": name, "args": args, "ok": False, "error": str(e)})
            yield {"type": "tool_result", "tool": name, "ok": False, "error": str(e)}
            content = json.dumps({"error": str(e), "available_tools": list(tools.TOOLS)})
        msgs.append({"role": "assistant", "content": text[:4000]})
        msgs.append({"role": "user", "content": f"Tool result for {name}:\n{content}\n\nContinue: call another tool or give the final JSON answer."})


def _final(final: dict[str, Any], trace: list[dict[str, Any]], model: str, offline_mode: bool = False) -> dict[str, Any]:
    final = dict(final)
    final["answer"] = provenance.clean_wording(str(final.get("answer", "")))
    for k in ("numbers", "evidence"):
        if not isinstance(final.get(k), list):
            final[k] = []
    final.setdefault("what_would_change", "")
    final.setdefault("suggested_decision", None)
    final.setdefault("confidence", "medium")
    return {"type": "final", "id": uuid.uuid4().hex[:10], "final": final, "trace": trace, "model": model,
            "offline": offline_mode, "at": datetime.now().isoformat(timespec="seconds")}


# ------------------------------------------------------------- offline router
def _num(q: str, word: str) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:" + word + ")", q)
    return float(m.group(1)) if m else None


def offline(site: str, question: str, reason: str = "", trace: list | None = None) -> Iterator[dict[str, Any]]:
    trace = list(trace or [])
    q = question.lower()
    yield {"type": "status", "text": "Offline: answering with the engines directly"}
    parts: list[str] = []
    numbers: list[dict[str, Any]] = []
    evidence: list[dict[str, str]] = []

    def use(name: str, **args):
        yield {"type": "tool", "tool": name, "args": args, "why": "offline router"}
        res = tools.call(name, site, args)
        srcs = _sources_from(res)
        trace.append({"tool": name, "args": args, "sources": srcs, "ok": True})
        yield {"type": "tool_result", "tool": name, "ok": True, "sources": srcs}
        return res

    matched = False
    if any(w in q for w in ("plan", "demand", "persons", "people", "dry", "wet", "net zero", "tanker", "reservoir", "supply", "balance", "occupancy")):
        matched = True
        args: dict[str, Any] = {}
        ppf = _num(q, r"persons|people per flat|person")
        if ppf:
            args["persons_per_flat"] = ppf
        for c in ("dry", "wet"):
            if c in q:
                args["rain_case"] = c
        res = yield from use("run_water_plan", **args)
        rows = "\n".join(f"| {k['name']} | {k['value']:,} {k['unit']} | {k['period']} |" for k in res["kpis"][:13])
        parts.append(f"**Water plan - {res['rain_case']}, {res['scenario']['persons_per_flat']:.0f} persons/flat, {res['scenario']['flats']:.0f} flats** (run {res['run_id']})\n\n| Item | Value | Period |\n|---|---|---|\n{rows}\n\nNet zero discharge: **{'yes' if res['net_zero_discharge'] else 'no'}**. {res['standard']}.")
        pick = ("Average demand", "Flats use at full occupancy", "Reliability", "Borewell water used, average", "RO concentrate to tanker, average", "Water leaving the lease (spill)")
        numbers += [{**k, "source": res["source"]} for k in res["kpis"] if k["name"] in pick]
        evidence.append({"source": res["source"], "detail": "closed-loop daily run"})
    if any(w in q for w in ("drill", "borewell site", "where", "site a", "priority", "borehole")):
        matched = True
        res = yield from use("drilling_sites")
        rows = "\n".join(f"| {s['Site']} | {s['Role']} | {s['Primary_zone']} | {s['Basis'][:110]}... |" for s in res["sites"])
        parts.append(f"**Drilling sites** ({res['status']})\n\n| Site | Role | Zone (score, depth) | Basis |\n|---|---|---|---|\n{rows}\n\n{res['order_note']}")
        evidence.append({"source": res["source"], "detail": "priority list v03"})
    if any(w in q for w in ("recharge", "cloudburst", "tier", "storm")):
        matched = True
        res = yield from use("cloudburst_tiers")
        rows = "\n".join(f"| {r['tier']} | {r['boundary']} | {r['to_aquifer_pct']} | {r['held_unsat_pct']} | {r['retained_1y_pct']} |" for r in res["summary"])
        parts.append(f"**Cloudburst recharge by tier** ({res['label']})\n\n| Tier | Boundary | To aquifer % | Held in dry rock % | Retained after 1 yr % |\n|---|---|---|---|---|\n{rows}")
        evidence.append({"source": res["source"], "detail": "M7d tier effects"})
    if any(w in q for w in ("agree", "consisten", "integrity", "conflict", "differ", "mismatch")):
        matched = True
        res = yield from use("integrity_checks")
        rows = "\n".join(f"| {c['title']} | {c['status']} | {c['action']} |" for c in res["checks"])
        parts.append(f"**Integrity checks**\n\n| Check | Status | Action |\n|---|---|---|\n{rows}")
    if any(w in q for w in ("rain", "monsoon", "imd")) and not any("Water plan" in p for p in parts):
        matched = True
        res = yield from use("rainfall_outlook")
        rec = res["record"]
        parts.append(f"**Rainfall (IMD 0.25 deg, {rec['first_year']}-{rec['last_year']})**: mean {rec['mean_mm']} mm/yr; driest {rec['driest_mm']} mm ({rec['driest_year']}); wettest {rec['wettest_mm']} mm ({rec['wettest_year']}). Planning period means: dry {res['mean_mm_by_case']['dry']}, expected {res['mean_mm_by_case']['expected']}, wet {res['mean_mm_by_case']['wet']} mm/yr.")
    if not matched:
        res = yield from use("search_documents", query=question)
        if res["passages"]:
            parts.append("**From the project documents**\n\n" + "\n\n".join(f"> {p['passage'][:500]}\n\n- *{p['document']}* ({p['group']})" for p in res["passages"][:3]))
            evidence += [{"source": p["document"], "detail": p["group"]} for p in res["passages"][:3]]
        else:
            parts.append("I found nothing in the engines or documents for this question.")
    note = f"_Offline answer: the AI service was not used ({reason}). The numbers come straight from the engines._"
    final = {"answer": note + "\n\n" + "\n\n".join(parts), "numbers": numbers, "evidence": evidence,
             "what_would_change": "Connect the NVIDIA AI service for a reasoned answer; field data (pumping test, first borehole log) would change the groundwater results.",
             "suggested_decision": None, "confidence": "medium"}
    yield _final(final, trace, "offline router", offline_mode=True)


# ------------------------------------------------------------- chat store
def save_exchange(site: str, chat_id: str | None, question: str, final_event: dict[str, Any]) -> str:
    d = settings.state_dir("chats", site)
    chat_id = chat_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    p = d / f"{chat_id}.json"
    data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"id": chat_id, "site": site, "turns": []}
    data["turns"].append({"question": question, "answer": final_event, "at": datetime.now().isoformat(timespec="seconds")})
    data["title"] = data["turns"][0]["question"][:80]
    p.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    return chat_id


def list_chats(site: str) -> list[dict[str, Any]]:
    d = settings.state_dir("chats", site)
    out = []
    for p in sorted(d.glob("*.json"), reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            out.append({"id": data["id"], "title": data.get("title"), "turns": len(data["turns"]), "at": data["turns"][-1]["at"]})
        except Exception:
            continue
    return out


def get_chat(site: str, chat_id: str) -> dict[str, Any]:
    p = settings.state_dir("chats", site) / f"{chat_id}.json"
    return json.loads(p.read_text(encoding="utf-8"))
