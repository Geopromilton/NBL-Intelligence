import React from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, unit } from "../lib/format";
import { Art, ErrorBox, Hero, Loading, Stat, useLoad } from "../components/Bits";
import { Glyph, IconBadge } from "../components/Glyphs";

const THUMB: Record<string, string> = { area: "thumb-lease", flats: "thumb-flats", residents: "thumb-people", roof: "thumb-roof", ppf: "thumb-people" };
const ICON: Record<string, [string, string]> = { reservoir: ["tank", "blue"], borewell: ["drill", "amber"], rain: ["rain", "aqua"], grade: ["shield", "green"] };

export default function Integrity() {
  const { site, ask, go } = useApp();
  const d = useLoad(() => api<any>(`/api/sites/${site}/integrity`), [site]);
  if (d.err) return <div className="page"><ErrorBox e={d.err} /></div>;
  if (!d.data) return <div className="page"><Loading /></div>;
  const c = d.data;
  const total = c.checks.length;
  return (
    <div className="page">
      <Hero art="banner-integrity" icon="shield" eyebrow="Decide" title="Integrity"
        sub="Do the site registry, NBL-AquaTwin and NBL-WaterPlan hold the same numbers? Nothing is changed automatically; each difference comes with the action to take."
        actions={<><button className="btn light" onClick={d.reload}><Glyph name="sync" size={16} />Re-check</button>
          <button className="btn primary" onClick={() => ask("Which integrity differences matter most for design, and in what order should we fix them?")}><Glyph name="spark" size={16} />Prioritise with AI</button></>} />
      <div className="grid g4">
        <Stat icon="check" tone="green" label="Agree" value={c.counts.agree} sub="same value in every source" />
        <Stat icon="warn" tone="amber" label="Differ" value={c.counts.differs} sub="needs a decision or an update" warn={c.counts.differs > 0} />
        <Stat icon="info" tone="blue" label="Notes" value={c.counts.note} sub="different basis, not a conflict" />
        <Stat icon="list" tone="teal" label="Checks run" value={total} sub={<span className="row" style={{ gap: 8 }}><span className="pbar" style={{ flex: 1, minWidth: 60 }}><i style={{ width: `${(c.counts.agree / total) * 100}%` }} /></span>{Math.round((c.counts.agree / total) * 100)} % agree</span>} />
      </div>
      {c.errors?.length > 0 && <div style={{ marginTop: 12 }}><ErrorBox e={c.errors.join("; ")} /></div>}

      <div className="grid" style={{ marginTop: 16, gap: 12 }}>
        {c.checks.map((ch: any) => (
          <section key={ch.id} className="card" style={{ padding: 14, borderLeft: `3px solid ${ch.status === "differs" ? "#F5B041" : ch.status === "agree" ? "#3DDC97" : "#3B9BF5"}` }}>
            <div className="grid" style={{ gridTemplateColumns: "92px minmax(0,1fr) minmax(0,2.4fr) minmax(0,1.5fr)", gap: 16, alignItems: "center" }}>
              {THUMB[ch.id] ? <Art name={THUMB[ch.id]} style={{ width: 92, height: 72, objectFit: "cover", borderRadius: 12 }} />
                : <div style={{ display: "grid", placeItems: "center", height: 72 }}><IconBadge name={(ICON[ch.id] || ["info"])[0]} tone={(ICON[ch.id] || ["", "slate"])[1]} size={52} /></div>}
              <div>
                <div style={{ font: "700 16px var(--display)", color: "#fff" }}>{ch.title}</div>
                <span className={`badge b-${ch.status}`} style={{ marginTop: 6 }}>{ch.status === "differs" ? "Differs" : ch.status === "agree" ? "Agree" : "Note"}</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${ch.values.length}, minmax(0,1fr))`, gap: 10 }}>
                {ch.values.map((v: any) => (
                  <div key={v.source} className={`tile ${ch.status === "differs" ? "differs" : ""}`} style={{ padding: "10px 12px" }}>
                    <div className="t-src" style={{ fontSize: 11 }}>{v.source}</div>
                    <div className="t-val" style={{ fontSize: typeof v.value === "string" ? 15 : 22 }}>{typeof v.value === "number" ? fmt(v.value, v.value % 1 && v.value < 1000 ? 1 : 0) : v.value}<small>{unit(v.unit)}</small></div>
                  </div>))}
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Action</div>
                <div className="small">{ch.action}</div>
                {ch.detail && <div className="tiny muted" style={{ marginTop: 6 }}>{ch.detail}</div>}
                {ch.status === "differs" && <button className="btn" style={{ marginTop: 8, height: 30 }} onClick={() => go("decisions")}><Glyph name="gavel" size={14} />Record a decision</button>}
              </div>
            </div>
          </section>))}
      </div>
    </div>
  );
}
