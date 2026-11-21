import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Card, ErrorBox, Kpi, Loading, Source, Stamp, useLoad } from "../components/Bits";
import SiteMap from "../components/SiteMap";
import { I } from "../components/Icons";

const roleBadge = (r: string) => /Priority 1/.test(r) ? "b-p1" : /Priority 2/.test(r) ? "b-p2" : /reserve/.test(r) ? "b-reserve" : "b-alt";

export default function Explore() {
  const { site, ask } = useApp();
  const ex = useLoad(() => api<any>(`/api/sites/${site}/explore`), [site]);
  const tw = useLoad(() => api<any>(`/api/sites/${site}/twin`), [site]);
  const [pick, setPick] = useState("A");
  if (ex.err) return <div className="page"><ErrorBox e={ex.err} /></div>;
  if (!ex.data) return <div className="page"><Loading /></div>;
  const d = ex.data;
  const sites = d.drilling_sites.sites as any[];
  const s = sites.find(x => x.Site === pick) || sites[0];
  const conf = Object.fromEntries((d.confidence.rows || []).map((r: any) => [r.layer, r.status]));
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Water cycle · 1 Explore</div><h1>Groundwater exploration</h1>
          <p>Where to drill, from the ADMT survey interpreted by NBL-AquaTwin (run {d.run.run_id}, AquaTwin {d.run.version}). All sites are unvalidated until the first borehole.</p></div>
        <div className="actions"><button className="btn" onClick={() => ask("Where should we drill first and what depth should we target? Compare A, B and C.")}><I.spark size={15} />Ask about drilling</button></div>
      </div>
      <Stamp text={d.run.status_stamp} />
      <div className="grid g4" style={{ marginTop: 16 }}>
        <Kpi label="ADMT profiles" value="14" tag="N1-N8, E1-E6 · 2.5 m stations" prov="measured" accent="var(--leaf)" />
        <Kpi label="Stations × depth levels" value="1,000 × 60" tag="0-600 m nominal depth" prov="measured" accent="var(--leaf)" />
        <Kpi label="Cells kept by QC" value="67" u="%" tag="flag 4 % · exclude 28 % (transformer, noise)" prov="calculated" />
        <Kpi label="Drilling target" value="350–400" u="m" tag="preliminary; subject to pre-drilling review" prov="assumption" accent="var(--amber)" />
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Lease plan" sub="Click a site · priority sites in colour">
          {tw.data ? <SiteMap scene={tw.data} selected={pick} onPick={id => /^[A-G]$/.test(id) && setPick(id)} /> : <Loading />}
          <div className="legend" style={{ marginTop: 10 }}>
            <span><i className="swatch" style={{ background: "var(--aqua)" }} />Priority site</span>
            <span><i className="swatch" style={{ border: "2px solid var(--ink-3)" }} />Alternate / noted zone</span>
            <span><i className="swatch" style={{ border: "2px solid var(--leaf)", borderRadius: 6 }} />Recharge point</span>
            <span><i className="swatch" style={{ background: "var(--danger-soft)", border: "1px dashed var(--danger)" }} />Transformer exclusion</span>
          </div>
        </Card>
        <Card title={<>Site {s.Site} <span className={`badge ${roleBadge(s.Role)}`} style={{ marginLeft: 8 }}>{s.Role}</span></>} sub={`ADMT point ${s.ADMT_point} · ${s.Location_on_grid}`}>
          <div className="grid g3" style={{ gap: 10 }}>
            <Kpi label="Zone score" value={s.Best_zone_score} tag="of 10" prov="calculated" />
            <Kpi label="To boundary" value={s.Distance_to_boundary_m} u="m" prov="calculated" />
            <Kpi label="To transformer" value={s.Distance_to_transformer_m} u="m" prov="calculated" />
          </div>
          <div style={{ marginTop: 12 }}><div className="tiny muted">Primary zone</div><b>{s.Primary_zone}</b>{s.Supporting_zones && <span className="small muted"> · supported by {s.Supporting_zones}</span>}</div>
          <div style={{ marginTop: 10 }} className="small">{s.Basis}</div>
          {s.predictions?.length > 0 && <>
            <div className="hr" />
            <div className="eyebrow" style={{ marginBottom: 6 }}>Locked pre-drilling predictions</div>
            {s.predictions.slice(0, 4).map((p: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}><div className="small"><b>{p.item}</b></div><div className="tiny muted">{(p.predicted || "").slice(0, 300)}</div></div>
            ))}
          </>}
          <div className="small muted" style={{ marginTop: 8 }}>{d.drilling_sites.order_note}</div>
        </Card>
      </div>

      <Card title="All drilling sites" sub="Priority list v03" style={{ marginTop: 16 }} pad={false}>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Site</th><th>Role</th><th>Primary zone (score, depth, type)</th><th className="num">Score</th><th className="num">Boundary m</th><th className="num">Transformer m</th><th>Status</th></tr></thead>
            <tbody>{sites.map(x => (
              <tr key={x.Site} className="hover" onClick={() => setPick(x.Site)} style={x.Site === pick ? { background: "var(--aqua-soft)" } : {}}>
                <td><b>{x.Site}</b></td><td><span className={`badge ${roleBadge(x.Role)}`}>{x.Role}</span></td><td>{x.Primary_zone}</td>
                <td className="num">{x.Best_zone_score}</td><td className="num">{fmt(x.Distance_to_boundary_m)}</td><td className="num">{fmt(x.Distance_to_transformer_m)}</td><td>{x.Status}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div style={{ padding: "0 18px 14px" }}><Source s={d.drilling_sites.source} /></div>
      </Card>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Reference borewells" sub="Off-site; reported by drillers and owners, not measured by NBL">
          <table className="tbl"><thead><tr><th>Borewell</th><th className="num">Depth m</th><th>Water strikes (m)</th><th>Status</th></tr></thead>
            <tbody>{d.borewells.borewells.map((b: any) => (
              <tr key={b.id}><td><b>{b.id}</b></td><td className="num">{b.total_depth_m}</td><td>{(b.strikes_m || []).map((x: number[]) => x.join("–")).join("; ")}</td><td>{b.status}</td></tr>))}</tbody></table>
          <div className="note" style={{ marginTop: 10 }}>BW-1's 37–43 m strike is blue on the ADMT scale but yielded only about 1 inch, so a shallow blue response does not guarantee yield. Drilling zones use blue only; purple peaks (clay-like, very low response) are excluded.</div>
          <Source s={d.borewells.source} />
        </Card>
        <Card title="Confidence panel" sub="Each layer is reported on its own; they are never merged into one score">
          {(d.confidence.rows || []).map((r: any) => (
            <div key={r.layer} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div className="small"><b>{r.layer}</b></div><div className="small muted">{r.status}</div>
            </div>))}
          <Source s={d.confidence.source} />
        </Card>
      </div>
    </div>
  );
}
