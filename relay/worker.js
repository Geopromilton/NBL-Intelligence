/**
 * NBL-Intelligence AI relay (Cloudflare Worker).
 *
 * The public website cannot call NVIDIA directly: browsers are blocked (CORS) and
 * the API key must never be in a web page. This relay holds the key as a secret,
 * checks the team passcode, allows only the NBL-Intelligence models and sizes,
 * and streams NVIDIA's reply back to the website.
 *
 * Secrets (set by the "AI relay" GitHub workflow, never in this file):
 *   NVIDIA_API_KEY   the NVIDIA API catalog key (nvapi-...)
 *   AI_PASSCODE      passcode the team types once on the website
 * Variable (wrangler.toml): ALLOWED_ORIGINS  comma-separated website origins
 */
const NVIDIA = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODELS = (env) => (env.MODELS || "nvidia/nemotron-3.5-super-vl-120b-a12b,nvidia/nemotron-3.5-lightning-30b-a3b").split(",").map(s => s.trim()).filter(Boolean);
const MAX_TOKENS = 16000;          // reasoning (deep think) needs room before the answer
const MAX_BODY = 200_000;          // bytes of conversation sent per request
const PER_MINUTE = 20;             // requests per visitor per minute (best effort, per relay instance)
const hits = new Map();

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-nbl-passcode",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function sameText(a, b) {
  // constant-time comparison so the passcode cannot be guessed from timing
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_MINUTE;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const h = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "NBL-Intelligence AI relay", key_set: !!env.NVIDIA_API_KEY, passcode_set: !!env.AI_PASSCODE, models: MODELS(env) }, 200, h);
    }
    if (url.pathname === "/check" && req.method === "POST") {
      const ok = !!env.AI_PASSCODE && sameText(req.headers.get("x-nbl-passcode") || "", env.AI_PASSCODE);
      return json({ ok }, ok ? 200 : 401, h);
    }
    if (url.pathname === "/models" && req.method === "GET") {
      // Models available on the NVIDIA account (team only), to pick current model names.
      if (!env.AI_PASSCODE || !sameText(req.headers.get("x-nbl-passcode") || "", env.AI_PASSCODE)) return json({ error: "Wrong passcode." }, 401, h);
      const r = await fetch("https://integrate.api.nvidia.com/v1/models", { headers: { "Authorization": `Bearer ${env.NVIDIA_API_KEY}` } });
      const d = await r.json().catch(() => ({}));
      return json({ models: (d.data || []).map(m => m.id).sort() }, r.ok ? 200 : 502, h);
    }
    if (url.pathname !== "/chat" || req.method !== "POST") return json({ error: "Not found" }, 404, h);

    if (!env.NVIDIA_API_KEY || !env.AI_PASSCODE) return json({ error: "The relay is not configured yet (key or passcode missing)." }, 503, h);
    if (!sameText(req.headers.get("x-nbl-passcode") || "", env.AI_PASSCODE)) return json({ error: "Wrong passcode." }, 401, h);
    if (limited(req.headers.get("CF-Connecting-IP") || "unknown")) return json({ error: "Too many questions in one minute. Wait a moment." }, 429, h);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "Conversation too long for one request." }, 413, h);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "Bad request." }, 400, h); }
    if (!MODELS(env).includes(body.model)) return json({ error: "Model not allowed." }, 400, h);
    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: "No messages." }, 400, h);

    const upstream = await fetch(NVIDIA, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.NVIDIA_API_KEY}`, "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages.map(m => ({ role: String(m.role), content: String(m.content) })),
        temperature: Math.min(1, Math.max(0, Number(body.temperature ?? 0.2))),
        max_tokens: Math.min(MAX_TOKENS, Number(body.max_tokens || MAX_TOKENS)),
        stream: true,
        // deep think: Nemotron reasoning switch (only this flag is passed through)
        ...(typeof body.thinking === "boolean" ? { chat_template_kwargs: { enable_thinking: body.thinking } } : {}),
      }),
    });
    if (!upstream.ok) {
      const text = (await upstream.text()).slice(0, 300);
      return json({ error: `AI service returned ${upstream.status}: ${text}` }, 502, h);
    }
    return new Response(upstream.body, { status: 200, headers: { ...h, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  },
};
