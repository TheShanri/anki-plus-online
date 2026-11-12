// Descending (motor) pathways: corticospinal (lateral and anterior), corticobulbar, the brainstem UMN tracts (rubrospinal,
// tectospinal, reticulospinal, vestibulospinal) and the UMN / LMN overview. Depth: Lecture 10 and Lab 10 (docs/PATHWAY_AUDIT.md).
//
// `side` is the side the beat model calls "i" (src/components/atlas/pathways/buildPathwayScene.ts, pathway-map.json):
//  - lcst, umn-lmn, corticobulbar: the side of the muscle; the upper motor neuron's cortex is the opposite side (rel "c");
//  - acst, reticulospinal, vestibulospinal: one side throughout (the beat model has no "c");
//  - rubrospinal, tectospinal: the side of the red nucleus / colliculus; the tract and its targets are the opposite side.
import { Fibre, inSlice, dist, cordY, nuc, sliceCentre, atlasMeshes } from "./relay.mjs";
import { B, soma, stop, motorDecussation, MOTOR_X, lmnAt, intoHorn, lmnOut, tractRun, CORTEX, joinFibres, cortex, CORD_TOP } from "./relay.mjs";
import { chain, sgnOf, synth, seam, rootCurve, drgAt } from "./common.mjs";
import { insideNear, hostOf } from "../lib/fibre.mjs";
import { curve, splines } from "../lib/nerves.mjs";

export const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
export const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const opp = (side) => (side === "L" ? "R" : "L");
const proxyStop = (n) => stop(n.key, n.name);

const WM = "a:white-matter-of-telencephalon";
const PLIC = "mni-posterior-limb-of-internal-capsule";
const GENU = "mni-genu-of-internal-capsule";
const PED = "base-of-peduncle";
const LONG = "mni-longitudinal-fibers-of-the-pons";
const PYR = "pyramid-of-medulla-oblongata";
// the motor decussation sits at the brainstem / spinal cord junction (Lab 10 slide 19; Lecture 10 slides 14-15:
// "at the inferior end of the medulla"); the course calls the level of the gracile / cuneate tubercles "caudal medulla"
const MOTOR_LEVEL = "brainstem/spinal cord junction";

/* ------------------------------------------------------------------ the cortical efferent descent */
/**
 * Layer V of a motor cortex area on side `cx` down the cortical efferent pathway (Lecture 10 slide 12): corona radiata,
 * internal capsule (posterior limb for corticospinal fibres, the app's settled decision; genu for corticobulbar ones),
 * cerebral peduncle, longitudinal fibres of the pons, then (corticospinal) the medullary pyramid. Each stretch is its own
 * Fibre (order 1) so the beats can show them one by one.
 */
async function descent(cx, target, o = {}) {
  const s = sgnOf(cx);
  const genu = o.capsule === "genu";
  const capId = genu ? GENU : PLIC;
  const CAP = `a:${capId}`;
  const somaP = await cortex(target, cx);
  const gyrus = `a:${CORTEX[target][0]}`;
  // capsule entry from the corona radiata and its lowest point above the crus cerebri
  // (the MNI genu touches the Z-Anatomy white matter only at its upper lateral edge, y ~1.641: enter it there)
  const capTop = genu ? await inSlice(GENU, cx, 1.6395) : await inSlice(PLIC, cx, 1.6305, [0.78, 0.45], 1.2);
  const capMid = genu ? await inSlice(GENU, cx, 1.6315, [0.62, 0.5]) : null;
  const capLow = genu ? await inSlice(GENU, cx, 1.6232, [0.62, 0.5]) : await inSlice(PLIC, cx, 1.6212, [0.62, 0.5], 1.2);
  // a corona radiata point straight above the capsule, so the route cannot wander into another limb of the capsule
  const corona = await insideNear(WM, genu ? [capTop[0] + s * 0.002, capTop[1] + 0.008, capTop[2]] : [capTop[0] + s * 0.004, capTop[1] + 0.012, capTop[2] - 0.002], 0.01);
  const under = await insideNear(WM, [somaP[0] * 0.86, somaP[1] - 0.008, somaP[2]], 0.012);
  const leave = new Fibre(1).from(somaP, gyrus);
  await leave.routeTo([gyrus, WM], under, { sgn: s, minX: 0.002, h: 0.0006, spread: 0.25 });
  const capsule = new Fibre(1).from(under, WM);
  // (from the lateral face area the corona radiata arches over the putamen: let the search box reach above both points)
  const top = Math.max(under[1], corona[1]) + 0.008;
  await capsule.routeTo([WM], corona, { sgn: s, minX: 0.002, h: 0.0007, spread: 0.15, smooth: 12, box: [[Math.min(under[0], corona[0]), Math.min(under[1], corona[1]) - 0.004, Math.min(under[2], corona[2]) - 0.004], [Math.max(under[0], corona[0]), top, Math.max(under[2], corona[2]) + 0.004]] });
  await capsule.routeTo([WM, CAP], capTop, { sgn: s, minX: 0.002, h: genu ? 0.0003 : 0.0005, spread: 0.2, smooth: 8 });
  // (the genu mesh is thin: its voxels break up, so the whole-capsule mesh, which coincides with it here, joins them)
  const capHosts = genu ? [CAP, "a:mni-internal-capsule"] : [CAP];
  if (capMid) await capsule.routeTo(capHosts, capMid, { sgn: s, minX: 0.002, h: 0.0003, spread: 0.2 });
  await capsule.routeTo(capHosts, capLow, { sgn: s, minX: 0.002, h: genu ? 0.0003 : 0.0004, spread: 0.2 });
  // the MNI capsule and the Z-Anatomy peduncle do not touch: a hidden seam of a few mm where the capsule becomes the crus
  const pedTop = await insideNear(`a:${PED}`, [capLow[0] * (genu ? 1 : 0.85), 1.6158, capLow[2]], 0.006);
  const ped = await inSlice(PED, cx, 1.6085, o.pedPref ?? [0.5, 0.7]);
  const pedLow = await inSlice(PED, cx, 1.6035, o.pedLowPref ?? [0.35, 0.8]);
  const peduncle = new Fibre(1).from(capLow, CAP);
  const seamPts = [[(capLow[0] + pedTop[0]) / 2, (capLow[1] + pedTop[1]) / 2, (capLow[2] + pedTop[2]) / 2], pedTop];
  seam(peduncle, `ic-crus-${genu ? "genu" : "plic"}-${cx}`, "Internal capsule into the cerebral peduncle", seamPts, 0.0012, "the internal capsule (MNI) and the peduncle (Z-Anatomy) meshes do not touch: a seam of a few mm");
  await peduncle.routeTo([`a:${PED}`], ped, { sgn: s, minX: 0.001, h: 0.0003 });
  await peduncle.routeTo([`a:${PED}`], pedLow, { sgn: s, minX: 0.001, h: 0.0003 });
  // longitudinal fibres of the pons, down to `ponsLowY`
  const ponsY = o.ponsY ?? 1.585;
  const ponsLowY = o.ponsLowY ?? 1.5785;
  const pons = await inSlice(LONG, cx, ponsY, [0.4, 0.7]);
  const basis = new Fibre(1).from(pedLow, `a:${PED}`);
  await basis.routeTo([`a:${PED}`, `a:${LONG}`, "a:pons"], pons, { sgn: s, minX: 0.0008, h: 0.0003 });
  if (ponsLowY < ponsY - 0.001) await basis.routeTo([`a:${LONG}`], await inSlice(LONG, cx, ponsLowY, [0.4, 0.7]), { sgn: s, minX: 0.0008, h: 0.0003 });
  return { soma: somaP, gyrus, leave, capsule, peduncle, basis };
}
/** On into the medullary pyramid (corticospinal fibres, and the last corticobulbar ones). */
async function intoPyramid(from, cx, yLow = 1.5632) {
  const s = sgnOf(cx);
  const pyr = await inSlice(PYR, cx, 1.5705, [0.4, 0.6]);
  const pyrLow = await inSlice(PYR, cx, yLow, [0.4, 0.6]);
  const f = new Fibre(1).from(from, `a:${LONG}`);
  await f.routeTo([`a:${LONG}`, "a:pons", "a:medulla-oblongata", `a:${PYR}`], pyr, { sgn: s, minX: 0.0006, h: 0.0003 });
  if (yLow < pyr[1] - 0.001) await f.routeTo([`a:${PYR}`], pyrLow, { sgn: s, minX: 0.0006, h: 0.0003 });
  return f;
}

/* ------------------------------------------------------------------ peripheral motor chains */
/** C8 ventral ramus to the intrinsic hand muscles: brachial plexus root, inferior trunk, ulnar nerve, its deep branch (real curves). */
export async function ulnarMotor(f, side) {
  const deep = curve("Deep branch of ulnar nerve", side, 0);
  chain(f, side, [
    ["Roots of brachial plexus", { gap: 0.003 }],
    "Inferior trunk of brachial plexus",
    "Anterior division of inferior trunk of brachial plexus",
    "Ulnar nerve",
    ["Superficial branch of ulnar nerve", { stop: deep.a }],
    ["Deep branch of ulnar nerve", { gap: 0.008 }],
  ]);
  return f.enter(`b:muscle_hand_${side}`);
}

/* ------------------------------------------------------------------ lateral corticospinal tract */
// One build per side for the corticospinal pieces (lcst and umn-lmn share them).
const CST = new Map();
async function corticospinal(side) {
  if (CST.has(side)) return CST.get(side);
  const p = (async () => {
    const cx = opp(side); // the cortex (upper motor neuron) is contralateral to the limb
    const d = await descent(cx, "m1-hand");
    d.pyramid = await intoPyramid(d.basis.end, cx);
    // the pyramidal (motor) decussation: about 80 % of the fibres cross at the brainstem / spinal cord junction
    d.x = await motorDecussation(d.pyramid.end, cx);
    // down the lateral corticospinal tract (dorsolateral lateral funiculus, limb side) to C8, then into the lateral (limb)
    // part of the ventral horn: the synapse on the alpha motor neuron
    d.lmn = await lmnAt("C8", side, "lateral");
    d.tract = new Fibre(1).from(d.x.f.end, "a:lateral-corticospinal-tract");
    await tractRun(d.tract, "lateral-corticospinal-tract", side, 1.5425, cordY("C8") + 0.0025);
    await intoHorn(d.tract, ["a:lateral-corticospinal-tract"], d.lmn, side);
    // the lower motor neuron: out of the horn by the C8 ventral root, then the brachial plexus and ulnar nerve to the hand
    d.out = await lmnOut(d.lmn, "C8", side);
    d.nerve = new Fibre(2).from(d.out.end, d.out.seg[d.out.seg.length - 1][1]);
    await ulnarMotor(d.nerve, side);
    d.cx = cx;
    return d;
  })();
  CST.set(side, p);
  return p;
}

export const lcst = {
  async build(side) {
    const d = await corticospinal(side);
    const cx = d.cx;
    const beats = [];
    beats[0] = B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", cx, CORTEX["m1-hand"][2])] });
    beats[1] = B({ f: [d.leave.json()] });
    beats[2] = B({ f: [d.capsule.json()] });
    beats[3] = B({ f: [d.peduncle.json()] });
    beats[4] = B({ f: [d.basis.json()] });
    beats[5] = B({ f: [d.pyramid.json()] });
    beats[6] = B({ f: [d.x.f.json()], cross: { p: d.x.cross, host: "a:medulla-oblongata", level: MOTOR_LEVEL, yMax: MOTOR_X.yMax, name: "Pyramidal (motor) decussation" } });
    beats[7] = B({ f: [d.tract.json()], syn: soma(d.lmn, "a:anterior-horn-of-spinal-cord", 1) });
    // 8 the uncrossed 20 %: the anterior corticospinal tract on the cortex side (branches from the end of the pyramid)
    const un = new Fibre(1).from(d.pyramid.end, `a:${PYR}`);
    const acTop = await inSlice("anterior-corticospinal-tract", cx, 1.5432);
    await un.routeTo([`a:${PYR}`, "a:medulla-oblongata", "a:white-matter-of-spinal-cord", "a:anterior-corticospinal-tract"], acTop, { sgn: sgnOf(cx), minX: 0.0001, h: 0.0003 });
    await tractRun(un, "anterior-corticospinal-tract", cx, 1.5425, cordY("C8") + 0.004);
    beats[8] = B({ f: [un.json()] });
    // 9 the lower motor neuron's cell body (lamina IX, lateral column at C8)
    beats[9] = B({ soma: soma(d.lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [stop("a:anterior-horn-of-spinal-cord@" + side, "Ventral horn (C8)")] });
    beats[10] = B({ f: [d.out.json()] });
    beats[11] = B({ f: [d.nerve.json()], syn: soma(d.nerve.end, `b:muscle_hand_${side}`, 2) });
    beats[12] = B({ stops: [carve(`b:muscle_hand_${side}`, d.nerve.end, 0.035, "Hand muscles")] });
    return beats;
  },
};

/* ------------------------------------------------------------------ UMN / LMN overview */
export const umnLmn = {
  async build(side) {
    const d = await corticospinal(side);
    const cx = d.cx;
    const umn = joinFibres(1, [d.leave, d.capsule, d.peduncle, d.basis, d.pyramid, d.x.f, d.tract]);
    return [
      B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", cx, CORTEX["m1-hand"][2])] }),
      // the whole upper motor neuron: cortex, capsule, brainstem, the crossing, the lateral corticospinal tract, the synapse
      B({ f: [umn.json()], syn: soma(d.lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(d.lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [stop("a:anterior-horn-of-spinal-cord@" + side, "Ventral horn (C8)")] }),
      B({ f: [d.out.json()] }),
      B({ f: [d.nerve.json()], syn: soma(d.nerve.end, `b:muscle_hand_${side}`, 2) }),
      B({ stops: [carve(`b:muscle_hand_${side}`, d.nerve.end, 0.035, "Hand muscles")] }),
    ];
  },
};

/* ------------------------------------------------------------------ helpers for brainstem nuclei and head targets */
/** The deepest point of a small atlas nucleus on one side (its half cross-sections every 0.2 mm). */
async function deepIn(id, side, y0 = null, y1 = null) {
  const ms = await atlasMeshes(id);
  const lo = y0 ?? Math.min(...ms.map((m) => m.lo[1]));
  const hi = y1 ?? Math.max(...ms.map((m) => m.hi[1]));
  let best = null;
  for (let y = lo + 0.0001; y < hi; y += 0.0002)
    for (const m of ms) {
      const c = sliceCentre(m, y, sgnOf(side));
      if (c && (!best || c.depth > best.depth)) best = c;
    }
  if (!best) throw new Error(`deepIn ${id} ${side}`);
  return best.p;
}
/** A head-target part (left-sided in the file; the right side is its mirror image). */
const headPart = (node, side, midline = false) => (side === "L" || midline ? `part:head-targets/${node}` : `pr:head-targets/${node}`);
/** Arc length of the curve sample nearest to a mesh host (scanning s0..s1). */
async function nearestToHost(c, key, s0, s1) {
  const h = await hostOf(key);
  let best = null;
  for (let s = s0; s <= s1; s += 0.0008) {
    const p = c.at(s).p;
    const d = Math.min(...h.meshes.map((m) => m.dist(p, 0.03)));
    if (!best || d < best.d) best = { s, d, p };
  }
  return best;
}

/* ------------------------------------------------------------------ corticobulbar */
// Lab 10 slide 2: one corticobulbar UMN from the face area of the motor cortex to each motor nucleus (motor V, facial,
// nucleus ambiguus, hypoglossal), each crossing the midline just superior to its nucleus, then the LMN out of the
// cranial nerve to its muscles. Lecture 10 slides 13-14: fibres for V and VII leave in the pons, those for XII and
// ambiguus run on in the pyramid and end in the medulla.
const CB = new Map();
async function corticobulbarParts(side) {
  if (CB.has(side)) return CB.get(side);
  const p = (async () => {
    const cx = opp(side);
    const s = sgnOf(cx);
    const si = sgnOf(side);
    const d = await descent(cx, "m1-face", { capsule: "genu", pedPref: [0.4, 0.7], ponsY: 1.585 });
    // the nuclei (LMN cell bodies) on the face side
    const vii = await deepIn("motor-nucleus-of-facial-nerve", side);
    const xii = await deepIn("nucleus-of-hypoglossal-nerve", side);
    const amb = await deepIn("nucleus-ambiguus", side);
    const mv = await nuc("motor-v", side);
    const MED = "a:medulla-oblongata";
    /** Crossing fibre: from `from` (host `fromHost`) to a point beside the midline on the cortex side, over the midline at
     * `cross`, then into the nucleus on the face side. */
    const crossInto = async (start, startHost, near, cross, hosts, nucleusKey, goal) => {
      const f = new Fibre(1).from(start, startHost);
      // (through the tegmentum: the longitudinal fibres, the pons and the medial lemniscus between them)
      await f.routeTo([startHost, ...hosts, "a:mni-medial-lemniscus"], near, { sgn: s, minX: 0.0003, h: 0.0003, snap: 0.004, label: "cb-leave" });
      // the brainstem meshes are two halves that meet at the midline without overlapping: the step across is a hidden seam
      const other = [-near[0], near[1], near[2]];
      seam(f, `cb-x-${cross.map((v) => Math.round(v * 1e4)).join("_")}-${side}`, "Across the midline (the two halves of the brainstem mesh)", [cross, other], 0.0008, "the left and right halves of the brainstem mesh meet at the midline without overlapping");
      await f.routeTo([...hosts, nucleusKey], goal, { sgn: si, minX: 0.0003, h: 0.00025 });
      return f;
    };
    // VII: leave the longitudinal fibres in the caudal pons, cross just above the facial nucleus
    const xVII = [0, 1.5838, -0.0118];
    const fVII = await crossInto(d.basis.end, `a:${LONG}`, [s * 0.0015, 1.5842, -0.0112], xVII, ["a:pons"], "a:motor-nucleus-of-facial-nerve", vii);
    // V: leave higher, in the rostral pons, cross just above the motor nucleus of V
    let iV = 0;
    d.basis.pts.forEach((q, i) => {
      if (Math.abs(q[1] - 1.5968) < Math.abs(d.basis.pts[iV][1] - 1.5968)) iV = i;
    });
    const xV = [0, 1.5948, -0.0135];
    // (that sample may lie in the crus, the longitudinal fibres or the rest of the pons: start in whichever holds it)
    let hostV = `a:${LONG}`;
    for (const k of [`a:${LONG}`, `a:${PED}`, "a:pons"]) if ((await hostOf(k)).test(d.basis.pts[iV])) {
      hostV = k;
      break;
    }
    const fV = await crossInto(d.basis.pts[iV], hostV, [s * 0.0015, 1.5952, -0.013], xV, ["a:pons"], mv.key, mv.c);
    // XII and ambiguus: on through the pons into the pyramid, out of it dorsally, across just above each nucleus
    const pyr = await inSlice(PYR, cx, 1.5745, [0.4, 0.5]);
    const toPyr = new Fibre(1).from(d.basis.end, `a:${LONG}`);
    await toPyr.routeTo([`a:${LONG}`, "a:pons", MED, `a:${PYR}`], pyr, { sgn: s, minX: 0.0006, h: 0.0003 });
    const xXII = [0, 1.5758, -0.0158];
    const fXII = joinFibres(1, [toPyr, await crossInto(pyr, `a:${PYR}`, [s * 0.0012, 1.5753, -0.0152], xXII, [MED], "a:nucleus-of-hypoglossal-nerve", xii)]);
    const xAMB = [0, 1.5754, -0.0138];
    const fAMB = joinFibres(1, [toPyr, await crossInto(pyr, `a:${PYR}`, [s * 0.0012, 1.575, -0.0132], xAMB, [MED], "a:nucleus-ambiguus", amb)]);

    // LMN VII: the Z-Anatomy facial nerve starts in the nucleus, loops dorsomedially over the abducens nucleus (the
    // internal genu, Lab 10 slide 13), leaves the pons, and runs to the face; a branch of the parotid plexus (Z-Anatomy
    // splines 3 then 5) reaches the muscles around the mouth (the nerve curves end 3-4 mm deep to the thin muscle mesh)
    const c0 = curve("Facial nerve (VII)", side, 0);
    const c3 = curve("Facial nerve (VII)", side, 3);
    const c5 = curve("Facial nerve (VII)", side, 5);
    const nVII = new Fibre(2).from(vii, "a:motor-nucleus-of-facial-nerve");
    nVII.curve(c0, c0.nearest(vii).s, c0.nearest(c3.a).s);
    nVII.curve(c3, 0, c3.nearest(c5.a).s);
    nVII.curve(c5, 0, c5.length);
    await nVII.enter(`b:muscle_face_${side}`, 0.008);
    // LMN V: motor nucleus of V into the trigeminal root, the mandibular nerve (V3, anterior division), the masseteric nerve
    const t0 = curve("Trigeminal nerve (V)", side, 0);
    const near0 = t0.nearest(mv.c);
    const nV = new Fibre(2).from(mv.c, mv.key);
    await nV.routeTo([mv.key, "a:pons"], near0.q, { sgn: si, minX: 0.001, h: 0.0003 });
    nV.curve(t0, near0.s, t0.length);
    // (the root's two splines meet at the ganglion: take spline 1 explicitly, a chain would pick spline 0 back)
    const t1 = curve("Trigeminal nerve (V)", side, 1);
    nV.curve(t1, 0, t1.length);
    chain(nV, side, ["Anterior division of mandibular nerve"]);
    const masseter = headPart("muscle_masseter", side);
    const mIn = await insideNear(masseter, [nV.end[0] + si * 0.012, nV.end[1] - 0.004, nV.end[2] + 0.004], 0.012);
    synth(nV, `masseteric-${side}`, "Masseteric nerve (V3)", [[(nV.end[0] + mIn[0]) / 2, (nV.end[1] + mIn[1]) / 2 + 0.001, (nV.end[2] + mIn[2]) / 2], mIn], 0.0005, "Z-Anatomy has no masseteric nerve: the motor branch of V3 from the mandibular nerve to the masseter");
    // LMN XII: hypoglossal nucleus, the hypoglossal nerve to the tongue
    const h0 = curve("Hypoglossal nerve (XII)", side, 0);
    const nXII = new Fibre(2).from(xii, "a:nucleus-of-hypoglossal-nerve");
    await nXII.routeTo(["a:nucleus-of-hypoglossal-nerve", MED], h0.a, { sgn: si, minX: 0.0002, h: 0.0002 });
    nXII.curve(h0, 0, h0.length);
    const tongue = headPart("organ_tongue", side, true);
    await nXII.enter(tongue, 0.012);
    // LMN ambiguus: the vagus (X) from the nucleus down the neck, and its pharyngeal branch to the pharyngeal constrictors
    const v2 = curve("Vagus nerve (X)", side, 2);
    const constrictors = headPart("muscle_pharyngeal_constrictors", side);
    const nAMB = new Fibre(2).from(amb, "a:nucleus-ambiguus");
    const sv = v2.nearest(amb).s;
    const at = await nearestToHost(v2, constrictors, sv + 0.03, sv + 0.09);
    nAMB.curve(v2, sv, at.s);
    const pIn = await insideNear(constrictors, at.p, 0.02);
    synth(nAMB, `pharyngeal-x-${side}`, "Pharyngeal branch of the vagus (X)", [[(at.p[0] + pIn[0]) / 2, (at.p[1] + pIn[1]) / 2, (at.p[2] + pIn[2]) / 2], pIn], 0.0005, "Z-Anatomy has no pharyngeal branch: the vagus to the pharyngeal constrictors");
    return { cx, d, vii, xii, amb, mv, fVII, fV, fXII, fAMB, xVII, nVII, nV, nXII, nAMB, masseter, tongue, constrictors };
  })();
  CB.set(side, p);
  return p;
}

export const corticobulbar = {
  async build(side) {
    const c = await corticobulbarParts(side);
    const { cx, d } = c;
    return [
      B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", cx, CORTEX["m1-face"][2])] }),
      B({ f: [d.leave.json()] }),
      B({ f: [d.capsule.json()] }),
      B({ f: [d.peduncle.json()] }),
      B({ f: [d.basis.json()] }),
      // the facial fibre first: the validator checks the first crossing (just above the facial nucleus, caudal pons)
      B({ f: [c.fVII.json(), c.fV.json(), c.fAMB.json(), c.fXII.json()], syn: soma(c.vii, "a:motor-nucleus-of-facial-nerve", 1), cross: { p: c.xVII, host: "a:pons", level: "just above each motor nucleus (here the facial nucleus, caudal pons)", yMin: 1.5821, yMax: 1.5875, name: "Corticobulbar fibres cross" } }),
      B({
        soma: soma(c.vii, "a:motor-nucleus-of-facial-nerve", 2),
        stops: [atlasStop("motor-nucleus-of-facial-nerve", side, "Facial nucleus (VII)"), proxyStop(c.mv), atlasStop("nucleus-ambiguus", side, "Nucleus ambiguus"), atlasStop("nucleus-of-hypoglossal-nerve", side, "Hypoglossal nucleus")],
      }),
      B({ f: [c.nVII.json()], syn: soma(c.nVII.end, `b:muscle_face_${side}`, 2), meta: { view: "oblique-front" } }),
      B({ stops: [carve(`b:muscle_face_${side}`, c.nVII.end, 0.02, "Facial muscles")], meta: { view: "anterior" } }),
      B({ f: [c.nV.json(), c.nAMB.json(), c.nXII.json()], syn: soma(c.nXII.end, c.tongue, 2), meta: { view: "oblique-front" } }),
      B({ stops: [carve(c.masseter, c.nV.end, 0.015, "Masseter (V)"), carve(c.tongue, c.nXII.end, 0.015, "Tongue (XII)"), carve(c.constrictors, c.nAMB.end, 0.015, "Pharynx (ambiguus)")], meta: { view: "oblique-front" } }),
    ];
  },
};


/* ------------------------------------------------------------------ brainstem upper motor neurons */
const BS = ["a:midbrain", "a:pons", "a:medulla-oblongata"];
/** Across the midline at height y (the brainstem meshes are two halves that meet without overlapping: a hidden seam). */
async function crossAt(f, from, y, pref, hosts, id) {
  const s = sgnOf(from);
  const a = await inSlice(hosts[0].slice(2), from, y, pref, 1.0);
  const startHost = f.seg[f.seg.length - 1][1].replace(/^u:/, "").split("|")[0];
  await f.routeTo([...new Set([startHost, ...hosts])], a, { sgn: s, minX: 0.0003, h: 0.0003 });
  const cross = [0, a[1], a[2]];
  const b = [-a[0], a[1], a[2]];
  seam(f, id, "Across the midline (the two halves of the brainstem mesh)", [cross, b], 0.0008, "the left and right halves of the brainstem mesh meet at the midline without overlapping");
  return cross;
}
/** Down the brainstem on one side through waypoints [mesh, y, pref], then into a cord tract and down it to a level. */
async function bsDown(f, side, way, tract, yEnd) {
  const s = sgnOf(side);
  for (const [id, y, pref] of way) await f.routeTo(BS, await inSlice(id, side, y, pref, 1.0), { sgn: s, minX: 0.0008, h: 0.0003, smooth: 8 });
  const top = await inSlice(tract, side, 1.5432);
  await f.routeTo([...BS, "a:white-matter-of-spinal-cord", `a:${tract}`], top, { sgn: s, minX: 0.0002, h: 0.0003 });
  await tractRun(f, tract, side, 1.5425, yEnd);
  return f;
}
const lmnStop = (side, seg) => stop(`a:anterior-horn-of-spinal-cord@${side}`, `Ventral horn (${seg})`);

export const rubrospinal = {
  async build(side) {
    // side = the red nucleus; its axons cross at once and the tract and the upper-limb LMNs are on the other side
    const O = opp(side);
    const rn = await inSlice("red-nucleus", side, 1.611, [0.55, 0.5], 1.5); // (the mesh joins both nuclei: aim at the middle of one)
    const f1 = new Fibre(1).from(rn, "a:red-nucleus");
    const cross = await crossAt(f1, side, 1.6065, [0.15, 0.6], ["a:midbrain", "a:red-nucleus"], `rn-x-${side}`);
    const lmn = await lmnAt("C8", O, "lateral");
    const f2 = new Fibre(1).from(f1.end, "a:midbrain");
    await bsDown(f2, O, [["midbrain", 1.603, [0.45, 0.55]], ["pons", 1.592, [0.5, 0.4]], ["pons", 1.58, [0.6, 0.4]], ["medulla-oblongata", 1.565, [0.7, 0.45]], ["medulla-oblongata", 1.55, [0.7, 0.5]]], "rubrospinal-tract", cordY("C8") + 0.0025);
    await intoHorn(f2, ["a:rubrospinal-tract"], lmn, O);
    return [
      B({ soma: soma(rn, "a:red-nucleus", 1), stops: [atlasStop("red-nucleus", side, "Red nucleus")] }),
      B({ f: [f1.json()], cross: { p: cross, host: "a:midbrain", level: "midbrain", yMin: 1.6015, yMax: 1.6175, name: "Rubrospinal fibres cross" } }),
      B({ f: [f2.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [lmnStop(O, "C8")] }),
    ];
  },
};

export const tectospinal = {
  async build(side) {
    const O = opp(side);
    const sc = await deepIn("superior-colliculus", side);
    const f1 = new Fibre(1).from(sc, "a:superior-colliculus");
    await f1.routeTo(["a:superior-colliculus", "a:midbrain"], await inSlice("midbrain", side, 1.611, [0.25, 0.35], 1.0), { sgn: sgnOf(side), minX: 0.0006, h: 0.0003 });
    const cross = await crossAt(f1, side, 1.6095, [0.12, 0.4], ["a:midbrain"], `tect-x-${side}`);
    const lmn = await lmnAt("C5", O, "medial");
    const f2 = new Fibre(1).from(f1.end, "a:midbrain");
    await bsDown(f2, O, [["midbrain", 1.604, [0.12, 0.45]], ["pons", 1.592, [0.12, 0.3]], ["pons", 1.58, [0.12, 0.35]], ["medulla-oblongata", 1.565, [0.12, 0.45]], ["medulla-oblongata", 1.55, [0.15, 0.6]]], "tectospinal-tract", cordY("C5") + 0.0025);
    await intoHorn(f2, ["a:tectospinal-tract"], lmn, O);
    return [
      B({ soma: soma(sc, "a:superior-colliculus", 1), stops: [atlasStop("superior-colliculus", side, "Superior colliculus"), atlasStop("inferior-colliculus", side, "Inferior colliculus")] }),
      B({ f: [f1.json()], cross: { p: cross, host: "a:midbrain", level: "midbrain", yMin: 1.6015, yMax: 1.6175, name: "Tectospinal fibres cross" } }),
      B({ f: [f2.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [lmnStop(O, "C5")] }),
    ];
  },
};

export const reticulospinal = {
  async build(side) {
    const rp = await nuc("reticular-pons", side);
    const rm = await nuc("reticular-med", side);
    const lmn = await lmnAt("C8", side, "medial");
    const fp = new Fibre(1).from(rp.c, rp.key);
    await fp.routeTo([rp.key, "a:pons"], await inSlice("pons", side, 1.58, [0.22, 0.4], 1.0), { sgn: sgnOf(side), minX: 0.0006, h: 0.0003 });
    await bsDown(fp, side, [["medulla-oblongata", 1.565, [0.2, 0.5]], ["medulla-oblongata", 1.55, [0.25, 0.55]]], "medial-reticulospinal-tract", cordY("C8") + 0.0025);
    await intoHorn(fp, ["a:medial-reticulospinal-tract"], lmn, side);
    const fm = new Fibre(1).from(rm.c, rm.key);
    await fm.routeTo([rm.key, "a:medulla-oblongata"], await inSlice("medulla-oblongata", side, 1.552, [0.45, 0.5], 1.0), { sgn: sgnOf(side), minX: 0.0006, h: 0.0003 });
    await bsDown(fm, side, [], "lateral-reticulospinal-tract", cordY("C8") + 0.0025);
    await intoHorn(fm, ["a:lateral-reticulospinal-tract"], lmn, side);
    return [
      B({ soma: soma(rp.c, rp.key, 1), start: soma(rm.c, rm.key, 1), stops: [proxyStop(rp), proxyStop(rm)] }),
      B({ f: [fp.json(), fm.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [lmnStop(side, "C8")] }),
    ];
  },
};

export const vestibulospinal = {
  async build(side) {
    const vn = await deepIn("vestibular-nuclei", side);
    const lmn = await lmnAt("C8", side, "medial");
    const f = new Fibre(1).from(vn, "a:vestibular-nuclei");
    await f.routeTo(["a:vestibular-nuclei", "a:pons", "a:medulla-oblongata"], await inSlice("medulla-oblongata", side, 1.57, [0.55, 0.4], 1.0), { sgn: sgnOf(side), minX: 0.0006, h: 0.0003 });
    await bsDown(f, side, [["medulla-oblongata", 1.556, [0.5, 0.55]]], "lateral-vestibulospinal-tract", cordY("C8") + 0.0025);
    await intoHorn(f, ["a:lateral-vestibulospinal-tract"], lmn, side);
    return [
      B({ soma: soma(vn, "a:vestibular-nuclei", 1), stops: [atlasStop("vestibular-nuclei", side, "Vestibular nuclei")] }),
      B({ f: [f.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [lmnStop(side, "C8")] }),
    ];
  },
};

export const acst = {
  async build(side) {
    // one side throughout: the trunk area of M1, the pyramid, the same-side anterior corticospinal tract, the medial horn
    const d = await descent(side, "m1-trunk");
    const pyr = await intoPyramid(d.basis.end, side);
    const lmn = await inSlice("anterior-horn-of-spinal-cord", side, cordY("T1"), [0.35, 0.75], 1.0); // medial column, kept off the horn's edge
    const t = new Fibre(1).from(pyr.end, `a:${PYR}`);
    const top = await inSlice("anterior-corticospinal-tract", side, 1.5432);
    await t.routeTo([`a:${PYR}`, "a:medulla-oblongata", "a:white-matter-of-spinal-cord", "a:anterior-corticospinal-tract"], top, { sgn: sgnOf(side), minX: 0.0001, h: 0.0003 });
    await tractRun(t, "anterior-corticospinal-tract", side, 1.5425, cordY("T1") + 0.0025);
    await intoHorn(t, ["a:anterior-corticospinal-tract"], lmn, side);
    const umn = joinFibres(1, [d.leave, d.capsule, d.peduncle, d.basis, pyr, t]);
    const out = await lmnOut(lmn, "T1", side);
    // the dorsal ramus to the deep back muscles (Z-Anatomy has no posterior rami): a drawn, flagged connector
    const back = `b:muscle_back_${side}`;
    const g = drgAt("T1", side);
    const into = await insideNear(back, [g[0] + sgnOf(side) * 0.012, g[1] - 0.004, g[2] - 0.02], 0.02);
    const ramus = new Fibre(2).from(out.end, out.seg[out.seg.length - 1][1]);
    synth(ramus, `t1-dorsal-ramus-${side}`, "Dorsal ramus of T1", [[(g[0] + into[0]) / 2, g[1] - 0.002, (g[2] + into[2]) / 2], into], 0.0006, "Z-Anatomy has no posterior rami: the T1 dorsal ramus to the deep back muscles");
    const lmnF = joinFibres(2, [out, ramus]);
    return [
      B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", side, "M1 (trunk area)")] }),
      B({ f: [umn.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [lmnStop(side, "T1, medial")] }),
      B({ f: [lmnF.json()], syn: soma(into, back, 2) }),
      B({ stops: [carve(back, into, 0.03, "Deep back muscles (axial)")] }),
    ];
  },
};

export const PATHWAYS = { lcst, "umn-lmn": umnLmn, corticobulbar, rubrospinal, tectospinal, reticulospinal, vestibulospinal, acst };
export { joinFibres, dist, splines, descent, intoPyramid, MOTOR_LEVEL };
