// Autonomic pathways (v3 specs): sympathetic and parasympathetic. Depth: Lecture 6 slides 16-24, Lecture 7 slide 28, the
// cranial nerve chart (docs/PATHWAY_AUDIT.md). `side` = the body side (the beat model has only "i").
//
// Sympathetic (L6/18-21): preganglionic cell body in the lateral horn (intermediolateral column) at T2, out by the ventral
// root and the white ramus to a paravertebral (chain) ganglion: short preganglionic. Postganglionic: back by the grey ramus
// into the spinal (intercostal) nerve to the skin's vessels, glands and arrector pili (L6/21), and a long cardiac nerve to
// the heart. Parasympathetic (L6/22, L7/28): preganglionic cell bodies in the brainstem nuclei (here the dorsal motor nucleus
// of X and Edinger-Westphal, III) with long axons to a ganglion at or in the organ, then short postganglionic fibres.
import { Fibre, inSlice, cordY, drgAt, rootCurve, sgnOf, chain, synth, seam, dist } from "./common.mjs";
import { B, soma, stop } from "./relay.mjs";
import { insideNear, proxy, tube, hostOf } from "../lib/fibre.mjs";
import { curve, splines } from "../lib/nerves.mjs";
import { atlasMeshes, sliceCentre } from "../lib/geom.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const proxyStop = (key, name) => stop(key, name);
const headPart = (node, side) => (side === "L" ? `part:head-targets/${node}` : `pr:head-targets/${node}`);
const mid = (a, b, dy = 0) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy, (a[2] + b[2]) / 2];

/** The deepest point of a small atlas nucleus on one side. */
export async function deepIn(id, side) {
  const ms = await atlasMeshes(id);
  const lo = Math.min(...ms.map((m) => m.lo[1])), hi = Math.max(...ms.map((m) => m.hi[1]));
  let best = null;
  for (let y = lo + 0.0001; y < hi; y += 0.0002)
    for (const m of ms) {
      const c = sliceCentre(m, y, sgnOf(side));
      if (c && (!best || c.depth > best.depth)) best = c;
    }
  if (!best) throw new Error(`deepIn ${id} ${side}`);
  return best.p;
}
/** The point deepest inside a mesh host within r of p (for a ganglion that must sit inside its organ's wall). */
async function deepNear(key, p, r) {
  const h = await hostOf(key);
  let best = null;
  for (let k = 0; k < 800; k++) {
    const q = [p[0] + (Math.random() * 2 - 1) * r, p[1] + (Math.random() * 2 - 1) * r, p[2] + (Math.random() * 2 - 1) * r];
    if (!h.test(q)) continue;
    const d = Math.min(...h.meshes.map((m) => m.dist(q, 0.006)));
    if (!best || d > best.d) best = { q, d };
  }
  if (!best) throw new Error(`deepNear ${key}`);
  best.q.depth = best.d;
  return best.q;
}
/** The spline of a nerve whose start or end lies nearest p. */
function splineNearest(name, side, p) {
  let best = null;
  for (const c of splines(name, side)) {
    const d = Math.min(dist(c.a, p), dist(c.b, p));
    if (!best || d < best.d) best = { c, d };
  }
  return best.c;
}

/* ------------------------------------------------------------------ sympathetic */
// Z-Anatomy has the rami communicantes ("Sympathetic nerves", one short spline per thoracic level, from the chain at the
// side of the vertebral body to the spinal nerve) but no trunk and no ganglia: the chain is a flagged tube through the rami's
// chain ends, the ganglion a small ellipsoid on it.
const SYMP = new Map();
async function sympathetic(side) {
  if (SYMP.has(side)) return SYMP.get(side);
  const p = (async () => {
    const s = sgnOf(side);
    const seg = "T2";
    const y = cordY(seg);
    // the chain: the rami's chain ends, top to bottom
    const rami = splines("Sympathetic nerves", side).filter((c) => c.length > 0.012).sort((a, b) => b.a[1] - a.a[1]);
    const trunkPts = rami.map((c) => c.a);
    const trunk = tube(`symp-trunk-${side}`, "Sympathetic chain (paravertebral ganglia)", trunkPts, 0.0018, "Z-Anatomy has the rami communicantes but no sympathetic trunk: the chain is drawn through the rami's chain ends");
    // the T2 ramus: from the T2 spinal nerve (its b end) to the chain (its a end)
    const g = drgAt(seg, side);
    const ramus = rami.reduce((best, c) => (!best || dist(c.b, g) < dist(best.b, g) ? c : best), null);
    const gc = ramus.a.slice();
    const gKey = proxy(`symp-ganglion-${seg}-${side}`, `Sympathetic chain ganglion (${seg})`, trunk, gc, [0.0014, 0.0026, 0.0014]);
    // 0 the preganglionic cell body: the lateral horn (intermediolateral column) at T2
    const iml = await inSlice("intermediolateral-nucleus", side, y, null, 1.2);
    // 1 out of the lateral horn, through the ventral horn and white matter into the ventral root, to the spinal nerve, then
    // the white ramus to the chain ganglion
    const root = rootCurve("ventral", seg, side);
    const pre = new Fibre(1).from(iml, "a:intermediolateral-nucleus");
    const exit = await insideNear("a:white-matter-of-spinal-cord", root.a, 0.003);
    await pre.routeTo(["a:intermediolateral-nucleus", "a:grey-matter-of-spinal-cord", "a:anterior-horn-of-spinal-cord", "a:white-matter-of-spinal-cord"], exit, { sgn: s, minX: 0.0003, h: 0.00025, snap: 0.003 });
    pre.curve(root, 0, root.length);
    const ic = splineNearest("Intercostal nerves", side, g);
    const join = ic.nearest(ramus.b);
    pre.curve(ic, ic.nearest(pre.end).s, join.s);
    const wr = new Fibre(1);
    seam(pre, `ramus-join-pre-${side}`, "Ramus onto the spinal nerve", [ramus.b], 0.0012, "the Z-Anatomy ramus curve ends 1-2 mm short of the intercostal nerve curve");
    pre.curve(ramus, ramus.length, 0, 0.15, [0, 1, 0]);
    pre.lineTo(gc, `u:n:${ramus.key}|${gKey}`, 0.0004);
    // 3 postganglionic, short route: back by the grey ramus into the intercostal nerve, round the chest wall to the skin
    const gr = new Fibre(2).from(gc, gKey);
    gr.curve(ramus, 0, ramus.length, -0.15, [0, 1, 0]);
    seam(gr, `ramus-join-post-${side}`, "Ramus onto the spinal nerve", [ic.at(join.s).p], 0.0012, "the Z-Anatomy ramus curve ends 1-2 mm short of the intercostal nerve curve");
    // to the lateral cutaneous territory of the chest wall (two thirds of the way round the nerve)
    const sSkin = ic.length * 0.62;
    gr.curve(ic, join.s, sSkin);
    const skinIn = await insideNear("b:skin", gr.end, 0.03, true);
    await gr.enter("b:skin", 0.03);
    // 5 postganglionic, long route: a thoracic cardiac nerve from the T2 ganglion to the heart (not in Z-Anatomy)
    const heart = side === "L" ? "part:thorax/organ_heart_la" : "part:thorax/organ_heart_ra";
    const hb = (await hostOf(heart)).meshes[0];
    const target = await insideNear(heart, [s * 0.012, hb.hi[1] - 0.012, 0.004], 0.02);
    const card = new Fibre(2).from(gc, gKey);
    const way1 = [gc[0] + s * 0.004, gc[1] - 0.012, gc[2] + 0.012];
    const way2 = [s * 0.016, gc[1] - 0.045, 0.0];
    synth(card, `cardiac-n-${side}`, "Thoracic cardiac nerve (postganglionic)", [way1, way2, target], 0.0006, "Z-Anatomy has no cardiac nerves: the postganglionic sympathetic fibres from the upper thoracic chain to the heart");
    await card.routeTo([heart], await insideNear(heart, [target[0] + s * 0.004, target[1] - 0.01, target[2] + 0.008], 0.02), { h: 0.0004 });
    void skinIn;
    void wr;
    return { iml, pre, gc, gKey, trunk, gr, card, heart, seg };
  })();
  SYMP.set(side, p);
  return p;
}

// from the front, the trunk opened by a coronal cut through the beat: cord, roots, rami and chain side by side (L6 slide 18)
const TOP = { view: "anterior", cut: "z" };
export const sympatheticSpec = {
  async build(side) {
    const d = await sympathetic(side);
    const where = d.gr.end;
    return [
      B({ soma: soma(d.iml, "a:intermediolateral-nucleus", 1), stops: [atlasStop("intermediolateral-nucleus", side, `Lateral horn (${d.seg})`)], meta: TOP }),
      B({ f: [d.pre.json()], syn: soma(d.gc, d.gKey, 1), meta: TOP }),
      B({ soma: soma(d.gc, d.gKey, 2), stops: [proxyStop(d.gKey, `Chain ganglion (${d.seg})`), stop(d.trunk, "Sympathetic chain")], meta: TOP }),
      B({ f: [d.gr.json()], syn: soma(where, "b:skin", 2), meta: TOP }),
      B({ stops: [carve("b:skin", where, 0.03, "Skin: vessels, glands, hair muscles")], meta: TOP }),
      B({ f: [d.card.json()], syn: soma(d.card.end, d.heart, 2), meta: { view: "anterior" } }),
      B({ stops: [stop(`${d.heart}`, "Heart")], meta: { view: "anterior" } }),
    ];
  },
};

/* ------------------------------------------------------------------ parasympathetic */
/** EW (III) to the ciliary ganglion and the pupil: shared with the pupillary light reflex. */
const EW = new Map();
export async function edingerWestphal(side) {
  if (EW.has(side)) return EW.get(side);
  const p = (async () => {
    const s = sgnOf(side);
    const ew = await deepIn("accessory-nucleus-of-oculomotor-nerve", side);
    // the oculomotor nerve: spline 0 runs from the interpeduncular fossa to the orbit; spline 2 is the inferior division,
    // which carries the parasympathetic fibres to the ciliary ganglion (on the lateral side of the optic nerve)
    const c0 = curve("Oculomotor nerve (III)", side, 0);
    const c2 = curve("Oculomotor nerve (III)", side, 2);
    const pre = new Fibre(1).from(ew, "a:accessory-nucleus-of-oculomotor-nerve");
    // ventrally through the midbrain tegmentum to the nerve's exit in the interpeduncular fossa
    const exitP = c0.at(0.0015).p;
    const exitIn = await insideNear("a:midbrain", exitP, 0.004);
    await pre.routeTo(["a:accessory-nucleus-of-oculomotor-nerve", "a:nucleus-of-oculomotor-nerve", "a:midbrain"], exitIn, { sgn: s, minX: 0.0002, h: 0.00025 });
    pre.lineTo(c0.at(0.0015).p, `u:a:midbrain|n:${c0.key}`, 0.0004);
    const branch = c0.nearest(c2.a);
    pre.curve(c0, 0.0015, branch.s);
    pre.lineTo(c2.a, `u:n:${c0.key}|n:${c2.key}`, 0.0004);
    const sG = Math.min(c2.length * 0.35, 0.009);
    pre.curve(c2, 0, sG);
    const gc = pre.end.slice();
    const gKey = proxy(`ciliary-ganglion-${side}`, "Ciliary ganglion", null, gc, [0.0012, 0.0012, 0.0016]);
    // short ciliary nerves to the sphincter pupillae (the iris, just behind the front of the globe)
    const eye = headPart("organ_eyeball", side);
    const eb = (await hostOf(eye)).meshes[0];
    const ec = [0, 1, 2].map((a) => (eb.lo[a] + eb.hi[a]) / 2);
    const iris = await insideNear(eye, [ec[0], ec[1], eb.hi[2] - 0.0035], 0.004);
    const back = await insideNear(eye, [ec[0] - s * 0.002, ec[1] - 0.001, eb.lo[2] + 0.0015], 0.004);
    const post = new Fibre(2).from(gc, gKey);
    synth(post, `short-ciliary-${side}`, "Short ciliary nerves", [mid(gc, back, -0.001), back], 0.0005, "Z-Anatomy has no ciliary ganglion or short ciliary nerves: from the ganglion to the back of the globe");
    // forward in the wall of the globe to the iris
    const wall = await insideNear(eye, [ec[0] + s * 0.010, ec[1] - 0.004, ec[2] + 0.002], 0.006);
    await post.routeTo([eye], wall, { h: 0.0003 });
    await post.routeTo([eye], iris, { h: 0.0003 });
    return { ew, pre, gc, gKey, post, iris, eye };
  })();
  EW.set(side, p);
  return p;
}

const VAGAL = new Map();
async function vagalHeart(side) {
  if (VAGAL.has(side)) return VAGAL.get(side);
  const p = (async () => {
    const s = sgnOf(side);
    const dmx = await deepIn("posterior-nucleus-of-vagus-nerve", side);
    const trunk = curve("Vagus nerve (X)", side, 2);
    const pre = new Fibre(1).from(dmx, "a:posterior-nucleus-of-vagus-nerve");
    // ventrolaterally through the medulla to the vagal rootlets (the top of the trunk curve leaves the medulla's side)
    const sOut = (() => {
      for (let q = 0; q < trunk.length; q += 0.0005) if (Math.abs(trunk.at(q).p[0]) > 0.009) return q;
      return 0.01;
    })();
    const exitIn = await insideNear("a:medulla-oblongata", trunk.at(sOut).p, 0.006);
    await pre.routeTo(["a:posterior-nucleus-of-vagus-nerve", "a:medulla-oblongata"], exitIn, { sgn: s, minX: 0.0006, h: 0.0003 });
    pre.lineTo(trunk.at(sOut).p, `u:a:medulla-oblongata|n:${trunk.key}`, 0.0004);
    // down the neck in the vagus to the upper thorax
    let sBr = trunk.length;
    for (let q = sOut; q < trunk.length; q += 0.0008) if (trunk.at(q).p[1] < 1.372) {
      sBr = q;
      break;
    }
    pre.curve(trunk, sOut, sBr);
    const vEnd = pre.end.slice();
    const vHost = `n:${trunk.key}`;
    // the cardiac branch of the vagus to a ganglion in the wall of the atria
    const heart = side === "L" ? "part:thorax/organ_heart_la" : "part:thorax/organ_heart_ra";
    const hb = (await hostOf(heart)).meshes[0];
    const gIn = await deepNear(heart, [s * 0.008, hb.hi[1] - 0.012, -0.002], 0.008);
    synth(pre, `vagal-cardiac-${side}`, "Cardiac branch of the vagus (X)", [[pre.end[0] - s * 0.002, pre.end[1] - 0.012, pre.end[2] + 0.004], gIn], 0.0006, "Z-Anatomy has no cardiac branches of the vagus: from the vagus in the upper thorax to the heart");
    const gc = gIn;
    const gKey = proxy(`cardiac-ganglion-${side}`, "Cardiac (terminal) ganglion", heart, gc, [0, 1, 2].map(() => Math.min(0.0013, (gIn.depth ?? 0.0013) * 0.8)));
    // short postganglionic fibres in the atrial wall
    const post = new Fibre(2).from(gc, gKey);
    const tgt = await insideNear(heart, [gc[0] + s * 0.006, gc[1] - 0.012, gc[2] + 0.01], 0.02);
    await post.routeTo([gKey, heart], tgt, { h: 0.0003 });
    // the vagus runs on behind the root of the lung: its pulmonary branches end on ganglia in the bronchial wall
    const sLow = trunk.length;
    const pul = new Fibre(1).from(vEnd, vHost);
    pul.curve(trunk, sBr, sLow);
    const bronchus = "part:thorax/organ_bronchus_main";
    const bIn = await deepNear(bronchus, [s * 0.016, 1.35, -0.016], 0.008);
    synth(pul, `vagal-pulmonary-${side}`, "Pulmonary branch of the vagus (X)", [mid(pul.end, bIn), bIn], 0.0006, "Z-Anatomy has no pulmonary branches of the vagus: from the vagus behind the lung root to the main bronchus");
    const bKey = proxy(`pulmonary-ganglion-${side}`, "Pulmonary (terminal) ganglion", bronchus, bIn, [0, 1, 2].map(() => Math.min(0.0011, (bIn.depth ?? 0.0011) * 0.8)));
    const bPost = new Fibre(2).from(bIn, bKey);
    const bT = await deepNear(bronchus, [bIn[0] + s * 0.006, bIn[1] - 0.004, bIn[2]], 0.003);
    await bPost.routeTo([bKey, bronchus], bT, { h: 0.0002 });
    const preAll = new Fibre(1);
    return { dmx, pre, pul, gc, gKey, post, heart, bIn, bKey, bPost, bronchus, preAll };
  })();
  VAGAL.set(side, p);
  return p;
}

export const parasympatheticSpec = {
  async build(side) {
    const v = await vagalHeart(side);
    const T = { view: "oblique" };
    return [
      B({ soma: soma(v.dmx, "a:posterior-nucleus-of-vagus-nerve", 1), stops: [atlasStop("posterior-nucleus-of-vagus-nerve", side, "Dorsal motor nucleus of X")] }),
      B({ f: [v.pre.json(), v.pul.json()], syn: soma(v.gc, v.gKey, 1), meta: T }),
      B({ soma: soma(v.gc, v.gKey, 2), start: soma(v.bIn, v.bKey, 2), stops: [proxyStop(v.gKey, "Cardiac ganglion"), proxyStop(v.bKey, "Pulmonary ganglion")], meta: T }),
      B({ f: [v.post.json()], syn: soma(v.post.end, v.heart, 2), meta: T }),
      B({ stops: [carve(v.heart, v.post.end, 0.025, "Cardiac muscle")], meta: T }),
      B({ f: [v.bPost.json()], syn: soma(v.bPost.end, v.bronchus, 2), meta: T }),
      B({ stops: [stop(v.heart, "Heart"), stop(v.bronchus, "Bronchi (smooth muscle)")], meta: T }),
    ];
  },
};

export const PATHWAYS = { sympathetic: sympatheticSpec, parasympathetic: parasympatheticSpec };
