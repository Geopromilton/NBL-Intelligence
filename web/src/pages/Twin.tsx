import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { fmt } from "../lib/format";
import { Loading, ErrorBox } from "../components/Bits";

// ADMT colour scale as in the instrument app: purple (very low) - blue (water-bearing signal) - green - yellow - red (high)
const ADMT_STOPS: [number, [number, number, number]][] = [
  [0, [0.42, 0.18, 0.62]], [0.2, [0.16, 0.3, 0.85]], [0.38, [0.1, 0.62, 0.95]], [0.52, [0.2, 0.78, 0.55]],
  [0.68, [0.95, 0.88, 0.25]], [0.84, [0.97, 0.55, 0.15]], [1, [0.85, 0.12, 0.12]],
];
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
const PERM_STOPS: [number, [number, number, number]][] = [[0, [0.12, 0.35, 0.75]], [0.5, [0.2, 0.75, 0.95]], [1, [0.9, 0.98, 1]]];
const cssRamp = (stops: typeof ADMT_STOPS) => `linear-gradient(90deg, ${stops.map(([t, c]) => `rgb(${c.map(v => Math.round(v * 255)).join(",")}) ${t * 100}%`).join(",")})`;

function inPoly(x: number, y: number, poly: number[][]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

interface Layers { terrain: boolean; boundary: boolean; sites: boolean; borewells: boolean; rz: boolean; rzLabels: boolean; zones: boolean; transformer: boolean; admt: boolean; block: boolean; }

export default function Twin() {
  const { site } = useApp();
  const [scene, setScene] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [layers, setLayers] = useState<Layers>({ terrain: true, boundary: true, sites: true, borewells: true, rz: true, rzLabels: false, zones: false, transformer: true, admt: false, block: false });
  const [reading, setReading] = useState("I-NEU");
  const [threshold, setThreshold] = useState(0.3);
  const [depth, setDepth] = useState<[number, number]>([0, 600]);
  const [vex, setVex] = useState(3);
  const [dscale, setDscale] = useState(0.5);
  const [sel, setSel] = useState<any>(null);
  const [view, setView] = useState("oblique");

  useEffect(() => { setScene(null); api(`/api/sites/${site}/twin`).then(setScene).catch(setErr); }, [site]);
  const blockCount = useMemo(() => {
    const B = scene?.block; if (!B) return { n: 0, max: 0 };
    const [nz, ny, nx] = B.shape, p = B.readings[reading]?.p || [];
    let n = 0, max = 0;
    for (let k = 0; k < nz; k++) { const zc = B.zc[k]; if (zc < depth[0] || zc > depth[1]) continue;
      for (let c = 0; c < ny * nx; c++) { if (!B.inside[c]) continue; const v = p[k * ny * nx + c]; if (v > max) max = v; if (v >= threshold) n++; } }
    return { n, max };
  }, [scene, reading, threshold, depth]);

  return (
    <div className="page flush">
      {err && <div style={{ padding: 24 }}><ErrorBox e={err} /></div>}
      {!scene && !err && <Loading text="Building the 3D site twin" />}
      {scene && (
        <div className="twin" style={{ height: "calc(100vh - 62px)" }}>
          <Viewport scene={scene} layers={layers} reading={reading} threshold={threshold} depth={depth} vex={vex} dscale={dscale} view={view} onSelect={setSel} />
          <div className="twin-panel twin-controls">
            <div className="eyebrow">Site twin</div>
            <h3>{scene.site === "siddanahalli" ? "Siddanahalli" : scene.site} · 3D</h3>
            <div className="tiny muted" style={{ marginBottom: 10 }}>Drag to rotate · right-drag to pan · scroll to zoom · click any pin, well or ring</div>
            <div className="seg" style={{ marginBottom: 12 }}>
              {[["oblique", "Oblique"], ["top", "Plan"], ["south", "Section"]].map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k + ":" + Date.now())}>{l}</button>)}
            </div>
            <div className="eyebrow" style={{ margin: "6px 0" }}>Surface</div>
            {([["terrain", "Terrain (FABDEM 30 m)", "#7f9a6b"], ["boundary", "Lease boundary", "#ffffff"], ["sites", "Drilling sites A-G", "#3FC1E8"], ["borewells", "Reference borewells BW-1 to 3", "#E2B04C"], ["rz", "Recharge points RZ", "#4FC487"], ["transformer", "Transformer zone (120 m)", "#F07074"]] as const).map(([k, l, c]) => (
              <label key={k} className="toggle"><input type="checkbox" checked={(layers as any)[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} /><span className="swatch" style={{ background: c }} />{l}</label>
            ))}
            {layers.rz && <label className="toggle" style={{ paddingLeft: 26 }}><input type="checkbox" checked={layers.rzLabels} onChange={e => setLayers({ ...layers, rzLabels: e.target.checked })} />Show RZ names</label>}
            <div className="eyebrow" style={{ margin: "10px 0 6px" }}>Subsurface (ADMT)</div>
            <label className="toggle"><input type="checkbox" checked={layers.admt} onChange={e => setLayers({ ...layers, admt: e.target.checked })} /><span className="swatch" style={{ background: cssRamp(ADMT_STOPS) }} />ADMT response cells</label>
            <label className="toggle"><input type="checkbox" checked={layers.zones} onChange={e => setLayers({ ...layers, zones: e.target.checked })} /><span className="swatch" style={{ background: "#B48CF0" }} />Anomaly zones (score ≥ 7)</label>
            <label className="toggle"><input type="checkbox" checked={layers.block} onChange={e => setLayers({ ...layers, block: e.target.checked })} /><span className="swatch" style={{ background: cssRamp(PERM_STOPS) }} />Permeable probability (M5)</label>
            {layers.block && (
              <div style={{ paddingLeft: 26 }}>
                <div className="seg" style={{ margin: "4px 0 8px" }}>
                  {Object.entries(scene.block?.readings || {}).map(([k, v]: any) => <button key={k} className={reading === k ? "on" : ""} onClick={() => setReading(k)}>{v.label}</button>)}
                </div>
                <div className="field"><label>Show cells with p ≥ <b>{threshold.toFixed(2)}</b></label><input type="range" min={0.05} max={0.95} step={0.05} value={threshold} onChange={e => setThreshold(+e.target.value)} />
                  <span className="hint">{blockCount.n.toLocaleString("en-US")} cells shown · highest p in window {blockCount.max.toFixed(2)}{reading === "I-NEG" ? " · the negative reading has no permeable class (D-014)" : blockCount.n === 0 ? " · lower the threshold" : ""}</span></div>
              </div>
            )}
            <div className="field"><label>Depth window <b>{depth[0]}–{depth[1]} m</b></label>
              <input type="range" min={0} max={590} step={10} value={depth[0]} onChange={e => setDepth([Math.min(+e.target.value, depth[1] - 10), depth[1]])} />
              <input type="range" min={10} max={600} step={10} value={depth[1]} onChange={e => setDepth([depth[0], Math.max(+e.target.value, depth[0] + 10)])} />
            </div>
            <div className="field"><label>Terrain exaggeration <b>{vex}×</b></label><input type="range" min={1} max={8} step={0.5} value={vex} onChange={e => setVex(+e.target.value)} /></div>
            <div className="field"><label>Depth scale <b>{dscale}×</b></label><input type="range" min={0.2} max={1} step={0.1} value={dscale} onChange={e => setDscale(+e.target.value)} /></div>
            <div className="tiny muted">{scene.stamp}</div>
          </div>

          <div className="twin-panel twin-inspect" style={{ display: sel ? "block" : "none" }}>
            {sel && <Inspector sel={sel} onClose={() => setSel(null)} />}
          </div>

          <div className="twin-panel twin-legend">
            {layers.admt && <><span>ADMT log10(dV) levelled</span><span>low</span><div className="ramp" style={{ background: cssRamp(ADMT_STOPS) }} /><span>high</span><span className="muted">purple = clay-like · blue = water-bearing signal</span></>}
            {!layers.admt && layers.block && <><span>p(permeable) · {reading}</span><span>{threshold}</span><div className="ramp" style={{ background: cssRamp(PERM_STOPS) }} /><span>1.0</span></>}
            {!layers.admt && !layers.block && <span>Ground {fmt(scene.terrain?.zmin)}–{fmt(scene.terrain?.zmax)} m amsl · terrain ×{vex} · depth ×{dscale} · UTM 43N origin E {scene.origin_utm?.[0]?.toFixed(0)}, N {scene.origin_utm?.[1]?.toFixed(0)}</span>}
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
      <div className="row between"><div><div className="eyebrow">{sel.kind}</div><h3 style={{ margin: 0, font: "600 20px var(--display)" }}>{sel.title}</h3></div><button className="icon-btn" onClick={onClose}>×</button></div>
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

function Viewport({ scene: S, layers, reading, threshold, depth, vex, dscale, view, onSelect }: { scene: any; layers: Layers; reading: string; threshold: number; depth: [number, number]; vex: number; dscale: number; view: string; onSelect: (s: any) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<any>({});

  // one-time renderer setup
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.setSize(el.clientWidth, el.clientHeight);
    Object.assign(labels.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" });
    el.appendChild(labels.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1828, 1400, 3600);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x203040, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-600, 900, 500); scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const el2 = renderer.domElement;
    el2.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
    el2.addEventListener("pointerup", e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = el2.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hits = ray.intersectObjects(root.children, true).filter(h => (h.object as any).userData?.pick);
      if (hits.length) ctx.current.onPick?.((hits[0].object as any).userData.pick);
    });
    el2.addEventListener("pointermove", e => {
      const r = el2.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(root.children, true).some(h => (h.object as any).userData?.pick);
      el2.style.cursor = hit ? "pointer" : "grab";
    });
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); labels.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(el);
    ctx.current = { renderer, labels, scene, camera, controls, root, onPick: null };
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

  useEffect(() => { ctx.current.onPick = onSelect; }, [onSelect]);

  // rebuild content when inputs change
  useEffect(() => {
    const { root } = ctx.current as { root: THREE.Group };
    if (!root) return;
    root.children.slice().forEach(c => { root.remove(c); c.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); if (o.element) o.element.remove(); }); });
    const gy = (x: number, y: number) => (ground(x, y) - base) * vex;
    const sub = (x: number, y: number, d: number) => gy(x, y) - d * dscale;
    const label = (text: string, cls: string, pos: THREE.Vector3, data: any, kind: string) => {
      const div = document.createElement("div"); div.className = `label3d ${cls}`; div.textContent = text;
      div.onclick = () => onSelect({ title: text, kind, data });
      const o = new CSS2DObject(div); o.position.copy(pos); root.add(o);
    };

    if (layers.terrain && T) {
      const g = new THREE.BufferGeometry();
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      const zr = Math.max(1, T.zmax - T.zmin);
      for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
        const z = T.z[j * T.nx + i];
        pos.push(T.x[i], (z - base) * vex, -T.y[j]);
        const t = (z - T.zmin) / zr;
        const inside = S.boundary?.length && inPoly(T.x[i], T.y[j], S.boundary);
        const c = inside ? new THREE.Color().setHSL(0.36, 0.42, 0.36 + t * 0.12) : new THREE.Color().setHSL(0.11 - t * 0.04, 0.22, 0.30 + t * 0.22);
        col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
        const a = j * T.nx + i, b = a + 1, c = a + T.nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const transparent = layers.admt || layers.block;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false, transparent, opacity: transparent ? 0.35 : 1, side: THREE.DoubleSide, depthWrite: !transparent }));
      root.add(m);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), new THREE.LineBasicMaterial({ color: 0x9fc3d8, transparent: true, opacity: 0.06 }));
      root.add(wire);
    }
    if (layers.boundary && S.boundary?.length) {
      const pts = S.boundary.map((p: number[]) => new THREE.Vector3(p[0], (p[2] - base) * vex + 1.5, -p[1]));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff }));
      root.add(line);
      // curtain showing the lease footprint down to 600 m
      if (layers.admt || layers.block) {
        const cp: number[] = [];
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1], da = a.y - 600 * dscale, db = b.y - 600 * dscale;
          cp.push(a.x, a.y, a.z, b.x, b.y, b.z, a.x, da, a.z, b.x, b.y, b.z, b.x, db, b.z, a.x, da, a.z);
        }
        const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
        root.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x3fc1e8, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })));
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
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xf07074, dashSize: 8, gapSize: 6 })).translateY(0));
      (root.children[root.children.length - 1] as THREE.Line).computeLineDistances();
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
        const c = ramp(ADMT_STOPS, (A.v[k] + 0.6) / 1.2); col.push(c[0], c[1], c[2]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      root.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 3.2, vertexColors: true, sizeAttenuation: true })));
    }
    if (layers.block && S.block) {
      const B = S.block, [nz, ny, nx] = B.shape, p = B.readings[reading]?.p || [];
      const dxs = Math.abs(B.xc[1] - B.xc[0]) || 10, dys = Math.abs(B.yc[1] - B.yc[0]) || 10;
      const cells: [number, number, number, number, number][] = [];
      for (let k = 0; k < nz; k++) {
        const zc = B.zc[k]; if (zc < depth[0] || zc > depth[1]) continue;
        const hz = (k < nz - 1 ? B.zc[k + 1] - zc : zc - B.zc[k - 1]) || 10;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          if (!B.inside[j * nx + i]) continue;
          const v = p[(k * ny + j) * nx + i]; if (v < threshold) continue;
          cells.push([B.xc[i], B.yc[j], zc, hz, v]);
        }
      }
      if (cells.length) {
        const geo = new THREE.BoxGeometry(dxs * 0.92, 1, dys * 0.92);
        const mat = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.78, roughness: 0.6 });
        const inst = new THREE.InstancedMesh(geo, mat, cells.length);
        const m4 = new THREE.Matrix4(), c = new THREE.Color();
        cells.forEach(([x, y, zc, hz, v], n) => {
          const h = hz * dscale * 0.92;
          m4.makeScale(1, h, 1).setPosition(x, sub(x, y, zc), -y);
          inst.setMatrixAt(n, m4);
          const [r, g2, b] = ramp(PERM_STOPS, (v - threshold) / Math.max(0.05, 1 - threshold)); inst.setColorAt(n, c.setRGB(r, g2, b));
        });
        root.add(inst);
      }
    }
  }, [S, layers, reading, threshold, depth, vex, dscale, ground]);

  // camera views
  useEffect(() => {
    const { camera, controls } = ctx.current as { camera: THREE.PerspectiveCamera; controls: OrbitControls };
    if (!camera) return;
    const k = view.split(":")[0];
    const target = new THREE.Vector3(0, (layers.admt || layers.block ? -200 : 20) * dscale, 0);
    if (k === "top") camera.position.set(0, 1100, 1);
    else if (k === "south") camera.position.set(0, -60, 900);
    else camera.position.set(-330, 280 - 60 * dscale, 430);
    controls.target.copy(k === "top" ? new THREE.Vector3(0, 0, 0) : target);
    controls.update();
  }, [view, layers.admt, layers.block]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
