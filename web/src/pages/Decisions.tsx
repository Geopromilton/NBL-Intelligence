import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { Card, Loading, useLoad } from "../components/Bits";
import { I } from "../components/Icons";

export default function Decisions() {
  const { site, toast } = useApp();
  const d = useLoad(() => api<any>(`/api/sites/${site}/decisions`), [site]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ decision: "", reason: "" });
  async function add() {
    if (form.decision.trim().length < 3) return;
    await api(`/api/sites/${site}/decisions`, { json: { ...form, by: "Hydrogeologist", status: "adopted" } });
    setForm({ decision: "", reason: "" }); toast("Decision recorded"); d.reload();
  }
  const all = d.data ? [...d.data.platform, ...d.data.aquatwin] : [];
  const rows = all.filter((r: any) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Decide</div><h1>Decisions</h1><p>One decision log: decisions made here (NBI-D-…) and the NBL-AquaTwin log (D-…, read-only). AI suggestions enter only when you approve them.</p></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
        <Card title="Log" sub={`${rows.length} of ${all.length}`} right={<input className="input" style={{ width: 240, height: 32 }} placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} />} pad={false}>
          {!d.data && <Loading />}
          <div style={{ maxHeight: "72vh", overflow: "auto" }}>
            <table className="tbl"><thead><tr><th>ID</th><th>Date</th><th>Decision</th><th>By</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r: any, i: number) => (
                <tr key={r.id + i}><td><b>{r.id}</b><div className="tiny muted">{r.engine}</div></td><td className="small">{r.date}</td>
                  <td><div className="small">{r.decision}</div>{r.reason && <div className="tiny muted" style={{ marginTop: 4 }}>{r.reason.slice(0, 260)}</div>}</td>
                  <td className="small">{r.by}</td><td><span className={`badge ${/adopt|approv/.test(r.status) ? "b-agree" : /propos|review/i.test(r.status) ? "b-pending" : "b-note"}`}>{r.status}</span></td></tr>))}</tbody></table>
          </div>
        </Card>
        <Card title="Record a decision">
          <div className="field"><label>Decision</label><textarea className="input" style={{ height: 90, padding: 10 }} value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} /></div>
          <div className="field"><label>Reason / evidence</label><textarea className="input" style={{ height: 80, padding: 10 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          <button className="btn primary" onClick={add}><I.gavel size={15} />Record</button>
        </Card>
      </div>
    </div>
  );
}
