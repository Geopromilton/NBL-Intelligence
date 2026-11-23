import React, { useEffect, useRef, useState } from "react";
import { api, askStream, AskEvent, Final, VIEW, RELEASES, BASE, webAI } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, toolEngine, toolLabel, unit } from "../lib/format";
import Markdown from "../components/Markdown";
import { Prov, useLoad } from "../components/Bits";
import { Glyph, IconBadge } from "../components/Glyphs";
import { I } from "../components/Icons";

interface Turn { q: string; stream?: string; think?: string; events: AskEvent[]; final?: Extract<AskEvent, { type: "final" }>; live: boolean; error?: string; decided?: string; }

const SUGGEST = [
  "Can the site stay net zero discharge with 6 persons per flat in a dry decade?",
  "Where should we drill the first borewell, and why there?",
  "Which recharge depth tier keeps the most cloudburst water?",
  "Do AquaTwin and WaterPlan agree on the site numbers?",
  "How many tanker trips a day will RO concentrate need at full occupancy?",
  "What field tests would most reduce uncertainty before design approval?",
];
const SHORT = ["Net zero with 6 persons in a dry decade?", "Where do we drill first?", "Which recharge tier keeps most water?"];

const QUICK = [
  { id: "explore", title: "Explore", sub: "Drilling sites & survey", art: "qa-explore" },
  { id: "plan", title: "Water Plan", sub: "Balance & utilisation", art: "qa-plan" },
  { id: "recharge", title: "Recharge", sub: "Store rain underground", art: "qa-recharge" },
  { id: "scenarios", title: "Scenarios", sub: "Compare & approve", art: "qa-scenarios" },
  { id: "reports", title: "Reports", sub: "Word reports", art: "qa-reports" },
];

export default function Intelligence() {
  const { site, pendingQuestion, clearPending, health, toast, go } = useApp();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const busy = turns.some(t => t.live);
  const endRef = useRef<HTMLDivElement>(null);
  const chats = useLoad(() => api<any[]>(`/api/sites/${site}/chats`), [site, turns.length]);
  const integ = useLoad(() => api<any>(`/api/sites/${site}/integrity`), [site]);
  const facts = useLoad(() => api<any>(`/api/sites/${site}`), [site]);

  useEffect(() => { if (pendingQuestion) { send(pendingQuestion); clearPending(); } }, [pendingQuestion]);
  useEffect(() => { if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

  async function send(text?: string) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ("");
    const history = turns.flatMap(t => t.final ? [{ role: "user", content: t.q }, { role: "assistant", content: t.final.final.answer.slice(0, 2500) }] : []);
    const idx = turns.length;
    setTurns(ts => [...ts, { q: question, events: [], live: true }]);
    const upd = (f: (t: Turn) => Turn) => setTurns(ts => ts.map((t, i) => (i === idx ? f(t) : t)));
    try {
      await askStream(site, { question, chat_id: chatId, history }, ev => {
        if (ev.type === "final") { upd(t => ({ ...t, final: ev as any })); if ((ev as any).chat_id) setChatId((ev as any).chat_id); }
        else if (ev.type === "delta") upd(t => ({ ...t, stream: (t.stream || "") + ev.text }));
        else if (ev.type === "thinking") upd(t => ({ ...t, think: (t.think || "") + ev.text }));
        else if (ev.type !== "done") upd(t => ({ ...t, events: [...t.events, ev] }));
      });
    } catch (e: any) { upd(t => ({ ...t, error: VIEW && !webAI.unlocked() ? (webAI.configured() ? "Unlock the AI (top right) with the team passcode to ask your own questions. Without it, the suggested questions show prepared answers." : "This public view answers the suggested questions only. Ask anything in the NBL-Intelligence desktop app.") : e.message })); }
    upd(t => ({ ...t, live: false }));
  }

  async function openChat(id: string) {
    const c = await api<any>(`/api/sites/${site}/chats/${id}`);
    setChatId(id);
    setTurns(c.turns.map((t: any) => ({ q: t.question, events: [], final: t.answer, live: false })));
  }

  async function decide(i: number, d: { decision: string; reason: string }, approve: boolean) {
    if (approve) {
      await api(`/api/sites/${site}/decisions`, { json: { decision: d.decision, reason: d.reason, by: "Hydrogeologist (accepted AI suggestion)", status: "adopted", evidence: turns[i].final?.final.evidence || [] } });
      toast("Decision recorded in the decision log");
    }
    setTurns(ts => ts.map((t, k) => (k === i ? { ...t, decided: approve ? "approved" : "rejected" } : t)));
  }

  const f = facts.data?.facts || {};
  const agree = integ.data ? integ.data.counts.agree : 0;
  const total = integ.data ? integ.data.checks.length : 1;
  const pulse: [string, string, any][] = [
    ["pin", "Lease area", f.lease_area_m2 && { ...f.lease_area_m2, show: `${fmt(f.lease_area_m2.value / 10000, 2)} ha` }],
    ["building", "Flats (planning)", f.flats],
    ["people", "Persons per flat", f.persons_per_flat],
    ["tank", "Reservoir (closed)", f.reservoir_m3],
    ["rain", "Rain normal 1991-2020", f.rain_normal_mm],
    ["warn", "Stage of development", f.stage_of_development && { ...f.stage_of_development, show: String(f.stage_of_development.value).split(" - ")[0] }],
  ];

  return (
    <div className="page">
      <div className="intel-hero">
        <div className="bg" />
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 330px", alignItems: "start", gap: 22 }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--green)" }}>NBL-Intelligence —</div>
            <h1>Ask about the <em>water</em><br />on this site.</h1>
            <p>NBL-Intelligence reasons with NVIDIA models and answers from the engines: AquaTwin for groundwater, WaterPlan for the water balance. Every number shows where it came from.</p>
            <div className="pills">
              <span className="pill"><Glyph name="drill" size={15} color="#7CF0BE" />Answers from AquaTwin</span>
              <span className="pill"><Glyph name="drop" size={15} color="#7CF0BE" />Answers from WaterPlan</span>
              <span className="pill"><Glyph name="shield" size={15} color="#7CF0BE" />Every number sourced</span>
            </div>
            <div className="ask-panel">
              <div className={`ask-orb ${busy ? "live" : ""}`}><Glyph name="spark" size={34} color="#fff" stroke={1.6} /></div>
              <div className="ask-input">
                <textarea value={q} placeholder="e.g. What happens to reliability if the borewell yield is half the placeholder? Should we recharge at RZ-2?" onChange={e => setQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="ask-go" disabled={busy || !q.trim()} onClick={() => send()}><Glyph name="spark" size={18} color="#03222E" />Ask</button>
              </div>
            </div>
            <div className="suggest">
              <Glyph name="trend" size={16} color="#F5C451" />
              {(more ? SUGGEST : SUGGEST.slice(0, 3)).map((s, i) => <button key={s} onClick={() => send(s)} title={s}>{more ? s : SHORT[i]}</button>)}
              <button onClick={() => setMore(m => !m)}>{more ? "Less" : "More"} ▾</button>
            </div>
            {VIEW && !webAI.unlocked() && <div className="note" style={{ marginTop: 12, maxWidth: 880 }}>Public view: the suggested questions show prepared answers from the engines. {webAI.configured() ? <>Team members can unlock live NVIDIA reasoning with the passcode (<b>Unlock AI</b>, top right).</> : <>Live NVIDIA reasoning runs in the <a href={RELEASES} target="_blank" rel="noreferrer">desktop app</a>.</>}</div>}
            {!VIEW && !health?.ai?.key_set && <div className="note" style={{ marginTop: 12, maxWidth: 880, borderColor: "rgba(245,176,65,.45)", color: "#FFD08A" }}>No NVIDIA key yet: answers come straight from the engines (offline mode). <a style={{ cursor: "pointer" }} onClick={() => go("settings")}>Add the key in Settings</a>.</div>}

            {turns.length > 0 && (
              <div className="thread">
                {turns.map((t, i) => <TurnView key={i} t={t} onDecide={(d, a) => decide(i, d, a)} />)}
                <div ref={endRef} />
              </div>
            )}

            {!turns.length && <>
              <div className="row between" style={{ margin: "26px 0 12px" }}>
                <div className="row"><Glyph name="grid3" size={20} color="#7CF0BE" /><b style={{ font: "700 18px var(--display)", color: "#fff" }}>Quick access</b></div>
              </div>
              <div className="grid g5">
                {QUICK.map(c => (
                  <div key={c.id} className="qa-card" onClick={() => go(c.id)}>
                    <div className="qa-top"><b>{c.title}</b><span>{c.sub}</span></div>
                    <span className="qa-go">›</span>
                    <div className="qa-img" style={{ backgroundImage: `url(${BASE}art/${c.art}.webp)` }} />
                  </div>
                ))}
              </div>
              <div className="brand-band">
                <h3>Nature-based intelligence<span>for a resilient, water-secure site</span></h3>
                {[["drop", "Conserve water"], ["leaf", "Restore nature"], ["building", "Build resilience"], ["recycle", "Close the loop"]].map(([g, l]) => (
                  <div key={l} className="bb-item"><IconBadge name={g} tone="green" size={40} />{l}</div>
                ))}
              </div>
            </>}
          </div>

          <div className="grid" style={{ gap: 16 }}>
            <div className="side-card">
              <h3><Glyph name="trend" size={20} color="#1F8F5F" />Site pulse<span className="live">Engines</span></h3>
              <div className="small" style={{ color: "#4E6A80", margin: "2px 0 6px" }}>{facts.data?.name} · shared site facts</div>
              {pulse.map(([g, l, v]) => v && (
                <div key={l} className="pulse-row" title={`${v.source || ""}`}>
                  <Glyph name={g} size={17} color="#2B6C8F" />
                  <span>{l}</span>
                  <b>{v.show ?? `${fmt(v.value)} ${unit(v.unit)}`}</b>
                </div>
              ))}
            </div>
            <div className="side-card">
              <h3><Glyph name="shield" size={20} color="#1F8F5F" />Integrity<span className="live" style={{ background: integ.data?.counts.differs ? "#FFE7C2" : "#D3F5E4", color: integ.data?.counts.differs ? "#8A5A07" : "#1F8F5F" }}>{integ.data?.counts.differs ? `${integ.data.counts.differs} to fix` : "Agree"}</span></h3>
              <div className="small" style={{ color: "#4E6A80", margin: "6px 0 10px" }}>Checks whether the registry, AquaTwin and WaterPlan hold the same site numbers.</div>
              <div className="pbar"><i style={{ width: `${(agree / Math.max(total, 1)) * 100}%` }} /></div>
              <div className="row between small" style={{ marginTop: 6, color: "#4E6A80" }}><span>{agree} of {total} agree</span><a style={{ cursor: "pointer", color: "#1670B5", fontWeight: 600 }} onClick={() => go("integrity")}>Open ›</a></div>
            </div>
            <div className="side-card">
              <h3><Glyph name="book" size={20} color="#1670B5" />Conversations<span className="live" style={{ background: "#DCEBFF", color: "#1670B5", cursor: "pointer" }} onClick={() => { setTurns([]); setChatId(null); }}>New</span></h3>
              <div style={{ marginTop: 8 }}>
                {(chats.data || []).slice(0, 6).map(c => (
                  <div key={c.id} className="pulse-row" style={{ gridTemplateColumns: "1fr auto", cursor: "pointer" }} onClick={() => openChat(c.id)}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span><b style={{ color: "#4E6A80" }}>›</b>
                  </div>
                ))}
                {!chats.data?.length && <div className="small" style={{ color: "#4E6A80" }}>Questions and answers are saved here.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TurnView({ t, onDecide }: { t: Turn; onDecide: (d: any, approve: boolean) => void }) {
  const tools = t.final?.trace?.length ? t.final.trace : t.events.filter(e => e.type === "tool").map((e: any) => ({ tool: e.tool, ok: true }));
  const status = [...t.events].reverse().find(e => e.type === "status") as any;
  const fin: Final | undefined = t.final?.final;
  return (
    <>
      <div className="q-bubble">{t.q}</div>
      <div className="a-card">
        <div className="a-head">
          <span className={`orb ${t.live ? "live" : ""}`} />
          <b style={{ color: "#fff" }}>NBL-Intelligence</b>
          <span>{t.live ? (status?.text || "Working") + "…" : t.final ? (t.final.offline ? "engines only (offline)" : t.final.model) : ""}</span>
          {fin?.confidence && <span className="badge b-note" style={{ marginLeft: "auto" }}>Confidence: {fin.confidence}</span>}
        </div>
        {tools.length > 0 && (
          <div className="trace" style={{ paddingTop: 12 }}>
            {tools.map((s: any, i: number) => <span key={i} className={`step ${toolEngine(s.tool)}`}><i />{toolLabel[s.tool] || s.tool}{s.ok === false ? " (failed)" : ""}</span>)}
          </div>
        )}
        {t.error && <div className="a-body"><div className="note" style={{ color: "#FFB4B4" }}>{t.error}</div></div>}
        {fin && (
          <>
            <div className="a-body"><Markdown text={fin.answer} /></div>
            {fin.numbers?.length > 0 && (
              <div className="numbers">
                {fin.numbers.slice(0, 8).map((n, i) => (
                  <div key={i} className="num-chip">
                    <span>{n.name}</span>
                    <b>{fmt(n.value)} <small style={{ fontSize: 12 }}>{unit(n.unit)}</small></b>
                    <span>{[n.period, n.case].filter(Boolean).join(" · ")}</span>
                    {n.provenance && <div style={{ marginTop: 4 }}><Prov p={n.provenance} /></div>}
                  </div>
                ))}
              </div>
            )}
            {fin.suggested_decision && (
              <div className="decision">
                <IconBadge name="gavel" tone="green" size={34} />
                <p><b>Suggested decision:</b> {fin.suggested_decision.decision}<br /><span className="small muted">{fin.suggested_decision.reason}</span></p>
                {t.decided ? <span className={`badge b-${t.decided}`}>{t.decided}</span> : (
                  <>
                    <button className="btn" onClick={() => onDecide(fin.suggested_decision, false)}><I.x size={14} />Reject</button>
                    <button className="btn primary" onClick={() => onDecide(fin.suggested_decision, true)}><I.check size={14} />Approve</button>
                  </>
                )}
              </div>
            )}
            <div className="a-foot">
              <div>
                <h4>Evidence</h4>
                {(fin.evidence?.length ? fin.evidence : (t.final?.trace || []).flatMap((s: any) => (s.sources || []).map((x: string) => ({ source: x })))).slice(0, 6).map((e: any, i: number) => (
                  <div key={i} className="small" style={{ marginBottom: 4 }}>• {e.source}{e.detail ? <span className="muted"> - {e.detail}</span> : null}</div>
                ))}
              </div>
              <div>
                <h4>What would change this answer</h4>
                <div className="small">{fin.what_would_change || "–"}</div>
              </div>
            </div>
          </>
        )}
        {t.think && <Thinking text={t.think} live={t.live && !t.stream && !fin} />}
        {t.live && !fin && t.stream && <div className="a-body streaming"><Markdown text={t.stream} /><span className="caret" /></div>}
        {t.live && !fin && !t.stream && <div className="a-body"><div className="row small muted"><div className="spinner" />{status?.text === "Reasoning" ? "Reasoning and calling the engines…" : (status?.text || "Working") + "…"}</div></div>}
      </div>
    </>
  );
}

/** The model's reasoning (deep think): open while it thinks, folded once the answer starts. */
function Thinking({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = React.useState<boolean | null>(null);
  const shown = open ?? live;
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (shown && live && box.current) box.current.scrollTop = box.current.scrollHeight; }, [text, shown, live]);
  return (
    <div className="thinking">
      <button className="think-h" onClick={() => setOpen(!shown)}>
        <span className={`orb ${live ? "live" : ""}`} />{live ? "Thinking deeply…" : "Reasoning (deep think)"}
        <span className="muted tiny">{Math.round(text.split(/\s+/).length)} words · {shown ? "hide" : "show"}</span>
      </button>
      {shown && <div className="think-b" ref={box}>{text.trim()}</div>}
    </div>
  );
}
