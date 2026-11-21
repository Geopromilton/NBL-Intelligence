import React from "react";
import { fmt, unit } from "../lib/format";

export const PROV_TEXT: Record<string, string> = {
  measured: "Measured", imported: "Source document", calculated: "Calculated", forecast: "Forecast",
  assumption: "Assumption", placeholder: "Placeholder", ai_interpretation: "AI interpretation",
};
export function Prov({ p }: { p?: string }) {
  if (!p) return null;
  return <span className={`prov ${p}`} title={PROV_TEXT[p] || p}><i />{PROV_TEXT[p] || p}</span>;
}
export function Kpi({ label, value, u, tag, accent, prov }: { label: string; value: any; u?: string; tag?: React.ReactNode; accent?: string; prov?: string }) {
  return (
    <div className="kpi" style={{ ["--accent" as any]: accent }}>
      <div className="k-label">{label}</div>
      <div className="k-value">{typeof value === "number" ? fmt(value) : value}{u && <small>{unit(u)}</small>}</div>
      {(tag || prov) && <div className="k-tag">{prov && <Prov p={prov} />}{tag}</div>}
    </div>
  );
}
export function Card({ title, sub, right, children, pad = true, style }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; pad?: boolean; style?: React.CSSProperties }) {
  return (
    <section className="card" style={style}>
      {(title || right) && <div className="card-h"><div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div><div className="right">{right}</div></div>}
      <div className={pad ? "card-b" : ""}>{children}</div>
    </section>
  );
}
export function Source({ s }: { s?: string }) {
  if (!s) return null;
  return <div className="tiny muted" style={{ marginTop: 8 }}>Source: {s}</div>;
}
export function Loading({ text = "Loading" }: { text?: string }) {
  return <div className="empty"><div className="row" style={{ justifyContent: "center" }}><div className="spinner" />{text}</div></div>;
}
export function ErrorBox({ e }: { e: any }) {
  return <div className="note" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>{String(e?.message || e)}</div>;
}
export function Stamp({ text }: { text: string }) {
  return <div className="stamp"><span>●</span><span>{text}</span></div>;
}
export function useLoad<T>(fn: () => Promise<T>, deps: any[]): { data: T | null; err: any; loading: boolean; reload: () => void } {
  const [data, setData] = React.useState<T | null>(null);
  const [err, setErr] = React.useState<any>(null);
  const [n, setN] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let live = true; setLoading(true); setErr(null);
    fn().then(d => live && setData(d)).catch(e => live && setErr(e)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line
  }, [...deps, n]);
  return { data, err, loading, reload: () => setN(x => x + 1) };
}
