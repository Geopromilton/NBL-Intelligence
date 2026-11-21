import React, { useEffect, useRef, useState } from "react";
import { api, BASE, VIEW } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt, unit } from "../lib/format";
import { Card, ErrorBox, Kpi, Loading, Prov, useLoad } from "../components/Bits";
import { LineChart, StackBar, YearBars } from "../components/Charts";
import { I } from "../components/Icons";

export default function Plan() {
  const { site, ask, toast } = useApp();
  const defs = useLoad(() => api<any>(`/api/sites/${site}/plan/defaults`), [site]);
  const [inp, setInp] = useState<any>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [name, setName] = useState("");
  const timer = useRef<any>(null);

  useEffect(() => {
    if (defs.data && !inp) {
      const p = defs.data.plan;
      setInp({ rain_case: "expected", rain_mm_per_year: null, persons_per_flat: p.persons_per_flat, flats: p.flats, years: p.years,
        litres_per_person_day: p.litres_per_person_day, years_to_full_occupancy: p.years_to_full_occupancy, reservoir_m3: p.reservoir_m3,
        borewell_m3_per_day: p.borewell_m3_per_day, ro_recovery: p.ro_recovery, treated_tank_m3: p.treated_tank_m3 });
    }
  }, [defs.data]);

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
      if (save) toast(`Saved as ${r.run_id}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  useEffect(() => { if (inp) { clearTimeout(timer.current); timer.current = setTimeout(() => run(false), 350); } }, [inp]);

  if (defs.err) return <div className="page"><ErrorBox e={defs.err} /></div>;
  if (!inp) return <div className="page"><Loading /></div>;
  const set = (k: string, v: any) => setInp({ ...inp, [k]: v });
  const rain = defs.data.rain;
  const k = (n: string) => res?.kpis?.find((x: any) => x.name === n);
  const years = res ? Object.entries(res.rain?.annual_mm || {}).map(([y, v]) => ({ year: y, value: v as number })) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Water cycle · 2 Utilise & reuse</div><h1>Water plan</h1>
          <p>Daily closed-loop balance from NBL-WaterPlan. Change any input; the plan re-runs in about a second. One water standard: every source is filtered or RO-treated before use.</p></div>
        <div className="actions">
          {!VIEW && <button className="btn" onClick={() => ask(`Explain this water plan: ${inp.persons_per_flat} persons per flat, ${inp.flats} flats, ${inp.rain_case} rain. Is net zero discharge achieved and what is the weakest point?`)}><I.spark size={15} />Explain with AI</button>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "310px minmax(0,1fr)", alignItems: "start" }}>
        <Card title="Scenario inputs" sub="Real quantities, not multipliers">
          <div className="field"><label>Rain case</label>
            <div className="seg">{["dry", "expected", "wet"].map(c => <button key={c} className={inp.rain_case === c && !inp.rain_mm_per_year ? "on" : ""} onClick={() => setInp({ ...inp, rain_case: c, rain_mm_per_year: null })}>{c[0].toUpperCase() + c.slice(1)}</button>)}</div>
            <span className="hint">Means for {rain.start_year}-{rain.start_year + rain.years - 1}: dry {fmt(rain.mean_mm_by_case.dry)} · expected {fmt(rain.mean_mm_by_case.expected)} · wet {fmt(rain.mean_mm_by_case.wet)} mm/yr (IMD record {rain.record.first_year}-{rain.record.last_year})</span>
          </div>
          {VIEW && <div className="note small" style={{ marginBottom: 12 }}>Public view: rain case and persons per flat use prepared WaterPlan runs (141 flats, design values). All inputs are adjustable in the desktop app.</div>}
          <fieldset disabled={VIEW} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>
          <div className="field"><label>Fixed rain (optional) <b>{inp.rain_mm_per_year ? `${inp.rain_mm_per_year} mm/yr` : "off"}</b></label>
            <input type="range" min={300} max={1500} step={10} value={inp.rain_mm_per_year || rain.mean_mm_by_case.expected} onChange={e => set("rain_mm_per_year", +e.target.value)} /></div>
          </fieldset>
          <div className="field"><label>Persons per flat <b>{inp.persons_per_flat}</b></label>
            <input type="range" min={2} max={6} step={1} value={inp.persons_per_flat} onChange={e => set("persons_per_flat", +e.target.value)} />
            <span className="hint">Adjustable 2-6 · design value 4</span></div>
          <fieldset disabled={VIEW} style={{ border: 0, padding: 0, margin: 0, display: "contents" }}>
          <div className="field"><label>Flats <b>{inp.flats}</b></label>
            <input type="range" min={60} max={200} step={1} value={inp.flats} onChange={e => set("flats", +e.target.value)} />
            <span className="hint">Planning 141 · architect statement 144</span></div>
          <div className="field"><label>Water use <b>{inp.litres_per_person_day} L/person/day</b></label>
            <input type="range" min={70} max={200} step={5} value={inp.litres_per_person_day} onChange={e => set("litres_per_person_day", +e.target.value)} /></div>
          <div className="field"><label>Years to full occupancy <b>{inp.years_to_full_occupancy}</b></label>
            <input type="range" min={1} max={10} step={1} value={inp.years_to_full_occupancy} onChange={e => set("years_to_full_occupancy", +e.target.value)} /></div>
          <div className="field"><label>Borewell capacity <b>{fmt(inp.borewell_m3_per_day)} m³/day</b></label>
            <input type="range" min={0} max={260} step={4.3} value={inp.borewell_m3_per_day} onChange={e => set("borewell_m3_per_day", +e.target.value)} />
            <span className="hint">Placeholder P3 until the pumping test</span></div>
          <div className="field"><label>Reservoir (closed) <b>{fmt(inp.reservoir_m3)} m³</b></label>
            <input type="range" min={1000} max={12000} step={250} value={inp.reservoir_m3} onChange={e => set("reservoir_m3", +e.target.value)} /></div>
          <div className="field"><label>RO recovery <b>{Math.round(inp.ro_recovery * 100)} %</b></label>
            <input type="range" min={0.5} max={0.9} step={0.01} value={inp.ro_recovery} onChange={e => set("ro_recovery", +e.target.value)} /></div>
          <div className="field"><label>Planning period <b>{inp.years} years</b></label>
            <input type="range" min={1} max={30} step={1} value={inp.years} onChange={e => set("years", +e.target.value)} /></div>
          </fieldset>
          {!VIEW && <>
          <div className="hr" />
          <input className="input" placeholder="Scenario name" value={name} onChange={e => setName(e.target.value)} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={busy} onClick={() => run(true, name || `${inp.rain_case} rain, ${inp.persons_per_flat} persons/flat`)}><I.download size={15} />Save scenario</button>
            {busy && <div className="spinner" />}
          </div>
          </>}
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          {err && <ErrorBox e={err} />}
          {!res && <Loading text="Running WaterPlan" />}
          {res && <>
            <div className="grid g4">
              <Kpi label="Net zero discharge" value={res.net_zero_discharge ? "Yes" : "No"} tag={`water leaving the lease ${fmt(res.totals_m3.spill)} m³ over ${inp.years} yr`} accent={res.net_zero_discharge ? "var(--leaf)" : "var(--danger)"} prov="calculated" />
              <Kpi label="Reliability" value={fmt(res.metrics.reliability * 100, 1)} u="%" tag="of days fully supplied · over the run" prov="calculated" accent="var(--water)" />
              <Kpi label="Average demand" value={k("Average demand")?.value} u="m3/day" tag="per day · averaged over build-up" prov="calculated" />
              <Kpi label="Tanker: RO concentrate" value={k("RO concentrate to tanker, average")?.value} u="m3/day" tag="per day · averaged · removed by treatment" prov="calculated" accent="var(--laterite)" />
            </div>
            <Card title="Where the water comes from" sub="Share of supply over the run, all after treatment">
              <StackBar parts={[{ label: "Rainwater", value: res.supply_shares.rain || 0, color: "var(--aqua)" }, { label: "Treated wastewater reused", value: res.supply_shares.reuse || 0, color: "var(--water)" }, { label: "Borewell", value: res.supply_shares.borewell || 0, color: "var(--violet)" }]} />
              <div className="small muted" style={{ marginTop: 8 }}>{fmt(res.people_full_occupancy)} people at full occupancy · {res.rain_case}</div>
            </Card>
            <Card title="Storage through the planning period" sub="Daily, every third day shown · m³">
              <LineChart dates={res.daily.date} yLabel="m³" series={[
                { name: "Reservoir (closed)", values: res.daily.reservoir_storage_m3, color: "#1677B8" },
                { name: "Roof chambers", values: res.daily.roof_storage_m3, color: "#14A3B8" },
                { name: "Treated-water tank", values: res.daily.treated_storage_m3, color: "#C4622D" }]} />
            </Card>
            <div className="grid g2">
              <Card title="Rain drawn for this plan" sub={`mm per year · mean ${fmt(res.rain?.mean_mm_per_year)} mm/yr`}>
                <YearBars data={years} unit="mm" ref1={{ value: rain.record.mean_mm, label: `record mean ${fmt(rain.record.mean_mm)} mm` }} />
                <div className="tiny muted">Years are drawn from the IMD record ({(res.rain?.drawn_record_years || []).join(", ")}). Orange bars are below the record mean.</div>
              </Card>
              <Card title="Totals with labels" pad={false}>
                <div style={{ maxHeight: 360, overflow: "auto" }}>
                  <table className="tbl"><thead><tr><th>Item</th><th className="num">Value</th><th>Period · case</th></tr></thead>
                    <tbody>{res.kpis.map((x: any) => (
                      <tr key={x.name}><td>{x.name}<div><Prov p={x.provenance} /></div></td><td className="num"><b>{fmt(x.value)}</b> {unit(x.unit)}</td>
                        <td className="small muted">{x.period}{x.treatment ? ` · ${x.treatment}` : ""}</td></tr>))}</tbody></table>
                </div>
              </Card>
            </div>
            <div className="tiny muted">Source: {res.source} · {res.standard}. Rain case: {res.rain_case}.</div>
          </>}
        </div>
      </div>
    </div>
  );
}
