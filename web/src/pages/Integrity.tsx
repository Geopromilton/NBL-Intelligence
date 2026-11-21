import React from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, unit } from "../lib/format";
import { Card, ErrorBox, Kpi, Loading, useLoad } from "../components/Bits";
import { I } from "../components/Icons";

export default function Integrity() {
  const { site, ask } = useApp();
  const d = useLoad(() => api<any>(`/api/sites/${site}/integrity`), [site]);
  if (d.err) return <div className="page"><ErrorBox e={d.err} /></div>;
  if (!d.data) return <div className="page"><Loading /></div>;
  const c = d.data;
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Decide</div><h1>Integrity</h1>
          <p>Do the site registry, NBL-AquaTwin and NBL-WaterPlan hold the same numbers? Nothing is changed automatically; each difference comes with the action to take.</p></div>
        <div className="actions"><button className="btn" onClick={d.reload}><I.refresh size={15} />Re-check</button>
          <button className="btn" onClick={() => ask("Which integrity differences matter most for design, and in what order should we fix them?")}><I.spark size={15} />Prioritise with AI</button></div>
      </div>
      <div className="grid g3">
        <Kpi label="Agree" value={c.counts.agree} accent="var(--leaf)" tag="same value in every source" />
        <Kpi label="Differ" value={c.counts.differs} accent="var(--laterite)" tag="needs a decision or an update" />
        <Kpi label="Notes" value={c.counts.note} accent="var(--water)" tag="different basis, not a conflict" />
      </div>
      {c.errors?.length > 0 && <div style={{ marginTop: 12 }}><ErrorBox e={c.errors.join("; ")} /></div>}
      <div className="grid" style={{ marginTop: 16, gap: 12 }}>
        {c.checks.map((ch: any) => (
          <Card key={ch.id} title={<span className="row">{ch.title}<span className={`badge b-${ch.status}`}>{ch.status}</span></span>}>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${ch.values.length}, minmax(0,1fr)) 1.4fr`, gap: 12, alignItems: "start" }}>
              {ch.values.map((v: any) => (
                <div key={v.source} style={{ padding: 12, borderRadius: 12, background: "var(--plane-2)", border: "1px solid var(--line)" }}>
                  <div className="tiny muted">{v.source}</div>
                  <div style={{ font: "600 22px var(--display)", marginTop: 4 }}>{fmt(v.value)} <small className="muted" style={{ fontSize: 12 }}>{unit(v.unit)}</small></div>
                </div>))}
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Action</div>
                <div className="small">{ch.action}</div>
                {ch.detail && <div className="tiny muted" style={{ marginTop: 6 }}>{ch.detail}</div>}
              </div>
            </div>
          </Card>))}
      </div>
    </div>
  );
}
