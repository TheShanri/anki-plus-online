// Special senses and eye reflexes (v3 specs). `side` = the visual FIELD for the visual pathway (L = the left field), the
// body side of the stimulus elsewhere.
import { Fibre, nuc, inSlice, cortexPoint, sgnOf, dist } from "./common.mjs";
import { B, soma, stop } from "./relay.mjs";
import { insideNear, hostOf } from "../lib/fibre.mjs";
import { curve } from "../lib/nerves.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const WM = "a:white-matter-of-telencephalon";

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
    beats[2] = B({ f: xf.map((f) => f.json()), cross: { p: [0, cross[1], cross[2]], host: "a:optic-chiasm", level: "optic chiasm", yMin: 1.607, yMax: 1.617, name: "Optic chiasm (nasal fibres)" }, meta: { view: "inferior" } });
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

export const PATHWAYS = { visual };
export { dist, nuc };
