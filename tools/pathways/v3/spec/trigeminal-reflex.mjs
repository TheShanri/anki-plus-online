// Trigeminal reflexes (v3 specs): the corneal (blink) reflex and the jaw-jerk reflex. `side` = the stimulated side.
// Corneal: Lecture 12 slides 3 and 5 (CN V1 from the cornea, the spinal trigeminal nucleus, both facial nuclei: both eyes
// blink). Jaw jerk: Lecture 9 slide 10 (mesencephalic nucleus of V: 1st-order cell bodies inside the CNS, monosynaptic onto
// the motor nucleus of V).
import { Fibre, nuc, inSlice, sgnOf, synth, seam, chain, dist } from "./common.mjs";
import { B, soma, stop } from "./relay.mjs";
import { crossBS } from "./sensory.mjs";
import { insideNear, hostOf, proxy } from "../lib/fibre.mjs";
import { curve } from "../lib/nerves.mjs";
import { atlasMeshes, sliceCentre } from "../lib/geom.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const proxyStop = (n) => stop(n.key, n.name);
const headPart = (node, side) => (side === "L" ? `part:head-targets/${node}` : `pr:head-targets/${node}`);
const opp = (s) => (s === "L" ? "R" : "L");
const mid = (a, b, dy = 0) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy, (a[2] + b[2]) / 2];

async function deepIn(id, side) {
  const ms = await atlasMeshes(id);
  const lo = Math.min(...ms.map((m) => m.lo[1])), hi = Math.max(...ms.map((m) => m.hi[1]));
  let best = null;
  for (let y = lo + 0.0001; y < hi; y += 0.0002)
    for (const m of ms) {
      const c = sliceCentre(m, y, sgnOf(side));
      if (c && (!best || c.depth > best.depth)) best = c;
    }
  return best.p;
}
/** The trigeminal ganglion (a flagged ellipsoid at the junction of the divisions and the root: the atlas has no ganglion). */
function ganglion(side) {
  const c = curve("Ophthalmic nerve", side, 0).a;
  return { key: proxy(`trigeminal-ganglion-${side}`, "Trigeminal ganglion", null, c, [0.0018, 0.0012, 0.0022]), c: c.slice(), name: "Trigeminal ganglion" };
}
/** From the ganglion along the sensory root into the lateral pons. */
async function rootIn(f, side) {
  const root = curve("Trigeminal nerve (V)", side, 0);
  const pons = (await hostOf("a:pons")).test;
  let sIn = 0;
  for (let q = root.length; q > 0; q -= 0.0003)
    if (pons(root.at(q).p)) {
      sIn = q - 0.0015;
      break;
    }
  f.lineTo(root.b, `u:${f.seg[f.seg.length - 1][1].replace(/^u:/, "")}|n:${root.key}`, 0.0003);
  f.curve(root, root.length, Math.max(0, sIn));
  return f;
}

/* ------------------------------------------------------------------ corneal reflex */
export const corneal = {
  async build(side) {
    const s = sgnOf(side);
    const O = opp(side);
    const cornea = headPart("organ_cornea", side);
    const cb = (await hostOf(cornea)).meshes[0];
    const cc = await insideNear(cornea, [0, 1, 2].map((a) => (cb.lo[a] + cb.hi[a]) / 2), 0.004);
    const g = ganglion(side);
    // V1: the ophthalmic nerve runs through the orbit above the globe; its nasociliary / long ciliary branches to the cornea are
    // not in Z-Anatomy (a flagged connector from the point of the nerve nearest the globe)
    const v1 = curve("Ophthalmic nerve", side, 0);
    const eye = headPart("organ_eyeball", side);
    const near = v1.nearest([cc[0], cc[1] + 0.008, cc[2] - 0.02]);
    const f1 = new Fibre(1, "afferent").from(cc, cornea);
    const exit = await insideNear(cornea, [cc[0], cc[1] + 0.004, cc[2] - 0.001], 0.004);
    await f1.routeTo([cornea], exit, { h: 0.0002 });
    synth(f1, `long-ciliary-${side}`, "Long ciliary (nasociliary) nerve, V1", [[cc[0] + s * 0.004, cc[1] + 0.008, cc[2] - 0.008], [near.q[0], near.q[1] - 0.002, near.q[2] + 0.004], near.q], 0.0005, "Z-Anatomy has no nasociliary or long ciliary nerves: from the cornea round the globe to the ophthalmic nerve");
    f1.curve(v1, near.s, 0);
    f1.lineTo(g.c, `u:n:${v1.key}|${g.key}`, 0.0003);
    void eye;
    // 3: root into the pons, down the spinal trigeminal tract to the spinal nucleus (the synapse), then the 2nd-order neurons up
    // to the facial nucleus of the same side and, across the midline, of the other side
    const sv = await nuc("spinal-v", side);
    const down = new Fibre(1).from(g.c, g.key);
    await rootIn(down, side);
    for (const [id, y, pref] of [["pons", 1.584, [0.72, 0.3]], ["medulla-oblongata", 1.572, [0.75, 0.25]]])
      await down.routeTo(["a:pons", "a:medulla-oblongata"], await inSlice(id, side, y, pref, 1.0), { sgn: s, minX: 0.0015, h: 0.0003, smooth: 8 });
    const syn = [sv.c[0], sv.c[1] + sv.r[1] * 0.4, sv.c[2]];
    await down.routeTo(["a:medulla-oblongata", sv.key], syn, { sgn: s, minX: 0.0015, h: 0.0003 });
    const vii = await deepIn("motor-nucleus-of-facial-nerve", side);
    const viiO = await deepIn("motor-nucleus-of-facial-nerve", O);
    const ipsi = new Fibre(2).from(syn, sv.key);
    await ipsi.routeTo([sv.key, "a:medulla-oblongata", "a:pons", "a:motor-nucleus-of-facial-nerve"], vii, { sgn: s, minX: 0.001, h: 0.0003, smooth: 6 });
    const contra = new Fibre(2).from(syn, sv.key);
    const cross = await crossBS(contra, side, "medulla-oblongata", Math.min(1.576, syn[1] + 0.012), [0.2, 0.5], `corneal-x-${side}`);
    await contra.routeTo(["a:medulla-oblongata", "a:pons", "a:motor-nucleus-of-facial-nerve"], viiO, { sgn: -s, minX: 0.001, h: 0.0003, smooth: 6 });
    const top = { view: "posterior" };
    return [
      B({ start: soma(cc, cornea, 1), stops: [carve(cornea, cc, 0.008, "Cornea")], meta: { view: "anterior" } }),
      B({ f: [f1.json()], meta: { view: "oblique-front" } }),
      B({ soma: soma(g.c, g.key, 1), stops: [proxyStop(g)], meta: { view: "oblique-front" } }),
      B({ f: [down.json(), ipsi.json(), contra.json()], syn: soma(vii, "a:motor-nucleus-of-facial-nerve", 2), cross: { p: cross, host: "a:medulla-oblongata", level: "medulla, to the other facial nucleus", yMin: 1.556, yMax: 1.579, name: "Reflex fibres cross" }, meta: top }),
      B({ soma: soma(syn, sv.key, 2), stops: [proxyStop(sv), atlasStop("motor-nucleus-of-facial-nerve", side, "Facial nucleus (same side)"), atlasStop("motor-nucleus-of-facial-nerve", O, "Facial nucleus (other side)")], meta: top }),
    ];
  },
};

/* ------------------------------------------------------------------ jaw-jerk reflex */
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
export const jawJerk = {
  async build(side) {
    const s = sgnOf(side);
    const masseter = headPart("muscle_masseter", side);
    const mv = await nuc("motor-v", side);
    const mes = await nuc("mes-v", side);
    // the efferent (motor) path first: motor nucleus -> motor root -> mandibular nerve (V3) -> masseteric nerve -> masseter
    const t0 = curve("Trigeminal nerve (V)", side, 0);
    const t1 = curve("Trigeminal nerve (V)", side, 1);
    const near0 = t0.nearest(mv.c);
    const out = new Fibre(2).from(mv.c, mv.key);
    await out.routeTo([mv.key, "a:pons"], near0.q, { sgn: s, minX: 0.001, h: 0.0003 });
    out.curve(t0, near0.s, t0.length);
    out.curve(t1, 0, t1.length);
    chain(out, side, ["Anterior division of mandibular nerve"]);
    const mIn = await insideNear(masseter, [out.end[0] + s * 0.012, out.end[1] - 0.004, out.end[2] + 0.004], 0.012);
    synth(out, `masseteric-${side}`, "Masseteric nerve (V3)", [mid(out.end, mIn, 0.001), mIn], 0.0005, "Z-Anatomy has no masseteric nerve: the branch of V3 from the mandibular nerve to the masseter");
    const spindle = out.end.slice();
    // the afferent: from a spindle in the masseter back along the same nerves; it passes through the ganglion without a cell
    // body, enters the pons in the root and climbs to the mesencephalic nucleus in the midbrain
    const aff = new Fibre(1, "afferent").from(spindle, masseter);
    const back = out.reversed();
    // (the reversed motor fibre without its last stretch into the pons)
    const firstT0 = back.seg.find(([, h]) => h === `n:${t0.key}`)[0];
    for (const [i, h] of back.seg) {
      const end = back.seg.find(([j]) => j > i)?.[0] ?? back.pts.length;
      if (i >= firstT0) break;
      aff.add(back.pts.slice(i, end + 1), h);
    }
    const g = ganglion(side);
    // (the root curve's junction with the divisions is the ganglion)
    const rootRun = new Fibre(1).from(aff.end, aff.seg[aff.seg.length - 1][1]);
    await rootIn(rootRun, side);
    for (const [i, h] of rootRun.seg) aff.add(rootRun.pts.slice(i, rootRun.seg.find(([j]) => j > i)?.[0] ?? rootRun.pts.length), h);
    // up through the dorsolateral pontine tegmentum to the mesencephalic nucleus
    const ponsUp = await inSlice("pons", side, 1.598, [0.45, 0.2], 1.0);
    await aff.routeTo(["a:pons", "a:midbrain"], ponsUp, { sgn: s, minX: 0.001, h: 0.0003 });
    await aff.routeTo(["a:pons", "a:midbrain", mes.key], mes.c, { sgn: s, minX: 0.001, h: 0.0003 });
    // the mesencephalic neuron's central branch down to the motor nucleus of V (monosynaptic)
    const mono = new Fibre(1).from(mes.c, mes.key);
    await mono.routeTo([mes.key, "a:midbrain", "a:pons", mv.key], mv.c, { sgn: s, minX: 0.001, h: 0.0003 });
    void g;
    void dist;
    void seam;
    const side3 = { view: "oblique-front" };
    return [
      B({ start: soma(spindle, masseter, 1), stops: [carve(masseter, spindle, 0.02, "Spindles in the masseter")], meta: side3 }),
      B({ f: [aff.json()], meta: side3 }),
      B({ soma: soma(mes.c, mes.key, 1), stops: [proxyStop(mes)], meta: { view: "left" } }),
      B({ f: [mono.json()], syn: soma(mv.c, mv.key, 1), meta: { view: "left" } }),
      B({ soma: soma(mv.c, mv.key, 2), stops: [proxyStop(mv)], meta: { view: "left" } }),
      B({ f: [out.json()], syn: soma(spindle, masseter, 2), meta: side3 }),
      B({ stops: [carve(masseter, spindle, 0.03, "Masseter contracts")], meta: side3 }),
    ];
  },
};

export const PATHWAYS = { corneal, "jaw-jerk": jawJerk };
