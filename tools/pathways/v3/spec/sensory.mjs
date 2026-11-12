// Ascending (sensory) pathways: DCML, anterolateral, DSCT, trigeminal (discriminative and pain).
import { Fibre, nuc, inSlice, drgAt, cordY, dist } from "./relay.mjs";
import { B, soma, stop, thalamocortical, ulnarTip, ulnarToDrg, plantarTip, plantarToDrg, dorsalRootIn, tractRun, CORD_TOP, CORTEX } from "./relay.mjs";

import { sgnOf, chain, synth, seam, cortexPoint } from "./common.mjs";
import { insideNear, hostOf, proxy } from "../lib/fibre.mjs";
import { curve } from "../lib/nerves.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const proxyStop = (n) => stop(n.key, n.name);
const atlasStop = (id, side, name, slug) => stop(`a:${id}@${side}`, name, { slug });

/** The limb start shared by the DCML, the anterolateral system and the withdrawal reflex: receptor, nerve, ganglion. */
export function limbStart(side, limb) {
  const hand = limb === "hand";
  const seg = hand ? "C8" : "L5";
  const tip = hand ? ulnarTip(side) : plantarTip(side);
  const nerve = new Fibre(1, "afferent").from(tip, "b:skin");
  if (hand) ulnarToDrg(nerve, side, 0.3);
  else plantarToDrg(nerve, side, 0.3);
  const drg = drgAt(seg, side);
  nerve.lineTo(drg, hand ? "a:spinal-ganglion" : "part:spine/nerve_drg");
  const gHost = hand ? "a:spinal-ganglion" : "part:spine/nerve_drg";
  return { seg, tip, nerve, drg, gHost, skinStop: carve("b:skin", tip, hand ? 0.0055 : 0.008, hand ? "Little finger skin" : "Big toe skin"), drgStop: carve(gHost, drg, 0.004, `DRG ${seg}`) };
}

export const dcml = {
  variants: ["hand", "foot"],
  async build(side, limb) {
    const O = side === "L" ? "R" : "L";
    const s = sgnOf(side);
    const hand = limb === "hand";
    const st = limbStart(side, limb);
    const tract = hand ? "cuneate-fasciculus" : "gracile-fasciculus";
    const nucleus = await nuc(hand ? "cuneate" : "gracile", side);
    const beats = [];
    // 0 receptors
    beats[0] = B({ start: soma(st.tip, "b:skin", 1), stops: [st.skinStop], meta: { view: "anterior" } });
    // 1 nerve to the ganglion
    beats[1] = B({ f: [st.nerve.json()] });
    // 2 ganglion: the pseudounipolar cell body
    beats[2] = B({ soma: soma(st.drg, st.gHost, 1), stops: [st.drgStop] });
    // 3 dorsal root, then up the dorsal column
    const dc = new Fibre(1).from(st.drg, st.gHost);
    await dorsalRootIn(dc, st.seg, side);
    const entryY = Math.max(dc.end[1] + 0.0015, hand ? 1.4445 : 1.068);
    const entry = await inSlice(tract, side, entryY);
    await dc.routeTo(["a:spinal-cord", "part:spine/nerve_cord", `a:${tract}`], entry, { sgn: s, minX: 0.0002, h: 0.00022, snap: 0.003 });
    await tractRun(dc, tract, side, entryY, CORD_TOP);
    beats[3] = B({ f: [dc.json()] });
    // 4 into the medulla: synapse in the gracile / cuneate nucleus
    const toN = new Fibre(1).from(dc.end, `a:${tract}`);
    await toN.routeTo([`a:${tract}`, "a:medulla-oblongata", nucleus.key], nucleus.c, { sgn: s, minX: 0.0004, h: 0.00025 });
    beats[4] = B({ f: [toN.json()], syn: soma(nucleus.c, nucleus.key, 1) });
    // 5 the nucleus: 2nd-order cell body
    beats[5] = B({ soma: soma(nucleus.c, nucleus.key, 2), stops: [proxyStop(nucleus)] });
    // 6 internal arcuate fibres sweep ventromedially and cross in the caudal medulla
    const yX = 1.5515;
    const sweep = await inSlice("medulla-oblongata", side, yX - 0.0008, [0.18, 0.55]);
    const cross = [0, yX, (await inSlice("medulla-oblongata", "M", yX, [0, 0.62]))[2]];
    const mlStart = await inSlice("medulla-oblongata", O, yX + 0.0015, [0.12, 0.78]);
    const arc = new Fibre(2).from(nucleus.c, nucleus.key);
    await arc.routeTo(["a:medulla-oblongata", nucleus.key], sweep, { h: 0.00025, sgn: s, minX: 0.0003 });
    await arc.routeTo(["a:medulla-oblongata"], cross, { h: 0.00025 });
    await arc.routeTo(["a:medulla-oblongata"], mlStart, { h: 0.00025, sgn: -s, minX: 0.0002 });
    beats[6] = B({ f: [arc.json()], cross: { p: cross, host: "a:medulla-oblongata", level: "caudal medulla", yMax: 1.5585, name: "Internal arcuate fibres" } });
    // 7 medial lemniscus: medulla (paramedian), pons, midbrain, to the VPL
    const vpl = await nuc("vpl", O);
    const ml = new Fibre(2).from(mlStart, "a:medulla-oblongata");
    const mlBottom = await inSlice("mni-medial-lemniscus", O, 1.5745);
    await ml.routeTo(["a:medulla-oblongata", "a:mni-medial-lemniscus"], mlBottom, { h: 0.0003, sgn: -s, minX: 0.0003 });
    const mlTop = await inSlice("mni-medial-lemniscus", O, 1.6125);
    await ml.routeTo(["a:mni-medial-lemniscus"], mlTop, { h: 0.0002, sgn: -s, minX: 0.0003 });
    await ml.routeTo(["a:mni-medial-lemniscus", "a:midbrain", "a:thalamus", vpl.key], vpl.c, { h: 0.0004, sgn: -s, minX: 0.001 });
    beats[7] = B({ f: [ml.json()], syn: soma(vpl.c, vpl.key, 2) });
    // 8 VPL: 3rd-order cell body
    beats[8] = B({ soma: soma(vpl.c, vpl.key, 3), stops: [proxyStop(vpl)] });
    // 9-11 thalamocortical: VPL -> internal capsule -> corona radiata -> S1
    const tc = await thalamocortical(O, "vpl", hand ? "s1-hand" : "s1-leg");
    beats[9] = B({ f: [tc.leave.json()] });
    beats[10] = B({ f: [tc.cap.json()] });
    beats[11] = B({ f: [tc.cor.json()], syn: soma(tc.goal, `a:${CORTEX[hand ? "s1-hand" : "s1-leg"][0]}`, 3) });
    beats[12] = B({ stops: [atlasStop(CORTEX[hand ? "s1-hand" : "s1-leg"][0], O, CORTEX[hand ? "s1-hand" : "s1-leg"][2])] });
    return beats;
  },
};

/* ------------------------------------------------------------------ anterolateral system */
/** The anterolateral (spinothalamic) tract's course through the brainstem: the lateral tegmentum, dorsal to the olive in
 * the medulla, lateral to the medial lemniscus in the pons and midbrain, to a thalamic nucleus (no mesh of its own). */
export async function lateralTegmentum(f, side, toNucleus) {
  const s = sgnOf(side);
  const pts = [
    ["medulla-oblongata", 1.5525, [0.72, 0.5]],
    ["medulla-oblongata", 1.5655, [0.74, 0.42]],
    ["pons", 1.5845, [0.5, 0.32]],
    ["pons", 1.597, [0.55, 0.36]],
    ["midbrain", 1.6085, [0.72, 0.4]],
  ];
  const hosts = ["a:white-matter-of-spinal-cord", "a:medulla-oblongata", "a:pons", "a:midbrain"];
  for (const [id, y, pref] of pts) {
    const q = await inSlice(id, side, y, pref, 1.0);
    await f.routeTo(hosts, q, { sgn: s, minX: 0.0015, h: 0.0003, smooth: 8 });
  }
  await f.routeTo(["a:midbrain", "a:thalamus", toNucleus.key], toNucleus.c, { sgn: s, minX: 0.002, h: 0.0004, smooth: 8 });
  return f;
}

/** Into the cord by the dorsal root, up Lissauer's tract a little, into the dorsal horn; returns the 2nd-order cell body. */
async function lissauerToHorn(f, seg, side, entryY) {
  const s = sgnOf(side);
  const lis = await inSlice("posterolateral-tract", side, entryY + 0.001);
  await f.routeTo(["a:spinal-cord", "part:spine/nerve_cord", "a:posterolateral-tract"], lis, { sgn: s, minX: 0.0002, h: 0.0002, snap: 0.003 });
  const lisTop = await inSlice("posterolateral-tract", side, entryY + 0.003);
  await f.routeTo(["a:posterolateral-tract", "a:white-matter-of-spinal-cord"], lisTop, { sgn: s, minX: 0.0002, h: 0.0002 });
  // the 2nd-order cell body: the dorsal horn's tip (marginal zone / nucleus proprius) at that level
  const horn = await inSlice("posterior-horn-of-spinal-cord", side, entryY + 0.0035, [0.6, 0.25], 1.0);
  await f.routeTo(["a:posterolateral-tract", "a:white-matter-of-spinal-cord", "a:posterior-horn-of-spinal-cord"], horn, { sgn: s, minX: 0.0002, h: 0.0002 });
  return horn;
}

export const alst = {
  variants: ["hand", "foot"],
  async build(side, limb) {
    const O = side === "L" ? "R" : "L";
    const s = sgnOf(side);
    const hand = limb === "hand";
    const st = limbStart(side, limb);
    const beats = [];
    beats[0] = B({ start: soma(st.tip, "b:skin", 1), stops: [st.skinStop], meta: { view: "anterior" } });
    beats[1] = B({ f: [st.nerve.json()] });
    beats[2] = B({ soma: soma(st.drg, st.gHost, 1), stops: [st.drgStop] });
    // 3 dorsal root, Lissauer's tract, dorsal horn: the first synapse
    const root = new Fibre(1).from(st.drg, st.gHost);
    await dorsalRootIn(root, st.seg, side);
    const entryY = hand ? Math.max(root.end[1], 1.4485) : Math.max(root.end[1], 1.0615);
    const horn = await lissauerToHorn(root, st.seg, side, entryY);
    beats[3] = B({ f: [root.json()], syn: soma(horn, "a:posterior-horn-of-spinal-cord", 1) });
    beats[4] = B({ soma: soma(horn, "a:posterior-horn-of-spinal-cord", 2), stops: [stop(`a:posterior-horn-of-spinal-cord@${side}`, "Dorsal horn")] });
    // 5 across the anterior white commissure (ventral to the central canal), near the level of entry, into the contralateral
    // anterolateral funiculus
    const yX = horn[1] + 0.0015;
    const canal = await inSlice("white-matter-of-spinal-cord", "M", yX, [0, 0.62], 1.0);
    const cross = [0, yX, canal[2]];
    const als = await inSlice("lateral-spinothalamic-tract", O, yX + 0.0015);
    const x = new Fibre(2).from(horn, "a:posterior-horn-of-spinal-cord");
    const grey = ["a:posterior-horn-of-spinal-cord", "a:grey-matter-of-spinal-cord", "a:white-matter-of-spinal-cord"];
    const ventromedial = await inSlice("grey-matter-of-spinal-cord", side, yX - 0.0005, [0.15, 0.55], 1.0);
    await x.routeTo(grey, ventromedial, { sgn: s, minX: 0.00015, h: 0.0002 });
    await x.routeTo(["a:grey-matter-of-spinal-cord", "a:white-matter-of-spinal-cord"], cross, { h: 0.0002 });
    await x.routeTo(["a:white-matter-of-spinal-cord", "a:lateral-spinothalamic-tract"], als, { sgn: -s, minX: 0.00015, h: 0.0002 });
    beats[5] = B({ f: [x.json()], cross: { p: cross, host: "a:white-matter-of-spinal-cord", level: `${st.seg}, the level of entry`, yMin: entryY - 0.004, yMax: entryY + 0.008, name: "Anterior white commissure" } });
    // 6 up the contralateral anterolateral tract, then the lateral brainstem tegmentum, to the VPL
    const vpl = await nuc("vpl", O);
    const up = new Fibre(2).from(als, "a:lateral-spinothalamic-tract");
    await tractRun(up, "lateral-spinothalamic-tract", O, als[1] + 0.001, CORD_TOP);
    await lateralTegmentum(up, O, vpl);
    beats[6] = B({ f: [up.json()], syn: soma(vpl.c, vpl.key, 2) });
    beats[7] = B({ soma: soma(vpl.c, vpl.key, 3), stops: [proxyStop(vpl)] });
    const tc = await thalamocortical(O, "vpl", hand ? "s1-hand" : "s1-leg");
    beats[8] = B({ f: [tc.leave.json()] });
    beats[9] = B({ f: [tc.cap.json()] });
    beats[10] = B({ f: [tc.cor.json()], syn: soma(tc.goal, `a:${CORTEX[hand ? "s1-hand" : "s1-leg"][0]}`, 3) });
    beats[11] = B({ stops: [atlasStop(CORTEX[hand ? "s1-hand" : "s1-leg"][0], O, CORTEX[hand ? "s1-hand" : "s1-leg"][2])] });
    return beats;
  },
};

/* ------------------------------------------------------------------ dorsal spinocerebellar tract */
export const dsct = {
  variants: ["foot"],
  async build(side) {
    const s = sgnOf(side);
    const beats = [];
    // 0 a muscle spindle / Golgi tendon organ in a plantar muscle of the foot, reached by the medial plantar nerve
    const mp = curve("Medial plantar nerve", side, 0);
    const sNerve = mp.length * 0.72;
    const tip = new Fibre(1, "afferent").from(mp.at(sNerve).p, `n:${mp.key}`);
    await tip.enter(`b:muscle_foot_${side}`);
    const spindle = tip.end;
    // 1 muscle -> medial plantar, tibial and sciatic nerves -> the L5 ganglion
    const nerve = tip.reversed();
    nerve.curve(mp, sNerve, 0);
    chain(nerve, side, ["Tibial nerve", ["Sciatic nerve", { spline: 0 }]]);
    const g = drgAt("L5", side);
    synth(nerve, `l5-ramus-${side}`, "L5 spinal nerve (ventral ramus)", [[(nerve.end[0] + g[0]) / 2, (nerve.end[1] + g[1]) / 2 + 0.002, (nerve.end[2] + g[2]) / 2], g], 0.0016, "Z-Anatomy has no lumbosacral trunk: the L5 ventral ramus joins the sciatic nerve to the L5 ganglion");
    nerve.lineTo(g, "part:spine/nerve_drg");
    beats[0] = B({ start: soma(spindle, `b:muscle_foot_${side}`, 1), stops: [stop(`c:b:muscle_foot_${side}@${spindle.map((v) => v.toFixed(4)).join(",")}`, "Foot muscles (spindles, tendon organs)", { carve: { mesh: `b:muscle_foot_${side}`, p: spindle, r: 0.03 } })], meta: { view: "anterior" } });
    beats[1] = B({ f: [nerve.json()] });
    beats[2] = B({ soma: soma(g, "part:spine/nerve_drg", 1), stops: [stop(`c:part:spine/nerve_drg@${g.map((v) => v.toFixed(4)).join(",")}`, "DRG L5", { carve: { mesh: "part:spine/nerve_drg", p: g, r: 0.004 } })] });
    // 3 dorsal root into the conus, up the same-side fasciculus gracilis to L2, into Clarke's nucleus (C8-L2): the synapse
    const clarke = await nuc("clarke", side);
    const up = new Fibre(1).from(g, "part:spine/nerve_drg");
    await dorsalRootIn(up, "L5", side);
    const entryY = Math.max(up.end[1] + 0.0015, 1.068);
    const entry = await inSlice("gracile-fasciculus", side, entryY);
    await up.routeTo(["a:spinal-cord", "part:spine/nerve_cord", "a:gracile-fasciculus"], entry, { sgn: s, minX: 0.0002, h: 0.00022, snap: 0.003 });
    await tractRun(up, "gracile-fasciculus", side, entryY, clarke.c[1] - 0.0015);
    await up.routeTo(["a:gracile-fasciculus", "a:white-matter-of-spinal-cord", "a:posterior-horn-of-spinal-cord", clarke.key], clarke.c, { sgn: s, minX: 0.0002, h: 0.0002 });
    beats[3] = B({ f: [up.json()], syn: soma(clarke.c, clarke.key, 1) });
    beats[4] = B({ soma: soma(clarke.c, clarke.key, 2), stops: [proxyStop(clarke)] });
    // 5 the dorsal spinocerebellar tract: laterally into the same-side lateral funiculus, up to the top of the cord
    const dsctY = clarke.c[1] + 0.0015;
    const lat = await inSlice("posterior-spinocerebellar-tract", side, dsctY);
    const tract = new Fibre(2).from(clarke.c, clarke.key);
    await tract.routeTo([clarke.key, "a:posterior-horn-of-spinal-cord", "a:grey-matter-of-spinal-cord", "a:white-matter-of-spinal-cord", "a:posterior-spinocerebellar-tract"], lat, { sgn: s, minX: 0.0002, h: 0.0002 });
    await tractRun(tract, "posterior-spinocerebellar-tract", side, dsctY + 0.001, CORD_TOP);
    beats[5] = B({ f: [tract.json()] });
    // 6 the dorsolateral medulla into the inferior cerebellar peduncle
    const icpLow = await inSlice("mni-inferior-cerebellar-peduncle", side, 1.5745, [0.7, 0.5], 1.0);
    const icpTop = await inSlice("mni-inferior-cerebellar-peduncle", side, 1.5835, [0.8, 0.35], 1.0);
    const icp = new Fibre(2).from(tract.end, "a:posterior-spinocerebellar-tract");
    const dl = await inSlice("medulla-oblongata", side, 1.558, [0.8, 0.3], 1.0);
    await icp.routeTo(["a:posterior-spinocerebellar-tract", "a:white-matter-of-spinal-cord", "a:medulla-oblongata"], dl, { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    await icp.routeTo(["a:medulla-oblongata", "a:mni-inferior-cerebellar-peduncle"], icpLow, { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    await icp.routeTo(["a:mni-inferior-cerebellar-peduncle"], icpTop, { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    beats[6] = B({ f: [icp.json()] });
    // 7 into the same-side cerebellar cortex (the anterior lobe, the leg's spinocerebellum)
    const goal = await cortexPoint("anterior-quadrangular-lobule", side, [0.014, 1.6, -0.035]);
    const cb = new Fibre(2).from(icpTop, "a:mni-inferior-cerebellar-peduncle");
    // the MNI peduncle and the Z-Anatomy cerebellum do not touch: a hidden seam into the nearest cerebellar tissue
    const inCb = await insideNear("a:cerebellum", icpTop, 0.006, true);
    if (dist(inCb, icpTop) > 0.0004) seam(cb, `icp-cb-${side}`, "Inferior cerebellar peduncle into the cerebellum", [inCb], 0.0008, "the MNI inferior cerebellar peduncle and the Z-Anatomy cerebellum meshes do not touch");
    await cb.routeTo(["a:mni-inferior-cerebellar-peduncle", "a:cerebellum", "a:superior-cerebellar-peduncle"], goal, { sgn: s, minX: 0.002, h: 0.0004, smooth: 8 });
    beats[7] = B({ f: [cb.json()], syn: soma(goal, "a:anterior-quadrangular-lobule", 2) });
    beats[8] = B({ stops: [atlasStop("anterior-quadrangular-lobule", side, "Cerebellar cortex (same side)")] });
    return beats;
  },
};


/* ------------------------------------------------------------------ trigeminal (face) */
// Lecture 9 slides 16-17 (discriminative touch) and 21-24 (pain and temperature). The 1st-order cell body is in the trigeminal
// ganglion; the receptor is the skin of the cheek (V2, the maxillary nerve's infraorbital branches, real Z-Anatomy curves).
/** A proxy that fits inside a host near p: the deepest spot within r, the radius shrunk until the poles are inside. */
export async function fitProxy(id, name, parentKey, p, rad, r = 0.003) {
  const h = await hostOf(parentKey);
  let best = null;
  for (let k = 0; k < 1500; k++) {
    const q = [p[0] + (Math.random() * 2 - 1) * r, p[1] + (Math.random() * 2 - 1) * r, p[2] + (Math.random() * 2 - 1) * r];
    if (!h.test(q)) continue;
    const d = h.meshes ? Math.min(...h.meshes.map((m) => m.dist(q, 0.006))) : 0.001;
    const score = d - 0.15 * dist(q, p);
    if (!best || score > best.score) best = { q, d, score };
  }
  if (!best) throw new Error(`fitProxy ${id}: nothing inside ${parentKey} near ${p}`);
  let rr = rad.slice();
  const fits = () => {
    for (let a = 0; a < 3; a++)
      for (const sg of [-1, 1]) {
        const q = best.q.slice();
        q[a] += sg * rr[a];
        if (!h.test(q)) return false;
      }
    return true;
  };
  for (let it = 0; it < 30 && !fits(); it++) rr = rr.map((v) => v * 0.9);
  return { key: proxy(id, name, parentKey, best.q, rr), c: best.q, r: rr, name };
}
const TRI = new Map();
async function trigeminalStart(side) {
  if (TRI.has(side)) return TRI.get(side);
  const p = (async () => {
    const s = sgnOf(side);
    const v2 = curve("Maxillary nerve", side, 0);
    const br = curve("Maxillary nerve", side, 1);
    // the receptor: the skin of the cheek at the end of an infraorbital branch (built from the nerve tip into the skin, reversed)
    const tip = new Fibre(1, "afferent").from(br.b, `n:${br.key}`);
    await tip.enter("b:skin", 0.02);
    const skin = tip.end.slice();
    const nerve = tip.reversed();
    nerve.curve(br, br.length, 0);
    const j = v2.nearest(br.a);
    if (j.d > 0.0005) seam(nerve, `v2-branch-${side}`, "Infraorbital branch onto the maxillary nerve", [v2.at(j.s).p], 0.0008, "the Z-Anatomy branch curve starts beside the trunk curve");
    nerve.curve(v2, j.s, 0);
    // the ganglion: where the three divisions meet the root (inside the trigeminal nerve mesh)
    // (the atlas nerve mesh is a thin cord with no ganglion swelling: the ganglion is a flagged ellipsoid on the curves' junction)
    const gang = { key: proxy(`trigeminal-ganglion-${side}`, "Trigeminal ganglion", null, v2.a, [0.0018, 0.0012, 0.0022]), c: v2.a.slice(), name: "Trigeminal ganglion" };
    nerve.lineTo(gang.c, `u:n:${v2.key}|${gang.key}`, 0.0003);
    // beat 3: from the ganglion along the sensory root into the lateral pons
    const root = curve("Trigeminal nerve (V)", side, 0);
    const pons = (await hostOf("a:pons")).test;
    let sIn = root.length;
    for (let q = root.length; q > 0; q -= 0.0003)
      if (pons(root.at(q).p)) {
        sIn = q - 0.0015;
        break;
      }
    const rf = new Fibre(1).from(gang.c, gang.key);
    rf.lineTo(root.b, `u:${gang.key}|n:${root.key}`, 0.0003);
    rf.curve(root, root.length, Math.max(0, sIn));
    const skinStop = stop(`c:b:skin@${skin.map((v) => v.toFixed(4)).join(",")}`, "Cheek skin (V2)", { carve: { mesh: "b:skin", p: skin, r: 0.012 } });
    return { s, skin, nerve, gang, rf, skinStop };
  })();
  TRI.set(side, p);
  return p;
}
/** Across the brainstem midline at height y (the two mesh halves meet without overlapping: a hidden seam). */
export async function crossBS(f, side, id, y, pref, tag) {
  const a = await inSlice(id, side, y, pref, 1.0);
  const host = f.seg[f.seg.length - 1][1].replace(/^u:/, "").split("|")[0];
  await f.routeTo([...new Set([host, `a:${id}`])], a, { sgn: sgnOf(side), minX: 0.0003, h: 0.0003 });
  const cross = [0, a[1], a[2]];
  seam(f, tag, "Across the midline (the two halves of the brainstem mesh)", [cross, [-a[0], a[1], a[2]]], 0.0008, "the left and right halves of the brainstem mesh meet at the midline without overlapping");
  return cross;
}
function trigeminalHead(st) {
  return [
    B({ start: soma(st.skin, "b:skin", 1), stops: [st.skinStop], meta: { view: "anterior" } }),
    B({ f: [st.nerve.json()], meta: { view: "anterior" } }),
    B({ soma: soma(st.gang.c, st.gang.key, 1), stops: [proxyStop(st.gang)], meta: { view: "anterior" } }),
    B({ f: [st.rf.json()] }),
  ];
}
async function vpmToCortex(beats, O, vpm) {
  beats[8] = B({ soma: soma(vpm.c, vpm.key, 3), stops: [proxyStop(vpm)] });
  const tc = await thalamocortical(O, "vpm", "s1-face");
  beats[9] = B({ f: [tc.leave.json()] });
  beats[10] = B({ f: [tc.cap.json()] });
  beats[11] = B({ f: [tc.cor.json()], syn: soma(tc.goal, `a:${CORTEX["s1-face"][0]}`, 3) });
  beats[12] = B({ stops: [atlasStop(CORTEX["s1-face"][0], O, CORTEX["s1-face"][2])] });
  return beats;
}

export const trigeminalDiscriminative = {
  async build(side) {
    const O = side === "L" ? "R" : "L";
    const st = await trigeminalStart(side);
    const s = st.s;
    const beats = trigeminalHead(st);
    // 4 into the principal sensory nucleus (rostral pons, lateral tegmentum)
    const pv = await nuc("principal-v", side);
    const inP = new Fibre(1).from(st.rf.end, st.rf.seg[st.rf.seg.length - 1][1]);
    await inP.routeTo(["a:pons", pv.key], pv.c, { sgn: s, minX: 0.001, h: 0.0003 });
    beats[4] = B({ f: [inP.json()], syn: soma(pv.c, pv.key, 1) });
    beats[5] = B({ soma: soma(pv.c, pv.key, 2), stops: [proxyStop(pv)] });
    // 6 the 2nd-order axons cross the midline in the pons
    const x = new Fibre(2).from(pv.c, pv.key);
    const cross = await crossBS(x, side, "pons", pv.c[1] - 0.001, [0.15, 0.55], `tri-d-x-${side}`);
    const mlP = await inSlice("mni-medial-lemniscus", O, pv.c[1] + 0.0015);
    await x.routeTo(["a:pons", "a:mni-medial-lemniscus"], mlP, { sgn: -s, minX: 0.0003, h: 0.0003 });
    beats[6] = B({ f: [x.json()], cross: { p: cross, host: "a:pons", level: "pons", yMin: 1.582, yMax: 1.598, name: "Trigeminal fibres cross" } });
    // 7 the trigeminal lemniscus with the medial lemniscus, up to the VPM
    const vpm = await nuc("vpm", O);
    const tl = new Fibre(2).from(mlP, "a:mni-medial-lemniscus");
    const mlTop = await inSlice("mni-medial-lemniscus", O, 1.6125);
    await tl.routeTo(["a:mni-medial-lemniscus"], mlTop, { h: 0.0002, sgn: -s, minX: 0.0003 });
    await tl.routeTo(["a:mni-medial-lemniscus", "a:midbrain", "a:thalamus", vpm.key], vpm.c, { h: 0.0004, sgn: -s, minX: 0.001 });
    beats[7] = B({ f: [tl.json()], syn: soma(vpm.c, vpm.key, 2) });
    return vpmToCortex(beats, O, vpm);
  },
};

export const trigeminalPain = {
  async build(side) {
    const O = side === "L" ? "R" : "L";
    const st = await trigeminalStart(side);
    const s = st.s;
    const beats = trigeminalHead(st);
    // 4 down the spinal trigeminal tract in the lateral tegmentum of the pons and medulla, to the spinal nucleus (caudal medulla)
    const sv = await nuc("spinal-v", side);
    const down = new Fibre(1).from(st.rf.end, st.rf.seg[st.rf.seg.length - 1][1]);
    for (const [id, y, pref] of [["pons", 1.584, [0.72, 0.3]], ["medulla-oblongata", 1.572, [0.75, 0.25]], ["medulla-oblongata", 1.564, [0.75, 0.22]]])
      await down.routeTo(["a:pons", "a:medulla-oblongata"], await inSlice(id, side, y, pref, 1.0), { sgn: s, minX: 0.0015, h: 0.0003, smooth: 8 });
    const low = [sv.c[0], sv.c[1] - sv.r[1] * 0.5, sv.c[2]];
    await down.routeTo(["a:medulla-oblongata", sv.key], low, { sgn: s, minX: 0.0015, h: 0.0003 });
    beats[4] = B({ f: [down.json()], syn: soma(low, sv.key, 1) });
    beats[5] = B({ soma: soma(low, sv.key, 2), stops: [proxyStop(sv)] });
    // 6 the 2nd-order axon crosses just after the nucleus, in the caudal medulla
    const x = new Fibre(2).from(low, sv.key);
    const cross = await crossBS(x, side, "medulla-oblongata", low[1] + 0.0005, [0.2, 0.55], `tri-p-x-${side}`);
    const lt = await inSlice("medulla-oblongata", O, low[1] + 0.002, [0.72, 0.5], 1.0);
    await x.routeTo(["a:medulla-oblongata"], lt, { sgn: -s, minX: 0.0015, h: 0.0003 });
    beats[6] = B({ f: [x.json()], cross: { p: cross, host: "a:medulla-oblongata", level: "caudal medulla", yMax: 1.562, name: "Trigeminothalamic fibres cross" } });
    // 7 the trigeminothalamic tract beside the anterolateral tract in the lateral tegmentum, up to the VPM
    const vpm = await nuc("vpm", O);
    const up = new Fibre(2).from(lt, "a:medulla-oblongata");
    for (const [id, y, pref] of [["medulla-oblongata", 1.5655, [0.72, 0.42]], ["pons", 1.5845, [0.48, 0.32]], ["pons", 1.597, [0.52, 0.36]], ["midbrain", 1.6085, [0.68, 0.4]]])
      await up.routeTo(["a:medulla-oblongata", "a:pons", "a:midbrain"], await inSlice(id, O, y, pref, 1.0), { sgn: -s, minX: 0.0015, h: 0.0003, smooth: 8 });
    await up.routeTo(["a:midbrain", "a:thalamus", vpm.key], vpm.c, { sgn: -s, minX: 0.002, h: 0.0004, smooth: 8 });
    beats[7] = B({ f: [up.json()], syn: soma(vpm.c, vpm.key, 2) });
    return vpmToCortex(beats, O, vpm);
  },
};

export const PATHWAYS = { dcml, alst, dsct, "trigeminal-discriminative": trigeminalDiscriminative, "trigeminal-pain": trigeminalPain };
export { dist, cordY };
