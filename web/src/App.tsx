import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api, BASE, RELEASES, VIEW } from "./lib/api";
import { Ctx } from "./lib/app";
import { I } from "./components/Icons";
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

const PAGES: { id: string; label: string; icon: keyof typeof I; group: string; view?: boolean }[] = [
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

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    let t = "";
    try { t = localStorage.getItem("nbi-theme") || ""; } catch { /* */ }
    return t || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("nbi-theme", theme); } catch { /* */ } }, [theme]);
  return [theme, () => setTheme(t => (t === "dark" ? "light" : "dark"))];
}

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
  const [integrity, setIntegrity] = useState<number>(0);
  const [welcome, setWelcome] = useState(false);
  const [update, setUpdate] = useState<any>(null);
  const [theme, toggleTheme] = useTheme();

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
              const Ico = I[p.icon];
              const head = p.group !== lastGroup ? <div className="rail-group">{p.group}</div> : null;
              lastGroup = p.group;
              return (
                <React.Fragment key={p.id}>
                  {head}
                  <button className={`nav ${current === p.id ? "on" : ""}`} onClick={() => go(p.id)} title={p.label}>
                    <Ico /><span>{p.label}</span>
                    {p.id === "integrity" && integrity > 0 && <span className="count">{integrity}</span>}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <div className="rail-foot">
            {VIEW ? <div><span className="dot off" />Public view · read-only snapshot</div> : <div><span className={`dot ${aiOn ? "" : "off"}`} />{aiOn ? "NVIDIA reasoning on" : "AI offline - engines only"}</div>}
            <div style={{ marginTop: 4 }}>AquaTwin {health?.engines?.aquatwin?.version || "–"} · WaterPlan {health?.engines?.waterplan?.version || "–"}</div>
            <div style={{ marginTop: 4 }}>v{health?.version || "1.1.0"}{VIEW && health?.snapshot ? ` · snapshot ${health.snapshot}` : ""}</div>
          </div>
        </aside>
        <div className="main" style={{ gridTemplateRows: (update?.available || update?.pending_restart || VIEW) ? "62px auto 1fr" : "62px 1fr" }}>
          <header className="topbar">
            <div className="site-switch">
              <div className="pin"><I.pin size={16} /></div>
              <div style={{ minWidth: 0 }}>
                <select value={site} onChange={e => setSite(e.target.value)} style={{ border: 0, background: "transparent", font: "600 15px var(--display)", padding: 0, outline: 0 }}>
                  {(sites.length ? sites : [{ id: "siddanahalli", name: "Siddanahalli" }]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <small>{siteInfo?.location}</small>
              </div>
            </div>
            <div className="command" onClick={() => setPalette(true)}>
              <I.spark size={16} /><span className="ph">Ask NBL-Intelligence or jump to a page…</span><span className="kbd">Ctrl K</span>
            </div>
            <div className="top-right">
              {siteInfo?.stage && <span className="chip stage" title={siteInfo?.status}>Stage {siteInfo.stage} · pre-drilling</span>}
              {VIEW ? <a className="chip ai" href={RELEASES} target="_blank" rel="noreferrer"><I.download size={13} />Get the app</a> : (
                <span className={`chip ai ${aiOn ? "" : "off"}`} onClick={() => go("settings")} style={{ cursor: "pointer" }}>
                  <I.spark size={13} />{aiOn ? (health?.ai?.model || "").split("/").pop() : "Add NVIDIA key"}
                </span>)}
              <button className="icon-btn" title="Light / dark" onClick={toggleTheme}>{theme === "dark" ? <I.sun size={16} /> : <I.moon size={16} />}</button>
            </div>
          </header>
          {VIEW && <div className="banner"><b>Public view</b> A read-only snapshot of the Siddanahalli results. Live AI, engine runs, reports and saving are in the NBL-Intelligence desktop app. <a className="btn" style={{ marginLeft: "auto" }} href={RELEASES} target="_blank" rel="noreferrer"><I.download size={14} />Download for Windows</a></div>}
          {!VIEW && update?.pending_restart && <div className="banner"><b>Update ready.</b> Restart NBL-Intelligence to use version {update.latest}.<button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => api("/api/update/restart", { method: "POST" }).then(() => toast("Restarting…"))}>Restart now</button></div>}
          {!VIEW && !update?.pending_restart && update?.available && <div className="banner"><b>Version {update.latest} is available.</b> You have {update.current}.<button className="btn" style={{ marginLeft: "auto" }} onClick={() => go("settings")}>What's new</button></div>}
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
