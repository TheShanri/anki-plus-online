// Relays shared by several pathways: the thalamocortical radiation (thalamus -> internal capsule -> corona radiata -> cortex),
// the corticofugal descent (motor cortex -> capsule -> peduncle -> basis pontis -> pyramid), the limb chains and the cord.
import { Fibre, nuc, inSlice, cortexPoint, chain, synth, drgAt, rootCurve, caudaPath, cordY, sgnOf, atlasMeshes, dist } from "./common.mjs";
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
  await cor.routeTo(["a:mni-posterior-limb-of-internal-capsule", "a:white-matter-of-telencephalon", `a:${CORTEX[target][0]}`], goal, { sgn: s, minX: 0.002, h: 0.0008, spread: 0.2 });
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
