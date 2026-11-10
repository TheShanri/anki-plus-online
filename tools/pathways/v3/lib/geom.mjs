// Geometry for the v3 pathway build and validator: GLB loading (meshopt), triangle meshes with ray-parity inside tests,
// distance to the surface, mesh slices, and a voxel "most interior path" router.
// Units: metres, atlas world frame (Y up, +Z anterior, patient's left = +X).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/* ------------------------------------------------------------------ loading */
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** All meshes of a GLB, with world-space positions and a triangle index. */
export async function loadGlb(path) {
  await MeshoptDecoder.ready;
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => loader.parse(ab, "", res, rej));
  gltf.scene.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.getAttribute("position");
    const p = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      p[i * 3] = v.x;
      p[i * 3 + 1] = v.y;
      p[i * 3 + 2] = v.z;
    }
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    out.push({ name: o.name, pos: p, idx });
  });
  return out;
}

let INDEX = null;
export function atlasIndex() {
  if (!INDEX) INDEX = JSON.parse(readFileSync(join(ROOT, "public/atlas/index.json"), "utf8"));
  return INDEX;
}
/** Loadable ids of an atlas id (groups expand to members). */
export function atlasIds(id) {
  const ix = atlasIndex();
  const out = [];
  const add = (k) => {
    const e = ix.structures[k];
    if (!e) return;
    if (e.file) out.includes(k) || out.push(k);
    else (e.members ?? []).forEach(add);
  };
  add(id);
  return out;
}

const MESHES = new Map();
/** One TriMesh per loadable member of an atlas id (a group is a union: never merge overlapping closed meshes for parity tests). */
export async function atlasMeshes(id) {
  if (MESHES.has(id)) return MESHES.get(id);
  const ids = atlasIds(id);
  if (!ids.length) throw new Error(`atlas: no geometry for ${id}`);
  const out = [];
  for (const k of ids) out.push(TriMesh.from(await loadGlb(join(ROOT, "public/atlas", atlasIndex().structures[k].file)), k));
  MESHES.set(id, out);
  return out;
}
/** A single-file atlas structure as one TriMesh (throws for groups: use atlasMeshes). */
export async function atlasMesh(id) {
  const ms = await atlasMeshes(id);
  if (ms.length !== 1) throw new Error(`atlas ${id} is a group of ${ms.length}: use atlasMeshes`);
  return ms[0];
}
export const insideAny = (ms, p) => ms.some((m) => m.inside(p));
export const distAny = (ms, p, r) => Math.min(...ms.map((m) => m.dist(p, r)));
const BODY = new Map();
/** A TriMesh for a node of a world-frame GLB (body.glb, spine.glb ...). */
export async function nodeMesh(file, node) {
  const key = `${file}#${node}`;
  if (BODY.has(key)) return BODY.get(key);
  if (!BODY.has(file)) BODY.set(file, await loadGlb(file));
  const parts = BODY.get(file).filter((m) => m.name === node || m.name.startsWith(node + "_") || m.name.startsWith(node + "."));
  if (!parts.length) throw new Error(`${file}: no node ${node}`);
  const m = TriMesh.from(parts, node);
  BODY.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ triangle mesh */
const EPS = 1e-12;
export class TriMesh {
  constructor(tris, name) {
    this.name = name;
    this.tris = tris; // Float32Array, 9 per triangle
    this.n = tris.length / 9;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < tris.length; i += 3)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], tris[i + a]);
        hi[a] = Math.max(hi[a], tris[i + a]);
      }
    this.lo = lo;
    this.hi = hi;
    this.grids = [null, null, null];
    this.cells = null;
  }
  static from(parts, name) {
    let n = 0;
    for (const p of parts) n += p.idx.length;
    const t = new Float32Array(n * 3);
    let o = 0;
    for (const p of parts)
      for (let i = 0; i < p.idx.length; i++) {
        const k = p.idx[i] * 3;
        t[o++] = p.pos[k];
        t[o++] = p.pos[k + 1];
        t[o++] = p.pos[k + 2];
      }
    return new TriMesh(t, name);
  }
  /** 2D bucket grid of the triangles projected along `axis` (for axis-aligned rays). */
  grid(axis) {
    if (this.grids[axis]) return this.grids[axis];
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const N = Math.max(8, Math.min(256, Math.ceil(Math.sqrt(this.n / 2))));
    const u0 = this.lo[u], v0 = this.lo[v];
    const du = (this.hi[u] - u0) / N || 1e-6, dv = (this.hi[v] - v0) / N || 1e-6;
    const buckets = Array.from({ length: N * N }, () => []);
    const T = this.tris;
    for (let t = 0; t < this.n; t++) {
      const b = t * 9;
      const us = [T[b + u], T[b + 3 + u], T[b + 6 + u]];
      const vs = [T[b + v], T[b + 3 + v], T[b + 6 + v]];
      const i0 = Math.max(0, Math.floor((Math.min(...us) - u0) / du)), i1 = Math.min(N - 1, Math.floor((Math.max(...us) - u0) / du));
      const j0 = Math.max(0, Math.floor((Math.min(...vs) - v0) / dv)), j1 = Math.min(N - 1, Math.floor((Math.max(...vs) - v0) / dv));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) buckets[i * N + j].push(t);
    }
    return (this.grids[axis] = { u, v, N, u0, v0, du, dv, buckets });
  }
  /** Coordinates along `axis` where the axis-parallel line through (pu, pv) crosses the surface, sorted. */
  crossings(axis, pu, pv) {
    const g = this.grid(axis);
    const i = Math.floor((pu - g.u0) / g.du), j = Math.floor((pv - g.v0) / g.dv);
    if (i < 0 || j < 0 || i >= g.N || j >= g.N) return [];
    const T = this.tris;
    const out = [];
    for (const t of g.buckets[i * g.N + j]) {
      const b = t * 9;
      const au = T[b + g.u], av = T[b + g.v], bu = T[b + 3 + g.u], bv = T[b + 3 + g.v], cu = T[b + 6 + g.u], cv = T[b + 6 + g.v];
      const d = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
      if (Math.abs(d) < EPS) continue;
      const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / d;
      const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      out.push(l1 * T[b + axis] + l2 * T[b + 3 + axis] + l3 * T[b + 6 + axis]);
    }
    out.sort((a, b) => a - b);
    // a ray through a shared edge hits both triangles: merge near-duplicates
    const m = [];
    for (const x of out) if (!m.length || Math.abs(x - m[m.length - 1]) > 1e-7) m.push(x);
    return m;
  }
  /** Ray parity along +x, +y and +z, majority vote (robust to the odd degenerate hit). */
  inside(p) {
    if (p[0] < this.lo[0] || p[1] < this.lo[1] || p[2] < this.lo[2] || p[0] > this.hi[0] || p[1] > this.hi[1] || p[2] > this.hi[2]) return false;
    let votes = 0;
    for (let a = 0; a < 3; a++) {
      const g = this.grid(a);
      // a tiny fixed jitter keeps the ray off shared edges and vertices
      const c = this.crossings(a, p[g.u] + 1.37e-7, p[g.v] - 2.11e-7);
      let k = 0;
      for (const x of c) if (x > p[a]) k++;
      if (k % 2 === 1) votes++;
    }
    return votes >= 2;
  }
  /** Distance from p to the surface (m), searched up to `maxR`. */
  dist(p, maxR = 0.01) {
    if (!this.cells) this.buildCells();
    const c = this.cells;
    const ci = (a) => Math.floor((p[a] - c.lo[a]) / c.h);
    const r = Math.ceil(maxR / c.h);
    let best = Infinity;
    const T = this.tris;
    const seen = new Set();
    for (let i = ci(0) - r; i <= ci(0) + r; i++)
      for (let j = ci(1) - r; j <= ci(1) + r; j++)
        for (let k = ci(2) - r; k <= ci(2) + r; k++) {
          if (i < 0 || j < 0 || k < 0 || i >= c.n[0] || j >= c.n[1] || k >= c.n[2]) continue;
          const list = c.b.get(i + c.n[0] * (j + c.n[1] * k));
          if (!list) continue;
          for (const t of list) {
            if (seen.has(t)) continue;
            seen.add(t);
            const d = triDist(p, T, t * 9);
            if (d < best) best = d;
          }
        }
    return best;
  }
  buildCells() {
    const h = Math.max(0.0008, Math.max(this.hi[0] - this.lo[0], this.hi[1] - this.lo[1], this.hi[2] - this.lo[2]) / 96);
    const n = [0, 1, 2].map((a) => Math.max(1, Math.ceil((this.hi[a] - this.lo[a]) / h) + 1));
    const b = new Map();
    const T = this.tris;
    for (let t = 0; t < this.n; t++) {
      const o = t * 9;
      const lo = [0, 1, 2].map((a) => Math.floor((Math.min(T[o + a], T[o + 3 + a], T[o + 6 + a]) - this.lo[a]) / h));
      const hi = [0, 1, 2].map((a) => Math.floor((Math.max(T[o + a], T[o + 3 + a], T[o + 6 + a]) - this.lo[a]) / h));
      for (let i = lo[0]; i <= hi[0]; i++)
        for (let j = lo[1]; j <= hi[1]; j++)
          for (let k = lo[2]; k <= hi[2]; k++) {
            const key = i + n[0] * (j + n[1] * k);
            let l = b.get(key);
            if (!l) b.set(key, (l = []));
            l.push(t);
          }
    }
    this.cells = { h, n, b, lo: this.lo };
  }
  /** Signed-ish depth: distance to the surface, negative outside. */
  depth(p, maxR = 0.01) {
    const d = this.dist(p, maxR);
    return this.inside(p) ? d : -d;
  }
  /** The cross-section at height y: segments [[x0,z0,x1,z1], ...]. */
  sliceY(y) {
    const T = this.tris;
    const segs = [];
    for (let t = 0; t < this.n; t++) {
      const o = t * 9;
      const ys = [T[o + 1], T[o + 4], T[o + 7]];
      if (Math.min(...ys) > y || Math.max(...ys) < y) continue;
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const a = o + e * 3, b = o + ((e + 1) % 3) * 3;
        const ya = T[a + 1], yb = T[b + 1];
        if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
        const s = (y - ya) / (yb - ya);
        pts.push([T[a] + (T[b] - T[a]) * s, T[a + 2] + (T[b + 2] - T[a + 2]) * s]);
      }
      if (pts.length >= 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }
    return segs;
  }
}

function triDist(p, T, o) {
  // closest point on a triangle (Ericson)
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const L = (x, y, z) => Math.hypot(p[0] - x, p[1] - y, p[2] - z);
  if (d1 <= 0 && d2 <= 0) return L(ax, ay, az);
  const bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return L(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return L(ax + abx * v, ay + aby * v, az + abz * v);
  }
  const cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return L(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return L(ax + acx * w, ay + acy * w, az + acz * w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return L(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return L(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/* ------------------------------------------------------------------ 2D cross-sections */
function insidePoly(segs, x, z) {
  let k = 0;
  for (const s of segs) {
    const [x0, z0, x1, z1] = s;
    if (z0 > z !== z1 > z) {
      const xi = x0 + ((z - z0) * (x1 - x0)) / (z1 - z0);
      if (xi > x) k++;
    }
  }
  return k % 2 === 1;
}
function segDist(segs, x, z) {
  let best = Infinity;
  for (const [x0, z0, x1, z1] of segs) {
    const dx = x1 - x0, dz = z1 - z0;
    const l = dx * dx + dz * dz;
    const t = l > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l)) : 0;
    best = Math.min(best, Math.hypot(x - x0 - dx * t, z - z0 - dz * t));
  }
  return best;
}
/**
 * The most interior point of a mesh's cross-section at height y, on one side of the midline (sgn +1 left, -1 right, 0 any).
 * `pref` = [px, pz] in 0..1 of the half-section's box pulls the choice (score = depth - w * distance to the preferred point).
 */
export function sliceCentre(mesh, y, sgn = 0, pref = null, w = 0.5, near = null, wn = 1.5, minX = 0.0003) {
  const segs = mesh.sliceY(y);
  if (segs.length < 3) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [a, b, c, d] of segs) {
    x0 = Math.min(x0, a, c);
    x1 = Math.max(x1, a, c);
    z0 = Math.min(z0, b, d);
    z1 = Math.max(z1, b, d);
  }
  if (sgn > 0) x0 = Math.max(x0, 0);
  if (sgn < 0) x1 = Math.min(x1, 0);
  if (x1 <= x0) return null;
  const px = pref ? x0 + (x1 - x0) * (sgn < 0 ? 1 - pref[0] : pref[0]) : 0;
  const pz = pref ? z0 + (z1 - z0) * pref[1] : 0;
  let best = null;
  const N = 28;
  const scan = (ax, bx, az, bz, n) => {
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * j) / n;
        if (sgn > 0 && x <= minX) continue;
        if (sgn < 0 && x >= -minX) continue;
        if (!insidePoly(segs, x, z)) continue;
        const d = segDist(segs, x, z);
        const s = d - (pref ? w * Math.hypot(x - px, z - pz) : 0) - (near ? wn * Math.hypot(x - near[0], z - near[1]) : 0);
        if (!best || s > best.s) best = { x, z, d, s };
      }
  };
  scan(x0, x1, z0, z1, N);
  if (!best) return null;
  const rx = (x1 - x0) / N, rz = (z1 - z0) / N;
  scan(best.x - rx, best.x + rx, best.z - rz, best.z + rz, 10);
  return { p: [best.x, y, best.z], depth: best.d, box: [x0, x1, z0, z1] };
}

/* ------------------------------------------------------------------ voxel router */
class Heap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0], tk = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return [tk, top];
  }
  get size() {
    return this.k.length;
  }
}

/**
 * The most interior path from a to b through the union of `meshes` (plus optional analytic `extra(p)` inside tests),
 * on a voxel grid of pitch h. Constraint `sgn` keeps x*sgn >= minX (one side of the midline). Returns world points
 * (smoothed, every point re-checked inside) or throws when no path exists.
 */
export function route(meshes, a, b, opt = {}) {
  const h = opt.h ?? 0.0004;
  const pad = opt.pad ?? 0.004;
  const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k]) - pad - (opt.spread ?? 0.35) * Math.abs(a[k] - b[k]));
  const hi = [0, 1, 2].map((k) => Math.max(a[k], b[k]) + pad + (opt.spread ?? 0.35) * Math.abs(a[k] - b[k]));
  if (opt.box) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], opt.box[0][k]);
    hi[k] = Math.max(hi[k], opt.box[1][k]);
  }
  // clamp to the union of the meshes
  const mlo = [Infinity, Infinity, Infinity], mhi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let k = 0; k < 3; k++) {
    mlo[k] = Math.min(mlo[k], m.lo[k]);
    mhi[k] = Math.max(mhi[k], m.hi[k]);
  }
  if (meshes.length && !opt.extra)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.max(lo[k], mlo[k] - h);
      hi[k] = Math.min(hi[k], mhi[k] + h);
    }
  const n = [0, 1, 2].map((k) => Math.max(2, Math.ceil((hi[k] - lo[k]) / h) + 1));
  const N = n[0] * n[1] * n[2];
  if (N > 40e6) throw new Error(`route: grid too large ${n.join("x")}`);
  const id = (i, j, k) => i + n[0] * (j + n[1] * k);
  const dbg = (m) => process.env.PW3_DEBUG && console.error(`    [route ${opt.label ?? ""}] ${m} ${(performance.now() / 1000).toFixed(2)}s`);
  dbg(`grid ${n.join("x")}`);
  const inside = new Uint8Array(N);
  const sgn = opt.sgn ?? 0;
  const minX = opt.minX ?? 0;
  // ray parity along each axis; a voxel is inside when at least two of the three axes say so (open meshes leak on one axis only)
  const votes = new Uint8Array(N);
  for (let ax = 0; ax < 3; ax++) {
    const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
    const at = [0, 0, 0];
    for (let jv = 0; jv < n[v]; jv++) {
      const pv = lo[v] + jv * h;
      for (let ju = 0; ju < n[u]; ju++) {
        const pu = lo[u] + ju * h;
        for (const m of meshes) {
          if (pu < m.lo[u] || pu > m.hi[u] || pv < m.lo[v] || pv > m.hi[v]) continue;
          const c = m.crossings(ax, pu + 1.37e-7, pv - 2.11e-7);
          for (let q = 0; q + 1 < c.length; q += 2) {
            const i0 = Math.max(0, Math.ceil((c[q] - lo[ax]) / h)), i1 = Math.min(n[ax] - 1, Math.floor((c[q + 1] - lo[ax]) / h));
            at[u] = ju;
            at[v] = jv;
            for (let i = i0; i <= i1; i++) {
              at[ax] = i;
              votes[id(at[0], at[1], at[2])] |= 1 << ax;
            }
          }
        }
      }
    }
  }
  for (let q = 0; q < N; q++) {
    const b = votes[q];
    inside[q] = (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) >= 2 ? 1 : 0;
  }
  if (opt.extra || sgn !== 0)
    for (let k = 0; k < n[2]; k++)
      for (let j = 0; j < n[1]; j++)
        for (let i = 0; i < n[0]; i++) {
          const q = id(i, j, k);
          const x = lo[0] + i * h;
          if (!inside[q] && opt.extra && opt.extra([x, lo[1] + j * h, lo[2] + k * h])) inside[q] = 1;
          if (sgn !== 0 && x * sgn < minX) inside[q] = 0;
        }
  dbg("voxelised");
  // chamfer distance to the outside (voxel units, 3-4-5 weights / 3)
  const D = new Float32Array(N);
  for (let q = 0; q < N; q++) D[q] = inside[q] ? 1e9 : 0;
  const W = [];
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const s = Math.abs(di) + Math.abs(dj) + Math.abs(dk);
    if (s === 0) continue;
    W.push([di, dj, dk, s === 1 ? 1 : s === 2 ? 4 / 3 : 5 / 3]);
  }
  const fwd = W.filter(([di, dj, dk]) => dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0))));
  const bwd = W.filter((w) => !fwd.includes(w));
  const pass = (ws, rev) => {
    for (let k0 = 0; k0 < n[2]; k0++) {
      const k = rev ? n[2] - 1 - k0 : k0;
      for (let j0 = 0; j0 < n[1]; j0++) {
        const j = rev ? n[1] - 1 - j0 : j0;
        for (let i0 = 0; i0 < n[0]; i0++) {
          const i = rev ? n[0] - 1 - i0 : i0;
          const q = id(i, j, k);
          if (!inside[q]) continue;
          let d = D[q];
          for (const [di, dj, dk, w] of ws) {
            const ii = i + di, jj = j + dj, kk = k + dk;
            const v = ii < 0 || jj < 0 || kk < 0 || ii >= n[0] || jj >= n[1] || kk >= n[2] ? 0 : D[id(ii, jj, kk)];
            if (v + w < d) d = v + w;
          }
          D[q] = d;
        }
      }
    }
  };
  pass(fwd, false);
  pass(bwd, true);
  const vox = (p) => [0, 1, 2].map((k) => Math.max(0, Math.min(n[k] - 1, Math.round((p[k] - lo[k]) / h))));
  const snap = (p) => {
    const [i, j, k] = vox(p);
    let best = -1, bd = Infinity;
    const R = Math.ceil((opt.snap ?? 0.006) / h);
    for (let dk = -R; dk <= R; dk++) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= n[0] || jj >= n[1] || kk >= n[2]) continue;
      const q = id(ii, jj, kk);
      if (!inside[q]) continue;
      const dd = di * di + dj * dj + dk * dk - 0.15 * D[q];
      if (dd < bd) {
        bd = dd;
        best = q;
      }
    }
    return best;
  };
  dbg("distance");
  const s = snap(a), t = snap(b);
  dbg("snapped");
  if (s < 0 || t < 0) throw new Error(`route ${opt.label ?? ""}: endpoint outside the hosts (${s < 0 ? "start" : "end"})`);
  const K = opt.centre ?? 6;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  dist[s] = 0;
  const heap = new Heap();
  heap.push(0, s);
  while (heap.size) {
    const [dq, q] = heap.pop();
    if (q === t) break;
    if (dq > dist[q]) continue;
    const i = q % n[0], j = Math.floor(q / n[0]) % n[1], k = Math.floor(q / (n[0] * n[1]));
    for (const [di, dj, dk, w] of W) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= n[0] || jj >= n[1] || kk >= n[2]) continue;
      const r = id(ii, jj, kk);
      if (!inside[r]) continue;
      const dd = D[r];
      const c = dq + w * (1 + K / (dd * dd + 0.3));
      if (c < dist[r]) {
        dist[r] = c;
        prev[r] = q;
        heap.push(c, r);
      }
    }
  }
  dbg("dijkstra");
  if (prev[t] < 0 && s !== t) throw new Error(`route ${opt.label ?? ""}: no path inside the hosts`);
  const path = [];
  for (let q = t; q >= 0; q = prev[q]) {
    const i = q % n[0], j = Math.floor(q / n[0]) % n[1], k = Math.floor(q / (n[0] * n[1]));
    path.push([lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, D[q] * h]);
    if (q === s) break;
  }
  path.reverse();
  const isIn = (p) => {
    const q = id(...vox(p));
    return inside[q] === 1;
  };
  return { pts: smoothInside(path.map((p) => p.slice(0, 3)), isIn, opt.smooth ?? 4), isIn, h, dims: n };
}

/** Moving-average smoothing that never moves a point out of the host. */
export function smoothInside(pts, isIn, iters = 4) {
  let cur = pts.map((p) => p.slice());
  for (let it = 0; it < iters; it++) {
    const nx = cur.map((p) => p.slice());
    for (let i = 1; i < cur.length - 1; i++) {
      const lo = Math.max(0, i - 2), hi = Math.min(cur.length - 1, i + 2);
      const q = [0, 0, 0];
      for (let k = lo; k <= hi; k++) for (let a = 0; a < 3; a++) q[a] += cur[k][a] / (hi - lo + 1);
      if (isIn(q)) nx[i] = q;
    }
    cur = nx;
  }
  return simplify(cur, 0.00015);
}

/** Drops points that lie within tol of the chord of their neighbours (keeps the shape, fewer samples). */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = keep[keep.length - 1], b = pts[i + 1], p = pts[i];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...ab) || 1e-9;
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (l * l);
    const d = Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
    if (d > tol || Math.hypot(...ap) > 0.004) keep.push(p);
  }
  keep.push(pts[pts.length - 1]);
  return keep;
}

/** Points every `step` metres along a polyline (keeps the ends). */
export function resample(pts, step) {
  if (pts.length < 2) return pts.map((p) => p.slice());
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let s = step - carry;
    while (s < L) {
      const t = s / L;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      s += step;
    }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  const pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1], last[2] - pl[2]) > step * 0.3) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

export const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);
export const fileExists = existsSync;
