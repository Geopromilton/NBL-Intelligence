export const VIEW = import.meta.env.VITE_VIEW === "1";
export const BASE = import.meta.env.BASE_URL || "/";
export const RELEASES = "https://github.com/Geopromilton/NBL-Intelligence/releases/latest";

export class ViewOnlyError extends Error {
  constructor() { super("This is the public view. Running engines, AI and saving work happen in the NBL-Intelligence desktop app."); }
}

/** In the public view, GET requests are answered from a published snapshot. */
function snapshotPath(path: string): string {
  const clean = path.replace(/^\/api\//, "").split("?")[0].replace(/\/$/, "");
  return `${BASE}snapshot/${clean}.json`;
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: any } = {}): Promise<T> {
  if (VIEW) {
    const method = (opts.method || (opts.json !== undefined ? "POST" : "GET")).toUpperCase();
    if (method !== "GET" || path.includes("?")) throw new ViewOnlyError();
    const r = await fetch(snapshotPath(path));
    if (!r.ok) throw new ViewOnlyError();
    return r.json();
  }
  const init: RequestInit = { ...opts };
  if (opts.json !== undefined) {
    init.method = init.method || "POST";
    init.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    init.body = JSON.stringify(opts.json);
  }
  const r = await fetch(path, init);
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const j = await r.json(); msg = j.detail || JSON.stringify(j); } catch { /* */ }
    throw new Error(msg);
  }
  const ct = r.headers.get("content-type") || "";
  return (ct.includes("json") ? r.json() : (r.text() as any)) as Promise<T>;
}

export type AskEvent =
  | { type: "status"; text: string }
  | { type: "tool"; tool: string; args: any; why?: string; model?: string }
  | { type: "tool_result"; tool: string; ok: boolean; sources?: string[]; error?: string }
  | { type: "delta"; text: string }
  | { type: "final"; id: string; final: Final; trace: any[]; model: string; offline: boolean; chat_id?: string; at: string }
  | { type: "done" };

export interface Final {
  answer: string;
  numbers: { name: string; value: any; unit?: string; period?: string; case?: string; provenance?: string; source?: string }[];
  evidence: { source: string; detail?: string }[];
  what_would_change?: string;
  suggested_decision?: { decision: string; reason: string } | null;
  confidence?: string;
}

export async function askStream(site: string, body: any, onEvent: (e: AskEvent) => void): Promise<void> {
  if (VIEW) {
    const demo = await fetch(`${BASE}snapshot/sites/${site}/demo_answers.json`).then(r => r.json()).catch(() => ({}));
    const hit = demo[body.question];
    if (!hit) throw new ViewOnlyError();
    for (const ev of hit.events || []) { onEvent(ev); await new Promise(r => setTimeout(r, 250)); }
    const text: string = hit.final.final.answer;
    for (let i = 0; i < text.length; i += 24) { onEvent({ type: "delta", text: text.slice(i, i + 24) }); await new Promise(r => setTimeout(r, 12)); }
    onEvent(hit.final);
    return;
  }
  const r = await fetch(`/api/sites/${site}/ask/stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) throw new Error(`AI request failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split("\n").find(l => l.startsWith("data:"));
      if (line) { try { onEvent(JSON.parse(line.slice(5))); } catch { /* */ } }
    }
  }
}
