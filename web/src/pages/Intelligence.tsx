import React, { useEffect, useRef, useState } from "react";
import { api, askStream, AskEvent, Final, VIEW, RELEASES } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, toolEngine, toolLabel, unit } from "../lib/format";
import Markdown from "../components/Markdown";
import { Card, Prov, useLoad } from "../components/Bits";
import { I } from "../components/Icons";

interface Turn { q: string; stream?: string; events: AskEvent[]; final?: Extract<AskEvent, { type: "final" }>; live: boolean; error?: string; decided?: string; }

const SUGGEST = [
  "Can the site stay net zero discharge with 6 persons per flat in a dry decade?",
  "Where should we drill the first borewell, and why there?",
  "Which recharge depth tier keeps the most cloudburst water?",
  "Do AquaTwin and WaterPlan agree on the site numbers?",
  "How many tanker trips a day will RO concentrate need at full occupancy?",
  "What field tests would most reduce uncertainty before design approval?",
];

export default function Intelligence() {
  const { site, pendingQuestion, clearPending, health, toast, go } = useApp();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const busy = turns.some(t => t.live);
  const endRef = useRef<HTMLDivElement>(null);
  const chats = useLoad(() => api<any[]>(`/api/sites/${site}/chats`), [site, turns.length]);
  const integ = useLoad(() => api<any>(`/api/sites/${site}/integrity`), [site]);
  const facts = useLoad(() => api<any>(`/api/sites/${site}`), [site]);

  useEffect(() => { if (pendingQuestion) { send(pendingQuestion); clearPending(); } }, [pendingQuestion]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

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
        else if (ev.type !== "done") upd(t => ({ ...t, events: [...t.events, ev] }));
      });
    } catch (e: any) { upd(t => ({ ...t, error: VIEW ? "This public view answers the suggested questions only. Ask anything in the NBL-Intelligence desktop app." : e.message })); }
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
  return (
    <div className="page">
      <div className="grid g-side" style={{ alignItems: "start" }}>
        <div>
          <div className="ask-hero">
            <div className="eyebrow" style={{ color: "#6FD3F0", position: "relative" }}>NBL-Intelligence · {facts.data?.name || "Site"}</div>
            <h1>Ask about the water on this site.</h1>
            <p>NBL-Intelligence reasons with NVIDIA models and answers from the engines: AquaTwin for groundwater, WaterPlan for the water balance. Every number shows its source and its period.</p>
            <div className="ask-box">
              <textarea value={q} placeholder="e.g. What happens to reliability if borewell yield is half the placeholder?" onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn aqua" disabled={busy || !q.trim()} onClick={() => send()}><I.send size={16} />Ask</button>
            </div>
            {VIEW && <div style={{ position: "relative", marginTop: 12, fontSize: 12.5, color: "#9FD8EA" }}>Public view: try the suggested questions below (answers prepared from the engines). Live NVIDIA reasoning runs in the <a style={{ color: "#fff" }} href={RELEASES} target="_blank" rel="noreferrer">desktop app</a>.</div>}
            {!turns.length && <div className="suggest">{SUGGEST.map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
            {!VIEW && !health?.ai?.key_set && <div style={{ position: "relative", marginTop: 14, fontSize: 12, color: "#E2B04C" }}>No NVIDIA key yet: answers come straight from the engines (offline mode). <a style={{ color: "#6FD3F0", cursor: "pointer" }} onClick={() => go("settings")}>Add the key in Settings</a>.</div>}
          </div>

          <div className="thread">
            {turns.map((t, i) => <TurnView key={i} t={t} onDecide={(d, a) => decide(i, d, a)} onFollow={send} />)}
            <div ref={endRef} />
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <Card title="Site pulse" sub={facts.data?.status}>
            <div>
              {[["Lease area", f.lease_area_m2], ["Flats (planning)", f.flats], ["Persons per flat", f.persons_per_flat], ["Reservoir (closed)", f.reservoir_m3], ["Rain normal 1991-2020", f.rain_normal_mm], ["Stage of development", f.stage_of_development]].map(([l, v]: any) => v && (
                <div key={l} className="pulse-row">
                  <span className="small muted">{l}</span>
                  <b>{typeof v.value === "number" ? fmt(v.value) : String(v.value).split(" - ")[0]} <span className="small muted" style={{ fontFamily: "var(--font)", fontWeight: 400 }}>{unit(v.unit)}</span></b>
                  <span />
                  <span style={{ justifySelf: "end" }}><Prov p={v.provenance} /></span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Integrity" right={<button className="btn ghost small" onClick={() => go("integrity")}>Open</button>}>
            {integ.data ? (
              <div className="row wrap" style={{ gap: 8 }}>
                <span className="badge b-agree">{integ.data.counts.agree} agree</span>
                <span className="badge b-differs">{integ.data.counts.differs} differ</span>
                <span className="badge b-note">{integ.data.counts.note} note</span>
              </div>) : <div className="spinner" />}
            <div className="small muted" style={{ marginTop: 10 }}>Checks whether the registry, AquaTwin and WaterPlan hold the same site numbers.</div>
          </Card>
          <Card title="Conversations" right={<button className="btn ghost small" onClick={() => { setTurns([]); setChatId(null); }}>New</button>}>
            {(chats.data || []).slice(0, 8).map(c => (
              <div key={c.id} className="row between" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }} onClick={() => openChat(c.id)}>
                <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span><span className="tiny muted">{c.turns}</span>
              </div>
            ))}
            {!chats.data?.length && <div className="small muted">Your questions and answers are saved here.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function TurnView({ t, onDecide, onFollow }: { t: Turn; onDecide: (d: any, approve: boolean) => void; onFollow: (q: string) => void }) {
  const tools = t.final?.trace?.length ? t.final.trace : t.events.filter(e => e.type === "tool").map((e: any) => ({ tool: e.tool, ok: true }));
  const status = [...t.events].reverse().find(e => e.type === "status") as any;
  const fin: Final | undefined = t.final?.final;
  return (
    <>
      <div className="q-bubble">{t.q}</div>
      <div className="a-card">
        <div className="a-head">
          <span className={`orb ${t.live ? "live" : ""}`} />
          <b style={{ color: "var(--ink)" }}>NBL-Intelligence</b>
          <span>{t.live ? (status?.text || "Working") + "…" : t.final ? (t.final.offline ? "offline · engines only" : t.final.model) : ""}</span>
          {fin?.confidence && <span className="badge b-note" style={{ marginLeft: "auto" }}>Confidence: {fin.confidence}</span>}
        </div>
        {tools.length > 0 && (
          <div className="trace" style={{ paddingTop: 12 }}>
            {tools.map((s: any, i: number) => <span key={i} className={`step ${toolEngine(s.tool)}`}><i />{toolLabel[s.tool] || s.tool}{s.ok === false ? " (failed)" : ""}</span>)}
          </div>
        )}
        {t.error && <div className="a-body"><div className="note" style={{ color: "var(--danger)" }}>{t.error}</div></div>}
        {fin && (
          <>
            <div className="a-body"><Markdown text={fin.answer} /></div>
            {fin.numbers?.length > 0 && (
              <div className="numbers">
                {fin.numbers.slice(0, 8).map((n, i) => (
                  <div key={i} className="num-chip">
                    <span>{n.name}</span>
                    <b>{fmt(typeof n.value === "number" ? n.value : n.value)} <small style={{ fontSize: 12 }}>{unit(n.unit)}</small></b>
                    <span>{[n.period, n.case].filter(Boolean).join(" · ")}</span>
                    {n.provenance && <div style={{ marginTop: 4 }}><Prov p={n.provenance} /></div>}
                  </div>
                ))}
              </div>
            )}
            {fin.suggested_decision && (
              <div className="decision">
                <I.gavel size={18} />
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
        {t.live && !fin && t.stream && <div className="a-body streaming"><Markdown text={t.stream} /><span className="caret" /></div>}
        {t.live && !fin && !t.stream && <div className="a-body"><div className="row small muted"><div className="spinner" />{status?.text === "Reasoning" ? "Reasoning and calling the engines…" : (status?.text || "Working") + "…"}</div></div>}
      </div>
    </>
  );
}
