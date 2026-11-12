// Brainstem hubs and circuits (v3 specs): the solitary nucleus, the corticopontocerebellar pathway, the cerebellar and basal
// ganglia loops, the limbic tracts and the reward pathway. `side` = the side the beat model calls "i".
import { Fibre, nuc, inSlice, cortexPoint, sgnOf, synth, seam, dist } from "./common.mjs";
import { B, soma, stop, corticofugal, joinFibres, cordY, tractRun } from "./relay.mjs";
import { crossBS, fitProxy as fitProxyC } from "./sensory.mjs";
import { centreIn, deepIn } from "./autonomic.mjs";
import { insideNear, hostOf, proxy } from "../lib/fibre.mjs";
import { curve } from "../lib/nerves.mjs";

const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);
const proxyStop = (n) => stop(n.key, n.name);
const headPart = (node, side) => (side === "L" ? `part:head-targets/${node}` : `pr:head-targets/${node}`);
const opp = (s) => (s === "L" ? "R" : "L");
const mid = (a, b, dy = 0) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy, (a[2] + b[2]) / 2];
const MED = "a:medulla-oblongata";

/* ------------------------------------------------------------------ solitary nucleus */
// Lecture 7 slides 22-24, Lecture 8 slide 22: CN VII, IX, X bring taste (rostral) and visceral input (caudal: baroreceptors,
// chemoreceptors, gut) to the solitary nucleus; outputs to the salivatory nuclei, DMX, nucleus ambiguus and the lateral horn
// T1-L2. Here CN IX: taste from the posterior tongue and the carotid sinus baroreceptors.
export const solitary = {
  async build(side) {
    const s = sgnOf(side);
    const ix = curve("Glossopharyngeal nerve (IX)", side, 0);
    const lin = curve("Glossopharyngeal nerve (IX)", side, 1);
    const tongue = "part:head-targets/organ_tongue"; // (one midline organ)
    // taste: a taste bud on the posterior third of the tongue, up the lingual branch of IX (built from the nerve's end, reversed)
    const t = new Fibre(1).from(lin.b, `n:${lin.key}`);
    await t.enter(tongue, 0.012);
    const bud = t.end.slice();
    const taste = t.reversed();
    taste.curve(lin, lin.length, 0);
    const jl = ix.nearest(lin.a);
    if (jl.d > 0.0005) seam(taste, `ix-lingual-${side}`, "Lingual branch onto CN IX", [jl.q], 0.0008, "the branch curve starts beside the trunk curve");
    // the inferior ganglion of IX in the jugular foramen (no mesh: a flagged ellipsoid on the nerve)
    let sG = 0;
    for (let q = 0; q < ix.length; q += 0.0005) if (ix.at(q).p[1] < 1.556) {
      sG = q;
      break;
    }
    const gc = ix.at(sG).p;
    const gKey = proxy(`ix-ganglion-${side}`, "Inferior ganglion of IX", null, gc, [0.0012, 0.0016, 0.0012]);
    taste.curve(ix, jl.s, sG);
    // baroreceptors: the carotid sinus, by the carotid sinus branch of IX (not in Z-Anatomy: a flagged connector)
    const sinus = "part:thorax/vessel_carotid_sinus";
    const sinP = await insideNear(sinus, [s * 0.034, 1.491, 0.003], 0.006);
    const near = ix.nearest(sinP);
    const baro = new Fibre(1).from(sinP, sinus);
    synth(baro, `carotid-sinus-n-${side}`, "Carotid sinus branch of IX", [mid(sinP, near.q, 0.004), near.q], 0.0005, "Z-Anatomy has no carotid sinus nerve: from the sinus wall to the glossopharyngeal nerve");
    baro.curve(ix, near.s, sG);
    // 3 on into the medulla: the solitary tract and nucleus (dorsal medulla)
    const nts = await nuc("solitary", side);
    const f3 = new Fibre(1).from(gc, gKey);
    f3.curve(ix, sG, 0);
    const inMed = await insideNear(MED, f3.end, 0.004);
    if (dist(inMed, f3.end) > 0.0004) seam(f3, `ix-in-${side}`, "CN IX into the medulla", [inMed], 0.0008, "the CN IX curve ends at the medulla's surface");
    await f3.routeTo([MED, nts.key], nts.c, { sgn: s, minX: 0.0006, h: 0.00025 });
    // the outputs (2nd-order solitary neurons), all on the same side
    const isn = await centreIn("inferior-salivatory-nucleus", side);
    const ssn = await centreIn("superior-salivatory-nucleus", side);
    const amb = await deepIn("nucleus-ambiguus", side);
    const out = async (goal, hosts) => {
      const f = new Fibre(2).from(nts.c, nts.key);
      await f.routeTo([nts.key, MED, "a:pons", ...hosts], goal, { sgn: s, minX: 0.0004, h: 0.00025 });
      return f;
    };
    const toISN = await out(isn, ["a:inferior-salivatory-nucleus"]);
    const toAMB = await out(amb, ["a:nucleus-ambiguus"]);
    const toSSN = await out(ssn, ["a:superior-salivatory-nucleus"]);
    // nucleus ambiguus -> the vagus -> its pharyngeal branch to the pharyngeal constrictors (LMN, order 3)
    const v2 = curve("Vagus nerve (X)", side, 2);
    const constrictors = headPart("muscle_pharyngeal_constrictors", side);
    const nA = new Fibre(3).from(amb, "a:nucleus-ambiguus");
    const sv = v2.nearest(amb);
    const exitA = await insideNear(MED, sv.q, 0.004);
    await nA.routeTo(["a:nucleus-ambiguus", MED], exitA, { sgn: s, minX: 0.0004, h: 0.00025 });
    nA.lineTo(sv.q, `u:${MED}|n:${v2.key}`, 0.0003);
    let best = null;
    const ch = await hostOf(constrictors);
    for (let q = sv.s + 0.02; q < Math.min(v2.length, sv.s + 0.09); q += 0.0008) {
      const p = v2.at(q).p;
      const d = Math.min(...ch.meshes.map((m) => m.dist(p, 0.03)));
      if (!best || d < best.d) best = { q, d, p };
    }
    nA.curve(v2, sv.s, best.q);
    const pIn = await insideNear(constrictors, best.p, 0.02);
    synth(nA, `pharyngeal-x-sol-${side}`, "Pharyngeal branch of the vagus (X)", [mid(best.p, pIn), pIn], 0.0005, "Z-Anatomy has no pharyngeal branch: the vagus to the pharyngeal constrictors");
    // to the lateral horn (T1): down the lateral medulla and the lateral funiculus of the cord to the intermediolateral column
    const iml = await inSlice("intermediolateral-nucleus", side, cordY("T1"), null, 1.2);
    const toLH = new Fibre(2).from(nts.c, nts.key);
    await toLH.routeTo([nts.key, MED], await inSlice("medulla-oblongata", side, 1.552, [0.55, 0.5], 1.0), { sgn: s, minX: 0.0008, h: 0.0003, smooth: 6 });
    const lfTop = await inSlice("lateral-reticulospinal-tract", side, 1.5432);
    await toLH.routeTo([MED, "a:white-matter-of-spinal-cord", "a:lateral-reticulospinal-tract"], lfTop, { sgn: s, minX: 0.0002, h: 0.0003 });
    await tractRun(toLH, "lateral-reticulospinal-tract", side, 1.5425, iml[1] + 0.0025);
    await toLH.routeTo(["a:lateral-reticulospinal-tract", "a:white-matter-of-spinal-cord", "a:grey-matter-of-spinal-cord", "a:intermediolateral-nucleus"], iml, { sgn: s, minX: 0.0002, h: 0.0002 });
    const bs = { view: "posterior" };
    return [
      B({ start: soma(bud, tongue, 1), soma: soma(sinP, sinus, 1), stops: [carve(tongue, bud, 0.012, "Tongue (posterior third)"), stop(sinus, "Carotid sinus")], meta: { view: "oblique-front" } }),
      B({ f: [taste.json(), baro.json()], syn: soma(gc, gKey, 1), meta: { view: "oblique-front" } }),
      B({ soma: soma(gc, gKey, 1), stops: [stop(gKey, "Inferior ganglion of IX")], meta: { view: "oblique-front" } }),
      B({ f: [f3.json()], syn: soma(nts.c, nts.key, 1), meta: bs }),
      B({ soma: soma(nts.c, nts.key, 2), stops: [proxyStop(nts)], meta: bs }),
      B({ f: [toISN.json()], syn: soma(isn, "a:inferior-salivatory-nucleus", 2), meta: bs }),
      B({ soma: soma(isn, "a:inferior-salivatory-nucleus", 3), stops: [atlasStop("inferior-salivatory-nucleus", side, "Inferior salivatory nucleus")], meta: bs }),
      B({ f: [toAMB.json()], syn: soma(amb, "a:nucleus-ambiguus", 2), meta: bs }),
      B({ soma: soma(amb, "a:nucleus-ambiguus", 3), stops: [atlasStop("nucleus-ambiguus", side, "Nucleus ambiguus")], meta: bs }),
      B({ f: [nA.json()], syn: soma(pIn, constrictors, 3), meta: { view: "oblique-front" } }),
      B({ stops: [carve(constrictors, pIn, 0.02, "Pharynx and larynx")], meta: { view: "oblique-front" } }),
      B({ f: [toSSN.json()], syn: soma(ssn, "a:superior-salivatory-nucleus", 2), meta: bs }),
      B({ soma: soma(ssn, "a:superior-salivatory-nucleus", 3), stops: [atlasStop("superior-salivatory-nucleus", side, "Superior salivatory nucleus")], meta: bs }),
      B({ f: [toLH.json()], syn: soma(iml, "a:intermediolateral-nucleus", 2) }),
      B({ soma: soma(iml, "a:intermediolateral-nucleus", 3), stops: [atlasStop("intermediolateral-nucleus", side, "Lateral horn (T1)")] }),
    ];
  },
};

/* ------------------------------------------------------------------ corticopontocerebellar */
// Lecture 10 slide 11, Lecture 14 slide 11, Lab 10 slide 4: layer V cortex -> cerebral peduncle -> ipsilateral pontine nuclei
// -> transverse pontine fibres cross -> middle cerebellar peduncle -> contralateral cerebellar cortex. `side` = the cortex.
export const corticopontocerebellar = {
  async build(side) {
    const O = opp(side);
    const s = sgnOf(side);
    const d = await corticofugal(side, "m1-hand");
    const pn = await nuc("pontine", side);
    const f1 = joinFibres(1, [d.capsule, d.peduncle]);
    const leave = d.leave;
    await f1.routeTo(["a:base-of-peduncle", "a:mni-longitudinal-fibers-of-the-pons", "a:pons", pn.key], pn.c, { sgn: s, minX: 0.0008, h: 0.0003 });
    const corticopontine = joinFibres(1, [leave, f1]);
    // the pontine neuron: across the midline in the basis pontis (transverse fibres), into the opposite MCP
    const x = new Fibre(2).from(pn.c, pn.key);
    const cross = await crossBS(x, side, "pons", pn.c[1] - 0.001, [0.15, 0.85], `tpf-x-${side}`);
    const mcpIn = await inSlice("mni-middle-cerebellar-peduncle", O, 1.583, [0.35, 0.6], 1.0);
    await x.routeTo(["a:pons", "a:mni-middle-cerebellar-peduncle"], mcpIn, { sgn: -s, minX: 0.002, h: 0.0003, smooth: 6 });
    const mcp = new Fibre(2).from(mcpIn, "a:mni-middle-cerebellar-peduncle");
    const mcpOut = await inSlice("mni-middle-cerebellar-peduncle", O, 1.583, [0.95, 0.5], 1.0);
    await mcp.routeTo(["a:mni-middle-cerebellar-peduncle"], mcpOut, { sgn: -s, minX: 0.004, h: 0.0003, smooth: 6 });
    const cb = new Fibre(2).from(mcpOut, "a:mni-middle-cerebellar-peduncle");
    const inCb = await insideNear("a:cerebellum", mcpOut, 0.008, true);
    if (dist(inCb, mcpOut) > 0.0004) seam(cb, `mcp-cb-${side}`, "Middle cerebellar peduncle into the cerebellum", [inCb], 0.001, "the MNI middle cerebellar peduncle and the Z-Anatomy cerebellum meshes do not touch");
    const goal = await cortexPoint("posterior-quadrangular-lobule", O, [0.03, 1.595, -0.045]);
    await cb.routeTo(["a:mni-middle-cerebellar-peduncle", "a:cerebellum", "a:posterior-quadrangular-lobule"], goal, { sgn: -s, minX: 0.004, h: 0.0004, smooth: 8 });
    return [
      B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", side, "Motor cortex (layer V)")] }),
      B({ f: [corticopontine.json()], syn: soma(pn.c, pn.key, 1) }),
      B({ soma: soma(pn.c, pn.key, 2), stops: [proxyStop(pn)] }),
      B({ f: [x.json()], cross: { p: cross, host: "a:pons", level: "basis pontis", yMin: 1.578, yMax: 1.598, name: "Transverse pontine fibres cross" } }),
      B({ f: [mcp.json()] }),
      B({ f: [cb.json()], syn: soma(goal, "a:posterior-quadrangular-lobule", 2) }),
      B({ stops: [atlasStop("posterior-quadrangular-lobule", O, "Cerebellar hemisphere (other side)")] }),
    ];
  },
};

export const PATHWAYS = { solitary, corticopontocerebellar };
// (later specs add themselves below)
export { carve, atlasStop, proxyStop, opp, mid, joinFibres, synth };

/* ------------------------------------------------------------------ cerebellar circuit */
// Lecture 14 slides 11-18, Lab 10 slides 4 and 9: mossy fibres (pontine nuclei, crossed, by the MCP) and climbing fibres
// (inferior olive, crossed, by the ICP) reach the cortex of one cerebellar hemisphere; Purkinje cells (inhibitory) project to
// the deep cerebellar nuclei (excitatory), whose axons leave by the SCP, cross in the caudal midbrain (decussation of the
// SCP) and end in the contralateral red nucleus and VA/VL thalamus. `side` = the cerebellar hemisphere.
export const cerebellar = {
  async build(side) {
    const O = opp(side);
    const s = sgnOf(side);
    const pn = await nuc("pontine", O);
    const olive = await centreIn("olive", O);
    const goal = await cortexPoint("posterior-quadrangular-lobule", side, [0.03, 1.595, -0.045]);
    const intoCb = async (f, from, tag) => {
      const inCb = await insideNear("a:cerebellum", from, 0.008, true);
      if (dist(inCb, from) > 0.0004) seam(f, tag, "Peduncle into the cerebellum", [inCb], 0.001, "the MNI peduncle and the Z-Anatomy cerebellum meshes do not touch");
      await f.routeTo(["a:cerebellum", "a:posterior-quadrangular-lobule"], goal, { sgn: s, minX: 0.004, h: 0.0004, smooth: 8 });
    };
    // 1 mossy fibre: pontine nucleus (other side) -> transverse fibres cross -> MCP -> cerebellar cortex
    const mossy = new Fibre(1).from(pn.c, pn.key);
    await crossBS(mossy, O, "pons", pn.c[1] - 0.001, [0.15, 0.85], `cb-mossy-x-${side}`);
    const mcpIn = await inSlice("mni-middle-cerebellar-peduncle", side, 1.583, [0.35, 0.6], 1.0);
    await mossy.routeTo(["a:pons", "a:mni-middle-cerebellar-peduncle"], mcpIn, { sgn: s, minX: 0.002, h: 0.0003, smooth: 6 });
    const mcpOut = await inSlice("mni-middle-cerebellar-peduncle", side, 1.583, [0.95, 0.5], 1.0);
    await mossy.routeTo(["a:mni-middle-cerebellar-peduncle"], mcpOut, { sgn: s, minX: 0.004, h: 0.0003, smooth: 6 });
    await intoCb(mossy, mcpOut, `cb-mcp-${side}`);
    // 2 climbing fibre: inferior olive (other side) -> crosses in the medulla -> ICP -> cerebellar cortex
    const climb = new Fibre(1).from(olive, "a:olive");
    await crossBS(climb, O, "medulla-oblongata", olive[1] + 0.001, [0.2, 0.7], `cb-climb-x-${side}`);
    const icpLow = await inSlice("mni-inferior-cerebellar-peduncle", side, 1.5745, [0.7, 0.5], 1.0);
    await climb.routeTo([MED, "a:mni-inferior-cerebellar-peduncle"], icpLow, { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    const icpTop = await inSlice("mni-inferior-cerebellar-peduncle", side, 1.5835, [0.8, 0.35], 1.0);
    await climb.routeTo(["a:mni-inferior-cerebellar-peduncle"], icpTop, { sgn: s, minX: 0.002, h: 0.0003, smooth: 8 });
    await intoCb(climb, icpTop, `cb-icp-${side}`);
    // 4 Purkinje cell (inhibitory) -> deep cerebellar nucleus
    const dn = await nuc("dentate", side);
    const pk = new Fibre(2).from(goal, "a:posterior-quadrangular-lobule");
    await pk.routeTo(["a:posterior-quadrangular-lobule", "a:cerebellum", dn.key], dn.c, { sgn: s, minX: 0.003, h: 0.0003, smooth: 6 });
    // 6-8 deep nucleus (excitatory) -> SCP -> decussation (caudal midbrain) -> red nucleus and VA/VL of the other side
    const scpLow = await inSlice("superior-cerebellar-peduncle", side, 1.587, [0.6, 0.5], 1.0);
    const scpTop = await inSlice("superior-cerebellar-peduncle", side, 1.599, [0.3, 0.5], 1.0);
    const scp = new Fibre(3).from(dn.c, dn.key);
    await scp.routeTo([dn.key, "a:cerebellum", "a:superior-cerebellar-peduncle"], scpLow, { sgn: s, minX: 0.002, h: 0.0003, smooth: 6 });
    await scp.routeTo(["a:superior-cerebellar-peduncle"], scpTop, { sgn: s, minX: 0.001, h: 0.0003, smooth: 6 });
    const x = new Fibre(3).from(scpTop, "a:superior-cerebellar-peduncle");
    const inMb = await insideNear("a:midbrain", scpTop, 0.006, true);
    if (dist(inMb, scpTop) > 0.0004) seam(x, `scp-mb-${side}`, "SCP into the midbrain", [inMb], 0.0008, "the SCP and midbrain meshes do not touch");
    const cross = await crossBS(x, side, "midbrain", 1.6045, [0.15, 0.55], `scp-x-${side}`);
    const rn = await inSlice("red-nucleus", O, 1.611, [0.55, 0.5], 1.5);
    const vavl = await nuc("vavl", O);
    const toRN = new Fibre(3).from(x.end, "a:midbrain");
    await toRN.routeTo(["a:midbrain", "a:red-nucleus"], rn, { sgn: -s, minX: 0.0006, h: 0.0003 });
    const toVL = new Fibre(3).from(rn, "a:red-nucleus");
    await toVL.routeTo(["a:red-nucleus", "a:midbrain", "a:thalamus", vavl.key], vavl.c, { sgn: -s, minX: 0.001, h: 0.0004, smooth: 6 });
    const thal = joinFibres(3, [toRN, toVL]);
    return [
      B({ start: soma(pn.c, pn.key, 1), soma: soma(olive, "a:olive", 1), stops: [proxyStop(pn), atlasStop("olive", O, "Inferior olive")] }),
      B({ f: [mossy.json()], syn: soma(goal, "a:posterior-quadrangular-lobule", 1) }),
      B({ f: [climb.json()], syn: soma(goal, "a:posterior-quadrangular-lobule", 1) }),
      B({ soma: soma(goal, "a:posterior-quadrangular-lobule", 2), stops: [atlasStop("posterior-quadrangular-lobule", side, "Purkinje cells (inhibitory)")] }),
      B({ f: [pk.json()], syn: soma(dn.c, dn.key, 2) }),
      B({ soma: soma(dn.c, dn.key, 3), stops: [stop(dn.key, "Deep cerebellar nuclei (excitatory)")] }),
      B({ f: [scp.json()] }),
      B({ f: [x.json()], cross: { p: cross, host: "a:midbrain", level: "caudal midbrain", yMin: 1.6, yMax: 1.609, name: "Decussation of the SCP" } }),
      B({ f: [thal.json()], syn: soma(vavl.c, vavl.key, 3) }),
      B({ stops: [atlasStop("red-nucleus", O, "Red nucleus (other side)"), stop(vavl.key, "VA/VL thalamus (other side)")] }),
    ];
  },
};
PATHWAYS.cerebellar = cerebellar;

/* ------------------------------------------------------------------ basal ganglia loop */
// Lecture 14 slides 23-31: cortex -> striatum (caudate + putamen); direct "go": striatum inhibits GPi, which then stops
// inhibiting VA/VL, so the cortex is excited; indirect "no-go": striatum inhibits GPe, which disinhibits the STN, which
// excites GPi; SNc dopamine to the striatum (D1 excites the direct pathway, D2 inhibits the indirect); GPi -> VA/VL ->
// cortex. One hemisphere: `side` is the body side, the loop runs in the opposite hemisphere (the beat model's "c").
// Colours: 1 cortex, 2 striatum, 3 pallidum / STN / SNc, 4 thalamus.
export const basalGanglia = {
  async build(side) {
    const H = opp(side);
    const s = sgnOf(H);
    const GP = "a:globus-pallidus";
    const cx = await cortexPoint("precentral-gyrus", H, [0.03, 1.685, -0.01]);
    const put = await inSlice("putamen", H, 1.628, [0.5, 0.5], 1.0);
    // GPi (medial) and GPe (lateral) segments of the one atlas pallidum
    const gpiP = await inSlice("globus-pallidus", H, 1.626, [0.12, 0.55], 0.9);
    const gpeP = await inSlice("globus-pallidus", H, 1.628, [0.85, 0.5], 0.9);
    const gpi = await fitProxyC(`gpi-${H}`, "GPi", GP, gpiP, [0.0016, 0.002, 0.002]);
    const gpe = await fitProxyC(`gpe-${H}`, "GPe", GP, gpeP, [0.0016, 0.002, 0.002]);
    const stn = await centreIn("mni-subthalamic-nucleus", H);
    const snc = await inSlice("mni-substantia-nigra", H, 1.609, [0.5, 0.25], 1.0);
    const vavl = await nuc("vavl", H);
    const R = (f, hosts, p, o = {}) => f.routeTo(hosts, p, { sgn: s, minX: 0.002, h: 0.0004, smooth: 8, ...o });
    const WMk = "a:white-matter-of-telencephalon";
    const IC = "a:mni-internal-capsule";
    // 1 corticostriate fibre
    const f1 = new Fibre(1).from(cx, "a:precentral-gyrus");
    await R(f1, ["a:precentral-gyrus", WMk, IC, "a:putamen"], put);
    // 3 direct: striatum -> GPi (inhibitory)
    const d3 = new Fibre(2).from(put, "a:putamen");
    await R(d3, ["a:putamen", GP, gpi.key], gpi.c, { h: 0.0003 });
    // 4 indirect: striatum -> GPe (inhibitory), GPe -> STN (inhibitory), STN -> GPi (excitatory)
    const i1 = new Fibre(2).from(put, "a:putamen");
    await R(i1, ["a:putamen", GP, gpe.key], gpe.c, { h: 0.0003 });
    const i2 = new Fibre(3).from(gpe.c, gpe.key);
    await R(i2, [gpe.key, GP, IC, "a:mni-internal-capsule", "a:thalamus", "a:hypothalamus", "a:mni-subthalamic-nucleus"], stn, { h: 0.0003 });
    const i3 = new Fibre(3).from(stn, "a:mni-subthalamic-nucleus");
    await R(i3, ["a:mni-subthalamic-nucleus", IC, "a:thalamus", "a:hypothalamus", GP, gpi.key], gpi.c, { h: 0.0003 });
    // 5 SNc dopamine -> striatum
    const da = new Fibre(3).from(snc, "a:mni-substantia-nigra");
    await R(da, ["a:mni-substantia-nigra", "a:midbrain", "a:mni-subthalamic-nucleus", "a:thalamus", "a:hypothalamus", IC, GP, "a:putamen"], put, { h: 0.0004 });
    // 7 GPi -> VA/VL thalamus (inhibitory) -> motor cortex (excitatory)
    const g7 = new Fibre(3).from(gpi.c, gpi.key);
    await R(g7, [gpi.key, GP, IC, "a:thalamus", vavl.key], vavl.c, { h: 0.0003 });
    const t7 = new Fibre(4).from(vavl.c, vavl.key);
    const capUp = await inSlice("mni-internal-capsule", H, 1.632, [0.5, 0.4], 1.0);
    await R(t7, [vavl.key, "a:thalamus", IC], capUp);
    await R(t7, [IC, WMk, "a:precentral-gyrus"], cx, { h: 0.0006, smooth: 12 });
    return [
      B({ soma: soma(cx, "a:precentral-gyrus", 1), stops: [atlasStop("precentral-gyrus", H, "Motor cortex")] }),
      B({ f: [f1.json()], syn: soma(put, "a:putamen", 1) }),
      B({ soma: soma(put, "a:putamen", 2), stops: [atlasStop("putamen", H, "Putamen (striatum)"), atlasStop("caudate-nucleus", H, "Caudate (striatum)")] }),
      B({ f: [d3.json()], syn: soma(gpi.c, gpi.key, 2) }),
      B({ f: [i1.json(), i2.json(), i3.json()], syn: soma(gpi.c, gpi.key, 3), soma: soma(gpe.c, gpe.key, 3), stops: [stop(gpe.key, "GPe"), atlasStop("mni-subthalamic-nucleus", H, "Subthalamic nucleus")] }),
      B({ f: [da.json()], syn: soma(put, "a:putamen", 3), soma: soma(snc, "a:mni-substantia-nigra", 3), stops: [atlasStop("mni-substantia-nigra", H, "Substantia nigra (SNc)")] }),
      B({ soma: soma(gpi.c, gpi.key, 3), stops: [stop(gpi.key, "GPi (inhibitory output)")] }),
      B({ f: [g7.json(), t7.json()], syn: soma(cx, "a:precentral-gyrus", 4) }),
      B({ soma: soma(vavl.c, vavl.key, 4), stops: [stop(vavl.key, "VA/VL thalamus"), atlasStop("precentral-gyrus", H, "Motor cortex")] }),
    ];
  },
};
PATHWAYS["basal-ganglia"] = basalGanglia;
