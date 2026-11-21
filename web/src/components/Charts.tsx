import React, { useMemo, useRef, useState } from "react";
import { fmt } from "../lib/format";

export interface Series { name: string; values: number[]; color: string; }

/** Multi-series line chart over dates, with hover read-out. */
export function LineChart({ dates, series, height = 260, yLabel }: { dates: string[]; series: Series[]; height?: number; yLabel?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = height, L = 58, R = 16, T = 14, B = 30;
  const n = dates.length;
  const max = useMemo(() => Math.max(1, ...series.flatMap(s => s.values)), [series]);
  const niceMax = useMemo(() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; }, [max]);
  const x = (i: number) => L + (i / Math.max(n - 1, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / niceMax) * (H - T - B);
  const years = useMemo(() => {
    const out: { i: number; y: string }[] = []; let last = "";
    dates.forEach((d, i) => { const yy = d.slice(0, 4); if (yy !== last) { out.push({ i, y: yy }); last = yy; } });
    return out;
  }, [dates]);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, .25, .5, .75, 1].map(f => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--line)" />
            <text x={L - 8} y={y(niceMax * f) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{fmt(niceMax * f)}</text>
          </g>
        ))}
        {years.map(t => <text key={t.i} x={x(t.i)} y={H - 10} fontSize="11" fill="var(--ink-3)">{t.y}</text>)}
        {yLabel && <text x={12} y={T + (H - T - B) / 2} fontSize="11" fill="var(--ink-3)" transform={`rotate(-90 12 ${T + (H - T - B) / 2})`} textAnchor="middle">{yLabel}</text>}
        {series.map(s => {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth="1.6" />;
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && (
        <div style={{ position: "absolute", top: 8, left: `${Math.min(70, (x(hover) / W) * 100)}%`, background: "var(--plane)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", fontSize: 12, boxShadow: "var(--shadow)", pointerEvents: "none" }}>
          <b>{dates[hover]}</b>
          {series.map(s => <div key={s.name} className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: s.color, width: 8, height: 8 }} />{s.name}: <b>{fmt(s.values[hover])}</b></div>)}
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>{series.map(s => <span key={s.name}><i className="swatch" style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}

/** Horizontal bars, each row label + value. */
export function HBars({ rows, unit, max, color = "var(--aqua)" }: { rows: { label: string; value: number; sub?: string; color?: string }[]; unit?: string; max?: number; color?: string }) {
  const m = max ?? Math.max(1e-9, ...rows.map(r => Math.abs(r.value || 0)));
  return (
    <div className="grid" style={{ gap: 10 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div className="row between small"><span>{r.label}{r.sub && <span className="muted tiny"> · {r.sub}</span>}</span><b>{fmt(r.value)}{unit ? ` ${unit}` : ""}</b></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, (Math.abs(r.value || 0) / m) * 100))}%`, background: r.color || color }} /></div>
        </div>
      ))}
    </div>
  );
}

/** One stacked bar of shares (0-1). */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", background: "var(--bg-2)" }}>
        {parts.map(p => <div key={p.label} title={`${p.label} ${(p.value / total * 100).toFixed(1)} %`} style={{ width: `${p.value / total * 100}%`, background: p.color }} />)}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {parts.map(p => <span key={p.label}><i className="swatch" style={{ background: p.color }} />{p.label} <b>{(p.value / total * 100).toFixed(0)} %</b></span>)}
      </div>
    </div>
  );
}

/** Small annual bars (e.g. rain per year). */
export function YearBars({ data, unit, ref1 }: { data: { year: string; value: number }[]; unit?: string; ref1?: { value: number; label: string } }) {
  const W = 900, H = 170, L = 44, B = 24, T = 10;
  const max = Math.max(...data.map(d => d.value), ref1?.value || 0) * 1.1 || 1;
  const bw = (W - L - 10) / data.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {[0, .5, 1].map(f => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" /><text x={L - 6} y={y(max * f) + 4} fontSize="11" textAnchor="end" fill="var(--ink-3)">{fmt(max * f)}</text></g>)}
      {data.map((d, i) => (
        <g key={d.year}>
          <rect x={L + i * bw + bw * .18} y={y(d.value)} width={bw * .64} height={H - B - y(d.value)} rx="4" fill={ref1 && d.value < ref1.value ? "var(--laterite)" : "var(--water)"} opacity=".85"><title>{`${d.year}: ${fmt(d.value)} ${unit || ""}`}</title></rect>
          <text x={L + i * bw + bw / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--ink-3)">{d.year}</text>
        </g>
      ))}
      {ref1 && <g><line x1={L} x2={W} y1={y(ref1.value)} y2={y(ref1.value)} stroke="var(--ink-2)" strokeDasharray="5 4" /><text x={W - 4} y={y(ref1.value) - 5} textAnchor="end" fontSize="11" fill="var(--ink-2)">{ref1.label}</text></g>}
    </svg>
  );
}
