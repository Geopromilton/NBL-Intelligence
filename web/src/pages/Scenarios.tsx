import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Card, Loading, useLoad } from "../components/Bits";
import { LineChart } from "../components/Charts";
import { I } from "../components/Icons";

const ROWS = ["Total demand", "Average demand", "Unmet demand", "Reliability", "Rainwater used", "Treated wastewater reused", "Borewell water used", "RO concentrate to tanker, average", "Water leaving the lease (spill)", "Recharge through recharge wells"];
const COLORS = ["#1677B8", "#C4622D", "#2E8B57", "#6D4BB0"];

export default function Scenarios() {
  const { site, toast, go } = useApp();
  const runs = useLoad(() => api<any[]>(`/api/sites/${site}/runs`), [site]);
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<Record<string, any>>({});
  async function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(-4);
    setPicked(next);
    if (!detail[id]) { const d = await api(`/api/sites/${site}/runs/${id}`); setDetail(x => ({ ...x, [id]: d })); }
  }
  async function review(id: string, status: string) {
    await api(`/api/sites/${site}/runs/${id}/review`, { json: { status, reviewer: "Hydrogeologist" } });
    toast(`Run ${id} marked ${status}`); runs.reload();
  }
  const sel = picked.map(id => detail[id]).filter(Boolean);
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Decide</div><h1>Scenarios</h1><p>Every plan run is saved with a SHA-256 fingerprint of its inputs and results. Pick up to four to compare side by side, then approve or reject.</p></div>
        <div className="actions"><button className="btn" onClick={() => go("plan")}><I.drop size={15} />New scenario</button></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "380px minmax(0,1fr)", alignItems: "start" }}>
        <Card title="Saved runs" sub={`${runs.data?.length || 0} runs`} pad={false}>
          {!runs.data && <Loading />}
          <div style={{ maxHeight: "70vh", overflow: "auto" }}>
            {(runs.data || []).map(r => (
              <div key={r.run_id} onClick={() => toggle(r.run_id)} style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer", background: picked.includes(r.run_id) ? "var(--aqua-soft)" : undefined }}>
                <div className="row between"><b className="small">{r.name}</b><span className={`badge b-${r.review?.status || "pending"}`}>{r.review?.status || "pending"}</span></div>
                <div className="tiny muted">{r.run_id} · {new Date(r.created).toLocaleString()} · {r.by}</div>
                <div className="tiny muted">{r.result?.scenario?.persons_per_flat} persons/flat · {r.result?.rain_case}</div>
              </div>))}
            {runs.data && !runs.data.length && <div className="empty">No runs yet. Save one on the Water plan page, or ask the AI a planning question.</div>}
          </div>
        </Card>
        <div className="grid" style={{ gap: 16 }}>
          {!sel.length && <div className="card empty">Select runs on the left to compare them.</div>}
          {sel.length > 0 && (
            <Card title="Comparison" pad={false}>
              <div className="tbl-wrap" style={{ border: 0 }}>
                <table className="tbl">
                  <thead><tr><th>Item</th>{sel.map((r, i) => <th key={r.run_id} className="num" style={{ color: COLORS[i] }}>{r.name}</th>)}</tr></thead>
                  <tbody>
                    <tr><td>Persons per flat · flats</td>{sel.map(r => <td key={r.run_id} className="num">{r.result.scenario.persons_per_flat} · {r.result.scenario.flats}</td>)}</tr>
                    <tr><td>Rain case</td>{sel.map(r => <td key={r.run_id} className="num small">{r.result.rain_case}</td>)}</tr>
                    <tr><td>Net zero discharge</td>{sel.map(r => <td key={r.run_id} className="num"><span className={`badge ${r.result.net_zero_discharge ? "b-agree" : "b-differs"}`}>{r.result.net_zero_discharge ? "yes" : "no"}</span></td>)}</tr>
                    {ROWS.map(n => (
                      <tr key={n}><td>{n}<div className="tiny muted">{sel[0].result.kpis.find((k: any) => k.name === n)?.period}</div></td>
                        {sel.map(r => { const k = r.result.kpis.find((x: any) => x.name === n); return <td key={r.run_id} className="num"><b>{fmt(k?.value)}</b> <span className="tiny muted">{k?.unit}</span></td>; })}</tr>))}
                    <tr><td>Review</td>{sel.map(r => <td key={r.run_id} className="num"><div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button className="btn" style={{ height: 28 }} onClick={() => review(r.run_id, "rejected")}><I.x size={13} /></button>
                      <button className="btn primary" style={{ height: 28 }} onClick={() => review(r.run_id, "approved")}><I.check size={13} />Approve</button></div></td>)}</tr>
                    <tr><td className="tiny muted">Fingerprint</td>{sel.map(r => <td key={r.run_id} className="num tiny muted">{r.fingerprint.slice(0, 16)}…</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </Card>)}
          {sel.length > 0 && sel[0].daily && (
            <Card title="Reservoir storage" sub="m³ · daily, every third day">
              <LineChart dates={sel[0].daily.date} yLabel="m³" series={sel.filter(r => r.daily).map((r, i) => ({ name: r.name, values: r.daily.reservoir_storage_m3, color: COLORS[i] }))} />
            </Card>)}
        </div>
      </div>
    </div>
  );
}
