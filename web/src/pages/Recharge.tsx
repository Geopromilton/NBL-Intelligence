import React, { useState } from "react";
import { api, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Art, Card, ErrorBox, Hero, Loading, Source, Stat, useLoad } from "../components/Bits";
import { HBars } from "../components/Charts";
import SiteMap from "../components/SiteMap";
import { Glyph, IconBadge } from "../components/Glyphs";

export default function Recharge() {
  const { site, ask } = useApp();
  const r = useLoad(() => api<any>(`/api/sites/${site}/recharge`), [site]);
  const tw = useLoad(() => api<any>(`/api/sites/${site}/twin`), [site]);
  const [bnd, setBnd] = useState("B1_GHB");
  const [mbnd, setMbnd] = useState("B1_GHB");
  if (r.err) return <div className="page"><ErrorBox e={r.err} /></div>;
  if (!r.data) return <div className="page"><Loading /></div>;
  const cb = r.data.cloudburst, mf = r.data.modflow, pts = r.data.points;
  const tiers = (cb.summary || []).filter((x: any) => x.boundary === bnd && x.scenario !== "CBALL");
  const all = (cb.summary || []).find((x: any) => x.boundary === bnd && x.scenario === "CBALL");
  const ms = (mf.summary || []).filter((x: any) => x.boundary === mbnd);
  const segB = (v: string, set: (s: string) => void) => (
    <div className="seg">{[["B1_GHB", "Open boundary"], ["B2_closed", "Closed"]].map(([k, l]) => <button key={k} className={v === k ? "on" : ""} onClick={() => set(k)}>{l}</button>)}</div>
  );
  return (
    <div className="page">
      <Hero art="banner-recharge" icon="leaf" eyebrow="Water cycle • 3 Regenerate" title="Recharge"
        sub="Regenerate groundwater. Store rain. Sustain the aquifer. Results from NBL-AquaTwin MODFLOW runs." />

      <div className="grid g5" style={{ marginBottom: 16 }}>
        <Stat icon="rain" tone="blue" label="Cloudburst storage" value={fmt(all?.to_aquifer_pct, 1)} u="%" sub="of storm water reaches the aquifer · all tiers, median" />
        <Stat icon="rock" tone="green" label="Retained after 1 year" value={fmt(all?.retained_1y_pct, 2)} u="%" sub="still inside the model domain" />
        <Stat icon="calendar" tone="violet" label="Design storm" value={fmt(all?.storm_mm, 0)} u="mm" sub="single event (1 day)" />
        <Stat icon="layers" tone="aqua" label="Recharge points" value={pts.points.length} sub="RZ points · untested" />
        <Stat icon="warn" tone="amber" warn label="Pre-drilling scenario" value={<span style={{ fontSize: 18 }}>Stage A</span>} sub="Not yet calibrated with on-site borehole or aquifer-test data" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.25fr) 300px minmax(0,1fr)", alignItems: "start" }}>
        <Card title="Cloudburst storage by depth tier" sub={cb.label} right={segB(bnd, setBnd)}>
          <div className="eyebrow" style={{ color: "var(--aqua)", marginBottom: 8 }}>Share of the storm water reaching the aquifer (%)</div>
          <HBars unit="%" max={100} rows={tiers.map((t: any) => ({ label: t.tier, value: t.to_aquifer_pct, color: "linear-gradient(90deg,#22D3EE,#3B9BF5)" }))} />
          <div className="eyebrow" style={{ color: "var(--amber)", margin: "18px 0 8px" }}>Held in dry rock above the water table (%)</div>
          <HBars unit="%" max={100} rows={tiers.map((t: any) => ({ label: t.tier, value: t.held_unsat_pct, color: "linear-gradient(90deg,#F5B041,#F08A4B)" }))} />
          <div className="eyebrow" style={{ color: "var(--green)", margin: "18px 0 8px" }}>Still inside the model after 1 year (%)</div>
          <HBars unit="%" max={Math.max(1, ...tiers.map((t: any) => t.retained_1y_pct || 0))} rows={tiers.map((t: any) => ({ label: t.tier, value: t.retained_1y_pct, color: "linear-gradient(90deg,#22C55E,#3DDC97)" }))} />
          <Source s={cb.source} />
        </Card>
        <Card title="Concept: recharge to aquifer" icon="leaf" tone="green" pad={false}>
          <div style={{ padding: "12px 14px 14px" }}><Art name="concept-recharge" className="concept" style={{ borderRadius: 14 }} /></div>
          <div className="tiny muted" style={{ padding: "0 16px 14px" }}>Tier depths as modelled (AquaTwin D-021). Illustration, not to scale.</div>
        </Card>
        <Card title="Recharge zone points" sub={`${pts.points.length} points · unvalidated`}>
          {tw.data ? <SiteMap scene={tw.data} show={{ sites: false, rz: true }} /> : <Loading />}
          <div className="tbl-wrap" style={{ marginTop: 12, maxHeight: 250, border: 0, borderRadius: 12 }}>
            <table className="tbl light"><thead><tr><th>Point</th><th>Tiers</th><th>Readings</th><th>Nearest zone · depth</th></tr></thead>
              <tbody>{pts.points.map((p: any) => <tr key={p.Site}><td><b>{p.Site}</b></td><td>{p.Tiers_found}</td><td>{p.Readings_found}</td><td>{p.Zone_nearest} · {p.Zone_depth_m} m</td></tr>)}</tbody></table>
          </div>
          <Source s={pts.source} />
        </Card>
      </div>

      {all && (
        <div className="footband">
          <span className="badge b-agree" style={{ height: 34, fontSize: 13 }}><Glyph name="check" size={16} />Key result</span>
          <div className="small" style={{ flex: 1, color: "#E3EEF5" }}>All tiers together: <b>{fmt(all.to_aquifer_pct, 1)} %</b> to the aquifer, <b>{fmt(all.retained_1y_pct, 2)} %</b> retained after 1 year; design storm {fmt(all.storm_mm, 0)} mm (single event), median over {all.sites} recharge points, {bnd === "B1_GHB" ? "open" : "closed"} boundary.</div>
          {!VIEW && <button className="btn primary" onClick={() => ask("Which recharge depth tier and which RZ points should we develop first, and what is the evidence?")}><Glyph name="spark" size={16} />Ask about recharge</button>}
        </div>
      )}

      <Card title="Ten-year aquifer response to recharge measures" sub={mf.label} icon="layers" tone="blue" style={{ marginTop: 16 }} right={segB(mbnd, setMbnd)} pad={false}>
        <div className="tbl-wrap" style={{ border: 0, marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>Scenario</th><th className="num">Runs</th><th className="num">Site recharge, 10 yr (m³)</th><th className="num">Abstraction avoided, 10 yr (m³)</th><th className="num">Drawdown at well, end (m) p10 · p50 · p90</th><th className="num">Retained vs S6 (%)</th></tr></thead>
            <tbody>{ms.map((x: any) => (
              <tr key={x.scenario}><td><b>{x.scenario}</b> <span className="small muted">{(x.scenario_text || "").replace(/^S\d /, "")}</span></td><td className="num">{x.runs}</td>
                <td className="num">{fmt(x.site_recharge_10yr_m3_p50)}</td><td className="num">{fmt(x.abstraction_avoided_10yr_m3_p50)}</td>
                <td className="num">{fmt(x.drawdown_well_end_m_p10)} · <b>{fmt(x.drawdown_well_end_m_p50)}</b> · {fmt(x.drawdown_well_end_m_p90)}</td><td className="num">{fmt(x.recharge_retained_vs_S6_pct_p50)}</td></tr>))}</tbody>
          </table>
        </div>
        <div style={{ padding: "0 20px 16px" }}>
          <div className="note" style={{ marginTop: 10 }}>These MODFLOW runs used {fmt(ms[0]?.residents_in_model)} residents and the earlier roof area; see Integrity before quoting volumes for design.</div>
          <Source s={mf.source} />
        </div>
      </Card>
    </div>
  );
}
