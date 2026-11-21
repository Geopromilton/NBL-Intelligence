import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Loading, ErrorBox, Stat } from "../components/Bits";
import { Glyph } from "../components/Glyphs";
import { buildField, coreValue, frac, isosurface, sample, Field } from "../lib/solid";

// ADMT colour scale as in the instrument app: purple (very low) - blue (water-bearing signal) - green - yellow - red (high)
const ADMT_STOPS: [number, [number, number, number]][] = [
  [0, [0.42, 0.18, 0.62]], [0.2, [0.16, 0.3, 0.85]], [0.38, [0.1, 0.62, 0.95]], [0.52, [0.2, 0.78, 0.55]],
  [0.68, [0.95, 0.88, 0.25]], [0.84, [0.97, 0.55, 0.15]], [1, [0.85, 0.12, 0.12]],
];
// probability of permeable rock: blue (at threshold) - cyan - green - yellow (highest)
const PERM_STOPS: [number, [number, number, number]][] = [[0, [0.12, 0.25, 0.72]], [0.33, [0.08, 0.6, 0.9]], [0.66, [0.22, 0.8, 0.5]], [1, [0.98, 0.86, 0.3]]];
// section (fence) colours: rock below the threshold in slate, then the permeable ramp
const ROCK: [number, number, number] = [0.46, 0.4, 0.34];
function ramp(stops: [number, [number, number, number]][], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}
/** Ramp colours are sRGB; vertex colours must be linear or they render washed out. */
const _c = new THREE.Color();
const lin = (c: [number, number, number]): [number, number, number] => { _c.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); return [_c.r, _c.g, _c.b]; };
const cssRamp = (stops: typeof ADMT_STOPS) => `linear-gradient(90deg, ${stops.map(([t, c]) => `rgb(${c.map(v => Math.round(v * 255)).join(",")}) ${t * 100}%`).join(",")})`;

function inPoly(x: number, y: number, poly: number[][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** UTM (WGS 84, northern hemisphere) to latitude/longitude in degrees. */
function utmToLatLon(E: number, N: number, zone = 43): [number, number] {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const x = E - 500000, M = N / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lat * 180 / Math.PI, (zone - 1) * 6 - 180 + 3 + lon * 180 / Math.PI];
}
const dms = (v: number, pos: string, neg: string) => { const s = v >= 0 ? pos : neg; v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), sec = ((v - d) * 60 - m) * 60; return `${d}°${String(m).padStart(2, "0")}′${sec.toFixed(1).padStart(4, "0")}″ ${s}`; };

interface Layers { terrain: boolean; boundary: boolean; sites: boolean; borewells: boolean; rz: boolean; rzLabels: boolean; zones: boolean; transformer: boolean; admt: boolean; block: boolean; }
type PermMode = "solid" | "shells" | "cells";
interface Cut { axis: "none" | "ew" | "ns"; pos: number }

export default function Twin() {
  const { site } = useApp();
  const [scene, setScene] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [layers, setLayers] = useState<Layers>({ terrain: true, boundary: true, sites: true, borewells: true, rz: true, rzLabels: false, zones: false, transformer: true, admt: false, block: true });
  const [reading, setReading] = useState("I-POS");
  const [mode, setMode] = useState<PermMode>("solid");
  const [threshold, setThreshold] = useState(0.3);
  const [depth, setDepth] = useState<[number, number]>([0, 600]);
  const [vex, setVex] = useState(3);
  const [dscale, setDscale] = useState(0.5);
  const [cut, setCut] = useState<Cut>({ axis: "none", pos: 0.5 });
  const [sel, setSel] = useState<any>(null);
  const [view, setView] = useState("oblique");
  const [cmd, setCmd] = useState("");
  const [panel, setPanel] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; z: number } | null>(null);
  const [fieldMax, setFieldMax] = useState(0);

  useEffect(() => {
    setScene(null); setErr(null);
    api(`/api/sites/${site}/twin`).then(setScene).catch(setErr);
    api(`/api/sites/${site}`).then(setInfo).catch(() => setInfo(null));
  }, [site]);

  const B = scene?.block;
  const stats = useMemo(() => {
    if (!B) return { n: 0, max: 0, vol: 0 };
    const [nz, ny, nx] = B.shape, p = B.readings[reading]?.p || [];
    const dx = Math.abs(B.xc[1] - B.xc[0]) || 10, dy = Math.abs(B.yc[1] - B.yc[0]) || 10;
    let n = 0, max = 0, vol = 0;
    for (let k = 0; k < nz; k++) {
      const zc = B.zc[k]; if (zc < depth[0] || zc > depth[1]) continue;
      const hz = (k < nz - 1 ? B.zc[k + 1] - zc : zc - B.zc[k - 1]) || 10;
      for (let c = 0; c < ny * nx; c++) { if (!B.inside[c]) continue; const v = p[k * ny * nx + c]; if (v > max) max = v; if (v >= threshold) { n++; vol += dx * dy * hz; } }
    }
    return { n, max, vol };
  }, [B, reading, threshold, depth]);

  const lease = useMemo(() => {
    const bz = (scene?.boundary || []).map((p: number[]) => p[2]).filter((z: any) => typeof z === "number");
    return bz.length ? { zmin: Math.min(...bz), zmax: Math.max(...bz) } : null;
  }, [scene]);
  const hoverLL = hover && scene?.origin_utm ? utmToLatLon(scene.origin_utm[0] + hover.x, scene.origin_utm[1] + hover.y) : null;
  const area = info?.facts?.lease_area_m2?.value;
  const centre = info?.centre;
  const prio = (scene?.drilling_sites || []).filter((s: any) => /Priority/.test(s.role)).length;
  const negReading = reading === "I-NEG" || stats.max === 0;

  return (
    <div className="page flush" style={{ marginTop: -68 }}>
      {err && <div style={{ padding: "90px 24px 24px" }}><ErrorBox e={err} /></div>}
      {!scene && !err && <div style={{ paddingTop: 90 }}><Loading text="Building the 3D site twin" /></div>}
      {scene && (
        <div className="twin">
          <Viewport scene={scene} layers={layers} reading={reading} mode={mode} threshold={threshold} depth={depth} vex={vex} dscale={dscale} cut={cut} view={view} cmd={cmd}
            onSelect={setSel} onHover={setHover} onField={setFieldMax} />

          {panel && (
            <div className="twin-panel twin-controls">
              <div className="eyebrow">Site twin · 3D</div><h3>{info?.name || scene.site}</h3>
                <div className="seg" style={{ width: "100%", margin: "8px 0 2px" }}>{[["oblique", "3D"], ["top", "Plan"], ["south", "Section"]].map(([k, l]) => <button key={k} style={{ flex: 1, justifyContent: "center" }} className={view.startsWith(k) ? "on" : ""} onClick={() => setView(k + ":" + Date.now())}>{l}</button>)}</div>
              <div className="tiny muted" style={{ margin: "6px 0 4px" }}>Drag to rotate · right-drag to pan · scroll to zoom · click a pin, well or ring</div>

              <div className="twin-sec">Permeable rock model (M5)</div>
              <label className="toggle"><input type="checkbox" checked={layers.block} onChange={e => setLayers({ ...layers, block: e.target.checked })} /><span className="swatch" style={{ background: cssRamp(PERM_STOPS) }} />Probability of permeable rock</label>
              {layers.block && (
                <div style={{ paddingLeft: 4 }}>
                  <div className="seg" style={{ margin: "4px 0 8px", width: "100%" }}>
                    {([["solid", "Solid"], ["shells", "Shells"], ["cells", "Cells"]] as const).map(([k, l]) => <button key={k} style={{ flex: 1, justifyContent: "center" }} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}
                  </div>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>{mode === "solid" ? "Smoothed closed body where p ≥ threshold, coloured by the strongest probability inside it." : mode === "shells" ? "Nested translucent surfaces at three probability levels." : "Raw M5 model cells, 10 m × 10 m × variable thickness."}</div>
                  <div className="tiny" style={{ color: "#9FD8EA", fontWeight: 700, margin: "6px 0 4px" }}>Reading</div>
                  <div className="seg" style={{ marginBottom: 8, width: "100%" }}>
                    {Object.entries(B?.readings || {}).map(([k, v]: any) => <button key={k} style={{ flex: 1, justifyContent: "center", textTransform: "capitalize" }} className={reading === k ? "on" : ""} onClick={() => setReading(k)}>{v.label}</button>)}
                  </div>
                  <div className="field"><label>Threshold p ≥ <b>{threshold.toFixed(2)}</b></label><input type="range" min={0.1} max={0.8} step={0.05} value={threshold} onChange={e => setThreshold(+e.target.value)} />
                    <span className="hint">{negReading ? "This reading has no permeable class (D-014): nothing to draw." : `Highest p: ${stats.max.toFixed(2)} (cells) · ${fieldMax.toFixed(2)} (smoothed)${mode !== "cells" && fieldMax < threshold ? " · lower the threshold" : ""}`}</span></div>
                  <div className="tiny" style={{ color: "#9FD8EA", fontWeight: 700, margin: "6px 0 4px" }}>Cutaway</div>
                  <div className="seg" style={{ marginBottom: 6, width: "100%" }}>
                    {([["none", "None"], ["ew", "E-W"], ["ns", "N-S"]] as const).map(([k, l]) => <button key={k} style={{ flex: 1, justifyContent: "center" }} className={cut.axis === k ? "on" : ""} onClick={() => setCut({ ...cut, axis: k })}>{l}</button>)}
                  </div>
                  {cut.axis !== "none" && <div className="field"><label>Section position <b>{Math.round(cut.pos * 100)} %</b> {cut.axis === "ew" ? "south → north" : "west → east"}</label><input type="range" min={0.02} max={0.98} step={0.01} value={cut.pos} onChange={e => setCut({ ...cut, pos: +e.target.value })} /></div>}
                </div>
              )}

              <div className="twin-sec">Surface</div>
              {([["terrain", "Terrain (FABDEM 30 m)", "#7f9a6b"], ["boundary", "Lease boundary", "#ffffff"], ["sites", "Drilling sites A-G", "#3FC1E8"], ["borewells", "Reference borewells (off-site)", "#E2B04C"], ["rz", "Recharge points RZ", "#4FC487"], ["transformer", "Transformer zone (120 m)", "#F07074"]] as const).map(([k, l, c]) => (
                <label key={k} className="toggle"><input type="checkbox" checked={(layers as any)[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} /><span className="swatch" style={{ background: c }} />{l}</label>
              ))}
              {layers.rz && <label className="toggle" style={{ paddingLeft: 26 }}><input type="checkbox" checked={layers.rzLabels} onChange={e => setLayers({ ...layers, rzLabels: e.target.checked })} />Show RZ names</label>}
              <div className="twin-sec">Subsurface (ADMT)</div>
              <label className="toggle"><input type="checkbox" checked={layers.admt} onChange={e => setLayers({ ...layers, admt: e.target.checked })} /><span className="swatch" style={{ background: cssRamp(ADMT_STOPS) }} />ADMT response cells</label>
              <label className="toggle"><input type="checkbox" checked={layers.zones} onChange={e => setLayers({ ...layers, zones: e.target.checked })} /><span className="swatch" style={{ background: "#B48CF0" }} />Anomaly zones (score ≥ 7)</label>

              <div className="twin-sec">Display</div>
              <div className="field"><label>Depth window <b>{depth[0]}–{depth[1]} m</b></label>
                <input type="range" min={0} max={590} step={10} value={depth[0]} onChange={e => setDepth([Math.min(+e.target.value, depth[1] - 10), depth[1]])} />
                <input type="range" min={10} max={600} step={10} value={depth[1]} onChange={e => setDepth([depth[0], Math.max(+e.target.value, depth[0] + 10)])} />
              </div>
              <div className="field"><label>Terrain exaggeration <b>{vex}×</b></label><input type="range" min={1} max={8} step={0.5} value={vex} onChange={e => setVex(+e.target.value)} /></div>
              <div className="field"><label>Depth scale <b>{dscale}×</b></label><input type="range" min={0.2} max={1} step={0.1} value={dscale} onChange={e => setDscale(+e.target.value)} /></div>
            </div>
          )}

          <div className="twin-tools">
            <button title="Zoom in" onClick={() => setCmd("in:" + Date.now())}>+</button>
            <button title="Zoom out" onClick={() => setCmd("out:" + Date.now())}>−</button>
            <button title="Reset view" onClick={() => setView("oblique:" + Date.now())}><Glyph name="sync" size={19} /></button>
            <button title="Plan view" onClick={() => setView("top:" + Date.now())}><Glyph name="pin" size={19} /></button>
            <button title="Show or hide the layer panel" onClick={() => setPanel(!panel)} style={panel ? { borderColor: "var(--aqua)", boxShadow: "0 0 14px rgba(34,211,238,.35)" } : undefined}><Glyph name="layers" size={19} /></button>
          </div>

          <div className="twin-panel twin-overview" style={{ display: sel ? "none" : "block" }}>
            <h4><Glyph name="globe" size={18} color="#22D3EE" />Site overview</h4>
            {area && <div className="ov"><span className="muted">Lease area</span><b>{fmt(area / 10000, 2)} ha</b></div>}
            {lease && <div className="ov"><span className="muted">Ground along boundary</span><b>{fmt(lease.zmin)}–{fmt(lease.zmax)} m amsl</b></div>}
            {centre && <div className="ov"><span className="muted">Centre</span><b>{centre.lat.toFixed(4)}° N, {centre.lon.toFixed(4)}° E</b></div>}
            <div className="ov"><span className="muted">Grid</span><b>UTM zone 43N</b></div>
            {B && <div className="ov"><span className="muted">M5 model</span><b>{B.shape[2]} × {B.shape[1]} × {B.shape[0]} cells</b></div>}
            <div className="ov"><span className="muted">Status</span><b style={{ color: "#F5B041" }}>Stage A · untested</b></div>
            <div className="tiny muted" style={{ marginTop: 8 }}>No on-site borehole yet. All subsurface layers are scenarios from the ADMT survey.</div>
          </div>

          <div className="twin-panel twin-inspect" style={{ display: sel ? "block" : "none", top: 84, bottom: "auto" }}>
            {sel && <Inspector sel={sel} onClose={() => setSel(null)} />}
          </div>

          <div className="twin-panel twin-legend">
            {layers.admt && <><span>ADMT log10(dV) levelled</span><span>low</span><div className="ramp" style={{ background: cssRamp(ADMT_STOPS) }} /><span>high</span></>}
            {!layers.admt && layers.block && !negReading && <><span>p(permeable) · {B?.readings?.[reading]?.label} reading</span><span>{threshold.toFixed(2)}</span><div className="ramp" style={{ background: cssRamp(PERM_STOPS) }} /><span>{(mode === "cells" ? stats.max : Math.max(fieldMax, threshold)).toFixed(2)}</span>{cut.axis !== "none" && <><i className="swatch" style={{ background: `rgb(${ROCK.map(v => v * 255).join(",")})` }} /><span>section: p below threshold</span></>}</>}
            {(!layers.admt && (!layers.block || negReading)) && <span>Ground {fmt(scene.terrain?.zmin)}–{fmt(scene.terrain?.zmax)} m amsl · terrain ×{vex} · depth ×{dscale}</span>}
          </div>

          {hover && <div className="twin-coord">
            {hoverLL && <>{dms(hoverLL[0], "N", "S")} · {dms(hoverLL[1], "E", "W")}<br /></>}
            E {fmt(scene.origin_utm[0] + hover.x)} · N {fmt(scene.origin_utm[1] + hover.y)} · ground {fmt(hover.z, 1)} m amsl
          </div>}

          <div className="twin-stats" style={{ left: panel ? 334 : 18, right: 76 }}>
            <Stat icon="mountain" tone="green" label="Ground level (lease)" value={lease ? `${fmt(lease.zmin)}–${fmt(lease.zmax)}` : "–"} u="m amsl" sub="FABDEM 30 m along the boundary" />
            <Stat icon="drill" tone="blue" label="Drilling sites" value={(scene.drilling_sites || []).length} sub={`${prio} priority · unvalidated`} />
            <Stat icon="recharge" tone="teal" label="Recharge points" value={(scene.recharge_points || []).length} sub="RZ points · untested" />
            <Stat icon="cube" tone="aqua" label={`Rock with p ≥ ${threshold.toFixed(2)}`} value={negReading ? "None" : fmt(stats.vol / 1e6, 2)} u={negReading ? undefined : "million m3"} sub={negReading ? "negative reading" : `${B?.readings?.[reading]?.label} reading · ${depth[0]}–${depth[1]} m · rock, not water`} />
          </div>
        </div>
      )}
    </div>
  );
}

function Inspector({ sel, onClose }: { sel: any; onClose: () => void }) {
  const rows: [string, any][] = Object.entries(sel.data).filter(([k]) => !["x", "y", "ground"].includes(k)) as any;
  return (
    <>
      <div className="row between"><div><div className="eyebrow">{sel.kind}</div><h3 style={{ margin: 0, font: "700 20px var(--display)", color: "#fff" }}>{sel.title}</h3></div><button className="icon-btn" onClick={onClose}>×</button></div>
      <div className="hr" />
      {rows.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 8 }}>
          <div className="tiny muted" style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</div>
          <div className="small">{Array.isArray(v) ? v.map(x => Array.isArray(x) ? x.join("–") + " m" : String(x)).join("; ") : typeof v === "number" ? fmt(v) : String(v ?? "–")}</div>
        </div>
      ))}
      <div className="tiny muted">Unvalidated: no on-site borehole yet.</div>
    </>
  );
}

interface VP { scene: any; layers: Layers; reading: string; mode: PermMode; threshold: number; depth: [number, number]; vex: number; dscale: number; cut: Cut; view: string; cmd: string;
  onSelect: (s: any) => void; onHover: (h: { x: number; y: number; z: number } | null) => void; onField: (m: number) => void }

function Viewport({ scene: S, layers, reading, mode, threshold, depth, vex, dscale, cut, view, cmd, onSelect, onHover, onField }: VP) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<any>({});

  // one-time renderer setup
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.setSize(el.clientWidth, el.clientHeight);
    Object.assign(labels.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(labels.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1828, 1500, 3800);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xdff2ff, 0x1a2a3a, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-600, 900, 500); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x7fd8ff, 0.6); rim.position.set(500, -200, -600); scene.add(rim);
    const root = new THREE.Group(); scene.add(root);
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const el2 = renderer.domElement;
    const ndc = (e: PointerEvent) => { const r = el2.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    el2.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
    el2.addEventListener("pointerup", e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      ray.setFromCamera(ndc(e), camera);
      const hits = ray.intersectObjects(root.children, true).filter(h => (h.object as any).userData?.pick);
      if (hits.length) ctx.current.onPick?.((hits[0].object as any).userData.pick);
    });
    let last = 0;
    el2.addEventListener("pointermove", e => {
      const now = performance.now(); if (now - last < 40) return; last = now;
      ray.setFromCamera(ndc(e), camera);
      const hits = ray.intersectObjects(root.children, true);
      el2.style.cursor = hits.some(h => (h.object as any).userData?.pick) ? "pointer" : "grab";
      const t = hits.find(h => (h.object as any).userData?.terrain);
      ctx.current.onHover?.(t ? { x: t.point.x, y: -t.point.z, z: ctx.current.ground?.(t.point.x, -t.point.z) ?? 0 } : null);
    });
    el2.addEventListener("pointerleave", () => ctx.current.onHover?.(null));
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); labels.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(el);
    ctx.current = { renderer, labels, scene, camera, controls, root, onPick: null, onHover: null };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ""; };
  }, []);

  const T = S.terrain;
  const base = T ? T.zmin : 900;
  const ground = useMemo(() => {
    if (!T) return () => 918;
    const x0 = T.x[0], dx = T.x[1] - T.x[0], y0 = T.y[0], dy = T.y[0] - T.y[1];
    return (x: number, y: number) => {
      const fi = Math.max(0, Math.min(T.nx - 1.001, (x - x0) / dx)), fj = Math.max(0, Math.min(T.ny - 1.001, (y0 - y) / dy));
      const i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
      const z = (ii: number, jj: number) => T.z[jj * T.nx + ii];
      return z(i, j) * (1 - a) * (1 - b) + z(i + 1, j) * a * (1 - b) + z(i, j + 1) * (1 - a) * b + z(i + 1, j + 1) * a * b;
    };
  }, [T]);

  useEffect(() => { ctx.current.onPick = onSelect; ctx.current.onHover = onHover; ctx.current.ground = ground; }, [onSelect, onHover, ground]);

  // smoothed probability field (rebuilt only when the reading or depth window changes)
  const field = useMemo<Field | null>(() => {
    const B = S.block; if (!B) return null;
    const p = B.readings[reading]?.p; if (!p) return null;
    return buildField(B, p, 2, 0.85, depth);
  }, [S, reading, depth]);
  useEffect(() => { let m = 0; if (field) for (let n = 0; n < field.v.length; n++) if (field.v[n] > m) m = field.v[n]; onField(m); }, [field]);

  // rebuild content when inputs change
  useEffect(() => {
    const { root } = ctx.current as { root: THREE.Group };
    if (!root) return;
    root.children.slice().forEach(c => { root.remove(c); c.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); if (o.element) o.element.remove(); }); });
    const gy = (x: number, y: number) => (ground(x, y) - base) * vex;
    const sub = (x: number, y: number, d: number) => gy(x, y) - d * dscale;
    const toWorld = (x: number, y: number, d: number) => new THREE.Vector3(x, sub(x, y, d), -y);
    const label = (text: string, cls: string, pos: THREE.Vector3, data: any, kind: string) => {
      const div = document.createElement("div"); div.className = `label3d ${cls}`; div.textContent = text;
      div.onclick = () => onSelect({ title: text, kind, data });
      const o = new CSS2DObject(div); o.position.copy(pos); root.add(o);
    };
    const B = S.block;
    const sub3d = layers.admt || layers.block;

    // cutaway plane (keeps the north / east part)
    let clip: THREE.Plane[] = [];
    let cutAt: number | null = null;
    if (layers.block && B && cut.axis !== "none") {
      const xs = B.xc, ys = B.yc;
      const at = cut.axis === "ew" ? ys[0] + (ys[ys.length - 1] - ys[0]) * cut.pos : xs[0] + (xs[xs.length - 1] - xs[0]) * cut.pos;
      cutAt = at;
      clip = [cut.axis === "ew" ? new THREE.Plane(new THREE.Vector3(0, 0, -1), -at) : new THREE.Plane(new THREE.Vector3(1, 0, 0), -at)];
    }

    if (layers.terrain && T) {
      const g = new THREE.BufferGeometry();
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      const zr = Math.max(1, T.zmax - T.zmin);
      for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
        const z = T.z[j * T.nx + i];
        pos.push(T.x[i], (z - base) * vex, -T.y[j]);
        const t = (z - T.zmin) / zr;
        const inside = S.boundary?.length && inPoly(T.x[i], T.y[j], S.boundary);
        const c = inside ? new THREE.Color().setHSL(0.36, 0.45, 0.34 + t * 0.12) : new THREE.Color().setHSL(0.11 - t * 0.04, 0.22, 0.28 + t * 0.22);
        col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
        const a = j * T.nx + i, b = a + 1, c = a + T.nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const transparent = sub3d;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, transparent, opacity: transparent ? 0.3 : 1, side: THREE.DoubleSide, depthWrite: !transparent }));
      m.userData.terrain = true; m.renderOrder = 5;
      root.add(m);
      root.add(new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x9fc3d8, transparent: true, opacity: 0.06 })));
    }
    if (layers.boundary && S.boundary?.length) {
      const pts = S.boundary.map((p: number[]) => new THREE.Vector3(p[0], (p[2] - base) * vex + 1.5, -p[1]));
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })));
      if (sub3d) {
        // faint curtain showing the lease footprint down to 600 m
        const cp: number[] = [];
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], da = a.y - 600 * dscale, db = b.y - 600 * dscale;
          cp.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, da, a.z, b.x, b.y, b.z, b.x, db, b.z, a.x, da, a.z);
        }
        const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
        root.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x3fc1e8, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false })));
        const bl = pts.map((p: THREE.Vector3) => new THREE.Vector3(p.x, p.y - 600 * dscale, p.z));
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bl), new THREE.LineBasicMaterial({ color: 0x3fc1e8, transparent: true, opacity: 0.35 })));
      }
    }
    if (layers.sites) for (const s of S.drilling_sites || []) {
      const y0 = gy(s.x, s.y);
      const prio = /Priority/.test(s.role);
      const color = prio ? 0x3fc1e8 : 0x8fa6bd;
      const pin = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      pin.position.set(s.x, y0 + 10, -s.y); pin.rotation.x = Math.PI; root.add(pin);
      pin.userData.pick = { title: `Site ${s.id}`, kind: "Drilling site", data: s };
      if (prio) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.x, y0, -s.y), new THREE.Vector3(s.x, y0 - 400 * dscale, -s.y)]);
        const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4 })); l.computeLineDistances(); root.add(l);
      }
      label(s.id, prio ? "site" : "mini", new THREE.Vector3(s.x, y0 + 22, -s.y), s, "Drilling site");
    }
    if (layers.borewells) for (const b of S.borewells || []) {
      const y0 = gy(b.x, b.y);
      const len = (b.depth || 300) * dscale;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 10), new THREE.MeshStandardMaterial({ color: 0xe2b04c }));
      shaft.position.set(b.x, y0 - len / 2, -b.y); root.add(shaft);
      shaft.userData.pick = { title: b.id, kind: "Reference borewell (off-site, reported)", data: b };
      for (const [t, bt] of b.strikes || []) {
        const h = Math.max(4, (bt - t) * dscale);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, h, 14), new THREE.MeshStandardMaterial({ color: 0x3fa9f5, emissive: 0x1677b8, emissiveIntensity: 0.5 }));
        st.position.set(b.x, y0 - ((t + bt) / 2) * dscale, -b.y); root.add(st);
      }
      label(b.id, "bw", new THREE.Vector3(b.x, y0 + 16, -b.y), b, "Reference borewell (off-site, reported)");
    }
    if (layers.rz) for (const r of S.recharge_points || []) {
      const y0 = gy(r.x, r.y);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 1.1, 8, 28), new THREE.MeshStandardMaterial({ color: 0x4fc487, emissive: 0x2e8b57, emissiveIntensity: 0.5 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(r.x, y0 + 2, -r.y); root.add(ring);
      ring.userData.pick = { title: r.id, kind: "Recharge zone point", data: r };
      if (layers.rzLabels) label(r.id, "rz mini", new THREE.Vector3(r.x, y0 + 10, -r.y), r, "Recharge zone point");
    }
    if (layers.transformer && S.transformer) {
      const t = S.transformer, y0 = gy(t.x, t.y);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; const x = t.x + Math.cos(a) * t.radius_m, y = t.y + Math.sin(a) * t.radius_m; pts.push(new THREE.Vector3(x, gy(x, y) + 1, -y)); }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xf07074, dashSize: 8, gapSize: 6 }));
      ring.computeLineDistances(); root.add(ring);
      const box = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf07074 }));
      box.position.set(t.x, y0 + 4, -t.y); root.add(box);
      label("Transformer", "bw mini", new THREE.Vector3(t.x, y0 + 16, -t.y), t, "Noise source");
    }
    if (layers.zones) for (const z of (S.zones || []).filter((z: any) => z.score >= 7)) {
      const top = Math.max(z.top, depth[0]), bot = Math.min(z.bottom, depth[1]);
      if (bot <= top) continue;
      const h = (bot - top) * dscale;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, h, 10), new THREE.MeshStandardMaterial({ color: 0xb48cf0, transparent: true, opacity: 0.75, emissive: 0x6d4bb0, emissiveIntensity: 0.4 }));
      const y = gy(z.x, z.y) - ((top + bot) / 2) * dscale;
      m.position.set(z.x, y, -z.y); root.add(m);
      m.userData.pick = { title: z.id, kind: "ADMT anomaly zone", data: z };
      label(`${z.id} (${z.score})`, "", new THREE.Vector3(z.x + 6, y, -z.y), z, "ADMT anomaly zone");
    }
    if (layers.admt && S.admt) {
      const A = S.admt, pos: number[] = [], col: number[] = [];
      for (let k = 0; k < A.x.length; k++) {
        const d = A.d[k]; if (d < depth[0] || d > depth[1]) continue;
        pos.push(A.x[k], sub(A.x[k], A.y[k], d), -A.y[k]);
        const c = lin(ramp(ADMT_STOPS, (A.v[k] + 0.6) / 1.2)); col.push(c[0], c[1], c[2]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      root.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, sizeAttenuation: true })));
    }

    if (layers.block && B) {
      const lo = threshold;
      let hi = 0; if (field) for (let n = 0; n < field.v.length; n++) if (field.v[n] > hi) hi = field.v[n];
      const tcol = (v: number) => lin(ramp(PERM_STOPS, (v - lo) / Math.max(0.05, hi - lo)));
      if (mode === "solid" && field && hi >= lo) {
        const g = isosurface(field, lo, toWorld, (fi, fj, fk) => tcol(coreValue(field, fi, fj, fk, 4)));
        if (g) {
          const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.08, side: THREE.DoubleSide, clippingPlanes: clip, emissive: 0x0a2a44, emissiveIntensity: 0.15 }));
          root.add(m);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.12, clippingPlanes: clip }));
          root.add(edges);
        }
      }
      if (mode === "shells" && field && hi >= lo) {
        const levels = [lo, lo + (hi - lo) * 0.45, lo + (hi - lo) * 0.8];
        const op = [0.2, 0.36, 0.9];
        levels.forEach((iso, n) => {
          const c = tcol(iso);
          const g = isosurface(field, iso, toWorld, () => c);
          if (!g) return;
          const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, transparent: n < 2, opacity: op[n], depthWrite: n === 2, side: THREE.DoubleSide, clippingPlanes: clip, emissive: new THREE.Color().setRGB(c[0], c[1], c[2]), emissiveIntensity: 0.12 }));
          m.renderOrder = 10 - n; root.add(m);
        });
      }
      if (mode === "cells") {
        const [nz, ny, nx] = B.shape, p = B.readings[reading]?.p || [];
        const dxs = Math.abs(B.xc[1] - B.xc[0]) || 10, dys = Math.abs(B.yc[1] - B.yc[0]) || 10;
        const cells: [number, number, number, number, number][] = [];
        let cmax = 0;
        for (let k = 0; k < nz; k++) {
          const zc = B.zc[k]; if (zc < depth[0] || zc > depth[1]) continue;
          const hz = (k < nz - 1 ? B.zc[k + 1] - zc : zc - B.zc[k - 1]) || 10;
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (!B.inside[j * nx + i]) continue;
            const v = p[(k * ny + j) * nx + i]; if (v < threshold) continue;
            cmax = Math.max(cmax, v); cells.push([B.xc[i], B.yc[j], zc, hz, v]);
          }
        }
        if (cells.length) {
          const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(dxs * 0.92, 1, dys * 0.92), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.8, roughness: 0.6, clippingPlanes: clip }), cells.length);
          const m4 = new THREE.Matrix4(), c = new THREE.Color();
          cells.forEach(([x, y, zc, hz, v], n) => {
            m4.makeScale(1, hz * dscale * 0.92, 1).setPosition(x, sub(x, y, zc), -y);
            inst.setMatrixAt(n, m4);
            const [r, g2, b] = ramp(PERM_STOPS, (v - threshold) / Math.max(0.05, cmax - threshold)); inst.setColorAt(n, c.setRGB(r, g2, b, THREE.SRGBColorSpace));
          });
          root.add(inst);
        }
      }
      // section face (fence) at the cutaway: rock in slate, permeable body in the colour ramp
      if (cutAt !== null && field && S.boundary?.length) {
        const C: number = cutAt;
        const along = cut.axis === "ew" ? B.xc : B.yc;
        const nA = 90, a0 = along[0], a1 = along[along.length - 1];
        const ks: number[] = [];
        for (let k = 0; k < field.nz; k++) { const d = field.zs[k]; if (d >= Math.max(0, depth[0]) && d <= depth[1] && d >= B.zc[0] - 5 && d <= B.zc[B.zc.length - 1] + 5) ks.push(k); }
        const pos: number[] = [], col: number[] = [], idx: number[] = [];
        const id = (a: number, k: number) => a * ks.length + k;
        const ins: boolean[] = [];
        for (let a = 0; a <= nA; a++) {
          const s = a0 + (a1 - a0) * (a / nA);
          const x = cut.axis === "ew" ? s : C, y = cut.axis === "ew" ? C : s;
          ins.push(inPoly(x, y, S.boundary));
          const fi = frac(field.xs, x), fj = frac(field.ys, y);
          for (const k of ks) {
            const w = toWorld(x, y, field.zs[k]);
            pos.push(w.x, w.y, w.z);
            const v = sample(field, fi, fj, k);
            const c = v >= lo ? tcol(v) : lin(ROCK.map((r, q) => r + (PERM_STOPS[0][1][q] - r) * Math.pow(Math.min(1, v / lo), 2) * 0.5) as [number, number, number]);
            col.push(c[0], c[1], c[2]);
          }
        }
        for (let a = 0; a < nA; a++) {
          if (!ins[a] || !ins[a + 1]) continue;
          for (let k = 0; k < ks.length - 1; k++) idx.push(id(a, k), id(a + 1, k), id(a, k + 1), id(a + 1, k), id(a + 1, k + 1), id(a, k + 1));
        }
        if (idx.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
          g.setIndex(idx);
          root.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1 })));
          // outline of the section face
          const ol: THREE.Vector3[] = [];
          for (let a = 0; a <= nA; a++) if (ins[a]) { const s = a0 + (a1 - a0) * (a / nA); const x = cut.axis === "ew" ? s : C, y = cut.axis === "ew" ? C : s; ol.push(toWorld(x, y, field.zs[ks[0]])); }
          for (let a = nA; a >= 0; a--) if (ins[a]) { const s = a0 + (a1 - a0) * (a / nA); const x = cut.axis === "ew" ? s : C, y = cut.axis === "ew" ? C : s; ol.push(toWorld(x, y, field.zs[ks[ks.length - 1]])); }
          if (ol.length) { ol.push(ol[0].clone()); root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ol), new THREE.LineBasicMaterial({ color: 0xe6f7ff }))); }
        }
      }
    }
  }, [S, layers, reading, mode, threshold, depth, vex, dscale, cut, ground, field]);

  // camera views
  useEffect(() => {
    const { camera, controls } = ctx.current as { camera: THREE.PerspectiveCamera; controls: OrbitControls };
    if (!camera) return;
    const k = view.split(":")[0];
    const deep = layers.admt || layers.block;
    const target = new THREE.Vector3(0, (deep ? -190 : 20) * dscale, 0);
    if (k === "top") camera.position.set(0, 1100, 1);
    else if (k === "south") camera.position.set(0, -80 * dscale, 900);
    else camera.position.set(-560, 360 - 40 * dscale, 690);
    controls.target.copy(k === "top" ? new THREE.Vector3(0, 0, 0) : target);
    controls.update();
  }, [view]);

  // zoom buttons
  useEffect(() => {
    const { camera, controls } = ctx.current as { camera: THREE.PerspectiveCamera; controls: OrbitControls };
    if (!camera || !cmd) return;
    const f = cmd.startsWith("in") ? 0.78 : 1.28;
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    camera.position.copy(controls.target).add(off); controls.update();
  }, [cmd]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
