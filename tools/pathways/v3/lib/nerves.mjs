// Z-Anatomy nerve curves (exported by export_v3.py): centreline + radius per point, atlas world frame.
// A fibre that runs "in" a nerve follows its centreline with a small offset inside the radius (two lines side by side).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./geom.mjs";

let RAW = null;
function raw() {
  if (!RAW) RAW = JSON.parse(readFileSync(join(ROOT, "_atlas/pw3_raw/nerves.json"), "utf8"));
  return RAW;
}

export class Curve {
  constructor(key, pts, r) {
    this.key = key;
    this.pts = pts;
    this.r = r;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    this.length = this.cum[this.cum.length - 1];
  }
  get a() {
    return this.pts[0];
  }
  get b() {
    return this.pts[this.pts.length - 1];
  }
  /** Arc length of the point of the curve nearest to p, and the distance. */
  nearest(p) {
    let best = { s: 0, d: Infinity, i: 0 };
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2));
      const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < best.d) best = { s: this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]), d, i, q, r: this.r[i - 1] * (1 - t) + this.r[i] * t };
    }
    return best;
  }
  at(s) {
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const t = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1e-12);
    const a = this.pts[i - 1], b = this.pts[i];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], r: this.r[i - 1] * (1 - t) + this.r[i] * t, tan: norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]) };
  }
  /** Is p inside the nerve (distance to the centreline within the local radius + tol)? */
  contains(p, tol = 0) {
    const n = this.nearest(p);
    return n.d <= n.r + tol;
  }
  /**
   * Samples from arc length s0 to s1 (either direction) every `step`, offset from the centreline by `off` x the local radius
   * along a fixed side vector (`side`, made perpendicular to the tangent at each point).
   */
  run(s0, s1, step = 0.0012, off = 0, side = [1, 0, 0]) {
    const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
    const out = [];
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      const { p, r, tan } = this.at(s);
      if (off) {
        const d = side[0] * tan[0] + side[1] * tan[1] + side[2] * tan[2];
        let v = norm([side[0] - tan[0] * d, side[1] - tan[1] * d, side[2] - tan[2] * d]);
        if (!isFinite(v[0])) v = [0, 0, 1];
        out.push([p[0] + v[0] * r * off, p[1] + v[1] * r * off, p[2] + v[2] * r * off]);
      } else out.push(p);
    }
    return out;
  }
}
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1e-12;
  return [v[0] / l, v[1] / l, v[2] / l];
};

const CACHE = new Map();
/** One spline of a Z-Anatomy nerve: name without the side suffix, side "L" / "R" (patient's side), spline index. */
/** Z-Anatomy names a few right-side objects without the ".r" suffix. */
function fullName(name, side) {
  if (!side) return name;
  const f = `${name}.${side === "L" ? "l" : "r"}`;
  return raw()[f] || !raw()[name] ? f : name;
}
export function curve(name, side, spline = 0) {
  const full = fullName(name, side);
  const key = `${full}#${spline}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const s = raw()[full];
  if (!s) throw new Error(`nerve curve missing: ${full}`);
  const sp = s[spline];
  if (!sp) throw new Error(`nerve ${full}: no spline ${spline} (has ${s.length})`);
  const c = new Curve(key, sp.p, sp.r);
  CACHE.set(key, c);
  return c;
}
/** Every spline of a nerve. */
export function splines(name, side) {
  const full = fullName(name, side);
  const s = raw()[full];
  if (!s) throw new Error(`nerve curve missing: ${full}`);
  return s.map((_, i) => curve(name, side, i));
}
/** The spline of a nerve whose start or end lies nearest to p. */
export function splineNear(name, side, p) {
  let best = null;
  for (const c of splines(name, side)) {
    const d = Math.min(dist(c.a, p), dist(c.b, p));
    if (!best || d < best.d) best = { c, d };
  }
  return best.c;
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Curve from its key ("Name.l#0"). */
export function curveByKey(key) {
  if (CACHE.has(key)) return CACHE.get(key);
  const [full, sp] = key.split("#");
  const s = raw()[full];
  if (!s) throw new Error(`nerve curve missing: ${full}`);
  const c = new Curve(key, s[Number(sp)].p, s[Number(sp)].r);
  CACHE.set(key, c);
  return c;
}
