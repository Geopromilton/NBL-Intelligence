import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Card, ErrorBox, Hero, Loading, Source, Stat, useLoad } from "../components/Bits";
import SiteMap from "../components/SiteMap";
import { Glyph, IconBadge } from "../components/Glyphs";

const roleBadge = (r: string) => /Priority 1/.test(r) ? "b-p1" : /Priority 2/.test(r) ? "b-p2" : /reserve/.test(r) ? "b-reserve" : "b-alt";
const roleColor = (r: string) => /Priority 1/.test(r) ? "#1FB5A0" : /Priority 2/.test(r) ? "#2E8BE6" : /reserve/.test(r) ? "#8B6FE0" : /Alternate/.test(r) ? "#5C7A92" : "#46586A";
const CONF_ICON: Record<string, [string, string]> = {
  "Data quality": ["check", "green"], "Statistical class membership": ["scale", "violet"], "Spatial support": ["globe", "blue"],
  "Hydrogeological evidence": ["drop", "aqua"], "Scenario-assumption status": ["list", "amber"], "Regional plausibility": ["mountain", "teal"],
  "Numerical-model status": ["cube", "blue"], "Surrogate performance": ["chip", "violet"],
};

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
  const top = sites.find(x => /Priority 1/.test(x.Role));
  return (
    <div className="page">
      <Hero art="banner-explore" icon="drill" eyebrow="Water cycle · 1 Explore" title="Groundwater" accent="exploration"
        sub={<>Where to drill, from the ADMT survey interpreted by NBL-AquaTwin (run {d.run.run_id}, AquaTwin {d.run.version}). All sites are unvalidated until the first borehole.</>}
        actions={<button className="btn light" onClick={() => ask("Where should we drill first and what depth should we target? Compare A, B and C.")}><Glyph name="spark" size={16} />Ask about drilling</button>} />

      <div className="grid g4">
        <Stat icon="layers" tone="green" label="ADMT profiles" value="14" sub="N1-N8, E1-E6 · 2.5 m stations" prov="measured" />
        <Stat icon="list" tone="blue" label="Stations × depth levels" value="1,000 × 60" sub="0-600 m nominal depth" prov="measured" />
        <Stat icon="check" tone="teal" label="Cells kept by QC" value="67" u="%" sub="flag 4 % · exclude 28 % (transformer, noise)" prov="calculated" />
        <Stat icon="drill" tone="amber" label="Drilling target" value="350–400" u="m" sub="preliminary; pre-drilling review" prov="assumption" warn />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", marginTop: 16, alignItems: "start" }}>
        <Card title="Drilling sites" sub="Priority list v03 · click a row" icon="pin" tone="aqua" pad={false}>
          <div className="tbl-wrap" style={{ border: 0, marginTop: 8 }}>
            <table className="tbl">
              <thead><tr><th>Site</th><th>Role</th><th>Primary zone (score, depth, type)</th><th className="num">Score</th><th className="num">Boundary m</th><th className="num">Transformer m</th><th>Status</th></tr></thead>
              <tbody>{sites.map(x => (
                <tr key={x.Site} className="hover" onClick={() => setPick(x.Site)} style={x.Site === pick ? { background: "rgba(34,211,238,.1)", boxShadow: "inset 3px 0 0 #22D3EE" } : {}}>
                  <td><span className="dot-letter" style={{ background: roleColor(x.Role), boxShadow: `0 0 10px ${roleColor(x.Role)}88` }}>{x.Site}</span></td>
                  <td><span className={`badge ${roleBadge(x.Role)}`}>{x.Role}</span></td><td className="small">{x.Primary_zone}</td>
                  <td className="num"><b>{x.Best_zone_score}</b></td><td className="num">{fmt(x.Distance_to_boundary_m)}</td><td className="num">{fmt(x.Distance_to_transformer_m)}</td>
                  <td><span className="badge b-pending">{x.Status}</span></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div style={{ padding: "0 18px 14px" }}><Source s={d.drilling_sites.source} /></div>
        </Card>
        <Card title="Lease plan" sub="Click a site · priority sites in colour" icon="globe" tone="blue">
          {tw.data ? <SiteMap scene={tw.data} selected={pick} onPick={id => /^[A-G]$/.test(id) && setPick(id)} /> : <Loading />}
          <div className="legend" style={{ marginTop: 10 }}>
            <span><i className="swatch" style={{ background: "var(--aqua)" }} />Priority site</span>
            <span><i className="swatch" style={{ border: "2px solid var(--ink-3)" }} />Alternate / noted zone</span>
            <span><i className="swatch" style={{ border: "2px solid #3DDC97", borderRadius: 6 }} />Recharge point</span>
            <span><i className="swatch" style={{ background: "rgba(242,107,107,.25)", border: "1px dashed #F26B6B" }} />Transformer exclusion</span>
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr)", marginTop: 16, alignItems: "start" }}>
        <Card icon="drill" tone="green" title={<span className="row">Site {s.Site}<span className={`badge ${roleBadge(s.Role)}`}>{s.Role}</span></span>} sub={`ADMT point ${s.ADMT_point} · ${s.Location_on_grid}`}>
          <div className="grid g3" style={{ gap: 10 }}>
            <div className="tile"><div className="t-src">Zone score</div><div className="t-val">{s.Best_zone_score}<small>of 10</small></div></div>
            <div className="tile"><div className="t-src">To boundary</div><div className="t-val">{fmt(s.Distance_to_boundary_m)}<small>m</small></div></div>
            <div className="tile"><div className="t-src">To transformer</div><div className="t-val">{fmt(s.Distance_to_transformer_m)}<small>m</small></div></div>
          </div>
          <div style={{ marginTop: 12 }}><div className="tiny muted">Primary zone</div><b style={{ color: "#fff" }}>{s.Primary_zone}</b>{s.Supporting_zones && <span className="small muted"> · supported by {s.Supporting_zones}</span>}</div>
          <div style={{ marginTop: 8 }} className="small">{s.Basis}</div>
          {s.Lat && <div className="tiny muted" style={{ marginTop: 6 }}>{Number(s.Lat).toFixed(5)}° N, {Number(s.Lon).toFixed(5)}° E · UTM E {fmt(s.E)}, N {fmt(s.N)}</div>}
          {s.predictions?.length > 0 && <>
            <div className="hr" />
            <div className="eyebrow" style={{ marginBottom: 6 }}>Locked pre-drilling predictions</div>
            {s.predictions.slice(0, 4).map((p: any, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}><div className="small"><b style={{ color: "#fff" }}>{p.item}</b></div><div className="tiny muted">{(p.predicted || "").slice(0, 300)}</div></div>
            ))}
          </>}
          <div className="small muted" style={{ marginTop: 8 }}>{d.drilling_sites.order_note}</div>
        </Card>
        <Card title="Confidence panel" sub="Each layer is reported on its own; they are never merged into one score" icon="shield" tone="teal">
          <div className="grid g2" style={{ gap: 10 }}>
            {(d.confidence.rows || []).map((r: any) => {
              const [ic, tone] = CONF_ICON[r.layer] || ["info", "slate"];
              return (
                <div key={r.layer} className="row" style={{ alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 14, background: "rgba(3,18,32,.45)", border: "1px solid var(--line)" }}>
                  <IconBadge name={ic} tone={tone} size={34} />
                  <div style={{ minWidth: 0 }}><div className="small"><b style={{ color: "#fff" }}>{r.layer}</b></div><div className="tiny muted" style={{ marginTop: 2 }}>{r.status}</div></div>
                </div>);
            })}
          </div>
          <Source s={d.confidence.source} />
        </Card>
      </div>

      <Card title="Reference borewells" sub="Off-site; reported by drillers and owners, not measured by NBL" icon="drop" tone="amber" style={{ marginTop: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <table className="tbl light" style={{ borderRadius: 12, overflow: "hidden" }}><thead><tr><th>Borewell</th><th className="num">Depth m</th><th>Water strikes (m)</th><th>Status</th></tr></thead>
            <tbody>{d.borewells.borewells.map((b: any) => (
              <tr key={b.id}><td><b>{b.id}</b></td><td className="num">{b.total_depth_m}</td><td>{(b.strikes_m || []).map((x: number[]) => x.join("–")).join("; ")}</td><td>{b.status}</td></tr>))}</tbody></table>
          <div className="note">BW-1's 37–43 m strike is blue on the ADMT scale but yielded only about 1 inch, so a shallow blue response does not guarantee yield. Drilling zones use blue only; purple peaks (clay-like, very low response) are excluded.</div>
        </div>
        <Source s={d.borewells.source} />
      </Card>

      {top && <div className="footband">
        <IconBadge name="spark" tone="green" size={44} />
        <div style={{ flex: 1 }}><b style={{ color: "#fff" }}>Key insight</b><div className="small">Site {top.Site} leads with zone {top.Primary_zone}. It is {fmt(top.Distance_to_transformer_m)} m from the transformer and {fmt(top.Distance_to_boundary_m)} m inside the boundary. Every site stays unvalidated until the first borehole is logged and pump-tested.</div></div>
        <button className="btn primary" onClick={() => ask(`Explain why Site ${top.Site} is Priority 1 and what the first borehole must log and test.`)}><Glyph name="spark" size={16} />Explain with AI</button>
      </div>}
    </div>
  );
}
