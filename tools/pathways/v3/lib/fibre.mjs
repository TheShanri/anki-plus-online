// Fibre builder for the v3 pathway build: every sample of a fibre records the host structure it runs in, so the
// validator can check it (atlas mesh, Z-Anatomy nerve curve, nucleus proxy, part mesh, or a flagged synthetic tube).
import { atlasMesh, atlasMeshes, nodeMesh, route, sliceCentre, resample, ROOT, TriMesh } from "./geom.mjs";
import { curveByKey, dist } from "./nerves.mjs";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/* ------------------------------------------------------------------ hosts */
export const PROXIES = new Map(); // id -> { id, name, parent, c:[x,y,z], r:[rx,ry,rz] }
export const TUBES = new Map(); // id -> { id, name, pts, r, synthetic: true, why }
const PARTS = JSON.parse(readFileSync(join(ROOT, "public/pathways/parts.json"), "utf8")).parts;

export function proxy(id, name, parent, c, r) {
  PROXIES.set(id, { id, name, parent, c, r });
  return `p:${id}`;
}
export function tube(id, name, pts, r, why, hidden = false) {
  TUBES.set(id, { id, name, pts, r, why, hidden });
  return `t:${id}`;
}
const inEllipsoid = (q, p, tol = 0) => {
  const k = ((p[0] - q.c[0]) / (q.r[0] + tol)) ** 2 + ((p[1] - q.c[1]) / (q.r[1] + tol)) ** 2 + ((p[2] - q.c[2]) / (q.r[2] + tol)) ** 2;
  return k <= 1;
};
function polyDist(pts, p) {
  let best = { d: Infinity, t: 0, i: 1 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2));
    const d = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
    if (d < best.d) best = { d, t, i };
  }
  return best.d;
}
/** World-frame mesh of a part node ("spine:nerve_drg_procedural"): parts are stored centred on their own origin. */
export async function partMesh(file, node) {
  const m = await nodeMesh(join(ROOT, "public/pathways", `${file}.glb`), node);
  const off = PARTS[file]?.worldOffset;
  if (off && !m.shifted) {
    for (let i = 0; i < m.tris.length; i += 3) for (let a = 0; a < 3; a++) m.tris[i + a] += off[a];
    for (let a = 0; a < 3; a++) {
      m.lo[a] += off[a];
      m.hi[a] += off[a];
    }
    m.grids = [null, null, null];
    m.cells = null;
    m.shifted = true;
  }
  return m;
}
/** The mirror image (x -> -x) of a part node: Z-Anatomy parts of paired organs exist on the left side only. */
const MIRRORED = new Map();
export async function partMeshMirrored(file, node) {
  const k = `${file}/${node}`;
  if (MIRRORED.has(k)) return MIRRORED.get(k);
  const m = await partMesh(file, node);
  const t = new Float32Array(m.tris);
  for (let i = 0; i < t.length; i += 3) t[i] = -t[i];
  const out = new TriMesh(t, node + "@mirror");
  MIRRORED.set(k, out);
  return out;
}
/** A point inside a mesh host as close as possible to p (the point itself when inside): shells of growing radius. */
export async function insideNear(key, p, maxR = 0.02, nearest = false) {
  const h = await hostOf(key);
  if (h.test(p)) return p.slice();
  for (let r = 0.0002; r <= maxR; r *= 1.25) {
    let best = null;
    for (let k = 0; k < 400; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const q = [p[0] + r * Math.sin(ph) * Math.cos(th), p[1] + r * Math.sin(ph) * Math.sin(th), p[2] + r * Math.cos(ph)];
      if (!h.test(q)) continue;
      if (nearest) return q;
      const d = h.meshes ? Math.min(...h.meshes.map((m) => m.dist(q, 0.004))) : 0;
      if (!best || d > best.d) best = { q, d };
    }
    if (best) return best.q;
  }
  throw new Error(`insideNear ${key}: nothing inside within ${maxR} m of ${p.map((v) => v.toFixed(4))}`);
}
/** The body context (skin, limb bones, muscles): the same optimised file the app draws and the validator checks. */
export async function bodyMesh(node) {
  const pub = join(ROOT, "public/pathways/v3/body.glb");
  return nodeMesh(existsSync(pub) ? pub : join(ROOT, "_atlas/pw3_raw/body.glb"), node);
}

/** Resolves a host key to an inside test (with a tolerance in metres) and, for meshes, the TriMesh. */
export async function hostOf(key) {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "a") {
    const ms = await atlasMeshes(id.split("@")[0]);
    return { kind, meshes: ms, test: (p, tol = 0) => ms.some((m) => m.inside(p)) || (tol > 0 && ms.some((m) => m.dist(p, tol * 2) <= tol)) };
  }
  if (kind === "b") {
    const m = await bodyMesh(id);
    return { kind, meshes: [m], test: (p, tol = 0) => m.inside(p) || (tol > 0 && m.dist(p, tol * 2) <= tol) };
  }
  if (kind === "part" || kind === "pr") {
    const [file, node] = id.split("/");
    const m = kind === "pr" ? await partMeshMirrored(file, node) : await partMesh(file, node);
    return { kind, meshes: [m], test: (p, tol = 0) => m.inside(p) || (tol > 0 && m.dist(p, tol * 2) <= tol) };
  }
  if (kind === "n") {
    const c = curveByKey(id);
    return { kind, curve: c, thin: true, test: (p, tol = 0) => c.contains(p, tol) };
  }
  if (kind === "p") {
    const q = PROXIES.get(id);
    if (!q) throw new Error(`no proxy ${id}`);
    return { kind, proxy: q, test: (p, tol = 0) => inEllipsoid(q, p, tol) };
  }
  if (kind === "t") {
    const t = TUBES.get(id);
    if (!t) throw new Error(`no tube ${id}`);
    return { kind, tube: t, thin: true, test: (p, tol = 0) => polyDist(t.pts, p) <= t.r + tol };
  }
  throw new Error(`bad host key ${key}`);
}

/* ------------------------------------------------------------------ fibres */
export class Fibre {
  constructor(order, tag = "") {
    this.order = order;
    this.tag = tag;
    this.pts = [];
    this.seg = []; // [startIndex, hostKey]
  }
  get end() {
    return this.pts[this.pts.length - 1];
  }
  add(pts, host) {
    const start = this.pts.length;
    for (const p of pts) {
      if (this.pts.length && dist(this.end, p) < 0.00015) continue;
      this.pts.push(p.map((v) => Math.round(v * 1e5) / 1e5));
    }
    if (this.pts.length > start) {
      const last = this.seg[this.seg.length - 1];
      if (!last || last[1] !== host) this.seg.push([start, host]);
    }
    return this;
  }
  from(p, host) {
    return this.add([p], host);
  }
  /** Along a nerve curve between two arc lengths (or the points nearest to two positions). */
  curve(c, a, b, off = 0, side = [1, 0, 0]) {
    const s0 = typeof a === "number" ? a : c.nearest(a).s;
    const s1 = typeof b === "number" ? b : c.nearest(b).s;
    return this.add(c.run(s0, s1, 0.0012, off, side), `n:${c.key}`);
  }
  /** The most interior route through the union of the hosts to p. `hosts` are host keys (a:, p:, b:, part:, t:, n:). */
  async routeTo(hosts, p, opt = {}) {
    const meshes = [];
    const extras = [];
    for (const k of hosts) {
      const h = await hostOf(k);
      if (h.meshes) meshes.push(...h.meshes);
      else extras.push(h.test);
    }
    const t0 = Date.now();
    const r = route(meshes.length ? meshes : [], this.end, p, { ...opt, extra: extras.length ? (q) => extras.some((t) => t(q)) : undefined, box: opt.box ?? (meshes.length ? undefined : boxOf([this.end, p], 0.003)) });
    if (process.env.PW3_DEBUG) console.error(`  route ${hosts.join("+")} ${((Date.now() - t0) / 1000).toFixed(1)} s grid ${r.dims?.join("x") ?? ""}`);
    const pts = resample([this.end, ...r.pts.slice(1, -1), p], opt.step ?? 0.0008);
    // the voxel path and its resampling can graze a thin wall: nudge any sample that the exact (ray-parity) test puts outside
    const tests = [];
    for (const k of hosts) tests.push((await hostOf(k)).test);
    const ok = (q) => tests.some((t) => t(q));
    for (let i = 1; i < pts.length; i++) pts[i] = nudgeInside(pts[i], ok);
    return this.add(pts.slice(1), hosts.length === 1 ? hosts[0] : `u:${hosts.join("|")}`);
  }
  /** A run through a cord tract: the most interior point of the tract's half cross-section every `step` metres of height. */
  async cord(tract, y0, y1, sgn, pref = null, step = 0.002) {
    const m = await atlasMesh(tract);
    const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / step));
    const pts = [];
    // each level's most interior point, pulled toward the previous one so the run stays in one bundle
    let near = this.pts.length ? [this.end[0], this.end[2]] : null;
    for (let k = 0; k <= n; k++) {
      const y = y0 + ((y1 - y0) * k) / n;
      const c = sliceCentre(m, Math.min(m.hi[1] - 0.0003, Math.max(m.lo[1] + 0.0003, y)), sgn, pref, 0.3, near, 0.6);
      // a level where the tract mesh is degenerate (segment seams) can put the centre far off: skip it
      if (c && near && Math.hypot(c.p[0] - near[0], c.p[2] - near[1]) > 0.0022) continue;
      if (c) {
        pts.push(c.p);
        near = [c.p[0], c.p[2]];
      }
    }
    // a skipped level leaves a longer step: resample to 1 mm (the tract is a near-vertical tube, the chords stay inside)
    return this.add(resample(pts, 0.001), `a:${tract}`);
  }
  /** From the current end (a nerve's tip, just outside a mesh) straight into the mesh: the short step belongs to both hosts. */
  async enter(meshKey, maxR = 0.01, depth = 0.0015) {
    const q1 = await insideNear(meshKey, this.end, maxR, true);
    const prev = this.seg[this.seg.length - 1][1].replace(/^u:/, "");
    const gap = dist(this.end, q1);
    if (gap > 0.0006) {
      // the curve stops short of the mesh it supplies (Z-Anatomy ends nerves at the surface): a flagged, undrawn seam
      const id = `enter-${meshKey.replace(/[^a-z0-9]+/gi, "-")}-${this.end.map((v) => Math.round(v * 1e4)).join("_")}`;
      const key = tube(id, "Nerve ending into its target", [this.end, q1], Math.max(0.0005, gap * 0.5), "the nerve curve ends short of the target mesh", true);
      this.lineTo(q1, `u:${key}|${meshKey}`, 0.0003);
    } else this.lineTo(q1, `u:${prev}|${meshKey}`, 0.0003);
    // then a little deeper, in the same direction, while it stays inside
    const h = await hostOf(meshKey);
    const d = [q1[0] - this.pts[Math.max(0, this.pts.length - 2)][0], q1[1] - this.pts[Math.max(0, this.pts.length - 2)][1], q1[2] - this.pts[Math.max(0, this.pts.length - 2)][2]];
    const l = Math.hypot(...d) || 1;
    let q2 = q1;
    for (let t = depth; t > 0.0002; t *= 0.6) {
      const c = [q1[0] + (d[0] / l) * t, q1[1] + (d[1] / l) * t, q1[2] + (d[2] / l) * t];
      if (h.test(c)) {
        q2 = c;
        break;
      }
    }
    return q2 === q1 ? this : this.lineTo(q2, meshKey, 0.0004);
  }
  lineTo(p, host, step = 0.0008) {
    const a = this.end;
    const L = dist(a, p);
    const n = Math.max(1, Math.ceil(L / step));
    const pts = [];
    for (let k = 1; k <= n; k++) pts.push([a[0] + ((p[0] - a[0]) * k) / n, a[1] + ((p[1] - a[1]) * k) / n, a[2] + ((p[2] - a[2]) * k) / n]);
    return this.add(pts, host);
  }
  /** Splits off the samples from index i (for the next beat), sharing the junction point. */
  json() {
    return { order: this.order, tag: this.tag || undefined, pts: this.pts.flat(), seg: this.seg };
  }
}
const DIRS = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) {
  const l = Math.hypot(a, b, c);
  DIRS.push([a / l, b / l, c / l]);
}
/** The point itself when inside, else the nearest inside point within 0.6 mm (26 directions), else unchanged. */
export function nudgeInside(p, ok) {
  if (ok(p)) return p;
  for (const r of [0.00012, 0.00025, 0.0004, 0.0006])
    for (const d of DIRS) {
      const q = [p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r];
      if (ok(q)) return q;
    }
  return p;
}
export function boxOf(pts, pad) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], p[a] - pad);
    hi[a] = Math.max(hi[a], p[a] + pad);
  }
  return [lo, hi];
}
