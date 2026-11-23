// Live NVIDIA reasoning for the public website.
// The browser runs the same JSON tool protocol as the desktop agent. Tool results come
// from the published snapshot (prepared by scripts/export_view.py); model calls go through
// the NBL-Intelligence relay (relay/worker.js), which holds the NVIDIA key and checks the
// team passcode. Without the relay or passcode the website keeps its prepared answers.
import type { AskEvent, Final } from "./api";

const BUILT_RELAY = (import.meta.env.VITE_AI_RELAY as string | undefined) || "";
const MODELS = ["nvidia/nemotron-3.5-super-vl-120b-a12b", "nvidia/nemotron-3.5-lightning-30b-a3b"];
const MAX_STEPS = 10;
const K_PASS = "nbi-ai-passcode", K_RELAY = "nbi-ai-relay";
const BASE = import.meta.env.BASE_URL || "/";

const store = {
  get(k: string) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k: string, v: string) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } },
};

export const webAI = {
  relay(): string { return (store.get(K_RELAY) || BUILT_RELAY).replace(/\/+$/, ""); },
  configured(): boolean { return !!this.relay(); },
  unlocked(): boolean { return this.configured() && !!store.get(K_PASS); },
  lock() { store.set(K_PASS, ""); window.dispatchEvent(new Event("nbi-ai-change")); },
  /** Check the passcode with the relay and remember it in this browser. */
  async unlock(passcode: string, relay?: string): Promise<boolean> {
    const url = (relay || this.relay()).replace(/\/+$/, "");
    if (!url) throw new Error("No AI relay address is set for this website.");
    const r = await fetch(`${url}/check`, { method: "POST", headers: { "x-nbl-passcode": passcode } });
    if (!r.ok) return false;
    if (relay) store.set(K_RELAY, relay.replace(/\/+$/, ""));
    store.set(K_PASS, passcode);
    window.dispatchEvent(new Event("nbi-ai-change"));
    return true;
  },
};

// ---------------------------------------------------------------- tools (from the snapshot)
let pack: Promise<any> | null = null;
function loadPack(site: string) {
  if (!pack) pack = fetch(`${BASE}snapshot/sites/${site}/ai_tools.json`).then(r => { if (!r.ok) throw new Error("AI tool pack missing"); return r.json(); });
  return pack;
}

async function callTool(site: string, name: string, args: any): Promise<any> {
  const P = await loadPack(site);
  if (name === "run_water_plan") {
    const ppf = Math.max(2, Math.min(6, Math.round(Number(args?.persons_per_flat ?? 4))));
    const raw = String(args?.rain_case || "expected").toLowerCase();
    const rc = raw.startsWith("d") ? "dry" : raw.startsWith("w") ? "wet" : "expected";
    const ignored = Object.keys(args || {}).filter(k => !["persons_per_flat", "rain_case"].includes(k));
    const r = await fetch(`${BASE}snapshot/sites/${site}/plangrid/${ppf}_${rc}.json`).then(x => x.json());
    return {
      prepared_run: `${ppf} persons/flat, ${rc} rain`, scenario: r.scenario, rain_case: r.rain_case,
      rain_mean_mm_per_year: r.rain?.mean_mm_per_year, kpis: r.kpis, supply_shares: r.supply_shares,
      net_zero_discharge: r.net_zero_discharge, standard: r.standard, source: r.source,
      ...(ignored.length ? { note: `On the website only persons_per_flat and rain_case can change; ignored: ${ignored.join(", ")}.` } : {}),
    };
  }
  if (!(name in P.tools)) throw new Error(`Tool ${name} is not available on the website. Available: ${[...Object.keys(P.tools), "run_water_plan"].join(", ")}`);
  let res = JSON.parse(JSON.stringify(P.tools[name]));
  if (name === "admt_zones" && args?.min_score != null) res.zones = res.zones.filter((z: any) => (z.Score || 0) >= Number(args.min_score));
  if (name === "decisions" && args?.query) { const q = String(args.query).toLowerCase(); res.decisions = res.decisions.filter((d: any) => JSON.stringify(d).toLowerCase().includes(q)); }
  return res;
}

function compact(obj: any, limit = 7000): string {
  const s = JSON.stringify(obj);
  return s.length <= limit ? s : s.slice(0, limit) + '..."(truncated)"';
}

function sourcesFrom(x: any, out: Set<string> = new Set()): string[] {
  if (Array.isArray(x)) x.slice(0, 50).forEach(v => sourcesFrom(v, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { if (k === "source" && typeof v === "string") out.add(v); else sourcesFrom(v, out); }
  return [...out].sort().slice(0, 8);
}

// ---------------------------------------------------------------- reply parsing (same as the desktop agent)
/** Escape raw line breaks and tabs that models sometimes leave inside JSON strings. */
function escapeInStrings(t: string): string {
  let out = "", inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === "\\") { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      out += ch === "\n" ? "\\n" : ch === "\r" ? "" : ch === "\t" ? "\\t" : ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  return out;
}

/** The first complete {...} object in the text (string-aware), ignoring anything after it. */
function firstObject(t: string): string | undefined {
  const start = t.indexOf("{"); if (start < 0) return undefined;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return t.slice(start, i + 1);
  }
  return undefined;
}

function parse(text: string): any | null {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const block = (t.match(/\{[\s\S]*\}/) || [])[0];
  const first = firstObject(t);
  for (const cand of [t, block, block && escapeInStrings(block), first, first && escapeInStrings(first)]) {
    if (!cand) continue;
    try { const o = JSON.parse(cand); if (o && typeof o === "object") return o; } catch { /* next */ }
  }
  return null;
}

/** Decode the "answer" string of a final JSON reply that is still arriving. */
function partialAnswer(buf: string): string | null {
  let t = buf.trimStart();
  if (t.startsWith("```")) t = t.includes("\n") ? t.slice(t.indexOf("\n") + 1) : "";
  if (!t.startsWith("{")) return null;
  const f = t.indexOf('"final"'), m = /"answer"\s*:\s*"/.exec(t);
  if (f < 0 || !m || m.index < f) return null;
  const esc: Record<string, string> = { n: "\n", t: "\t", '"': '"', "\\": "\\", "/": "/", r: "", b: "", f: "" };
  let out = "", i = m.index + m[0].length;
  while (i < t.length) {
    const ch = t[i];
    if (ch === "\\") {
      if (i + 1 >= t.length) break;
      const nx = t[i + 1];
      if (nx === "u") { if (i + 6 > t.length) break; out += String.fromCharCode(parseInt(t.slice(i + 2, i + 6), 16) || 32); i += 6; continue; }
      out += esc[nx] ?? nx; i += 2; continue;
    }
    if (ch === '"') break;
    out += ch; i++;
  }
  return out;
}

const BANNED = ["low-grade", "low grade", "lower-grade", "lower grade", "poor-quality supply"];
function clean(text: string) {
  let out = text;
  for (const w of BANNED) out = out.split(w).join("treated").split(w[0].toUpperCase() + w.slice(1)).join("Treated");
  return out;
}

// ---------------------------------------------------------------- one model turn, streamed
class RelayError extends Error { constructor(msg: string, public fatal = false) { super(msg); } }

async function step(msgs: { role: string; content: string }[], onDelta: (t: string) => void, onThink: (t: string) => void): Promise<{ text: string; model: string }> {
  const errors: string[] = [];
  for (const model of MODELS) {
    let r: Response;
    try {
      r = await fetch(`${webAI.relay()}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-nbl-passcode": store.get(K_PASS) },
        body: JSON.stringify({ model, messages: msgs, temperature: 0.2, max_tokens: 16000, stream: true, thinking: true }),
      });
    } catch { errors.push(`${model}: relay not reachable`); continue; }
    if (r.status === 401) { webAI.lock(); throw new RelayError("The AI passcode was not accepted. Unlock the AI again with the current passcode.", true); }
    if (r.status === 429) throw new RelayError("Too many questions in one minute. Wait a moment and ask again.", true);
    if (!r.ok || !r.body) { let m = `${r.status}`; try { m = (await r.json()).error || m; } catch { /* */ } errors.push(`${model}: ${m}`); continue; }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let sse = "", buf = "", sent = 0, inThink = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += dec.decode(value, { stream: true });
      let i;
      while ((i = sse.indexOf("\n")) >= 0) {
        const line = sse.slice(0, i).trim(); sse = sse.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let piece = "";
        try {
          const d = JSON.parse(data).choices?.[0]?.delta || {};
          const th = d.reasoning_content || d.reasoning || "";
          if (th) onThink(th);
          piece = d.content || "";
        } catch { continue; }
        while (piece) {
          if (inThink) { const e = piece.indexOf("</think>"); if (e < 0) { onThink(piece); piece = ""; } else { onThink(piece.slice(0, e)); piece = piece.slice(e + 8); inThink = false; } }
          else { const s = piece.indexOf("<think>"); if (s < 0) { buf += piece; piece = ""; } else { buf += piece.slice(0, s); piece = piece.slice(s + 7); inThink = true; } }
        }
        const ans = partialAnswer(buf);
        if (ans !== null && ans.length > sent) { onDelta(ans.slice(sent)); sent = ans.length; }
      }
    }
    if (buf.trim()) return { text: buf.trim(), model };
    errors.push(`${model}: empty reply`);
  }
  throw new RelayError(errors.join(" | "));
}

function finalEvent(final: any, trace: any[], model: string): AskEvent {
  const f: Final = {
    answer: clean(String(final?.answer ?? "")),
    numbers: Array.isArray(final?.numbers) ? final.numbers : [],
    evidence: Array.isArray(final?.evidence) ? final.evidence : [],
    what_would_change: final?.what_would_change || "",
    suggested_decision: final?.suggested_decision || null,
    confidence: final?.confidence || "medium",
  };
  return { type: "final", id: Math.random().toString(36).slice(2, 12), final: f, trace, model, offline: false, at: new Date().toISOString().slice(0, 19) };
}

/** Run one question through the website agent. Emits the same events as the desktop app. */
export async function askWeb(site: string, question: string, history: { role: string; content: string }[], onEvent: (e: AskEvent) => void): Promise<void> {
  const P = await loadPack(site);
  const msgs: { role: string; content: string }[] = [{ role: "system", content: P.system + `\nToday: ${new Date().toDateString()}` }];
  for (const h of history.slice(-6)) if ((h.role === "user" || h.role === "assistant") && h.content) msgs.push({ role: h.role, content: h.content.slice(0, 3000) });
  msgs.push({ role: "user", content: question });
  const trace: any[] = [];
  let repaired = false, lastText = "", lastModel = MODELS[0];
  onEvent({ type: "status", text: "Reasoning" });
  for (let s = 0; s <= MAX_STEPS; s++) {
    if (s === MAX_STEPS) msgs.push({ role: "user", content: "Give the final JSON answer now, using only the tool results above." });
    if (s > 0) onEvent({ type: "thinking", text: "\n\n" });
    const { text, model } = await step(msgs, t => onEvent({ type: "delta", text: t }), t => onEvent({ type: "thinking", text: t }));
    lastText = text; lastModel = model;
    const obj = parse(text);
    if (!obj) {
      if (!repaired && s < MAX_STEPS && (text.includes("{") || s === 0)) {
        repaired = true;
        onEvent({ type: "status", text: "Asking the model to restate its reply" });
        msgs.push({ role: "assistant", content: text.slice(0, 3000) });
        msgs.push({ role: "user", content: "That reply was not one valid JSON object. Reply again with exactly one JSON object: a tool call or the final answer." });
        continue;
      }
      onEvent(finalEvent({ answer: partialAnswer(text) || text, confidence: "low" }, trace, model)); return;
    }
    if ("final" in obj) { onEvent(finalEvent(typeof obj.final === "object" ? obj.final : { answer: String(obj.final) }, trace, model)); return; }
    const name = obj.tool;
    if (!name || s === MAX_STEPS) { onEvent(finalEvent({ answer: obj.answer || text }, trace, model)); return; }
    const args = obj.args || {};
    onEvent({ type: "tool", tool: name, args, why: obj.why || "", model });
    let content: string;
    try {
      const res = await callTool(site, name, args);
      const srcs = sourcesFrom(res);
      trace.push({ tool: name, args, sources: srcs, ok: true });
      onEvent({ type: "tool_result", tool: name, ok: true, sources: srcs });
      content = compact(res);
    } catch (e: any) {
      trace.push({ tool: name, args, ok: false, error: String(e.message || e) });
      onEvent({ type: "tool_result", tool: name, ok: false, error: String(e.message || e) });
      content = JSON.stringify({ error: String(e.message || e) });
    }
    msgs.push({ role: "assistant", content: text.slice(0, 4000) });
    msgs.push({ role: "user", content: `Tool result for ${name}:\n${content}\n\nContinue: call another tool or give the final JSON answer.` });
  }
  // never end without an answer: use what the model last wrote
  onEvent(finalEvent({ answer: partialAnswer(lastText) || lastText || "The model did not finish an answer. Please ask again.", confidence: "low" }, trace, lastModel));
}
