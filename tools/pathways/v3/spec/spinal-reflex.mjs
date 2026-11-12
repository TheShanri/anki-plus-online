// Spinal reflexes (v3 specs): the monosynaptic stretch (knee-jerk) reflex at L4 and the polysynaptic withdrawal reflex at C8.
// `side` = the side of the limb (the reflex stays on that side).
import { Fibre, nuc, sgnOf, synth, drgAt, inSlice } from "./common.mjs";
import { B, soma, stop, dorsalRootIn, lmnAt, lmnOut, ulnarTip, ulnarToDrg } from "./relay.mjs";
import { curve } from "../lib/nerves.mjs";
import { hostOf } from "../lib/fibre.mjs";
import { dist } from "../lib/nerves.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });

/* ------------------------------------------------------------------ stretch reflex (knee jerk, L4) */
export const stretchReflex = {
  variants: ["leg"],
  async build(side) {
    const s = sgnOf(side);
    const quad = `b:muscle_quad_${side}`;
    const fem = curve("Femoral nerve", side, 0);
    const g = drgAt("L4", side);
    const sTop = fem.nearest(g).s; // where the femoral nerve passes the L4 level (Z-Anatomy has no lumbar plexus roots)
    // a quadriceps branch level: where the femoral nerve runs closest to the muscle in the thigh
    const qm = (await hostOf(quad)).meshes[0];
    let sMuscle = fem.length * 0.6, best = Infinity;
    for (let k = fem.length * 0.3; k < fem.length * 0.95; k += 0.004) {
      const dd = qm.inside(fem.at(k).p) ? 0 : qm.dist(fem.at(k).p, 0.03);
      if (dd < best - 1e-5) {
        best = dd;
        sMuscle = k;
      }
    }
    // 0 a muscle spindle in the quadriceps
    const tip = new Fibre(1, "afferent").from(fem.at(sMuscle).p, `n:${fem.key}`);
    await tip.enter(quad);
    const spindle = tip.end;
    // 1 Ia afferent: quadriceps -> femoral nerve -> L4 ganglion
    const nerve = tip.reversed();
    nerve.curve(fem, sMuscle, sTop);
    synth(nerve, `l4-ramus-${side}`, "L4 spinal nerve (ventral ramus)", [g], 0.0012, "Z-Anatomy has no lumbar plexus: the L4 ventral ramus from the femoral nerve to the L4 ganglion");
    // 3 dorsal root up the cauda equina into the cord and straight to the alpha motor neuron (no interneuron)
    // (the model's lumbosacral segments crowd into the last few mm of the cord: the motor neuron sits just above the conus)
    const lmn = await inSlice("anterior-horn-of-spinal-cord", side, 1.0645, [0.85, 0.7], 1.2);
    const ia = new Fibre(1).from(g, "part:spine/nerve_drg");
    await dorsalRootIn(ia, "L4", side);
    await ia.routeTo(["a:spinal-cord", "part:spine/nerve_cord", "a:grey-matter-of-spinal-cord", "a:anterior-horn-of-spinal-cord"], lmn, { sgn: s, minX: 0.0002, h: 0.0002, snap: 0.004 });
    // 5 ventral root back down the cauda equina to the L4 level; 6 the femoral nerve to the quadriceps
    const out = await lmnOut(lmn, "L4", side);
    const back = new Fibre(2).from(out.end, out.seg[out.seg.length - 1][1]);
    synth(back, `l4-ramus-out-${side}`, "L4 spinal nerve (ventral ramus)", [fem.at(sTop).p], 0.0012, "Z-Anatomy has no lumbar plexus: the L4 ventral ramus from the L4 ganglion to the femoral nerve");
    back.curve(fem, sTop, sMuscle * 0.98);
    await back.enter(quad);
    return [
      B({ start: soma(spindle, quad, 1), stops: [carve(quad, spindle, 0.03, "Quadriceps (muscle spindle)")], meta: { view: "anterior" } }),
      B({ f: [nerve.json()] }),
      B({ soma: soma(g, "part:spine/nerve_drg", 1), stops: [carve("part:spine/nerve_drg", g, 0.004, "DRG L4")] }),
      B({ f: [ia.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) }),
      B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [stop(`a:anterior-horn-of-spinal-cord@${side}`, "Ventral horn (L4)")] }),
      B({ f: [out.json()] }),
      B({ f: [back.json()], syn: soma(back.end, quad, 2) }),
      B({ stops: [carve(quad, back.end, 0.04, "Quadriceps contracts")], meta: { view: "anterior" } }),
    ];
  },
};

export const PATHWAYS = { "stretch-reflex": stretchReflex };
export { dist, nuc, ulnarTip, ulnarToDrg };
