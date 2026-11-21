import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, unit } from "../lib/format";
import { Art, Card, Hero, Loading, Stat, useLoad } from "../components/Bits";
import { Donut, LineChart } from "../components/Charts";
import { Glyph, IconBadge } from "../components/Glyphs";

const ROWS: [string, string][] = [["Total demand", "drop"], ["Average demand", "calendar"], ["Unmet demand", "warn"], ["Reliability", "shield"], ["Rainwater used", "rain"], ["Treated wastewater reused", "recycle"], ["Borewell water used", "drill"], ["RO concentrate to tanker, average", "tank"], ["Water leaving the lease (spill)", "trend"], ["Recharge through recharge wells", "recharge"]];
const COLORS = ["#3DDC97", "#22D3EE", "#F5B041", "#A78BFA"];

export default function Scenarios() {
  const { site, toast, go } = useApp();
  const runs = useLoad(() => api<any[]>(`/api/sites/${site}/runs`), [site]);
  const [picked, setPicked] = useState<string[]>([]);
  const [detail, setDetail] = useState<Record<string, any>>({});
  async function load(id: string) { if (!detail[id]) { const d = await api(`/api/sites/${site}/runs/${id}`); setDetail(x => ({ ...x, [id]: d })); } }
  useEffect(() => { if (runs.data?.length && !picked.length) { setPicked([runs.data[0].run_id]); load(runs.data[0].run_id); } }, [runs.data]);
  async function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id].slice(-4);
    setPicked(next.length ? next : [id]); load(id);
  }
  async function review(id: string, status: string) {
    await api(`/api/sites/${site}/runs/${id}/review`, { json: { status, reviewer: "Hydrogeologist" } });
    toast(`Run ${id} marked ${status}`); runs.reload();
    setDetail(x => ({ ...x, [id]: { ...x[id], review: { status } } }));
  }
  const sel = picked.map(id => detail[id]).filter(Boolean);
  const main = sel[0];
  const k = (r: any, n: string) => r?.result?.kpis?.find((x: any) => x.name === n);
  const yrs = main ? `over ${main.result.scenario.years} years` : "";
  const supplied = main ? main.result.totals_m3.supplied || 1 : 1;
  return (
    <div className="page">
      <Hero art="banner-scenarios" icon="leaf" eyebrow="Decide" title="Scenarios" sub="Compare planning cases, check water security and choose the path forward. Every run carries a SHA-256 fingerprint."
        actions={<button className="btn light" onClick={() => go("plan")}><Glyph name="drop" size={16} />New scenario</button>} />
      <div className="grid" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
        <div className="grid" style={{ gap: 16 }}>
          <Card title={`Saved runs (${runs.data?.length || 0})`} icon="folder" tone="green" pad={false}>
            {!runs.data && <Loading />}
            <div style={{ maxHeight: 360, overflow: "auto", padding: 12, display: "grid", gap: 10 }}>
              {(runs.data || []).map(r => {
                const on = picked.includes(r.run_id);
                return (
                  <div key={r.run_id} onClick={() => toggle(r.run_id)} style={{ cursor: "pointer", padding: 12, borderRadius: 14, border: `1px solid ${on ? "rgba(61,220,151,.7)" : "var(--line)"}`, background: on ? "rgba(61,220,151,.1)" : "rgba(3,18,32,.4)", boxShadow: on ? "0 0 18px rgba(61,220,151,.15)" : undefined }}>
                    <div className="row between" style={{ alignItems: "flex-start" }}>
                      <div className="row" style={{ alignItems: "flex-start" }}><Glyph name={r.result?.rain_case?.startsWith("Dry") ? "drop" : "leaf"} size={18} color="#3DDC97" /><b style={{ color: "#fff" }}>{r.name}</b></div>
                      <span className={`badge b-${r.review?.status || "pending"}`}>{(r.review?.status || "pending").replace(/^./, (c: string) => c.toUpperCase())}</span>
                    </div>
                    <div className="tiny" style={{ color: "#7CF0BE", marginTop: 4 }}>{r.run_id}</div>
                    <div className="tiny muted">{new Date(r.created).toLocaleString()} · {r.result?.scenario?.persons_per_flat} persons/flat</div>
                    <div className="tiny muted">{r.result?.rain_case}</div>
                  </div>
                );
              })}
              {runs.data && !runs.data.length && <div className="empty">No runs yet. Save one on the Water plan page, or ask the AI a planning question.</div>}
            </div>
          </Card>
          {main && (
            <Card title="Water balance" sub={main.name} icon="drop" tone="aqua">
              <div className="row" style={{ gap: 14, alignItems: "center" }}>
                <Donut center={`${fmt(main.result.totals_m3.demand)} m³`} sub={`total demand, ${main.result.scenario.years} yr`} size={160}
                  parts={[{ label: "Rain", value: main.result.totals_m3.rain_supply, color: "#22D3EE" }, { label: "Reuse", value: main.result.totals_m3.reuse_supply, color: "#3DDC97" }, { label: "Borewell", value: main.result.totals_m3.borewell_supply, color: "#3B9BF5" }]} />
                <div className="grid" style={{ gap: 8, fontSize: 12.5 }}>
                  {[["Rainwater", main.result.totals_m3.rain_supply, "#22D3EE"], ["Treated reuse", main.result.totals_m3.reuse_supply, "#3DDC97"], ["Borewell", main.result.totals_m3.borewell_supply, "#3B9BF5"]].map(([l, v, c]: any) => (
                    <div key={l}><span className="row" style={{ gap: 6 }}><i className="swatch" style={{ background: c, borderRadius: 6 }} /><b style={{ color: "#fff" }}>{l}</b></span><span className="muted">{fmt(v)} m³ ({fmt(v / supplied * 100, 1)} %)</span></div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          <div className="card" style={{ overflow: "hidden" }}><Art name="concept-house" /></div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          {!main && <div className="card empty">Select a saved run to see it here.</div>}
          {main && (
            <div className="grid g5">
              <Stat icon="drop" tone="blue" label="Total demand" value={k(main, "Total demand")?.value} u="m3" sub={`(${yrs})`} />
              <Stat icon="calendar" tone="aqua" label="Average demand" value={k(main, "Average demand")?.value} u="m3/day" sub="per day, averaged" />
              <Stat icon="shield" tone="green" label="Reliability" value={fmt(main.result.metrics.reliability * 100, 1)} u="%" sub="days fully supplied" />
              <Stat icon="recycle" tone="green" label="Net zero discharge" value={main.result.net_zero_discharge ? "Yes" : "No"} sub={`spill ${fmt(main.result.totals_m3.spill)} m³`} />
              <Stat icon="layers" tone="teal" label="Recharge (wells)" value={k(main, "Recharge through recharge wells")?.value} u="m3" sub={`(${yrs})`} />
            </div>
          )}
          {sel.length > 0 && (
            <Card title="Comparison" icon="compare" tone="green" right={<span className="small muted">Click runs on the left to compare up to four</span>} pad={false}>
              <div className="tbl-wrap" style={{ border: 0, marginTop: 10 }}>
                <table className="tbl">
                  <thead><tr><th>Item</th>{sel.map((r, i) => <th key={r.run_id} style={{ color: COLORS[i] }}>{r.name}</th>)}{sel.length === 1 && <th>Share</th>}</tr></thead>
                  <tbody>
                    <tr><td><span className="row"><Glyph name="people" size={16} color="#9FD8EA" />Persons per flat · flats</span></td>{sel.map(r => <td key={r.run_id}><b>{r.result.scenario.persons_per_flat} · {fmt(r.result.scenario.flats)}</b></td>)}{sel.length === 1 && <td />}</tr>
                    <tr><td><span className="row"><Glyph name="rain" size={16} color="#9FD8EA" />Rain case</span></td>{sel.map(r => <td key={r.run_id} className="small">{r.result.rain_case}</td>)}{sel.length === 1 && <td />}</tr>
                    <tr><td><span className="row"><Glyph name="recycle" size={16} color="#9FD8EA" />Net zero discharge</span></td>{sel.map(r => <td key={r.run_id}><span className={`badge ${r.result.net_zero_discharge ? "b-agree" : "b-differs"}`}>{r.result.net_zero_discharge ? "Yes" : "No"}</span></td>)}{sel.length === 1 && <td />}</tr>
                    {ROWS.map(([n, g]) => (
                      <tr key={n}><td><span className="row"><Glyph name={g} size={16} color="#9FD8EA" /><span>{n} <span className="muted small">({sel[0].result.kpis.find((x: any) => x.name === n)?.period})</span></span></span></td>
                        {sel.map(r => { const x = k(r, n); return <td key={r.run_id}><b>{fmt(x?.value)}</b> <span className="tiny muted">{unit(x?.unit)}</span></td>; })}
                        {sel.length === 1 && <td style={{ width: 260 }}>{["Rainwater used", "Treated wastewater reused", "Borewell water used"].includes(n) && (() => { const pct = (k(main, n)?.value || 0) / supplied * 100; return <div className="row"><div className="bar-track" style={{ flex: 1 }}><div className="bar-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#22D3EE,#3B9BF5)" }} /></div><b className="small">{fmt(pct, 1)}%</b></div>; })()}</td>}
                      </tr>))}
                    <tr><td><span className="row"><Glyph name="doc" size={16} color="#9FD8EA" />Review</span></td>{sel.map(r => <td key={r.run_id}><div className="row" style={{ gap: 8 }}>
                      <button className="btn" style={{ height: 32 }} onClick={() => review(r.run_id, "rejected")}>✕ Reject</button>
                      <button className="btn primary" style={{ height: 32 }} onClick={() => review(r.run_id, "approved")}>✓ Approve</button></div></td>)}{sel.length === 1 && <td><span className={`badge b-${main.review?.status || "pending"}`}>{main.review?.status || "pending"}</span></td>}</tr>
                    <tr><td className="tiny muted">Fingerprint (SHA-256)</td>{sel.map(r => <td key={r.run_id} className="tiny muted">{r.fingerprint.slice(0, 20)}…</td>)}{sel.length === 1 && <td />}</tr>
                  </tbody>
                </table>
              </div>
            </Card>)}
          {sel.length > 0 && sel[0].daily && (
            <Card title="Reservoir storage" sub="m³ · daily, every third day" icon="tank" tone="blue">
              <LineChart dates={sel[0].daily.date} yLabel="m³" series={sel.filter(r => r.daily).map((r, i) => ({ name: r.name, values: r.daily.reservoir_storage_m3, color: COLORS[i] }))} />
            </Card>)}
        </div>
      </div>
    </div>
  );
}
