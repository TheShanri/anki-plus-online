// Ascending (sensory) pathways: DCML, anterolateral, DSCT, trigeminal (discriminative and pain).
import { Fibre, nuc, inSlice, drgAt, cordY, dist } from "./relay.mjs";
import { B, soma, stop, thalamocortical, ulnarTip, ulnarToDrg, plantarTip, plantarToDrg, dorsalRootIn, tractRun, CORD_TOP, CORTEX } from "./relay.mjs";
import { sgnOf } from "./common.mjs";

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
  return { seg, tip, nerve, drg, gHost, skinStop: carve("b:skin", tip, hand ? 0.012 : 0.02, hand ? "Little finger skin" : "Big toe skin"), drgStop: carve(gHost, drg, 0.004, `DRG ${seg}`) };
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
    beats[0] = B({ start: soma(st.tip, "b:skin", 1), stops: [st.skinStop] });
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

export const PATHWAYS = { dcml };
export { dist, cordY };
