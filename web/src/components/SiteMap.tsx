import React, { useMemo } from "react";

/** 2D plan of the lease from the twin scene: boundary, drilling sites, recharge points, transformer zone. */
export default function SiteMap({ scene, selected, onPick, show = { sites: true, rz: true } }: { scene: any; selected?: string; onPick?: (id: string) => void; show?: { sites?: boolean; rz?: boolean } }) {
  const box = useMemo(() => {
    const xs = scene.boundary.map((p: number[]) => p[0]), ys = scene.boundary.map((p: number[]) => p[1]);
    const pad = 40;
    return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
  }, [scene]);
  const W = 600, H = Math.round(600 * (box.y1 - box.y0) / (box.x1 - box.x0));
  const sx = (x: number) => ((x - box.x0) / (box.x1 - box.x0)) * W;
  const sy = (y: number) => H - ((y - box.y0) / (box.y1 - box.y0)) * H;
  const k = W / (box.x1 - box.x0);
  const t = scene.transformer;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "var(--plane-2)", borderRadius: 12, maxHeight: 440 }}>
      <defs>
        <pattern id="grid" width={50 * k} height={50 * k} patternUnits="userSpaceOnUse"><path d={`M ${50 * k} 0 L 0 0 0 ${50 * k}`} fill="none" stroke="var(--line)" strokeWidth="1" /></pattern>
        <clipPath id="lease"><polygon points={scene.boundary.map((p: number[]) => `${sx(p[0])},${sy(p[1])}`).join(" ")} /></clipPath>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {t && <circle cx={sx(t.x)} cy={sy(t.y)} r={t.radius_m * k} fill="var(--danger-soft)" stroke="var(--danger)" strokeDasharray="5 4" opacity=".8" />}
      <polygon points={scene.boundary.map((p: number[]) => `${sx(p[0])},${sy(p[1])}`).join(" ")} fill="var(--leaf-soft)" fillOpacity=".55" stroke="var(--ink)" strokeWidth="1.8" />
      {t && <text x={sx(t.x) + 6} y={sy(t.y) - 6} fontSize="11" fill="var(--danger)">Transformer · 120 m</text>}
      {show.rz && scene.recharge_points.map((r: any) => (
        <g key={r.id} onClick={() => onPick?.(r.id)} style={{ cursor: "pointer" }}>
          <circle cx={sx(r.x)} cy={sy(r.y)} r={6} fill="none" stroke="var(--leaf)" strokeWidth="2.2" />
          <text x={sx(r.x) + 8} y={sy(r.y) + 4} fontSize="10" fill="var(--leaf)">{r.id}</text>
        </g>
      ))}
      {show.sites && scene.drilling_sites.map((s: any) => {
        const prio = /Priority/.test(s.role);
        const on = selected === s.id;
        return (
          <g key={s.id} onClick={() => onPick?.(s.id)} style={{ cursor: "pointer" }}>
            <circle cx={sx(s.x)} cy={sy(s.y)} r={on ? 13 : 10} fill={prio ? "var(--aqua)" : "var(--plane)"} stroke={prio ? "var(--aqua)" : "var(--ink-3)"} strokeWidth="2" />
            <text x={sx(s.x)} y={sy(s.y) + 4} fontSize="11" fontWeight="700" textAnchor="middle" fill={prio ? "#fff" : "var(--ink-2)"}>{s.id}</text>
          </g>
        );
      })}
      <g transform={`translate(${W - 34},${26})`}><path d="M0 -14 L6 4 L0 0 L-6 4 Z" fill="var(--ink)" /><text y="18" fontSize="11" textAnchor="middle" fill="var(--ink)">N</text></g>
      <g transform={`translate(16,${H - 16})`}><line x1="0" x2={50 * k} y1="0" y2="0" stroke="var(--ink)" strokeWidth="2" /><text x={25 * k} y="-5" fontSize="10" textAnchor="middle" fill="var(--ink-2)">50 m</text></g>
    </svg>
  );
}
