// Shared pieces of the v3 pathway specs: side context, nucleus proxies (where the atlas has no mesh), cortex targets,
// the peripheral nerve chains (real Z-Anatomy curves), dorsal / ventral roots and the cord tracts.
import { atlasMesh, atlasMeshes, sliceCentre, insideAny } from "../lib/geom.mjs";
import { curve, splines, dist } from "../lib/nerves.mjs";
import { Fibre, proxy, tube, partMesh, hostOf } from "../lib/fibre.mjs";
import ANCH from "../../../../src/data/part-anchors.json" with { type: "json" };

export const SPINE = ANCH.spine;
export const anchor = (file, name, side) => {
  const t = ANCH[file];
  if (side === "R") {
    if (t[`${name}_R`]) return t[`${name}_R`].slice();
    const l = t[name];
    return l ? [-l[0], l[1], l[2]] : null;
  }
  return t[name] ? t[name].slice() : null;
};

/* ------------------------------------------------------------------ side context */
export function mkCtx(side) {
  const s = side === "L" ? 1 : -1;
  const O = side === "L" ? "R" : "L";
  return { S: side, O, s, sideOf: (rel) => (rel === "i" ? side : rel === "c" ? O : null), sg: (rel) => (rel === "i" ? s : rel === "c" ? -s : 0) };
}
export const sgnOf = (side) => (side === "L" ? 1 : -1);

/* ------------------------------------------------------------------ nucleus proxies */
// Placed inside their parent mesh at a level (fraction of the parent's height, or an absolute y) and a preferred spot of the
// half cross-section there ([0 medial .. 1 lateral, 0 dorsal .. 1 ventral]). Radii in metres (x, y, z).
// Only where the atlas has no mesh of its own; every proxy is validated inside its parent.
export const NUCLEI = {
  gracile: { name: "Gracile nucleus", parent: "medulla-oblongata", y: 1.5492, pref: [0.14, 0.06], r: [0.0009, 0.0022, 0.0009] },
  cuneate: { name: "Cuneate nucleus", parent: "medulla-oblongata", y: 1.5492, pref: [0.42, 0.08], r: [0.001, 0.0022, 0.001] },
  vpl: { name: "VPL nucleus", parent: "thalamus", y: 1.6205, pref: [0.82, 0.62], r: [0.0022, 0.0022, 0.0028] },
  vpm: { name: "VPM nucleus", parent: "thalamus", y: 1.6205, pref: [0.58, 0.62], r: [0.0018, 0.002, 0.0024] },
  vavl: { name: "VA/VL nucleus", parent: "thalamus", y: 1.6255, pref: [0.68, 0.86], r: [0.0022, 0.0024, 0.003] },
  md: { name: "MD nucleus", parent: "thalamus", y: 1.629, pref: [0.2, 0.55], r: [0.0018, 0.0024, 0.003] },
  "principal-v": { name: "Principal sensory nucleus of V", parent: "pons", y: 1.5915, pref: [0.62, 0.22], r: [0.0012, 0.0018, 0.0014] },
  "spinal-v": { name: "Spinal trigeminal nucleus", parent: "medulla-oblongata", y: 1.5565, pref: [0.72, 0.2], r: [0.0009, 0.006, 0.001] },
  "motor-v": { name: "Motor nucleus of V", parent: "pons", y: 1.5915, pref: [0.4, 0.22], r: [0.0011, 0.0016, 0.0012] },
  "mes-v": { name: "Mesencephalic nucleus of V", parent: "midbrain", y: 1.6085, pref: [0.4, 0.2], r: [0.0007, 0.003, 0.0007] },
  solitary: { name: "Solitary nucleus", parent: "medulla-oblongata", y: 1.5625, pref: [0.32, 0.1], r: [0.0008, 0.0045, 0.0009] },
  pprf: { name: "PPRF", parent: "pons", y: 1.585, pref: [0.18, 0.3], r: [0.0011, 0.0022, 0.0013] },
  pontine: { name: "Pontine nuclei", parent: "pons", y: 1.588, pref: [0.4, 0.82], r: [0.0022, 0.0028, 0.0018] },
  "reticular-pons": { name: "Pontine reticular formation", parent: "pons", y: 1.592, pref: [0.25, 0.42], r: [0.0014, 0.0025, 0.0014] },
  "reticular-med": { name: "Medullary reticular formation", parent: "medulla-oblongata", y: 1.562, pref: [0.3, 0.45], r: [0.0012, 0.003, 0.0012] },
  // Clarke's column: the medial base of the dorsal horn (lamina VII), C8-L2; shown at L2
  clarke: { name: "Clarke's nucleus", parent: "grey-matter-of-spinal-cord", y: 1.0765, pref: [0.2, 0.45], r: [0.0004, 0.0015, 0.0004] },
  dentate: { name: "Deep cerebellar nuclei", parent: "cerebellum", y: 1.578, pref: [0.32, 0.55], r: [0.0035, 0.003, 0.0035] },
  pretectal: { name: "Pretectal nucleus", parent: "midbrain", y: 1.6155, pref: [0.3, 0.12], r: [0.0009, 0.0009, 0.0009] },
  vta: { name: "Ventral tegmental area", parent: "midbrain", y: 1.6085, pref: [0.12, 0.72], r: [0.0012, 0.0016, 0.0012] },
  scn: { name: "Suprachiasmatic nucleus", parent: "hypothalamus", y: 1.6165, pref: [0.15, 0.95], r: [0.0008, 0.0008, 0.0008] },
  bnst: { name: "BNST", parent: "septal-nuclei", y: null, pref: [0.4, 0.8], r: [0.001, 0.001, 0.001] },
};
const PLACED = new Map();
/** Registers (once) the proxy of a nucleus on one side and returns { key, c, r, name }. */
export async function nuc(id, side) {
  const k = `${id}-${side}`;
  if (PLACED.has(k)) return PLACED.get(k);
  const d = NUCLEI[id];
  if (!d) throw new Error(`no nucleus ${id}`);
  const ms = await atlasMeshes(d.parent);
  const lo = Math.min(...ms.map((m) => m.lo[1])), hi = Math.max(...ms.map((m) => m.hi[1]));
  const y = d.y === null ? (lo + hi) / 2 : d.y < 1 ? lo + (hi - lo) * d.y : d.y;
  let best = null;
  for (const m of ms) {
    const c = sliceCentre(m, y, sgnOf(side), d.pref, 1.2);
    if (c && (!best || c.depth > best.depth * 0.5)) best = c;
  }
  if (!best) throw new Error(`nucleus ${id}: no slice of ${d.parent} at y=${y}`);
  // fit: move toward the deepest point of the section and shrink until the centre and the six poles are inside the parent
  let c = best.p.slice();
  let r = d.r.slice();
  const deep = (await Promise.all(ms.map(async (m) => sliceCentre(m, y, sgnOf(side))))).filter(Boolean).sort((a, b) => b.depth - a.depth)[0];
  const fits = (cc, rr) => {
    const pts = [cc];
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
      const q = cc.slice();
      q[a] += sg * rr[a];
      pts.push(q);
    }
    return pts.every((q) => insideAny(ms, q));
  };
  for (let it = 0; it < 24 && !fits(c, r); it++) {
    if (it % 2 === 0 && deep) c = c.map((v, a) => v + (deep.p[a] - v) * 0.15);
    else r = r.map((v) => v * 0.9);
  }
  // bilateral nuclei are mirror images: when the left proxy's mirror also fits and the slice search put this side > 1 mm away
  // from it (the cerebellum / pallidum slice heuristics can pick a different spot), take the mirror of the left one
  if (side === "R" && (id === "dentate" || id === "gpi" || NUCLEI[id].mirrorL)) {
    const L = await nuc(id, "L");
    const mc = [-L.c[0], L.c[1], L.c[2]];
    if (Math.hypot(mc[0] - c[0], mc[1] - c[1], mc[2] - c[2]) > 0.001 && fits(mc, L.r)) { c = mc; r = L.r.slice(); }
  }
  if (!fits(c, r)) throw new Error(`nucleus ${id}-${side} does not fit inside ${d.parent}`);
  const out = { key: proxy(k, d.name, d.parent, c, r), c, r, name: d.name, parent: d.parent };
  PLACED.set(k, out);
  return out;
}

/* ------------------------------------------------------------------ points inside meshes */
/** The most interior point of a structure's half cross-section at height y (absolute or fraction), with a preferred spot. */
export async function inSlice(id, side, y, pref = null, w = 0.8) {
  const ms = await atlasMeshes(id);
  const lo = Math.min(...ms.map((m) => m.lo[1])), hi = Math.max(...ms.map((m) => m.hi[1]));
  const yy = y < 1 ? lo + (hi - lo) * y : y;
  let best = null;
  for (const m of ms) {
    const c = sliceCentre(m, yy, side === "M" ? 0 : sgnOf(side), pref, w);
    if (c && (!best || c.depth > best.depth)) best = c;
  }
  if (!best) throw new Error(`no slice of ${id} at ${yy}`);
  return best.p;
}
/** A point in the cortex of a gyrus: the surface vertex nearest `near` on that side, then moved inward to the deepest spot. */
export async function cortexPoint(id, side, near) {
  const ms = await atlasMeshes(id);
  const s = sgnOf(side);
  const target = [near[0] * s, near[1], near[2]];
  let best = null;
  for (const m of ms) {
    const T = m.tris;
    for (let i = 0; i < T.length; i += 3) {
      if (T[i] * s <= 0.002) continue;
      const d = Math.hypot(T[i] - target[0], T[i + 1] - target[1], T[i + 2] - target[2]);
      if (!best || d < best.d) best = { d, p: [T[i], T[i + 1], T[i + 2]], m };
    }
  }
  if (!best) throw new Error(`cortexPoint ${id}`);
  // probe a small ball for the point deepest inside the gyrus
  let pick = null;
  for (let k = 0; k < 600; k++) {
    const r = 0.005 * Math.cbrt(Math.random());
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const q = [best.p[0] + r * Math.sin(ph) * Math.cos(th), best.p[1] + r * Math.sin(ph) * Math.sin(th), best.p[2] + r * Math.cos(ph)];
    if (q[0] * s <= 0.002 || !insideAny(ms, q)) continue;
    const dd = Math.min(...ms.map((m) => m.dist(q, 0.006)));
    if (!pick || dd > pick.dd) pick = { q, dd };
  }
  if (!pick) throw new Error(`cortexPoint ${id}: nothing inside near the surface`);
  return pick.q;
}

/* ------------------------------------------------------------------ peripheral chains */
/** Runs a fibre along a chain of nerve curves: each step takes the spline of the named nerve whose end is nearest the current
 * point (or the `pick` function's choice) and runs it to its other end (or to `stop`). Gaps above 2 mm throw. */
export function chain(f, side, steps, off = 0) {
  for (const st of steps) {
    const [name, opt = {}] = Array.isArray(st) ? st : [st];
    const cands = opt.spline !== undefined ? [curve(name, side, opt.spline)] : splines(name, side);
    let best = null;
    for (const c of cands) {
      for (const [end, other] of [["a", "b"], ["b", "a"]]) {
        const d = f.pts.length ? dist(c[end], f.end) : 0;
        const near = f.pts.length ? c.nearest(f.end) : null;
        // join at an end, or anywhere along the curve when opt.mid (a branch that leaves the trunk)
        const dd = opt.mid && near ? near.d : d;
        // with pickEnd, ties at the joint (several roots meet the trunk) go to the spline whose far end is nearest pickEnd
        const score = dd + (opt.pickEnd ? 0.05 * dist(c[other], opt.pickEnd) : 0);
        if (!best || score < best.score) best = { c, from: opt.mid && near ? near.s : c[end] === c.a ? 0 : c.length, to: opt.to !== undefined ? opt.to : other === "a" ? 0 : c.length, dd, score };
      }
    }
    if (f.pts.length && best.dd > (opt.gap ?? 0.0025)) throw new Error(`chain ${name}.${side}: gap ${(best.dd * 1000).toFixed(1)} mm`);
    let to = best.to;
    if (opt.stop) to = best.c.nearest(opt.stop).s;
    if (typeof opt.toEnd === "string") to = opt.toEnd === "a" ? 0 : best.c.length;
    f.curve(best.c, best.from, to, off, opt.side ?? [0, 0, 1]);
  }
  return f;
}

/** Synthetic connector (flagged in the validator report): a nerve segment Z-Anatomy does not model, drawn as a tube. */
export function synth(f, id, name, pts, r, why) {
  const all = [f.end, ...pts];
  const key = tube(id, name, all, r, why);
  for (const p of pts) f.lineTo(p, key, 0.0008);
  return key;
}

/** A seam between two atlas meshes that meet in the body but not in the model (a few mm): validated like a tube, not drawn. */
export function seam(f, id, name, pts, r, why) {
  const key = tube(id, name, [f.end, ...pts], r, why, true);
  for (const p of pts) f.lineTo(p, key, 0.0005);
  return key;
}

/* ------------------------------------------------------------------ spinal levels */
const LEVEL_ORDER = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "L1", "L2", "L3", "L4", "L5", "S1", "S2", "S3", "S4", "S5"];
export const cordY = (seg) => SPINE[`cord_${seg}`][1];
export const drgAt = (seg, side) => anchor("spine", `drg_${seg}`, side);
/** The real Z-Anatomy dorsal / ventral root of a level (C2 to L2: the spline that ends at the ganglion). */
export function rootCurve(kind, seg, side) {
  const g = drgAt(seg, side);
  const name = kind === "dorsal" ? "Posterior root of spinal nerve" : "Anterior root of spinal nerve";
  let best = null;
  for (const c of splines(name, side)) {
    const d = dist(c.b, g);
    if (!best || d < best.d) best = { c, d };
  }
  return best.d < 0.002 ? best.c : null;
}
/** Canal centre at a vertebral level (x = 0). */
const canal = (v) => SPINE[`${v}_foramen`];
const LUMBAR_V = ["S1", "L5", "L4", "L3", "L2", "L1"];
/**
 * A lumbosacral root (L3 to S5): Z-Anatomy draws the cauda equina as one bundle, so the root from the ganglion up the
 * vertebral canal to its segment in the conus is a synthetic tube along the canal (flagged).
 */
export function caudaPath(seg, side, dorsal) {
  const s = sgnOf(side);
  const g = drgAt(seg, side);
  const top = cordY(seg);
  const pts = [[g[0] * 0.55, g[1] + 0.002, g[2] + (dorsal ? -0.002 : 0.002)]];
  for (const v of LUMBAR_V) {
    const c = canal(v);
    if (c[1] <= g[1] + 0.004 || c[1] >= top - 0.006) continue;
    pts.push([s * 0.0032, c[1], c[2] + (dorsal ? -0.0025 : 0.0015)]);
  }
  const cz = SPINE[`cord_${seg}`][2];
  // up beside the conus to its segment, then into it (the last point is inside the cord)
  pts.push([s * 0.0026, top - 0.004, cz + (dorsal ? -0.0022 : 0.0012)]);
  pts.push([s * 0.0009, top, cz + (dorsal ? -0.0006 : 0.0004)]);
  return pts;
}
export { LEVEL_ORDER, Fibre, hostOf, partMesh, atlasMesh, atlasMeshes, curve, splines, dist };
