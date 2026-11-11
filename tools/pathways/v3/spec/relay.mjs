// Relays shared by several pathways: the thalamocortical radiation (thalamus -> internal capsule -> corona radiata -> cortex),
// the corticofugal descent (motor cortex -> capsule -> peduncle -> basis pontis -> pyramid), the limb chains and the cord.
import { Fibre, nuc, inSlice, cortexPoint, chain, synth, seam, drgAt, rootCurve, caudaPath, cordY, sgnOf, atlasMeshes, dist } from "./common.mjs";
import { insideNear } from "../lib/fibre.mjs";
import { atlasMesh, sliceCentre } from "../lib/geom.mjs";
import { splines } from "../lib/nerves.mjs";

/** A beat's output. */
export const B = (o = {}) => ({ f: [], stops: [], ...o });
export const soma = (p, host, order) => ({ p: p.map((v) => Math.round(v * 1e5) / 1e5), host, order });
export const stop = (key, name, extra = {}) => ({ key, name, ...extra });

/* ------------------------------------------------------------------ cortex targets (somatotopy) */
// near = [lateral distance (m), y, z] of a spot on the gyrus, mirrored to the side used.
export const CORTEX = {
  "s1-hand": ["postcentral-gyrus", [0.046, 1.676, -0.024], "S1 (hand area)"],
  "s1-leg": ["paracentral-gyrus-and-sulcus", [0.006, 1.688, -0.03], "S1 (leg area)"],
  "s1-face": ["postcentral-gyrus", [0.06, 1.653, -0.012], "S1 (face area)"],
  "m1-hand": ["precentral-gyrus", [0.044, 1.676, -0.004], "M1 (hand area)"],
  "m1-leg": ["paracentral-gyrus-and-sulcus", [0.006, 1.69, -0.012], "M1 (leg area)"],
  "m1-trunk": ["precentral-gyrus", [0.02, 1.692, -0.016], "M1 (trunk area)"],
  "m1-face": ["precentral-gyrus", [0.056, 1.652, 0.008], "M1 (face area)"],
};
export async function cortex(key, side) {
  const [id, near] = CORTEX[key];
  return cortexPoint(id, side, near);
}

/* ------------------------------------------------------------------ thalamus -> cortex */
/**
 * The 3rd-order relay from a thalamic nucleus to the cortex, split into the beats the map uses:
 *  leave: nucleus -> posterior limb of the internal capsule; capsule: up the capsule; corona: corona radiata -> cortex.
 */
export async function thalamocortical(side, nucleusId, target) {
  const n = await nuc(nucleusId, side);
  const s = sgnOf(side);
  const plic = await inSlice("mni-posterior-limb-of-internal-capsule", side, 1.6245, [0.62, 0.5]);
  const capTop = await inSlice("mni-posterior-limb-of-internal-capsule", side, 1.6345, [0.55, 0.5]);
  const goal = await cortex(target, side);
  const leave = new Fibre(3).from(n.c, n.key);
  await leave.routeTo([n.key, "a:thalamus", "a:mni-posterior-limb-of-internal-capsule"], plic, { sgn: s, minX: 0.001, h: 0.0004 });
  const cap = new Fibre(3).from(plic, "a:mni-posterior-limb-of-internal-capsule");
  await cap.routeTo(["a:mni-posterior-limb-of-internal-capsule"], capTop, { sgn: s, minX: 0.002, h: 0.0004 });
  const cor = new Fibre(3).from(capTop, "a:mni-posterior-limb-of-internal-capsule");
  await cor.routeTo(["a:mni-posterior-limb-of-internal-capsule", "a:white-matter-of-telencephalon", `a:${CORTEX[target][0]}`], goal, { sgn: s, minX: 0.002, h: 0.0008, spread: 0.2, smooth: 14 });
  return { n, leave, cap, cor, goal };
}

/* ------------------------------------------------------------------ limb chains */
/** The fingertip of the little finger (ulnar side), the start of the C8 chain. */
export function ulnarTip(side) {
  let best = null;
  for (const c of splines("Proper palmar digital branches of ulnar nerve", side)) for (const p of [c.a, c.b]) if (!best || p[1] < best[1]) best = p;
  return best;
}
/** Skin of the little finger to the C8 dorsal root ganglion, in the real ulnar nerve, inferior trunk and C8 root. */
export function ulnarToDrg(f, side, off = 0) {
  chain(f, side, [
    "Proper palmar digital branches of ulnar nerve",
    "Common palmar digital branches of ulnar nerve",
    "Superficial branch of ulnar nerve",
    "Ulnar nerve",
    "Anterior division of inferior trunk of brachial plexus",
    "Inferior trunk of brachial plexus",
    ["Roots of brachial plexus", { pickEnd: drgAt("C8", side) }],
  ], off);
  return f;
}
/** The tip of the big toe (medial plantar nerve), the start of the L5 chain. */
export function plantarTip(side) {
  // the most medial digital branch is the big toe's
  let best = null;
  for (const c of splines("Proper plantar digital branches of medial plantar nerve", side)) if (!best || Math.abs(c.a[0]) < Math.abs(best.a[0])) best = c;
  return best.b;
}
/** Big toe to the L5 ganglion: medial plantar, tibial and sciatic nerves (real), then the L5 ventral ramus (synthetic). */
export function plantarToDrg(f, side, off = 0) {
  chain(f, side, ["Proper plantar digital branches of medial plantar nerve", ["Common plantar digital branches of medial plantar nerve", { gap: 0.004 }], ["Medial plantar nerve", { spline: 0, gap: 0.004 }], "Tibial nerve", ["Sciatic nerve", { spline: 0 }]], off);
  const g = drgAt("L5", side);
  synth(f, `l5-ramus-${side}`, "L5 spinal nerve (ventral ramus)", [[(f.end[0] + g[0]) / 2, (f.end[1] + g[1]) / 2 + 0.002, (f.end[2] + g[2]) / 2], g], 0.0016, "Z-Anatomy has no lumbosacral trunk: the L5 ventral ramus joins the sciatic nerve to the L5 ganglion");
  return f;
}

/** From a ganglion into the cord: the real dorsal root (C2 to L2) or a synthetic root up the cauda equina (L3 and below). */
export async function dorsalRootIn(f, seg, side) {
  const c = rootCurve("dorsal", seg, side);
  if (c) f.curve(c, c.length, 0);
  else synth(f, `dorsal-root-${seg}-${side}`, `Dorsal root ${seg} (cauda equina)`, caudaPath(seg, side, true), 0.0007, "Z-Anatomy draws the cauda equina as one bundle: the root climbs the vertebral canal to its segment in the conus");
  return f;
}
/** Out of the cord: the real ventral root (C2 to L2) or a synthetic one down the cauda equina, ending at the ganglion level. */
export async function ventralRootOut(f, seg, side) {
  const c = rootCurve("ventral", seg, side);
  if (c) {
    f.lineTo(c.a, "a:spinal-cord");
    f.curve(c, 0, c.length);
  } else {
    const pts = caudaPath(seg, side, false).reverse();
    synth(f, `ventral-root-${seg}-${side}`, `Ventral root ${seg} (cauda equina)`, [...pts.slice(1), drgAt(seg, side)], 0.0007, "Z-Anatomy draws the cauda equina as one bundle: the ventral root runs down the vertebral canal");
  }
  return f;
}

/** A cord tract run on one side from y0 to y1 (the tract's most interior point every 2 mm). */
export async function tractRun(f, tract, side, y0, y1, pref = null) {
  return f.cord(tract, y0, y1, sgnOf(side), pref);
}
export const CORD_TOP = 1.5438;
export { cordY, drgAt, nuc, inSlice, sliceCentre, atlasMesh, atlasMeshes, dist, Fibre };

/* ------------------------------------------------------------------ joining fibres */
/** One fibre made of several consecutive pieces (beats that the beat model draws as one stretch). */
export function joinFibres(order, parts, tag = "") {
  const f = new Fibre(order, tag);
  for (const p of parts) {
    const pts = [];
    for (let i = 0; i < p.pts.length; i++) pts.push(p.pts[i]);
    p.seg.forEach(([start, host], k) => {
      const end = k + 1 < p.seg.length ? p.seg[k + 1][0] : p.pts.length;
      f.add(pts.slice(start, end), host);
    });
  }
  return f;
}

/* ------------------------------------------------------------------ corticofugal descent */
/**
 * The upper motor neuron's descent from a cortex target (CORTEX key) on side `cx` (the cortex side), split into the stretches
 * the beat model uses: leave (layer V into the white matter), capsule (corona radiata and internal capsule), peduncle
 * (base of the cerebral peduncle), pons (longitudinal fibres of the basis pontis), pyramid (medullary pyramid).
 * Each piece is its own Fibre (order 1), continuing from the end of the previous one.
 */
export async function corticofugal(cx, target, opt = {}) {
  const s = sgnOf(cx);
  const soma = await cortex(target, cx);
  const gyrus = `a:${CORTEX[target][0]}`;
  const WM = "a:white-matter-of-telencephalon";
  const IC = "a:mni-internal-capsule";
  const cap = await inSlice("mni-internal-capsule", cx, 1.6255, opt.capPref ?? [0.55, 0.62]);
  const capLow = await inSlice("mni-internal-capsule", cx, 1.6195, [0.5, 0.6]);
  const ped = await inSlice("base-of-peduncle", cx, 1.6075, [0.5, 0.7]);
  const pedLow = await inSlice("base-of-peduncle", cx, 1.6035, [0.35, 0.8]);
  const pons = await inSlice("mni-longitudinal-fibers-of-the-pons", cx, 1.585, [0.4, 0.7]);
  const ponsLow = await inSlice("mni-longitudinal-fibers-of-the-pons", cx, 1.5785, [0.4, 0.7]);
  const pyr = await inSlice("pyramid-of-medulla-oblongata", cx, 1.5705, [0.4, 0.6]);
  const pyrLow = await inSlice("pyramid-of-medulla-oblongata", cx, 1.5632, [0.4, 0.6]);
  // layer V cell body, then a short run down into the white matter under the gyrus
  const under = await insideNear(WM, [soma[0] * 0.86, soma[1] - 0.008, soma[2]], 0.012);
  const leave = new Fibre(1).from(soma, gyrus);
  await leave.routeTo([gyrus, WM], under, { sgn: s, minX: 0.002, h: 0.0006, spread: 0.25 });
  const capsule = new Fibre(1).from(under, WM);
  await capsule.routeTo([WM, IC], cap, { sgn: s, minX: 0.002, h: 0.0006, spread: 0.2, smooth: 12 });
  await capsule.routeTo([IC], capLow, { sgn: s, minX: 0.002, h: 0.0004 });
  // the MNI capsule and the Z-Anatomy peduncle leave a seam of ~2-3 mm where the capsule continues into the crus cerebri
  const pedTop = await insideNear("a:base-of-peduncle", [capLow[0] * 0.85, 1.6155, capLow[2]], 0.006);
  const peduncle = new Fibre(1).from(capLow, IC);
  seam(peduncle, `ic-crus-${cx}`, "Internal capsule into the cerebral peduncle", [[(capLow[0] + pedTop[0]) / 2, (capLow[1] + pedTop[1]) / 2, (capLow[2] + pedTop[2]) / 2], pedTop], 0.0012, "the internal capsule (MNI) and the peduncle (Z-Anatomy) meshes do not touch: a 2-3 mm seam");
  await peduncle.routeTo(["a:base-of-peduncle"], ped, { sgn: s, minX: 0.001, h: 0.0003, label: "peduncle" });
  await peduncle.routeTo(["a:base-of-peduncle"], pedLow, { sgn: s, minX: 0.001, h: 0.0003 });
  const basis = new Fibre(1).from(pedLow, "a:base-of-peduncle");
  await basis.routeTo(["a:base-of-peduncle", "a:mni-longitudinal-fibers-of-the-pons", "a:pons"], pons, { sgn: s, minX: 0.0008, h: 0.0003 });
  await basis.routeTo(["a:mni-longitudinal-fibers-of-the-pons"], ponsLow, { sgn: s, minX: 0.0008, h: 0.0003 });
  const pyramid = new Fibre(1).from(ponsLow, "a:mni-longitudinal-fibers-of-the-pons");
  await pyramid.routeTo(["a:mni-longitudinal-fibers-of-the-pons", "a:pons", "a:medulla-oblongata", "a:pyramid-of-medulla-oblongata"], pyr, { sgn: s, minX: 0.0006, h: 0.0003 });
  await pyramid.routeTo(["a:pyramid-of-medulla-oblongata"], pyrLow, { sgn: s, minX: 0.0006, h: 0.0003 });
  return { soma, leave, capsule, peduncle, basis, pyramid, gyrus };
}

/** Motor decussation: from the pyramid's lower end across the midline (caudal medulla) into the lateral corticospinal tract. */
export const MOTOR_X = { y: 1.5455, yMax: 1.552, level: "caudal medulla (motor decussation)" };
export async function motorDecussation(from, cx) {
  const s = sgnOf(cx);
  const O = cx === "L" ? "R" : "L";
  const zc = (await inSlice("medulla-oblongata", "M", MOTOR_X.y, [0, 0.55]))[2];
  const cross = [0, MOTOR_X.y, zc];
  const lcstTop = await inSlice("lateral-corticospinal-tract", O, 1.5432);
  const f = new Fibre(1).from(from, "a:pyramid-of-medulla-oblongata");
  const mid = await inSlice("medulla-oblongata", cx, MOTOR_X.y + 0.004, [0.2, 0.6]);
  await f.routeTo(["a:pyramid-of-medulla-oblongata", "a:medulla-oblongata"], mid, { sgn: s, minX: 0.0004, h: 0.0003 });
  await f.routeTo(["a:medulla-oblongata"], cross, { h: 0.0003 });
  await f.routeTo(["a:medulla-oblongata", "a:white-matter-of-spinal-cord", "a:lateral-corticospinal-tract"], lcstTop, { sgn: -s, minX: 0.0003, h: 0.0003 });
  return { f, cross };
}

/* ------------------------------------------------------------------ lower motor neuron out */
/** Alpha motor neuron in the ventral horn at a segment: the most interior point of the lateral (limb) or medial (axial) column. */
export async function lmnAt(seg, side, column = "lateral") {
  const y = cordY(seg);
  return inSlice("anterior-horn-of-spinal-cord", side, y, column === "lateral" ? [0.85, 0.7] : [0.2, 0.85], 1.2);
}
/** From a descending tract (or the dorsal root) into the ventral horn, ending on the motor neuron (the synapse). */
export async function intoHorn(f, hosts, lmn, side) {
  await f.routeTo([...hosts, "a:white-matter-of-spinal-cord", "a:anterior-horn-of-spinal-cord"], lmn, { sgn: sgnOf(side), minX: 0.0003, h: 0.00025 });
  return f;
}
/** Motor neuron cell body -> out of the horn -> the real ventral root (C2-L2) or the synthetic cauda equina root -> the ganglion level. */
export async function lmnOut(lmn, seg, side) {
  const f = new Fibre(2).from(lmn, "a:anterior-horn-of-spinal-cord");
  const c = rootCurve("ventral", seg, side);
  if (c) {
    // to the cord surface where the root leaves (the root mesh starts ~0.5 mm outside the cord mesh), then along the root
    const exit = await insideNear("a:white-matter-of-spinal-cord", c.a, 0.003);
    await f.routeTo(["a:anterior-horn-of-spinal-cord", "a:white-matter-of-spinal-cord"], exit, { sgn: sgnOf(side), minX: 0.0003, h: 0.00025, snap: 0.003 });
    f.curve(c, 0, c.length);
  } else await ventralRootOut(f, seg, side);
  return f;
}
