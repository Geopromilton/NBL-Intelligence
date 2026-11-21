// Smooth solid models from the M5 probability block (GMS / RockWorks style).
// Steps: mask to the lease -> trilinear upsample -> Gaussian smoothing -> marching cubes
// -> vertex welding and smooth normals. Everything runs in grid-index space, then maps
// to world coordinates through a caller-supplied function (terrain-following depth).
import * as THREE from "three";
import * as MC from "three/examples/jsm/objects/MarchingCubes.js";
const edgeTable = (MC as any).edgeTable as Int32Array, triTable = (MC as any).triTable as Int32Array;

export interface Block { shape: [number, number, number]; xc: number[]; yc: number[]; zc: number[]; inside: (number | boolean)[] }

export interface Field { nx: number; ny: number; nz: number; v: Float32Array; xs: number[]; ys: number[]; zs: number[] }

/** Build an upsampled, smoothed, padded scalar field (padding is zero so surfaces close). */
export function buildField(B: Block, p: number[], up = 2, sigma = 1.1, depth: [number, number] = [0, 1e9]): Field {
  const [nz, ny, nx] = B.shape;
  // 1. masked source with depth window
  const src = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const keep = B.zc[k] >= depth[0] && B.zc[k] <= depth[1];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = j * nx + i, n = (k * ny + j) * nx + i;
      src[n] = keep && B.inside[c] ? p[n] || 0 : 0;
    }
  }
  // 2. upsample (trilinear) with one padding cell on each side
  const lin = (a: number[], n: number) => { const out: number[] = []; for (let s = 0; s <= (a.length - 1) * n; s++) { const f = s / n, i = Math.min(a.length - 2, Math.floor(f)); out.push(a[i] + (a[i + 1] - a[i]) * (f - i)); } return out; };
  const pad = (a: number[]) => [a[0] - (a[1] - a[0]), ...a, a[a.length - 1] + (a[a.length - 1] - a[a.length - 2])];
  const xs = pad(lin(B.xc, up)), ys = pad(lin(B.yc, up)), zs = pad(lin(B.zc, up));
  const NX = xs.length, NY = ys.length, NZ = zs.length;
  const v = new Float32Array(NX * NY * NZ);
  const S = (i: number, j: number, k: number) => src[(k * ny + j) * nx + i];
  for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const fx = (i - 1) / up, fy = (j - 1) / up, fz = (k - 1) / up;
    const i0 = Math.min(nx - 2, Math.floor(fx)), j0 = Math.min(ny - 2, Math.floor(fy)), k0 = Math.min(nz - 2, Math.floor(fz));
    const a = fx - i0, b = fy - j0, c = fz - k0;
    const c00 = S(i0, j0, k0) * (1 - a) + S(i0 + 1, j0, k0) * a, c10 = S(i0, j0 + 1, k0) * (1 - a) + S(i0 + 1, j0 + 1, k0) * a;
    const c01 = S(i0, j0, k0 + 1) * (1 - a) + S(i0 + 1, j0, k0 + 1) * a, c11 = S(i0, j0 + 1, k0 + 1) * (1 - a) + S(i0 + 1, j0 + 1, k0 + 1) * a;
    v[(k * NY + j) * NX + i] = (c00 * (1 - b) + c10 * b) * (1 - c) + (c01 * (1 - b) + c11 * b) * c;
  }
  // 3. separable Gaussian
  if (sigma > 0) {
    const r = Math.ceil(sigma * 2.5), w: number[] = [];
    for (let t = -r; t <= r; t++) w.push(Math.exp(-(t * t) / (2 * sigma * sigma)));
    const sum = w.reduce((x, y) => x + y, 0); for (let t = 0; t < w.length; t++) w[t] /= sum;
    const tmp = new Float32Array(v.length);
    const pass = (from: Float32Array, to: Float32Array, axis: number) => {
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        let s = 0;
        for (let t = -r; t <= r; t++) {
          let ii = i, jj = j, kk = k;
          if (axis === 0) ii = Math.max(0, Math.min(NX - 1, i + t)); else if (axis === 1) jj = Math.max(0, Math.min(NY - 1, j + t)); else kk = Math.max(0, Math.min(NZ - 1, k + t));
          s += from[(kk * NY + jj) * NX + ii] * w[t + r];
        }
        to[(k * NY + j) * NX + i] = s;
      }
    };
    pass(v, tmp, 0); pass(tmp, v, 1); pass(v, tmp, 2); v.set(tmp);
    // keep the padding at zero so every surface is closed
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++)
      if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) v[(k * NY + j) * NX + i] = 0;
  }
  return { nx: NX, ny: NY, nz: NZ, v, xs, ys, zs };
}

/** Trilinear sample in fractional index space. */
export function sample(F: Field, fi: number, fj: number, fk: number): number {
  const i = Math.max(0, Math.min(F.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(F.ny - 2, Math.floor(fj))), k = Math.max(0, Math.min(F.nz - 2, Math.floor(fk)));
  const a = Math.max(0, Math.min(1, fi - i)), b = Math.max(0, Math.min(1, fj - j)), c = Math.max(0, Math.min(1, fk - k));
  const V = (ii: number, jj: number, kk: number) => F.v[(kk * F.ny + jj) * F.nx + ii];
  return ((V(i, j, k) * (1 - a) + V(i + 1, j, k) * a) * (1 - b) + (V(i, j + 1, k) * (1 - a) + V(i + 1, j + 1, k) * a) * b) * (1 - c)
    + ((V(i, j, k + 1) * (1 - a) + V(i + 1, j, k + 1) * a) * (1 - b) + (V(i, j + 1, k + 1) * (1 - a) + V(i + 1, j + 1, k + 1) * a) * b) * c;
}
const at = (a: number[], f: number) => { const i = Math.max(0, Math.min(a.length - 2, Math.floor(f))); return a[i] + (a[i + 1] - a[i]) * (f - i); };

/**
 * Marching cubes isosurface at `iso`. `toWorld(x, y, depth)` maps model coordinates to a THREE vector.
 * `color(fi,fj,fk)` returns an RGB triple for each vertex (index space).
 */
export function isosurface(F: Field, iso: number, toWorld: (x: number, y: number, d: number) => THREE.Vector3,
  color?: (fi: number, fj: number, fk: number) => [number, number, number]): THREE.BufferGeometry | null {
  const { nx, ny, nz, v } = F;
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const pos: number[] = [], col: number[] = [], tris: number[] = [];
  const weld = new Map<string, number>(); // edge key -> vertex index
  const CO = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const ED = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8), vid = new Int32Array(12);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let cube = 0;
    for (let c = 0; c < 8; c++) { val[c] = v[idx(i + CO[c][0], j + CO[c][1], k + CO[c][2])]; if (val[c] < iso) cube |= 1 << c; }
    const edges = edgeTable[cube]; if (!edges) continue;
    for (let e = 0; e < 12; e++) {
      if (!(edges & (1 << e))) continue;
      const [a, b] = ED[e];
      const ga = [i + CO[a][0], j + CO[a][1], k + CO[a][2]], gb = [i + CO[b][0], j + CO[b][1], k + CO[b][2]];
      const ka = idx(ga[0], ga[1], ga[2]), kb = idx(gb[0], gb[1], gb[2]);
      const key = ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`;
      let id = weld.get(key);
      if (id === undefined) {
        const t = Math.abs(val[b] - val[a]) < 1e-9 ? 0.5 : (iso - val[a]) / (val[b] - val[a]);
        const fi = ga[0] + (gb[0] - ga[0]) * t, fj = ga[1] + (gb[1] - ga[1]) * t, fk = ga[2] + (gb[2] - ga[2]) * t;
        const w = toWorld(at(F.xs, fi), at(F.ys, fj), at(F.zs, fk));
        id = pos.length / 3; pos.push(w.x, w.y, w.z);
        const cc = color ? color(fi, fj, fk) : [0.4, 0.8, 1];
        col.push(cc[0], cc[1], cc[2]);
        weld.set(key, id);
      }
      vid[e] = id;
    }
    const base = cube << 4;
    for (let t = 0; triTable[base + t] !== -1; t += 3) tris.push(vid[triTable[base + t]], vid[triTable[base + t + 2]], vid[triTable[base + t + 1]]);
  }
  if (!tris.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(tris);
  g.computeVertexNormals();
  return g;
}

/** Highest smoothed value found a short way into the body from a surface point (for colouring the solid). */
export function coreValue(F: Field, fi: number, fj: number, fk: number, reach = 3): number {
  const gx = sample(F, fi + 0.5, fj, fk) - sample(F, fi - 0.5, fj, fk);
  const gy = sample(F, fi, fj + 0.5, fk) - sample(F, fi, fj - 0.5, fk);
  const gz = sample(F, fi, fj, fk + 0.5) - sample(F, fi, fj, fk - 0.5);
  const n = Math.hypot(gx, gy, gz) || 1;
  let best = sample(F, fi, fj, fk);
  for (let s = 1; s <= reach; s++) best = Math.max(best, sample(F, fi + gx / n * s, fj + gy / n * s, fk + gz / n * s));
  return best;
}

/** Fractional index of a model coordinate along an axis. */
export function frac(a: number[], x: number): number {
  if (x <= a[0]) return 0;
  for (let i = 0; i < a.length - 1; i++) if (x <= a[i + 1]) return i + (x - a[i]) / (a[i + 1] - a[i]);
  return a.length - 1;
}
