import React from "react";
import { BASE } from "../lib/api";
import { fmt, unit } from "../lib/format";
import { Glyph, HeroIcon, IconBadge } from "./Glyphs";

export const PROV_TEXT: Record<string, string> = {
  measured: "Measured", imported: "Source document", calculated: "Calculated", forecast: "Forecast",
  assumption: "Assumption", placeholder: "Placeholder", ai_interpretation: "AI interpretation",
};
export function Prov({ p }: { p?: string }) {
  if (!p) return null;
  return <span className={`prov ${p}`} title={PROV_TEXT[p] || p}><i />{PROV_TEXT[p] || p}</span>;
}

/** Page header over a photographic banner. */
export function Hero({ art, icon, eyebrow, title, accent, sub, actions }: { art: string; icon: string; eyebrow: string; title: string; accent?: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="hero">
      <div className="bg" style={{ backgroundImage: `url(${BASE}art/${art}.webp)` }} />
      <HeroIcon name={icon} />
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}{accent && <> <em>{accent}</em></>}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/** Stat card with a glossy icon badge. */
export function Stat({ icon, tone = "aqua", label, value, u, sub, warn, onClick, prov }: { icon: string; tone?: string; label: string; value: React.ReactNode; u?: string; sub?: React.ReactNode; warn?: boolean; onClick?: () => void; prov?: string }) {
  const soft: Record<string, string> = { green: "rgba(61,220,151,.18)", aqua: "rgba(34,211,238,.16)", blue: "rgba(59,155,245,.18)", amber: "rgba(245,176,65,.2)", violet: "rgba(167,139,250,.2)", red: "rgba(242,107,107,.2)", teal: "rgba(31,181,160,.2)" };
  return (
    <div className={`stat ${warn ? "warn" : ""}`} style={{ ["--tone-soft" as any]: soft[tone], cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <IconBadge name={icon} tone={tone} />
      <div className="s-body">
        <div className="s-label">{label}</div>
        <div className="s-value">{typeof value === "number" ? fmt(value) : value}{u && <small>{unit(u)}</small>}</div>
        {(sub || prov) && <div className="s-sub">{sub}{prov && <> <Prov p={prov} /></>}</div>}
      </div>
      {onClick && <span className="s-go"><Glyph name="trend" size={13} /></span>}
    </div>
  );
}

/** Kept for older pages: simple stat without badge. */
export function Kpi({ label, value, u, tag, prov }: { label: string; value: any; u?: string; tag?: React.ReactNode; accent?: string; prov?: string }) {
  return <Stat icon="info" label={label} value={value} u={u} sub={tag} prov={prov} />;
}

export function Card({ title, sub, right, children, pad = true, style, icon, tone, glow }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; pad?: boolean; style?: React.CSSProperties; icon?: string; tone?: string; glow?: boolean }) {
  return (
    <section className={`card ${glow ? "glow" : ""}`} style={style}>
      {(title || right) && <div className="card-h">
        {icon && <IconBadge name={icon} tone={tone || "aqua"} size={38} />}
        <div style={{ minWidth: 0 }}><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
        <div className="right">{right}</div></div>}
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
  return <div className="note" style={{ borderColor: "rgba(242,107,107,.5)", color: "#FFB4B4" }}>{String(e?.message || e)}</div>;
}
export function Stamp({ text }: { text: string }) {
  return <div className="stamp"><IconBadge name="warn" tone="amber" size={30} /><span>{text}</span></div>;
}
export function Art({ name, style, className }: { name: string; style?: React.CSSProperties; className?: string }) {
  return <img className={className} src={`${BASE}art/${name}.webp`} alt="" style={{ display: "block", width: "100%", ...style }} />;
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
export { fmt, unit };
