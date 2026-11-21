import React, { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Card, ErrorBox, Loading, Source, Stamp, useLoad } from "../components/Bits";
import { HBars } from "../components/Charts";
import SiteMap from "../components/SiteMap";
import { I } from "../components/Icons";

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
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Water cycle · 3 Regenerate</div><h1>Recharge</h1>
          <p>Where and at what depth cloudburst water can be stored, and what roof-water recharge does to the aquifer over ten years. Results from NBL-AquaTwin MODFLOW runs; untested until borehole and aquifer-test data.</p></div>
        <div className="actions"><button className="btn" onClick={() => ask("Which recharge depth tier and which RZ points should we develop first, and what is the evidence?")}><I.spark size={15} />Ask about recharge</button></div>
      </div>
      <Stamp text={cb.stamp || mf.stamp || ""} />
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Cloudburst storage by depth tier" sub={cb.label} right={<div className="seg">{[["B1_GHB", "Open boundary"], ["B2_closed", "Closed"]].map(([k, l]) => <button key={k} className={bnd === k ? "on" : ""} onClick={() => setBnd(k)}>{l}</button>)}</div>}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Share of the storm water reaching the aquifer (%)</div>
          <HBars unit="%" max={100} rows={tiers.map((t: any) => ({ label: t.tier, value: t.to_aquifer_pct, color: "var(--water)" }))} />
          <div className="eyebrow" style={{ margin: "16px 0 8px" }}>Held in dry rock above the water table (%)</div>
          <HBars unit="%" max={100} rows={tiers.map((t: any) => ({ label: t.tier, value: t.held_unsat_pct, color: "var(--amber)" }))} />
          <div className="eyebrow" style={{ margin: "16px 0 8px" }}>Still inside the model after 1 year (%)</div>
          <HBars unit="%" max={Math.max(1, ...tiers.map((t: any) => t.retained_1y_pct || 0))} rows={tiers.map((t: any) => ({ label: t.tier, value: t.retained_1y_pct, color: "var(--leaf)" }))} />
          {all && <div className="note" style={{ marginTop: 14 }}>All tiers together: {fmt(all.to_aquifer_pct)} % to aquifer, {fmt(all.retained_1y_pct)} % retained after 1 year, design storm {fmt(all.storm_mm)} mm (single event), median over {all.sites} recharge points.</div>}
          <Source s={cb.source} />
        </Card>
        <Card title="Recharge zone points" sub={`${pts.points.length} points · unvalidated`}>
          {tw.data ? <SiteMap scene={tw.data} show={{ sites: false, rz: true }} /> : <Loading />}
          <div className="tbl-wrap" style={{ marginTop: 12, maxHeight: 230 }}>
            <table className="tbl"><thead><tr><th>Point</th><th>Tiers</th><th>Readings</th><th>Nearest zone · depth</th></tr></thead>
              <tbody>{pts.points.map((p: any) => <tr key={p.Site}><td><b>{p.Site}</b></td><td>{p.Tiers_found}</td><td>{p.Readings_found}</td><td className="small">{p.Zone_nearest} · {p.Zone_depth_m} m</td></tr>)}</tbody></table>
          </div>
          <Source s={pts.source} />
        </Card>
      </div>
      <Card title="Ten-year aquifer response to recharge measures" sub={mf.label} style={{ marginTop: 16 }} right={<div className="seg">{[["B1_GHB", "Open boundary"], ["B2_closed", "Closed"]].map(([k, l]) => <button key={k} className={mbnd === k ? "on" : ""} onClick={() => setMbnd(k)}>{l}</button>)}</div>} pad={false}>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table className="tbl">
            <thead><tr><th>Scenario</th><th className="num">Runs</th><th className="num">Site recharge, 10 yr (m³)</th><th className="num">Abstraction avoided, 10 yr (m³)</th><th className="num">Drawdown at well, end (m) p10 · p50 · p90</th><th className="num">Recharge retained vs S6 (%)</th></tr></thead>
            <tbody>{ms.map((x: any) => (
              <tr key={x.scenario}><td><b>{x.scenario}</b> <span className="small muted">{(x.scenario_text || "").replace(/^S\d /, "")}</span></td><td className="num">{x.runs}</td>
                <td className="num">{fmt(x.site_recharge_10yr_m3_p50)}</td><td className="num">{fmt(x.abstraction_avoided_10yr_m3_p50)}</td>
                <td className="num">{fmt(x.drawdown_well_end_m_p10)} · <b>{fmt(x.drawdown_well_end_m_p50)}</b> · {fmt(x.drawdown_well_end_m_p90)}</td><td className="num">{fmt(x.recharge_retained_vs_S6_pct_p50)}</td></tr>))}</tbody>
          </table>
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <div className="note" style={{ marginTop: 10 }}>These MODFLOW runs used {fmt(ms[0]?.residents_in_model)} residents and the earlier roof area; see Integrity before quoting volumes for design.</div>
          <Source s={mf.source} />
        </div>
      </Card>
    </div>
  );
}
