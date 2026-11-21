import React, { useEffect, useRef, useState } from "react";
import { api, BASE, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, unit } from "../lib/format";
import { Art, Card, ErrorBox, Hero, Loading, Prov, Stat, useLoad } from "../components/Bits";
import { LineChart, StackBar, YearBars } from "../components/Charts";
import { Glyph, IconBadge } from "../components/Glyphs";

export default function Plan() {
  const { site, ask, toast, go } = useApp();
  const defs = useLoad(() => api<any>(`/api/sites/${site}/plan/defaults`), [site]);
  const [inp, setInp] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [name, setName] = useState("");
  const timer = useRef<any>(null);

  const reset = () => {
    const p = defs.data.plan;
    setInp({ rain_case: "expected", rain_mm_per_year: null, persons_per_flat: p.persons_per_flat, flats: p.flats, years: p.years,
      litres_per_person_day: p.litres_per_person_day, years_to_full_occupancy: p.years_to_full_occupancy, reservoir_m3: p.reservoir_m3,
      borewell_m3_per_day: p.borewell_m3_per_day, ro_recovery: p.ro_recovery, treated_tank_m3: p.treated_tank_m3 });
  };
  useEffect(() => { if (defs.data && !inp) reset(); }, [defs.data]);

  async function run(save = false, label?: string) {
    if (!inp) return;
    setBusy(true); setErr(null);
    try {
      if (VIEW) {
        const r = await fetch(`${BASE}snapshot/sites/${site}/plangrid/${inp.persons_per_flat}_${inp.rain_case}.json`).then(x => x.json());
        setRes(r); return;
      }
      const r = await api<any>(`/api/sites/${site}/plan/run`, { json: { ...inp, name: label || "Preview", save } });
      setRes(r);
      if (save) toast(`Saved as ${r.run_id} - see Scenarios`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  useEffect(() => { if (inp) { clearTimeout(timer.current); timer.current = setTimeout(() => run(false), 300); } }, [inp]);

  if (defs.err) return <div className="page"><ErrorBox e={defs.err} /></div>;
  if (!inp) return <div className="page"><Loading /></div>;
  const set = (k: string, v: any) => setInp({ ...inp, [k]: v });
  const rain = defs.data.rain;
  const k = (n: string) => res?.kpis?.find((x: any) => x.name === n);
  const years = res ? Object.entries(res.rain?.annual_mm || {}).map(([y, v]) => ({ year: y, value: v as number })) : [];
  const dis = VIEW;
  const Row = ({ icon, label, value, children, hint }: { icon: string; label: string; value: React.ReactNode; children?: React.ReactNode; hint?: string }) => (
    <div className="field" style={{ marginBottom: 10 }}>
      <label><span className="row" style={{ gap: 8 }}><Glyph name={icon} size={16} color="#9FD8EA" />{label}</span><b>{value}</b></label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <div className="page">
      <Hero art="banner-plan" icon="leaf" eyebrow="Water cycle • 2 Utilise & reuse" title="Water" accent="Plan"
        sub="Daily closed-loop balance from NBL-WaterPlan. One water standard: every source is filtered or RO-treated before use."
        actions={!VIEW && <button className="btn light" onClick={() => ask(`Explain this water plan: ${inp.persons_per_flat} persons per flat, ${inp.flats} flats, ${inp.rain_case} rain. Is net zero discharge achieved and what is the weakest point?`)}><Glyph name="spark" size={16} />Explain with AI</button>} />

      {res && (
        <div className="grid g5" style={{ marginBottom: 16 }}>
          <Stat icon="people" tone="blue" label="People at full occupancy" value={res.people_full_occupancy} sub={`${fmt(inp.flats)} flats × ${inp.persons_per_flat} persons`} prov="assumption" />
          <Stat icon="check" tone="green" label="Net zero discharge" value={res.net_zero_discharge ? "Yes" : "No"} sub={`Water leaving the lease: ${fmt(res.totals_m3.spill)} m³ over ${inp.years} yr`} />
          <Stat icon="shield" tone="teal" label="Reliability" value={fmt(res.metrics.reliability * 100, 1)} u="%" sub={`Days fully supplied, over ${inp.years} years`} />
          <Stat icon="trend" tone="aqua" label="Average demand" value={k("Average demand")?.value} u="m3/day" sub="Per day, averaged over the build-up" />
          <Stat icon="tank" tone="blue" label="Tanker: RO concentrate" value={k("RO concentrate to tanker, average")?.value} u="m3/day" sub="Per day, averaged · leaves the lease" />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "330px minmax(0,1fr)", alignItems: "start" }}>
        <Card title="Scenario inputs" icon="gear" tone="blue" right={!VIEW && <button className="btn" style={{ height: 32 }} onClick={reset}><Glyph name="sync" size={14} />Reset</button>}>
          {VIEW && <div className="note" style={{ marginBottom: 12 }}>Public view: rain case and persons per flat use prepared WaterPlan runs. All inputs are adjustable in the desktop app.</div>}
          <div className="field"><label>Rain case</label>
            <div className="seg" style={{ width: "100%" }}>{[["dry", "Dry"], ["expected", "Expected"], ["wet", "Wet"]].map(([c, l]) => <button key={c} style={{ flex: 1, justifyContent: "center" }} className={inp.rain_case === c && !inp.rain_mm_per_year ? "on" : ""} onClick={() => setInp({ ...inp, rain_case: c, rain_mm_per_year: null })}>{l}</button>)}</div>
            <span className="hint">{rain.start_year}-{rain.start_year + rain.years - 1} means: dry {fmt(rain.mean_mm_by_case.dry)} · expected {fmt(rain.mean_mm_by_case.expected)} · wet {fmt(rain.mean_mm_by_case.wet)} mm/yr</span>
          </div>
          <fieldset disabled={dis} style={{ border: 0, padding: 0, margin: 0 }}>
            <Row icon="rain" label="Fixed rain (optional)" value={inp.rain_mm_per_year ? `${inp.rain_mm_per_year} mm/yr` : "off"}>
              <input type="range" min={300} max={1500} step={10} value={inp.rain_mm_per_year || rain.mean_mm_by_case.expected} onChange={e => set("rain_mm_per_year", +e.target.value)} />
            </Row>
          </fieldset>
          <Row icon="people" label="Persons per flat" value={inp.persons_per_flat} hint="Adjustable 2-6 · design value 4">
            <input type="range" min={2} max={6} step={1} value={inp.persons_per_flat} onChange={e => set("persons_per_flat", +e.target.value)} />
          </Row>
          <fieldset disabled={dis} style={{ border: 0, padding: 0, margin: 0 }}>
            <Row icon="building" label="Flats" value={inp.flats} hint="Planning 141 · architect statement 144">
              <input type="range" min={60} max={200} step={1} value={inp.flats} onChange={e => set("flats", +e.target.value)} />
            </Row>
            <Row icon="drop" label="Water use" value={`${inp.litres_per_person_day} L/person/day`}>
              <input type="range" min={70} max={200} step={5} value={inp.litres_per_person_day} onChange={e => set("litres_per_person_day", +e.target.value)} />
            </Row>
            <Row icon="calendar" label="Years to full occupancy" value={inp.years_to_full_occupancy}>
              <input type="range" min={1} max={10} step={1} value={inp.years_to_full_occupancy} onChange={e => set("years_to_full_occupancy", +e.target.value)} />
            </Row>
            <Row icon="drill" label="Borewell capacity" value={`${fmt(inp.borewell_m3_per_day)} m³/day`} hint="Placeholder P3 until the pumping test">
              <input type="range" min={0} max={260} step={4.3} value={inp.borewell_m3_per_day} onChange={e => set("borewell_m3_per_day", +e.target.value)} />
            </Row>
            <Row icon="tank" label="Reservoir (closed)" value={`${fmt(inp.reservoir_m3)} m³`}>
              <input type="range" min={1000} max={12000} step={250} value={inp.reservoir_m3} onChange={e => set("reservoir_m3", +e.target.value)} />
            </Row>
            <Row icon="recycle" label="RO recovery" value={`${Math.round(inp.ro_recovery * 100)} %`}>
              <input type="range" min={0.5} max={0.9} step={0.01} value={inp.ro_recovery} onChange={e => set("ro_recovery", +e.target.value)} />
            </Row>
            <Row icon="calendar" label="Planning period" value={`${inp.years} years`}>
              <input type="range" min={1} max={30} step={1} value={inp.years} onChange={e => set("years", +e.target.value)} />
            </Row>
          </fieldset>
          {!VIEW && <>
            <input className="input" style={{ marginTop: 6 }} placeholder="Scenario name (optional)" value={name} onChange={e => setName(e.target.value)} />
            <button className="btn blue lg" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={() => run(true, name || `${inp.rain_case} rain, ${inp.persons_per_flat} persons/flat`)}>
              {busy ? <div className="spinner" /> : <Glyph name="trend" size={18} />}Run and save this plan
            </button>
            <div className="hint" style={{ marginTop: 6, textAlign: "center" }}>Results update live; saving keeps a fingerprinted run for Scenarios.</div>
          </>}
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          {err && <ErrorBox e={err} />}
          {!res && <Loading text="Running WaterPlan" />}
          {res && <>
            <Card title="Where the water comes from" sub="Share of supply over the run, all after treatment" icon="trend" tone="blue">
              <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 220px", gap: 18, alignItems: "center" }}>
                <div>
                  <StackBar parts={[{ label: "Rainwater", value: res.supply_shares.rain || 0, color: "#22D3EE" }, { label: "Treated wastewater reused", value: res.supply_shares.reuse || 0, color: "#3B9BF5" }, { label: "Borewell", value: res.supply_shares.borewell || 0, color: "#A78BFA" }]} />
                  <div className="row small" style={{ marginTop: 10, color: "var(--ink-2)" }}><Glyph name="people" size={16} color="#9FD8EA" />{fmt(res.people_full_occupancy)} people at full occupancy · {res.rain_case}</div>
                </div>
                <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
                  <Art name="photo-tank" style={{ height: 120, objectFit: "cover" }} />
                  <div style={{ position: "absolute", right: 8, bottom: 8, background: "#F2FBF6", color: "#0B3A26", borderRadius: 12, padding: "4px 10px", textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>
                    <b style={{ font: "700 20px var(--display)", display: "block" }}>{Math.round((res.supply_shares.rain || 0) * 100)}%</b><span style={{ fontSize: 11 }}>Rainwater</span>
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Storage through the planning period" sub="Daily, every third day shown · m³" icon="tank" tone="aqua">
              <LineChart dates={res.daily.date} yLabel="m³" series={[
                { name: "Reservoir (closed)", values: res.daily.reservoir_storage_m3, color: "#3B9BF5" },
                { name: "Roof chambers", values: res.daily.roof_storage_m3, color: "#3DDC97" },
                { name: "Treated-water tank", values: res.daily.treated_storage_m3, color: "#F5A623" }]} />
            </Card>
            <div className="grid g2">
              <Card title="Rain drawn for this plan" sub={`mm per year · mean ${fmt(res.rain?.mean_mm_per_year)} mm/yr`} icon="rain" tone="blue">
                <YearBars data={years} unit="mm" ref1={{ value: rain.record.mean_mm, label: `record mean ${fmt(rain.record.mean_mm)} mm` }} />
                <div className="tiny muted">Years drawn from the IMD record ({(res.rain?.drawn_record_years || []).join(", ")}). Orange bars are below the record mean.</div>
              </Card>
              <Card title="Totals with labels" icon="list" tone="teal" pad={false}>
                <div style={{ maxHeight: 330, overflow: "auto", padding: "8px 0" }}>
                  <table className="tbl"><thead><tr><th>Item</th><th className="num">Value</th><th>Period</th></tr></thead>
                    <tbody>{res.kpis.map((x: any) => (
                      <tr key={x.name}><td>{x.name}<div><Prov p={x.provenance} /></div></td><td className="num"><b>{fmt(x.value)}</b> {unit(x.unit)}</td>
                        <td className="small muted">{x.period}{x.treatment ? ` · ${x.treatment}` : ""}</td></tr>))}</tbody></table>
                </div>
              </Card>
            </div>
            <div className="footband">
              <div className="fb"><IconBadge name="drop" tone="green" size={40} /><div><b>Water security</b>{fmt(res.metrics.reliability * 100, 1)} % reliability</div></div>
              <div className="fb"><IconBadge name="recycle" tone="aqua" size={40} /><div><b>Resource efficiency</b>{Math.round(inp.ro_recovery * 100)} % RO recovery</div></div>
              <div className="fb" style={{ borderRight: 0 }}><IconBadge name="leaf" tone="green" size={40} /><div><b>Net zero discharge</b>{res.net_zero_discharge ? "Achieved over the run" : "Not achieved"}</div></div>
              {!VIEW && <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => go("reports")}><Glyph name="doc" size={16} />Generate report</button>}
            </div>
            <div className="tiny muted">Source: {res.source} · {res.standard}. Rain case: {res.rain_case}.</div>
          </>}
        </div>
      </div>
    </div>
  );
}
