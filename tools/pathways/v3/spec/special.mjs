// Special senses and eye reflexes (v3 specs). `side` = the visual FIELD for the visual pathway (L = the left field), the
// body side of the stimulus elsewhere.
import { Fibre, nuc, inSlice, cortexPoint, sgnOf, dist, seam } from "./common.mjs";
import { B, soma, stop, corticofugal, joinFibres, lmnAt, intoHorn, cordY } from "./relay.mjs";
import { crossBS, fitProxy } from "./sensory.mjs";
import { edingerWestphal, deepIn as deepInAtlas, centreIn } from "./autonomic.mjs";
import { insideNear, hostOf, proxy, tube } from "../lib/fibre.mjs";
import { curve } from "../lib/nerves.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const WM = "a:white-matter-of-telencephalon";
const headPartKey = (node, side) => (side === "L" ? `part:head-targets/${node}` : `pr:head-targets/${node}`);

/* ------------------------------------------------------------------ the eye */
/** The eyeball host of one eye (the part exists on the left only: the right is its mirror). */
const eyeKey = (eye) => (eye === "L" ? "part:head-targets/organ_eyeball" : "pr:head-targets/organ_eyeball");
async function eyeGeom(eye) {
  const h = await hostOf(eyeKey(eye));
  const m = h.meshes[0];
  const c = [0, 1, 2].map((a) => (m.lo[a] + m.hi[a]) / 2);
  const R = Math.min(...[0, 1, 2].map((a) => (m.hi[a] - m.lo[a]) / 2));
  return { c, R, key: eyeKey(eye), test: h.test };
}
/** A point of the retina (inside the back wall of the globe): half = nasal / temporal, field = upper (inferior retina) / lower. */
async function retinaPoint(eye, half, field) {
  const g = await eyeGeom(eye);
  const toMid = eye === "L" ? -1 : 1; // the nasal half faces the midline
  const dx = (half === "nasal" ? toMid : -toMid) * 0.45;
  const dy = field === "upper" ? -0.4 : 0.4; // the upper field falls on the inferior retina
  const d = [dx, dy, -1];
  const l = Math.hypot(...d);
  const p = [0, 1, 2].map((a) => g.c[a] + (d[a] / l) * (g.R - 0.0016));
  return insideNear(g.key, p, 0.004);
}
/** The optic nerve curve of an eye, and the arc length where it leaves the globe (the optic disc). */
async function opticNerve(eye) {
  const c = curve("Optic nerve (II)", eye, 0);
  const g = await eyeGeom(eye);
  let sDisc = c.length;
  for (let s = c.length; s > 0; s -= 0.0003) if (!g.test(c.at(s).p)) {
    sDisc = s;
    break;
  }
  // where the nerve reaches the chiasm, coming from the eye: the Z-Anatomy curve runs on to the midline just below the
  // chiasm mesh, so the nerve part ends where the curve comes within 1 mm of the chiasm's lateral edge
  const ch = await hostOf("a:optic-chiasm");
  const edge = Math.max(...ch.meshes.map((m) => m.hi[0])) + 0.001;
  let sChiasm = 0;
  for (let s = sDisc; s > 0; s -= 0.0002) if (Math.abs(c.at(s).p[0]) <= edge) {
    sChiasm = s;
    break;
  }
  return { c, sDisc, sChiasm, g };
}

/* ------------------------------------------------------------------ visual pathway */
const TAG = { L: { upper: "leftUpper", lower: "leftLower" }, R: { upper: "rightUpper", lower: "rightLower" } };

export const visual = {
  async build(side) {
    const F = side; // the visual field
    const O = F === "L" ? "R" : "L"; // the hemisphere that sees it
    const xEye = F; // its nasal retina: this eye's fibres cross in the chiasm
    const uEye = O; // its temporal retina: these fibres stay on their own side
    const beats = [];
    const fields = ["upper", "lower"];
    // 0 the retina: the nasal half of one eye and the temporal half of the other
    const ret = {};
    for (const eye of [xEye, uEye]) for (const fd of fields) ret[`${eye}${fd}`] = await retinaPoint(eye, eye === xEye ? "nasal" : "temporal", fd);
    const retStop = (eye, half) => {
      const a = ret[`${eye}upper`], b = ret[`${eye}lower`];
      return carve(eyeKey(eye), a.map((v, i) => (v + b[i]) / 2), 0.0085, `${eye === "L" ? "Left" : "Right"} eye, ${half} retina`);
    };
    beats[0] = B({ start: soma(ret[`${xEye}upper`], eyeKey(xEye), 1), soma: soma(ret[`${uEye}upper`], eyeKey(uEye), 1), stops: [retStop(xEye, "nasal"), retStop(uEye, "temporal")] });
    // 1 ganglion cell axons: retina -> optic disc -> optic nerve, back to the chiasm (both eyes)
    const nerveEnd = {};
    const f1 = [];
    for (const eye of [xEye, uEye]) {
      const on = await opticNerve(eye);
      for (const fd of fields) {
        const f = new Fibre(2, TAG[F][fd]).from(ret[`${eye}${fd}`], on.g.key);
        const disc = on.c.at(on.sDisc).p;
        await f.routeTo([on.g.key], await insideNear(on.g.key, disc, 0.003), { h: 0.00025 });
        const off = fd === "upper" ? -0.35 : 0.35;
        f.curve(on.c, on.sDisc, on.sChiasm, off, [0, 1, 0]);
        nerveEnd[`${eye}${fd}`] = f.end;
        f1.push(f);
      }
    }
    beats[1] = B({ f: f1.map((f) => f.json()) });
    // 2 the nasal fibres cross in the chiasm into the opposite optic tract
    const tractStart = {};
    for (const fd of fields) tractStart[fd] = await inSlice("optic-tract", O, 1.6115, [0.35, fd === "upper" ? 0.08 : 0.12], 0.6);
    const xf = [];
    let cross = null;
    for (const fd of fields) {
      const f = new Fibre(2, TAG[F][fd]).from(nerveEnd[`${xEye}${fd}`], `a:optic-nerve-ii`);
      // into the chiasm on its own side first, so the midline is crossed inside the chiasm (not in the nerves below it)
      const yC = 1.6115 + (fd === "upper" ? -0.0006 : 0.0006);
      const pre = await inSlice("optic-chiasm", xEye, yC, [0.2, 0.45], 0.6);
      await f.routeTo(["a:optic-nerve-ii", "a:optic-chiasm"], pre, { sgn: sgnOf(xEye), minX: 0.0003, h: 0.0002 });
      const mid = await inSlice("optic-chiasm", "M", yC, [0, 0.45], 0.6);
      await f.routeTo(["a:optic-chiasm"], mid, { h: 0.0002 });
      if (!cross) cross = mid;
      await f.routeTo(["a:optic-chiasm", "a:optic-tract"], tractStart[fd], { sgn: -sgnOf(xEye), minX: 0.0001, h: 0.0002 });
      xf.push(f);
    }
    beats[2] = B({ f: xf.map((f) => f.json()), cross: { p: [0, cross[1], cross[2]], host: "a:optic-chiasm", level: "nasal fibres only", yMin: 1.607, yMax: 1.617, name: "Optic chiasm" }, meta: { view: "inferior" } });
    // 3 the temporal fibres stay on their own side, through the lateral chiasm
    const uf = [];
    for (const fd of fields) {
      const f = new Fibre(2, TAG[F][fd]).from(nerveEnd[`${uEye}${fd}`], `a:optic-nerve-ii`);
      await f.routeTo(["a:optic-nerve-ii", "a:optic-chiasm", "a:optic-tract"], tractStart[fd], { sgn: sgnOf(uEye), minX: 0.0012, h: 0.0002 });
      uf.push(f);
    }
    beats[3] = B({ f: uf.map((f) => f.json()), meta: { view: "inferior" } });
    // 4 the optic tract (the opposite visual field of both eyes) around the peduncle to the LGN
    const lgn = await inSlice("lateral-geniculate-body", O, 1.6125, null, 0.6);
    const t4 = [];
    for (const fd of fields) {
      for (const k of [0, 1]) {
        const f = new Fibre(2, TAG[F][fd]).from(tractStart[fd], "a:optic-tract");
        const end = [lgn[0] + (k ? 0.0004 : -0.0004), lgn[1] + (fd === "upper" ? -0.0006 : 0.0006), lgn[2]];
        await f.routeTo(["a:optic-tract", "a:lateral-geniculate-body"], await insideNear("a:lateral-geniculate-body", end, 0.002), { sgn: sgnOf(O), minX: 0.001, h: 0.00025, smooth: 8 });
        t4.push(f);
      }
    }
    beats[4] = B({ f: t4.map((f) => f.json()), syn: soma(lgn, "a:lateral-geniculate-body", 2) });
    beats[5] = B({ soma: soma(lgn, "a:lateral-geniculate-body", 3), stops: [atlasStop("lateral-geniculate-body", O, "Lateral geniculate nucleus")] });
    // 6 the parietal route: the lower field's fibres run back above the posterior horn to the cuneus (above the calcarine sulcus)
    const s = sgnOf(O);
    const wp = async (p) => insideNear(WM, [p[0] * s, p[1], p[2]], 0.006);
    const cuneus = await cortexPoint("cuneus", O, [0.009, 1.626, -0.084]);
    const par = new Fibre(3, TAG[F].lower).from(lgn, "a:lateral-geniculate-body");
    // waypoints checked against the atlas (white matter, lateral to the atrium and above the posterior horn)
    for (const p of [[0.036, 1.616, -0.012], [0.034, 1.62, -0.032], [0.03, 1.62, -0.05], [0.02, 1.622, -0.07]]) await par.routeTo(["a:lateral-geniculate-body", WM, "a:mni-internal-capsule"], await wp(p), { sgn: s, minX: 0.003, h: 0.0006, smooth: 10 });
    await par.routeTo([WM, "a:cuneus", "a:calcarine-sulcus"], cuneus, { sgn: s, minX: 0.002, h: 0.0005, smooth: 10 });
    beats[6] = B({ f: [par.json()], syn: soma(cuneus, "a:cuneus", 3) });
    // 7 Meyer's loop: the upper field's fibres sweep forward into the temporal lobe around the temporal horn, then back to the
    // lingual gyrus (below the calcarine sulcus)
    const lingual = await cortexPoint("lingual-gyrus", O, [0.012, 1.606, -0.083]);
    const mey = new Fibre(3, TAG[F].upper).from(lgn, "a:lateral-geniculate-body");
    // waypoints checked against the atlas: white matter over the temporal horn's tip (lateral to the hippocampus), then
    // back in the lateral wall of the horn
    for (const p of [[0.036, 1.614, -0.008], [0.041, 1.609, 0.004], [0.04, 1.609, -0.015], [0.039, 1.609, -0.028], [0.04, 1.607, -0.045], [0.028, 1.608, -0.07]])
      await mey.routeTo(["a:lateral-geniculate-body", WM, "a:mni-internal-capsule"], await wp(p), { sgn: s, minX: 0.003, h: 0.0006, smooth: 10 });
    await mey.routeTo([WM, "a:lingual-gyrus", "a:calcarine-sulcus"], lingual, { sgn: s, minX: 0.002, h: 0.0005, smooth: 10 });
    beats[7] = B({ f: [mey.json()], syn: soma(lingual, "a:lingual-gyrus", 3) });
    // 8 V1 around the calcarine sulcus: cuneus above (lower field), lingual gyrus below (upper field)
    beats[8] = B({ stops: [atlasStop("cuneus", O, "Cuneus (lower field)"), atlasStop("lingual-gyrus", O, "Lingual gyrus (upper field)"), atlasStop("calcarine-sulcus", O, "Calcarine sulcus (V1)")], meta: { view: "posterior" } });
    return beats;
  },
};


/* ------------------------------------------------------------------ pupillary light reflex */
// Lecture 11 slide 7, Lecture 12 slide 10, Lab 11 slide 11: light in ONE eye, the optic nerve to the pretectal nucleus (near
// the superior colliculus), both Edinger-Westphal nuclei, CN III, the ciliary ganglion, the sphincter pupillae of BOTH eyes.
// `side` = the lit eye. Neuron colours: retinal ganglion cell 1, pretectal neuron 2, EW preganglionic 3, ciliary ganglion 4.
const MB = ["a:midbrain"];
async function toPretectal(f, eye, pt) {
  // from the end of the optic tract (beside the LGN) medially into the midbrain (the brachium of the superior colliculus)
  const s = sgnOf(eye);
  const back = await inSlice("optic-tract", eye, 1.6125, [0.3, 0.9], 0.6);
  await f.routeTo(["a:optic-tract", "a:lateral-geniculate-body"], back, { sgn: s, minX: 0.002, h: 0.00025, smooth: 6 });
  // the brachium of the superior colliculus has no mesh: a hidden seam from the tract into the nearest midbrain tissue
  const mbIn = await insideNear("a:midbrain", [back[0] * 0.8, back[1] + 0.001, back[2]], 0.012, true);
  if (dist(mbIn, f.end) > 0.0005) seam(f, `brachium-sc-${eye}-${f.pts.length}`, "Brachium of the superior colliculus", [mbIn], 0.0012, "the optic tract (MNI) and the midbrain (Z-Anatomy) meshes do not touch; the brachium has no mesh");
  await f.routeTo(["a:midbrain", "a:superior-colliculus", pt.key], pt.c, { sgn: s, minX: 0.0008, h: 0.00025, smooth: 6 });
  return f;
}
export const pupillary = {
  async build(side) {
    const lit = side;
    const O = lit === "L" ? "R" : "L";
    const on = await opticNerve(lit);
    const nas = await retinaPoint(lit, "nasal", "upper");
    const tem = await retinaPoint(lit, "temporal", "upper");
    const nerve = {};
    for (const [k, p, off] of [["n", nas, -0.3], ["t", tem, 0.3]]) {
      const f = new Fibre(1).from(p, on.g.key);
      await f.routeTo([on.g.key], await insideNear(on.g.key, on.c.at(on.sDisc).p, 0.003), { h: 0.00025 });
      f.curve(on.c, on.sDisc, on.sChiasm, off, [1, 0, 0]);
      nerve[k] = f;
    }
    const ptL = await nuc("pretectal", lit);
    const ptO = await nuc("pretectal", O);
    // the nasal fibre crosses in the chiasm into the other optic tract; the temporal fibre stays
    const xf = new Fibre(1).from(nerve.n.end, "a:optic-nerve-ii");
    const pre = await inSlice("optic-chiasm", lit, 1.6115, [0.2, 0.45], 0.6);
    await xf.routeTo(["a:optic-nerve-ii", "a:optic-chiasm"], pre, { sgn: sgnOf(lit), minX: 0.0003, h: 0.0002 });
    const cm = await inSlice("optic-chiasm", "M", 1.6115, [0, 0.45], 0.6);
    await xf.routeTo(["a:optic-chiasm"], cm, { h: 0.0002 });
    const tO = await inSlice("optic-tract", O, 1.6115, [0.35, 0.1], 0.6);
    await xf.routeTo(["a:optic-chiasm", "a:optic-tract"], tO, { sgn: -sgnOf(lit), minX: 0.0001, h: 0.0002 });
    await toPretectal(xf, O, ptO);
    const uf = new Fibre(1).from(nerve.t.end, "a:optic-nerve-ii");
    const tI = await inSlice("optic-tract", lit, 1.6115, [0.35, 0.1], 0.6);
    await uf.routeTo(["a:optic-nerve-ii", "a:optic-chiasm", "a:optic-tract"], tI, { sgn: sgnOf(lit), minX: 0.0012, h: 0.0002 });
    await toPretectal(uf, lit, ptL);
    // each pretectal nucleus projects to the Edinger-Westphal nuclei of BOTH sides
    const ew = { L: await edingerWestphal("L"), R: await edingerWestphal("R") };
    const proj = [];
    for (const [from, pt] of [[lit, ptL], [O, ptO]])
      for (const to of ["L", "R"]) {
        const f = new Fibre(2).from(pt.c, pt.key);
        if (to !== from) await crossBS(f, from, "midbrain", pt.c[1] - 0.0012, [0.08, 0.15], `pt-x-${from}-${side}`);
        await f.routeTo([...MB, pt.key, "a:accessory-nucleus-of-oculomotor-nerve"], ew[to].ew, { sgn: sgnOf(to), minX: 0.0002, h: 0.00025 });
        proj.push(f);
      }
    const cross = cm;
    const eyeStop = (e, nm) => stop(`c:${e.eye}@${e.iris.map((v) => v.toFixed(4)).join(",")}`, nm, { carve: { mesh: e.eye, p: e.iris, r: 0.009 } });
    const retStop = stop(`c:${on.g.key}@${nas.map((v) => v.toFixed(4)).join(",")}`, `${lit === "L" ? "Left" : "Right"} retina (lit eye)`, { carve: { mesh: on.g.key, p: nas.map((v, i) => (v + tem[i]) / 2), r: 0.012 } });
    // the same fibres in this pathway's neuron colours (EW preganglionic 3rd, ciliary ganglion 4th)
    const recolour = (f, order) => Object.assign(new Fibre(order), { pts: f.pts.slice(), seg: f.seg.map((x) => x.slice()) });
    const pre3 = (e) => recolour(e.pre, 3);
    const post4 = (e) => recolour(e.post, 4);
    const ewKey = "a:accessory-nucleus-of-oculomotor-nerve";
    return [
      B({ start: soma(nas, on.g.key, 1), soma: soma(tem, on.g.key, 1), stops: [retStop] }),
      B({ f: [nerve.n.json(), nerve.t.json()] }),
      B({ stops: [stop(ptL.key, "Pretectal nucleus"), stop(ptO.key, "Pretectal nucleus (other side)")], soma: soma(ptL.c, ptL.key, 2), start: soma(ptO.c, ptO.key, 2) }),
      B({ f: [xf.json(), uf.json(), ...proj.map((f) => f.json())], syn: soma(ew[lit].ew, ewKey, 2), cross: { p: [0, cross[1], cross[2]], host: "a:optic-chiasm", level: "nasal fibres in the chiasm; pretectal fibres in the midbrain", yMin: 1.607, yMax: 1.617, name: "Optic chiasm" } }),
      B({ soma: soma(ew[lit].ew, ewKey, 3), start: soma(ew[O].ew, ewKey, 3), stops: [stop(`${ewKey}@L`, "Edinger-Westphal nucleus"), stop(`${ewKey}@R`, "Edinger-Westphal nucleus")] }),
      B({ f: [pre3(ew[lit]).json(), post4(ew[lit]).json(), pre3(ew[O]).json(), post4(ew[O]).json()], syn: soma(ew[lit].iris, ew[lit].eye, 4), meta: { view: "anterior" } }),
      B({ stops: [eyeStop(ew.L, "Left pupil constricts"), eyeStop(ew.R, "Right pupil constricts")], meta: { view: "anterior" } }),
    ];
  },
};

/* ------------------------------------------------------------------ horizontal gaze */
// Lecture 11 slides 25-27, Lab 11 slide 4: right FEF (BA 8) -> left PPRF -> left abducens nucleus -> left lateral rectus, and
// via the MLF -> right oculomotor nucleus -> right medial rectus: both eyes turn LEFT. `side` = the direction of gaze (the
// beat model's "i"); the frontal eye field is on the other side.
export const gaze = {
  async build(side) {
    const O = side === "L" ? "R" : "L";
    const s = sgnOf(side);
    const d = await corticofugal(O, "fef");
    const fef = d.soma;
    const pprf = await nuc("pprf", side);
    const vi = await deepInAtlas("nucleus-of-abducens-nerve", side);
    const iiiO = await deepInAtlas("nucleus-of-oculomotor-nerve", O);
    // 1a the FEF neuron: corona radiata, internal capsule, peduncle, basis pontis, across the midline to the PPRF
    const f1 = joinFibres(1, [d.leave, d.capsule, d.peduncle, d.basis]);
    const cross = await crossBS(f1, O, "pons", 1.5865, [0.2, 0.45], `fef-x-${side}`);
    await f1.routeTo(["a:pons", pprf.key], pprf.c, { sgn: s, minX: 0.0004, h: 0.0003 });
    // 1b PPRF -> abducens nucleus (same side)
    const f2 = new Fibre(2).from(pprf.c, pprf.key);
    await f2.routeTo([pprf.key, "a:pons", "a:nucleus-of-abducens-nerve"], vi, { sgn: s, minX: 0.0003, h: 0.00025 });
    // 1c abducens internuclear neuron: across the midline into the opposite MLF, up to the oculomotor nucleus
    const f3 = new Fibre(3).from(vi, "a:nucleus-of-abducens-nerve");
    await crossBS(f3, side, "pons", vi[1] + 0.0008, [0.1, 0.2], `mlf-x-${side}`);
    const mlfLow = await inSlice("mni-medial-longitudinal-fasciculus", O, vi[1] + 0.002, null, 1.0);
    await f3.routeTo(["a:pons", "a:mni-medial-longitudinal-fasciculus"], mlfLow, { sgn: -s, minX: 0.0002, h: 0.0002 });
    const mlfTop = await inSlice("mni-medial-longitudinal-fasciculus", O, iiiO[1] - 0.001, null, 1.0);
    await f3.routeTo(["a:mni-medial-longitudinal-fasciculus"], mlfTop, { sgn: -s, minX: 0.0002, h: 0.0002 });
    await f3.routeTo(["a:mni-medial-longitudinal-fasciculus", "a:midbrain", "a:nucleus-of-oculomotor-nerve"], iiiO, { sgn: -s, minX: 0.0002, h: 0.0002 });
    // 3 the lower motor neurons: abducens nerve to the lateral rectus (gaze side), CN III to the medial rectus (other eye)
    const lr = headPartKey("muscle_lateral_rectus", side);
    const mr = headPartKey("muscle_medial_rectus", O);
    const c6 = curve("Abducens nerve (VI)", side, 0);
    const n6 = new Fibre(3).from(vi, "a:nucleus-of-abducens-nerve");
    n6.lineTo(c6.a, `u:a:nucleus-of-abducens-nerve|n:${c6.key}`, 0.0003);
    n6.curve(c6, 0, c6.length);
    await n6.enter(lr, 0.012);
    const c3 = curve("Oculomotor nerve (III)", O, 0);
    const n3 = new Fibre(4).from(iiiO, "a:nucleus-of-oculomotor-nerve");
    const out3 = await insideNear("a:midbrain", c3.at(0.002).p, 0.004);
    await n3.routeTo(["a:nucleus-of-oculomotor-nerve", "a:midbrain"], out3, { sgn: -s, minX: 0.0002, h: 0.00025 });
    n3.lineTo(c3.at(0.002).p, `u:a:midbrain|n:${c3.key}`, 0.0003);
    n3.curve(c3, 0.002, c3.length);
    await n3.enter(mr, 0.012);
    const fefStop = stop(`a:middle-frontal-gyrus@${O}`, "Frontal eye field (BA 8)");
    const mrIn = n3.end, lrIn = n6.end;
    return [
      B({ soma: soma(fef, d.gyrus, 1), stops: [fefStop] }),
      B({ f: [f1.json(), f2.json(), f3.json()], syn: soma(iiiO, "a:nucleus-of-oculomotor-nerve", 3), cross: { p: cross, host: "a:pons", level: "pons", yMin: 1.578, yMax: 1.595, name: "FEF fibres cross" } }),
      B({ soma: soma(vi, "a:nucleus-of-abducens-nerve", 3), start: soma(iiiO, "a:nucleus-of-oculomotor-nerve", 4), stops: [stop(pprf.key, "PPRF"), stop(`a:nucleus-of-abducens-nerve@${side}`, "Abducens nucleus"), stop(`a:nucleus-of-oculomotor-nerve@${O}`, "Oculomotor nucleus (other side)")] }),
      B({ f: [n6.json(), n3.json()], syn: soma(lrIn, lr, 3), meta: { view: "superior" } }),
      B({ stops: [carve(lr, lrIn, 0.012, "Lateral rectus (gaze side)"), carve(mr, mrIn, 0.012, "Medial rectus (other eye)")], meta: { view: "superior" } }),
    ];
  },
};


/* ------------------------------------------------------------------ the inner ear and CN VIII */
// Auditory: Lecture 8 slides 18-19, Lecture 7 slide 6, Lecture 5 slide 20 (spiral ganglion, cochlear nuclei in the rostral
// medulla, inferior colliculus, MGN, primary auditory cortex BA 41/42; "be familiar with the structures"). The ascent is
// bilateral (OQ8): one fibre crosses in the pons, one stays; the tracer follows the same-side chain to the cortex.
// Vestibular: Lecture 8 slide 19, Lecture 14 slides 7-10, Lecture 11 slide 28 (vestibular ganglion; vestibular nuclei and
// cerebellum; ascending MLF to III/IV/VI; vestibulospinal; thalamus). `side` = the stimulated ear.
const ear = (node, side) => headPartKey(node, side);
/** From the medial end of the cochlear / vestibular nerve curve along CN VIII into the brainstem. */
async function viiiIn(f, side) {
  const c8 = curve("Vestibulocochlear nerve (VIII)", side, 0);
  f.lineTo(c8.b, `u:${f.seg[f.seg.length - 1][1].replace(/^u:/, "")}|n:${c8.key}`, 0.0003);
  f.curve(c8, c8.length, 0);
  const bs = await insideNear("a:medulla-oblongata", c8.a, 0.006);
  if (dist(bs, f.end) > 0.0005) seam(f, `viii-in-${side}-${f.pts.length}`, "CN VIII into the brainstem", [bs], 0.0008, "the CN VIII curve ends at the brainstem surface");
  return f;
}
const lateralUp = [
  ["pons", 1.5845, [0.6, 0.35]],
  ["pons", 1.597, [0.62, 0.4]],
];

export const cochlear = {
  async build(side) {
    const O = side === "L" ? "R" : "L";
    const s = sgnOf(side);
    const coch = ear("organ_cochlea", side);
    // (Z-Anatomy has the cochlear nerve on the left only: the right one is its mirror image, a flagged tube)
    const cnL = curve("Cochlear nerve", "L", 0);
    const cnR = side === "R" ? cnL.pts.map((q) => [-q[0], q[1], q[2]]) : null;
    const cnKey = cnR ? tube(`cochlear-nerve-R`, "Cochlear nerve (mirror of the left)", cnR, Math.max(...cnL.r) + 0.0002, "Z-Anatomy has the cochlear nerve on the left side only: the right one is its mirror image") : null;
    const cn = cnR ? { b: cnR[cnR.length - 1], a: cnR[0] } : cnL;
    const cb = (await hostOf(coch)).meshes[0];
    const centre = [0, 1, 2].map((a) => (cb.lo[a] + cb.hi[a]) / 2);
    const hair = await insideNear(coch, [centre[0] + s * 0.001, centre[1] - 0.001, centre[2] + 0.001], 0.004);
    const sg = await fitProxy(`spiral-ganglion-${side}`, "Spiral ganglion", coch, [(cn.b[0] + centre[0]) / 2, (cn.b[1] + centre[1]) / 2, (cn.b[2] + centre[2]) / 2], [0.0009, 0.0009, 0.0009], 0.002);
    // 1 from the hair cells to the spiral ganglion in the modiolus
    const f1 = new Fibre(1).from(hair, coch);
    await f1.routeTo([coch, sg.key], sg.c, { h: 0.0002 });
    // 3 the cochlear nerve, CN VIII, into the brainstem, to the cochlear nuclei
    const cnuc = await centreIn("posterior-cochlear-nucleus", side);
    const f3 = new Fibre(1).from(sg.c, sg.key);
    const out = await insideNear(coch, cn.b, 0.003);
    await f3.routeTo([sg.key, coch], out, { h: 0.0002 });
    if (dist(out, cn.b) > 0.0003) seam(f3, `coch-out-${side}`, "Cochlear nerve out of the cochlea", [cn.b], 0.0008, "the cochlear nerve curve starts at the cochlea's surface");
    if (cnR) for (const q of cnR.slice().reverse()) f3.lineTo(q, cnKey, 0.0008);
    else f3.curve(cnL, cnL.length, 0);
    await viiiIn(f3, side);
    await f3.routeTo(["a:medulla-oblongata", "a:pons", "a:posterior-cochlear-nucleus", "a:anterior-cochlear-nucleus"], cnuc, { sgn: s, minX: 0.002, h: 0.0003 });
    // 5 up the brainstem to the inferior colliculus: a crossed fibre (pons) and an uncrossed one, in the lateral tegmentum
    const icI = await centreIn("inferior-colliculus", side);
    const icO = await centreIn("inferior-colliculus", O);
    const xf = new Fibre(2).from(cnuc, "a:posterior-cochlear-nucleus");
    const cross = await crossBS(xf, side, "pons", 1.5805, [0.25, 0.6], `aud-x-${side}`);
    for (const [id, y, pref] of lateralUp) await xf.routeTo(BSX, await inSlice(id, O, y, pref, 1.0), { sgn: -s, minX: 0.002, h: 0.0003, smooth: 8 });
    await xf.routeTo([...BSX, "a:inferior-colliculus"], icO, { sgn: -s, minX: 0.002, h: 0.0003 });
    const uf = new Fibre(2).from(cnuc, "a:posterior-cochlear-nucleus");
    for (const [id, y, pref] of lateralUp) await uf.routeTo(["a:posterior-cochlear-nucleus", ...BSX], await inSlice(id, side, y, pref, 1.0), { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    await uf.routeTo([...BSX, "a:inferior-colliculus"], icI, { sgn: s, minX: 0.002, h: 0.0003 });
    // 7 inferior colliculus -> medial geniculate nucleus (brachium of the inferior colliculus)
    const mgn = await centreIn("medial-geniculate-body", side);
    const f7 = new Fibre(3).from(icI, "a:inferior-colliculus");
    await f7.routeTo(["a:inferior-colliculus", "a:midbrain", "a:thalamus", "a:medial-geniculate-body"], mgn, { sgn: s, minX: 0.002, h: 0.0003, smooth: 6 });
    // 9 MGN -> internal capsule (sublenticular) -> transverse temporal gyrus (Heschl, BA 41/42)
    const a1 = await cortexPoint("transverse-temporal-gyri", side, [0.045, 1.632, -0.012]);
    const f9 = new Fibre(4).from(mgn, "a:medial-geniculate-body");
    const capP = await insideNear(WM, [s * 0.03, 1.618, -0.012], 0.008);
    await f9.routeTo(["a:medial-geniculate-body", "a:thalamus", "a:mni-internal-capsule", "a:mni-posterior-limb-of-internal-capsule", WM], capP, { sgn: s, minX: 0.003, h: 0.0004, smooth: 8 });
    await f9.routeTo([WM, "a:transverse-temporal-gyri"], a1, { sgn: s, minX: 0.003, h: 0.0005, smooth: 10 });
    return [
      B({ start: soma(hair, coch, 1), stops: [carve(coch, hair, 0.006, "Cochlea")] }),
      B({ f: [f1.json()], syn: soma(sg.c, sg.key, 1) }),
      B({ soma: soma(sg.c, sg.key, 1), stops: [stop(sg.key, "Spiral ganglion")] }),
      B({ f: [f3.json()], syn: soma(cnuc, "a:posterior-cochlear-nucleus", 1) }),
      B({ soma: soma(cnuc, "a:posterior-cochlear-nucleus", 2), stops: [atlasStop("posterior-cochlear-nucleus", side, "Cochlear nuclei"), atlasStop("anterior-cochlear-nucleus", side, "Anterior cochlear nucleus")] }),
      B({ f: [xf.json(), uf.json()], syn: soma(icI, "a:inferior-colliculus", 2), cross: { p: cross, host: "a:pons", level: "pons (the ascent is bilateral)", yMin: 1.575, yMax: 1.59, name: "Some fibres cross" } }),
      B({ soma: soma(icI, "a:inferior-colliculus", 3), stops: [atlasStop("inferior-colliculus", side, "Inferior colliculus")] }),
      B({ f: [f7.json()], syn: soma(mgn, "a:medial-geniculate-body", 3) }),
      B({ soma: soma(mgn, "a:medial-geniculate-body", 4), stops: [atlasStop("medial-geniculate-body", side, "Medial geniculate nucleus")] }),
      B({ f: [f9.json()], syn: soma(a1, "a:transverse-temporal-gyri", 4) }),
      B({ stops: [atlasStop("transverse-temporal-gyri", side, "Primary auditory cortex (BA 41, 42)")] }),
    ];
  },
};
const BSX = ["a:medulla-oblongata", "a:pons", "a:midbrain"];

export const vestibular = {
  async build(side) {
    const O = side === "L" ? "R" : "L";
    const s = sgnOf(side);
    const vest = ear("organ_vestibule", side);
    const vb = (await hostOf(vest)).meshes[0];
    const hair = await insideNear(vest, [0, 1, 2].map((a) => (vb.lo[a] + vb.hi[a]) / 2), 0.004);
    const vn = curve("Vestibular nerve", side, 0);
    // 1 hair cells -> the vestibular nerve; the vestibular (Scarpa's) ganglion sits in the nerve in the internal acoustic meatus
    const f1 = new Fibre(1).from(hair, vest);
    const out = await insideNear(vest, vn.b, 0.004);
    await f1.routeTo([vest], out, { h: 0.0002 });
    if (dist(out, vn.b) > 0.0003) seam(f1, `vest-out-${side}`, "Vestibular nerve out of the vestibule", [vn.b], 0.0008, "the vestibular nerve curve starts at the vestibule's surface");
    const sG = vn.length * 0.45;
    f1.curve(vn, vn.length, sG);
    const g = { key: proxy(`vestibular-ganglion-${side}`, "Vestibular ganglion", null, f1.end.slice(), [0.0011, 0.0011, 0.0011]), c: f1.end.slice() };
    // 3 on in the nerve and CN VIII into the brainstem, to the vestibular nuclei
    const vnuc = await centreIn("vestibular-nuclei", side);
    const f3 = new Fibre(1).from(g.c, g.key);
    f3.curve(vn, sG, 0);
    await viiiIn(f3, side);
    const entry = f3.end.slice();
    const entryHost = f3.seg[f3.seg.length - 1][1];
    await f3.routeTo(["a:medulla-oblongata", "a:pons", "a:vestibular-nuclei"], vnuc, { sgn: s, minX: 0.002, h: 0.0003 });
    // 4 a direct branch through the inferior cerebellar peduncle to the flocculonodular lobe
    const icp = await inSlice("mni-inferior-cerebellar-peduncle", side, 1.5835, [0.8, 0.35], 1.0);
    const f4 = new Fibre(1).from(entry, entryHost);
    await f4.routeTo(["a:medulla-oblongata", "a:pons", "a:mni-inferior-cerebellar-peduncle"], icp, { sgn: s, minX: 0.002, h: 0.0003, smooth: 6 });
    const inCb = await insideNear("a:cerebellum", icp, 0.008, true);
    if (dist(inCb, icp) > 0.0004) seam(f4, `icp-cb-v-${side}`, "Inferior cerebellar peduncle into the cerebellum", [inCb], 0.0008, "the MNI inferior cerebellar peduncle and the Z-Anatomy cerebellum meshes do not touch");
    const floc = await cortexPoint("flocculus", side, [0.022, 1.58, -0.02]);
    await f4.routeTo(["a:mni-inferior-cerebellar-peduncle", "a:cerebellum", "a:flocculus"], floc, { sgn: s, minX: 0.002, h: 0.0002, smooth: 6 });
    // 6 ascending MLF: to the abducens nucleus of the other side (crossing) and up the same-side MLF to the oculomotor nucleus
    const viO = await deepInAtlas("nucleus-of-abducens-nerve", O);
    const iii = await deepInAtlas("nucleus-of-oculomotor-nerve", side);
    const x6 = new Fibre(2).from(vnuc, "a:vestibular-nuclei");
    const cross = await crossBS(x6, side, "pons", viO[1] + 0.0006, [0.12, 0.25], `vor-x-${side}`);
    await x6.routeTo(["a:pons", "a:nucleus-of-abducens-nerve"], viO, { sgn: -s, minX: 0.0003, h: 0.00025 });
    const m3 = new Fibre(2).from(vnuc, "a:vestibular-nuclei");
    const mlfLow = await inSlice("mni-medial-longitudinal-fasciculus", side, vnuc[1] + 0.001, null, 1.0);
    await m3.routeTo(["a:vestibular-nuclei", "a:pons", "a:mni-medial-longitudinal-fasciculus"], mlfLow, { sgn: s, minX: 0.0002, h: 0.00025 });
    const mlfTop = await inSlice("mni-medial-longitudinal-fasciculus", side, iii[1] - 0.001, null, 1.0);
    await m3.routeTo(["a:mni-medial-longitudinal-fasciculus"], mlfTop, { sgn: s, minX: 0.0002, h: 0.0002 });
    await m3.routeTo(["a:mni-medial-longitudinal-fasciculus", "a:midbrain", "a:nucleus-of-oculomotor-nerve"], iii, { sgn: s, minX: 0.0002, h: 0.0002 });
    // 7 the lateral vestibulospinal tract down the same side to the ventral horn (axial muscles)
    const lmn = await lmnAt("C8", side, "medial");
    const vs = new Fibre(2).from(vnuc, "a:vestibular-nuclei");
    await vs.routeTo(["a:vestibular-nuclei", "a:pons", "a:medulla-oblongata"], await inSlice("medulla-oblongata", side, 1.57, [0.55, 0.4], 1.0), { sgn: s, minX: 0.0006, h: 0.0003 });
    await vs.routeTo(["a:medulla-oblongata"], await inSlice("medulla-oblongata", side, 1.556, [0.5, 0.55], 1.0), { sgn: s, minX: 0.0008, h: 0.0003, smooth: 8 });
    const top = await inSlice("lateral-vestibulospinal-tract", side, 1.5432);
    await vs.routeTo(["a:medulla-oblongata", "a:white-matter-of-spinal-cord", "a:lateral-vestibulospinal-tract"], top, { sgn: s, minX: 0.0002, h: 0.0003 });
    await vs.cord("lateral-vestibulospinal-tract", 1.5425, cordY("C8") + 0.0025, s);
    await intoHorn(vs, ["a:lateral-vestibulospinal-tract"], lmn, side);
    // 8 up to the thalamus (conscious perception of movement)
    const th = await inSlice("thalamus", side, 1.6205, [0.75, 0.6], 1.0);
    const up = new Fibre(2).from(vnuc, "a:vestibular-nuclei");
    for (const [id, y, pref] of [["pons", 1.597, [0.55, 0.36]], ["midbrain", 1.6085, [0.68, 0.4]]]) await up.routeTo(["a:vestibular-nuclei", ...BSX], await inSlice(id, side, y, pref, 1.0), { sgn: s, minX: 0.0015, h: 0.0003, smooth: 8 });
    await up.routeTo(["a:midbrain", "a:thalamus"], th, { sgn: s, minX: 0.002, h: 0.0004, smooth: 8 });
    return [
      B({ start: soma(hair, vest, 1), stops: [carve(vest, hair, 0.008, "Vestibule"), stop(ear("organ_semicircular_canals", side), "Semicircular canals")] }),
      B({ f: [f1.json()] }),
      B({ soma: soma(g.c, g.key, 1), stops: [stop(g.key, "Vestibular ganglion")] }),
      B({ f: [f3.json()], syn: soma(vnuc, "a:vestibular-nuclei", 1) }),
      B({ f: [f4.json()], syn: soma(floc, "a:flocculus", 1) }),
      B({ soma: soma(vnuc, "a:vestibular-nuclei", 2), stops: [atlasStop("vestibular-nuclei", side, "Vestibular nuclei"), atlasStop("flocculus", side, "Flocculus (cerebellum)")] }),
      B({ f: [x6.json(), m3.json()], syn: soma(iii, "a:nucleus-of-oculomotor-nerve", 2), cross: { p: cross, host: "a:pons", level: "pons, to the other abducens nucleus", yMin: 1.578, yMax: 1.59, name: "VOR fibres cross" } }),
      B({ f: [vs.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 2) }),
      B({ f: [up.json()], syn: soma(th, "a:thalamus", 2) }),
    ];
  },
};

export const PATHWAYS = { visual, pupillary, gaze, cochlear, vestibular };
export { dist, nuc };

/* ------------------------------------------------------------------ olfactory pathway */
// Lecture 15 slides 11-15: bipolar receptor neurons in the olfactory epithelium, axons (CN I) through the cribriform plate to
// the mitral cells of the olfactory bulb; the olfactory tract to the olfactory tubercle and prepiriform cortex, bypassing the
// thalamus. Z-Anatomy: the olfactory nerve mesh is the bulb and tract; its curves are the tract (spline 1), the striae
// (spline 0) and the fila olfactoria (the short splines down through the cribriform plate). `side` = the nostril.
export const olfactory = {
  async build(side) {
    const s = sgnOf(side);
    const ON = "a:olfactory-nerve-i";
    const tract = curve("Olfactory nerve (I)", side, 1);
    const stria = curve("Olfactory nerve (I)", side, 0);
    const fil = curve("Olfactory nerve (I)", side, 6);
    // 0-2 the receptor neuron in the epithelium (the lower end of a filament) and its axon up through the cribriform plate
    const rec = fil.b.slice();
    const f1 = new Fibre(1).from(rec, `n:${fil.key}`);
    f1.curve(fil, fil.length, 0);
    // 3 into the bulb: the synapse on a mitral cell (inside the bulb, where the filaments join it)
    const mitral = await insideNear(ON, [fil.a[0] + s * 0.0005, fil.a[1] + 0.0008, fil.a[2]], 0.003);
    const f3 = new Fibre(1).from(f1.end, `n:${fil.key}`);
    f3.lineTo(mitral, `u:n:${fil.key}|${ON}`, 0.0003);
    // 5 the mitral cell axon back along the olfactory tract, out by the lateral stria to the prepiriform cortex (uncus); a branch
    // to the olfactory tubercle (anterior perforated substance) where the tract divides
    const f5 = new Fibre(2).from(mitral, ON);
    const sM = tract.nearest(mitral).s;
    f5.lineTo(tract.at(sM).p, `u:${ON}|n:${tract.key}`, 0.0003);
    f5.curve(tract, sM, 0.004);
    const split = f5.end.slice();
    const j = stria.nearest(split);
    seam(f5, `olf-stria-${side}`, "Olfactory tract into the lateral stria", [j.q], 0.001, "the tract and stria curves of the olfactory nerve meet a few mm apart");
    f5.curve(stria, j.s, stria.nearest([s * 0.03, 1.607, 0.02]).s);
    const pp = await cortexPoint("medial-occipitotemporal-gyrus-parahippocampal", side, [0.021, 1.603, 0.016]);
    const into = await insideNear("a:medial-occipitotemporal-gyrus-parahippocampal", f5.end, 0.015, true);
    seam(f5, `olf-cx-${side}`, "Lateral olfactory stria onto the cortex", [into], 0.0012, "the olfactory stria curve ends at the brain's surface");
    await f5.routeTo([WM, "a:medial-occipitotemporal-gyrus-parahippocampal", "a:temporal-pole", "a:amygdaloid-body"], pp, { sgn: s, minX: 0.003, h: 0.0003, smooth: 6 });
    // the olfactory tubercle (anterior perforated substance) has no atlas mesh: a flagged ellipsoid where the tract divides
    const tc = tract.at(0.0015).p;
    const tub = { key: proxy(`olf-tubercle-${side}`, "Olfactory tubercle", null, tc, [0.0016, 0.0012, 0.0016]), c: tc };
    const f5b = new Fibre(2).from(split, `n:${tract.key}`);
    await f5b.routeTo([ON, `n:${tract.key}`, tub.key], tub.c, { h: 0.0002 });
    const epi = stop(`c:${ON}@${fil.b.map((v) => v.toFixed(4)).join(",")}`, "Olfactory epithelium (nasal roof)", { carve: { mesh: ON, p: fil.b, r: 0.004 } });
    // a coronal section seen from the front for the nose and the bulb (fila through the cribriform plate, both nerves against the ethmoid and the frontal lobes), from below for the tract and cortex
    const SAG = { view: "anterior", cut: "z" };
    const INF = { view: "inferior" };
    return [
      B({ start: soma(rec, `n:${fil.key}`, 1), stops: [epi], meta: SAG }),
      B({ f: [f1.json()], meta: SAG }),
      B({ soma: soma(rec, `n:${fil.key}`, 1), stops: [epi], meta: SAG }),
      B({ f: [f3.json()], syn: soma(mitral, ON, 1), meta: SAG }),
      B({ soma: soma(mitral, ON, 2), stops: [stop(`c:${ON}@${mitral.map((v) => v.toFixed(4)).join(",")}`, "Olfactory bulb (mitral cells)", { carve: { mesh: ON, p: mitral, r: 0.008 } })], meta: SAG }),
      B({ f: [f5.json(), f5b.json()], syn: soma(pp, "a:medial-occipitotemporal-gyrus-parahippocampal", 2), meta: INF }),
      B({ stops: [stop(tub.key, "Olfactory tubercle"), carve("a:medial-occipitotemporal-gyrus-parahippocampal", pp, 0.008, "Prepiriform cortex (uncus)")], meta: INF }),
    ];
  },
};
PATHWAYS.olfactory = olfactory;
