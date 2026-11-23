import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api, BASE, RELEASES, VIEW, webAI } from "./lib/api";
import { Ctx } from "./lib/app";
import { I } from "./components/Icons";
import { Glyph } from "./components/Glyphs";
import { Loading } from "./components/Bits";
import Intelligence from "./pages/Intelligence";
import Explore from "./pages/Explore";
import Plan from "./pages/Plan";
import Recharge from "./pages/Recharge";
import Scenarios from "./pages/Scenarios";
import Integrity from "./pages/Integrity";
import Decisions from "./pages/Decisions";
import Knowledge from "./pages/Knowledge";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const Twin = React.lazy(() => import("./pages/Twin"));

const PAGES: { id: string; label: string; icon: string; group: string; view?: boolean }[] = [
  { id: "intelligence", label: "Intelligence", icon: "spark", group: "Ask", view: true },
  { id: "twin", label: "Site twin", icon: "cube", group: "Site", view: true },
  { id: "explore", label: "Explore", icon: "drill", group: "Water cycle", view: true },
  { id: "plan", label: "Water plan", icon: "drop", group: "Water cycle", view: true },
  { id: "recharge", label: "Recharge", icon: "recharge", group: "Water cycle", view: true },
  { id: "scenarios", label: "Scenarios", icon: "compare", group: "Decide" },
  { id: "integrity", label: "Integrity", icon: "shield", group: "Decide", view: true },
  { id: "decisions", label: "Decisions", icon: "gavel", group: "Decide", view: true },
  { id: "knowledge", label: "Knowledge", icon: "book", group: "Library" },
  { id: "reports", label: "Reports", icon: "doc", group: "Library" },
  { id: "settings", label: "Settings", icon: "gear", group: "System" },
];

class ErrorBoundary extends React.Component<{ children: React.ReactNode; page: string }, { err: any }> {
  state = { err: null as any };
  static getDerivedStateFromError(err: any) { return { err }; }
  componentDidUpdate(prev: any) { if (prev.page !== this.props.page && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page"><div className="card" style={{ padding: 28, maxWidth: 640 }}>
        <div className="eyebrow">Something went wrong on this page</div>
        <h2 style={{ font: "600 22px var(--display)", margin: "6px 0 8px" }}>The page could not be shown</h2>
        <p className="small muted">{String(this.state.err?.message || this.state.err)}</p>
        <button className="btn primary" onClick={() => this.setState({ err: null })}><I.refresh size={15} />Try again</button>
      </div></div>
    );
  }
}

export default function App() {
  const visible = PAGES.filter(p => !VIEW || p.view);
  const [page, setPage] = useState<string>(() => location.hash.replace("#/", "") || "intelligence");
  const [site, setSite] = useState("siddanahalli");
  const [siteInfo, setSiteInfo] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [toastText, setToast] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [webOn, setWebOn] = useState(() => webAI.unlocked());
  useEffect(() => { const f = () => setWebOn(webAI.unlocked()); window.addEventListener("nbi-ai-change", f); return () => window.removeEventListener("nbi-ai-change", f); }, []);
  const [integrity, setIntegrity] = useState<number>(0);
  const [welcome, setWelcome] = useState(false);
  const [update, setUpdate] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = "dark"; }, []);

  const refreshHealth = useCallback(() => { api("/api/health").then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => {
    refreshHealth();
    api<any[]>("/api/sites").then(setSites).catch(() => {});
    if (!VIEW) {
      api<any>("/api/settings").then(s => { if (!s.welcome_done) setWelcome(true); if (s.auto_check_updates) api("/api/update/check").then(setUpdate).catch(() => {}); }).catch(() => {});
    } else {
      try { if (!localStorage.getItem("nbi-view-welcome")) setWelcome(true); } catch { /* */ }
    }
  }, []);
  useEffect(() => {
    api(`/api/sites/${site}`).then(setSiteInfo).catch(() => {});
    api<any>(`/api/sites/${site}/integrity`).then(r => setIntegrity(r.counts?.differs || 0)).catch(() => {});
  }, [site]);
  useEffect(() => { const f = () => setPage(location.hash.replace("#/", "") || "intelligence"); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); } if (e.key === "Escape") { setPalette(false); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const toast = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 3600); }, []);
  const go = useCallback((p: string) => { location.hash = `#/${p}`; setPage(p); }, []);
  const ask = useCallback((q: string) => { setPending(q); go("intelligence"); }, [go]);
  const closeWelcome = () => {
    setWelcome(false);
    if (VIEW) { try { localStorage.setItem("nbi-view-welcome", "1"); } catch { /* */ } }
    else api("/api/settings", { method: "PUT", json: { welcome_done: true } }).catch(() => {});
  };

  const ctx = useMemo(() => ({ site, siteInfo, health, go, ask, pendingQuestion: pending, clearPending: () => setPending(null), toast, refreshHealth, update, setUpdate }),
    [site, siteInfo, health, go, ask, pending, toast, refreshHealth, update]);

  const aiOn = health?.ai?.key_set;
  const current = visible.find(p => p.id === page) ? page : "intelligence";
  let lastGroup = "";
  return (
    <Ctx.Provider value={ctx as any}>
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            <img className="brand-mark-img" src={`${BASE}brand/mark.svg`} alt="NBL-Intelligence" width="40" height="40" />
            <div><b>NBL-Intelligence</b><small>Nature Based Living</small></div>
          </div>
          <nav>
            {visible.map(p => {
              const head = p.group !== lastGroup ? <div className="rail-group">{p.group}</div> : null;
              lastGroup = p.group;
              return (
                <React.Fragment key={p.id}>
                  {head}
                  <button className={`nav ${current === p.id ? "on" : ""}`} onClick={() => go(p.id)} title={p.label}>
                    <Glyph name={p.icon} size={19} /><span>{p.label}</span>
                    {p.id === "integrity" && integrity > 0 && <span className="count">{integrity}</span>}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <div className={`rail-status ${VIEW || aiOn ? "" : "off"}`} title={`NBL-Intelligence v${health?.version || ""} · AquaTwin ${health?.engines?.aquatwin?.version || "–"} · WaterPlan ${health?.engines?.waterplan?.version || "–"}`}>
            <svg className="nv" viewBox="0 0 30 20"><path d="M11 4.5c5.5-.6 10.4 2.6 13 5.5-2.6 3-7.5 6.1-13 5.5V13c3.6.4 6.9-1.3 8.6-3-1.7-1.7-5-3.4-8.6-3z" fill="#76B900" /><path d="M11 7c2.6-.2 4.7.9 5.9 3-1.2 2.1-3.3 3.2-5.9 3z" fill="#76B900" /><path d="M2 10c2-3.4 5.2-5.4 9-5.5v2.5C8.4 7.2 6.4 8.4 5 10c1.4 1.6 3.4 2.8 6 3v2.5C7.2 15.4 4 13.4 2 10z" fill="#76B900" /></svg>
            <div>{VIEW ? (webOn ? <><b>NVIDIA reasoning</b><small>Website · team access</small></> : <><b>Public view</b><small>{webAI.configured() ? "Unlock AI with the passcode" : "Read-only snapshot"}</small></>) : aiOn ? <><b>NVIDIA reasoning</b><small>{(health?.ai?.model || "").split("/").pop()}</small></> : <><b>AI offline</b><small>Engines only · add key in Settings</small></>}</div>
          </div>
        </aside>
        <div className="main" onScroll={e => setScrolled((e.target as HTMLElement).scrollTop > 40)}>
          <header className={`topbar ${scrolled ? "scrolled" : ""}`}>
            <div className="site-switch">
              <div className="pin"><Glyph name="pin" size={17} color="#fff" /></div>
              <div style={{ minWidth: 0 }}>
                <select value={site} onChange={e => setSite(e.target.value)} style={{ border: 0, background: "transparent", font: "600 15px var(--display)", padding: 0, outline: 0 }}>
                  {(sites.length ? sites : [{ id: "siddanahalli", name: "Siddanahalli" }]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <small>{siteInfo?.location}</small>
              </div>
            </div>
            <div className="command" onClick={() => setPalette(true)}>
              <Glyph name="search" size={18} /><span className="ph">Ask NBL-Intelligence or jump to a page…</span><span className="kbd">Ctrl + K</span>
            </div>
            <div className="top-right">
              {siteInfo?.stage && <span className="chip stage" title={siteInfo?.status}>Stage {siteInfo.stage} · pre-drilling</span>}
              {VIEW ? (webAI.configured()
                ? <span className={`chip ai ${webOn ? "" : "off"}`} style={{ cursor: "pointer" }} onClick={() => setUnlock(true)}><Glyph name="spark" size={15} />{webOn ? "AI reasoning on" : "Unlock AI"}</span>
                : <a className="chip ai" href={RELEASES} target="_blank" rel="noreferrer"><I.download size={14} />Get the Windows app</a>) : (
                <span className={`chip ai ${aiOn ? "" : "off"}`} onClick={() => go("settings")} style={{ cursor: "pointer" }}>
                  <Glyph name="spark" size={15} />{aiOn ? "AI reasoning on" : "Add NVIDIA key"}
                </span>)}
            </div>
          </header>
          {!VIEW && update?.pending_restart && <div className="banner floating"><b>Update ready.</b> Restart NBL-Intelligence to use version {update.latest}.<button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => api("/api/update/restart", { method: "POST" }).then(() => toast("Restarting…"))}>Restart now</button></div>}
          {!VIEW && !update?.pending_restart && update?.available && <div className="banner floating"><b>Version {update.latest} is available.</b> You have {update.current}.<button className="btn" style={{ marginLeft: "auto" }} onClick={() => go("settings")}>What's new</button></div>}
          <ErrorBoundary page={current}>
            <Suspense fallback={<div className="page"><Loading text="Loading the 3D engine" /></div>}>
              {current === "intelligence" && <Intelligence />}
              {current === "twin" && <Twin />}
              {current === "explore" && <Explore />}
              {current === "plan" && <Plan />}
              {current === "recharge" && <Recharge />}
              {current === "scenarios" && <Scenarios />}
              {current === "integrity" && <Integrity />}
              {current === "decisions" && <Decisions />}
              {current === "knowledge" && <Knowledge />}
              {current === "reports" && <Reports />}
              {current === "settings" && <Settings />}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      {palette && <Palette pages={visible} onClose={() => setPalette(false)} onGo={p => { go(p); setPalette(false); }} onAsk={q => { ask(q); setPalette(false); }} />}
      {welcome && <Welcome onClose={closeWelcome} onGo={p => { closeWelcome(); go(p); }} health={health} />}
      {unlock && <Unlock onClose={() => setUnlock(false)} toast={toast} />}
      {toastText && <div className="toast">{toastText}</div>}
    </Ctx.Provider>
  );
}

function Welcome({ onClose, onGo, health }: { onClose: () => void; onGo: (p: string) => void; health: any }) {
  const engines = health?.engines;
  return (
    <div className="modal-back" style={{ paddingTop: "8vh" }}>
      <div className="welcome">
        <div className="welcome-hero">
          <img src={`${BASE}brand/logo-horizontal-dark.svg`} alt="NBL-Intelligence" style={{ height: 52, position: "relative" }} />
          <h2>{VIEW ? "Siddanahalli, as NBL-Intelligence sees it" : "Welcome to NBL-Intelligence"}</h2>
          <p>{VIEW ? "A read-only snapshot: the 3D site twin, drilling sites, the water plan for 2 to 6 persons per flat in dry, expected and wet years, recharge tiers and the integrity checks. Every number shows where it came from."
            : "Ask about the water on your site. NVIDIA models reason; NBL-AquaTwin and NBL-WaterPlan calculate. Every number shows its source, its period and its case."}</p>
        </div>
        {VIEW ? (
          <div className="welcome-steps">
            <div className="wstep"><div className="n">1</div><b>Site twin</b><span>Rotate the terrain, lease and the ADMT survey below it.</span></div>
            <div className="wstep"><div className="n">2</div><b>Water plan</b><span>Move persons per flat and the rain case; results come from WaterPlan runs.</span></div>
            <div className="wstep"><div className="n">3</div><b>Intelligence</b><span>Try the suggested questions to see how answers are built.</span></div>
          </div>
        ) : (
          <div className="welcome-steps">
            <div className="wstep"><div className="n">1</div><b>Add your NVIDIA key</b><span>{health?.ai?.key_set ? "Found - reasoning is on." : "Settings → NVIDIA reasoning. Without it, answers come straight from the engines."}</span></div>
            <div className="wstep"><div className="n">2</div><b>Check the engines</b><span>AquaTwin {engines?.aquatwin?.found ? `found (v${engines.aquatwin.version})` : "not found"} · WaterPlan {engines?.waterplan?.found ? "found" : "not found"}. Folders are in Settings.</span></div>
            <div className="wstep"><div className="n">3</div><b>Ask a question</b><span>Start with a suggestion on the Intelligence page, or press Ctrl K anywhere.</span></div>
          </div>
        )}
        <div className="welcome-foot">
          {!VIEW && <button className="btn" onClick={() => onGo("settings")}><I.gear size={15} />Open Settings</button>}
          {VIEW && <button className="btn" onClick={() => onGo("twin")}><I.cube size={15} />Open the site twin</button>}
          <button className="btn primary" onClick={onClose}>Start</button>
        </div>
      </div>
    </div>
  );
}

/** Website only: unlock live NVIDIA reasoning with the team passcode (checked by the relay). */
function Unlock({ onClose, toast }: { onClose: () => void; toast: (t: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const on = webAI.unlocked();
  async function go() {
    setBusy(true); setErr("");
    try { if (await webAI.unlock(code.trim())) { toast("AI unlocked in this browser"); onClose(); } else setErr("That passcode was not accepted."); }
    catch (e: any) { setErr(e.message || "The AI relay could not be reached."); }
    finally { setBusy(false); }
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card" style={{ maxWidth: 460, margin: "14vh auto 0", padding: 26 }} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ gap: 12, marginBottom: 10 }}><Glyph name="spark" size={22} color="#3DDC97" /><h3 style={{ margin: 0, font: "700 20px var(--display)", color: "#fff" }}>{on ? "AI is unlocked" : "Unlock AI on this website"}</h3></div>
        {on ? <>
          <p className="small muted">Questions in this browser go to NVIDIA through the NBL relay. The key is never in this page.</p>
          <div className="row" style={{ gap: 10, marginTop: 14 }}><button className="btn" onClick={() => { webAI.lock(); toast("AI locked in this browser"); onClose(); }}>Lock AI</button><button className="btn primary" onClick={onClose}>Close</button></div>
        </> : <>
          <p className="small muted">Type the NBL team passcode once. This browser remembers it. Without it, the website shows prepared answers only.</p>
          <input className="input" type="password" autoFocus placeholder="Team passcode" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && code && go()} style={{ marginTop: 8 }} />
          {err && <div className="small" style={{ color: "#F26B6B", marginTop: 8 }}>{err}</div>}
          <div className="row" style={{ gap: 10, marginTop: 14 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!code || busy} onClick={go}>{busy ? <div className="spinner" /> : <Glyph name="spark" size={15} />}Unlock</button></div>
        </>}
      </div>
    </div>
  );
}

function Palette({ pages, onClose, onGo, onAsk }: { pages: typeof PAGES; onClose: () => void; onGo: (p: string) => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = [
    ...(q.trim() ? [{ kind: "ask", label: `Ask: “${q}”`, id: "" }] : []),
    ...pages.filter(p => !q || p.label.toLowerCase().includes(q.toLowerCase())).map(p => ({ kind: "page", label: p.label, id: p.id })),
  ];
  const pick = (i: number) => { const it = items[i]; if (!it) return; it.kind === "ask" ? onAsk(q) : onGo(it.id); };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <input autoFocus placeholder="Ask a question, or type a page name…" value={q} onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => { if (e.key === "ArrowDown") setSel(s => Math.min(items.length - 1, s + 1)); if (e.key === "ArrowUp") setSel(s => Math.max(0, s - 1)); if (e.key === "Enter") pick(sel); }} />
        <div style={{ maxHeight: 380, overflow: "auto", padding: "6px 0" }}>
          {items.map((it, i) => (
            <div key={it.kind + it.id + i} className={`item ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
              {it.kind === "ask" ? <I.spark size={16} /> : <I.layers size={16} />}<span>{it.label}</span><small>{it.kind === "ask" ? "Enter" : "Page"}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
