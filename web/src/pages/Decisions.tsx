import React, { useState } from "react";
import { api, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Hero, Loading, Stat, useLoad } from "../components/Bits";
import { Glyph, IconBadge } from "../components/Glyphs";

const kind = (s: string) => /^adopt|approv/i.test(s) ? "adopted" : /propos|review|suggest/i.test(s) ? "proposed" : /open/i.test(s) ? "open" : "recorded";
const BAR: Record<string, string> = { adopted: "#3DDC97", proposed: "#F5B041", open: "#F26B6B", recorded: "#3B9BF5" };
const BADGE: Record<string, string> = { adopted: "b-adopted", proposed: "b-proposed", open: "b-differs", recorded: "b-recorded" };

export default function Decisions() {
  const { site, toast, go } = useApp();
  const d = useLoad(() => api<any>(`/api/sites/${site}/decisions`), [site]);
  const integ = useLoad(() => api<any>(`/api/sites/${site}/integrity`), [site]);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const [st, setSt] = useState("all");
  const [form, setForm] = useState({ decision: "", reason: "" });
  async function add(decision = form.decision, reason = form.reason) {
    if (decision.trim().length < 3) return;
    await api(`/api/sites/${site}/decisions`, { json: { decision, reason, by: "Hydrogeologist", status: "adopted" } });
    setForm({ decision: "", reason: "" }); toast("Decision recorded"); d.reload();
  }
  const all: any[] = d.data ? [...d.data.platform, ...d.data.aquatwin] : [];
  const count = (k: string) => all.filter(r => kind(r.status) === k).length;
  const rows = all.filter(r => (src === "all" || (src === "platform" ? r.engine !== "NBL-AquaTwin" : r.engine === "NBL-AquaTwin"))
    && (st === "all" || kind(r.status) === st) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
  const open = (integ.data?.checks || []).filter((c: any) => c.status === "differs");
  return (
    <div className="page">
      <Hero art="banner-decisions" icon="gavel" eyebrow="Decide" title="Decisions"
        sub="One decision log: decisions made here (NBI-D-…) and the NBL-AquaTwin log (D-…, read-only). AI suggestions enter only when you approve them." />
      <div className="grid g4">
        <Stat icon="list" tone="blue" label="Decisions logged" value={all.length} sub={`${d.data?.platform.length ?? 0} here · ${d.data?.aquatwin.length ?? 0} AquaTwin`} />
        <Stat icon="check" tone="green" label="Adopted" value={count("adopted")} sub="in force" />
        <Stat icon="hourglass" tone="amber" label="Proposed or for review" value={count("proposed")} sub="awaiting the hydrogeologist or MD" />
        <Stat icon="warn" tone="red" label="Open" value={count("open")} sub="still to decide" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", alignItems: "start", marginTop: 16 }}>
        <Card title="Decision log" sub={`${rows.length} of ${all.length} shown`} icon="book" tone="blue" pad={false}
          right={<input className="input" style={{ width: 220, height: 34 }} placeholder="Filter by word…" value={q} onChange={e => setQ(e.target.value)} />}>
          <div className="row wrap" style={{ padding: "10px 18px 4px", gap: 10 }}>
            <div className="seg">{[["all", "All sources"], ["platform", "NBL-Intelligence"], ["aquatwin", "NBL-AquaTwin"]].map(([k, l]) => <button key={k} className={src === k ? "on" : ""} onClick={() => setSrc(k)}>{l}</button>)}</div>
            <div className="seg">{[["all", "Any status"], ["adopted", "Adopted"], ["proposed", "Proposed"], ["open", "Open"], ["recorded", "Recorded"]].map(([k, l]) => <button key={k} className={st === k ? "on" : ""} onClick={() => setSt(k)}>{l}</button>)}</div>
          </div>
          {!d.data && <Loading />}
          <div style={{ maxHeight: "70vh", overflow: "auto", padding: "8px 14px 14px", display: "grid", gap: 8 }}>
            {rows.map((r: any, i: number) => {
              const k = kind(r.status);
              return (
                <div key={r.id + i} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) 150px", gap: 14, padding: "12px 14px", borderRadius: 14, background: "rgba(3,18,32,.45)", border: "1px solid var(--line)", borderLeft: `4px solid ${BAR[k]}` }}>
                  <div><b style={{ color: "#fff" }}>{r.id}</b><div className="tiny muted">{r.date}</div><div className="tiny" style={{ color: "#7CF0BE", marginTop: 2 }}>{r.engine}</div></div>
                  <div style={{ minWidth: 0 }}><div className="small" style={{ color: "#fff", fontWeight: 600 }}>{r.decision}</div>{r.reason && <div className="tiny muted" style={{ marginTop: 4 }}>{r.reason.slice(0, 260)}{r.reason.length > 260 ? "…" : ""}</div>}</div>
                  <div style={{ textAlign: "right" }}><span className={`badge ${BADGE[k]}`}>{r.status.length > 22 ? r.status.slice(0, 22) + "…" : r.status}</span><div className="tiny muted" style={{ marginTop: 6 }}>{r.by}</div></div>
                </div>);
            })}
            {d.data && !rows.length && <div className="empty">No decisions match this filter.</div>}
          </div>
        </Card>
        <div className="grid" style={{ gap: 16 }}>
          {!VIEW && <Card title="Record a decision" icon="gavel" tone="green">
            <div className="field"><label>Decision</label><textarea className="input" style={{ height: 90, padding: 10 }} value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} /></div>
            <div className="field"><label>Reason / evidence</label><textarea className="input" style={{ height: 80, padding: 10 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <button className="btn primary" onClick={() => add()}><Glyph name="gavel" size={15} />Record decision</button>
          </Card>}
          <Card title="Open actions" sub="From the integrity checks, not invented" icon="warn" tone="amber">
            {!integ.data && <Loading />}
            {open.map((c: any) => (
              <div key={c.id} className="row" style={{ alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <IconBadge name="warn" tone="amber" size={30} />
                <div style={{ minWidth: 0, flex: 1 }}><div className="small"><b style={{ color: "#fff" }}>{c.title}</b></div><div className="tiny muted" style={{ marginTop: 2 }}>{c.action}</div>
                  {!VIEW && <button className="btn" style={{ height: 28, marginTop: 6, fontSize: 12 }} onClick={() => setForm({ decision: `${c.title}: `, reason: c.action })}>Draft a decision</button>}</div>
              </div>))}
            {integ.data && !open.length && <div className="small muted">No open differences.</div>}
            <button className="btn" style={{ marginTop: 10 }} onClick={() => go("integrity")}><Glyph name="shield" size={15} />Open integrity</button>
          </Card>
        </div>
      </div>
    </div>
  );
}
