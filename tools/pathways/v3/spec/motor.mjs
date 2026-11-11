// Descending (motor) pathways: lateral corticospinal tract and its kin. `side` = the body side of the limb / muscle;
// the upper motor neuron's cortex is on the opposite side for crossed pathways.
import { Fibre, inSlice, dist, cordY } from "./relay.mjs";
import { B, soma, stop, corticofugal, motorDecussation, MOTOR_X, lmnAt, intoHorn, lmnOut, tractRun, CORTEX, joinFibres } from "./relay.mjs";
import { chain, sgnOf } from "./common.mjs";
import { insideNear } from "../lib/fibre.mjs";
import { curve, splines } from "../lib/nerves.mjs";

export const carve = (mesh, p, r, name) => stop(`c:${mesh}@${p.map((v) => v.toFixed(4)).join(",")}`, name, { carve: { mesh, p, r } });
export const atlasStop = (id, side, name) => stop(`a:${id}@${side}`, name);

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

export const lcst = {
  async build(side) {
    const cx = side === "L" ? "R" : "L"; // the cortex (upper motor neuron) is contralateral to the limb
    const d = await corticofugal(cx, "m1-hand");
    const beats = [];
    beats[0] = B({ soma: soma(d.soma, d.gyrus, 1), stops: [atlasStop("precentral-gyrus", cx, CORTEX["m1-hand"][2])] });
    beats[1] = B({ f: [d.leave.json()] });
    beats[2] = B({ f: [d.capsule.json()] });
    beats[3] = B({ f: [d.peduncle.json()] });
    beats[4] = B({ f: [d.basis.json()] });
    beats[5] = B({ f: [d.pyramid.json()] });
    // 6 the pyramidal (motor) decussation: about 80 % of the fibres cross in the caudal medulla
    const x = await motorDecussation(d.pyramid.end, cx);
    beats[6] = B({ f: [x.f.json()], cross: { p: x.cross, host: "a:medulla-oblongata", level: "caudal medulla", yMax: MOTOR_X.yMax, name: "Pyramidal (motor) decussation" } });
    // 7 down the lateral corticospinal tract (limb side) to C8, then into the lateral ventral horn: synapse on the alpha motor neuron
    const lmn = await lmnAt("C8", side, "lateral");
    const tract = new Fibre(1).from(x.f.end, "a:lateral-corticospinal-tract");
    await tractRun(tract, "lateral-corticospinal-tract", side, 1.5425, cordY("C8") + 0.0025);
    await intoHorn(tract, ["a:lateral-corticospinal-tract"], lmn, side);
    beats[7] = B({ f: [tract.json()], syn: soma(lmn, "a:anterior-horn-of-spinal-cord", 1) });
    // 8 the uncrossed 20 %: the anterior corticospinal tract on the cortex side (branches from the end of the pyramid)
    const un = new Fibre(1).from(d.pyramid.end, "a:pyramid-of-medulla-oblongata");
    const acTop = await inSlice("anterior-corticospinal-tract", cx, 1.5432);
    await un.routeTo(["a:pyramid-of-medulla-oblongata", "a:medulla-oblongata", "a:white-matter-of-spinal-cord", "a:anterior-corticospinal-tract"], acTop, { sgn: sgnOf(cx), minX: 0.0001, h: 0.0003 });
    await tractRun(un, "anterior-corticospinal-tract", cx, 1.5425, cordY("C8") + 0.004);
    beats[8] = B({ f: [un.json()] });
    // 9 the lower motor neuron's cell body (lamina IX, lateral column at C8)
    beats[9] = B({ soma: soma(lmn, "a:anterior-horn-of-spinal-cord", 2), stops: [stop("a:anterior-horn-of-spinal-cord@" + side, "Ventral horn (C8)")] });
    // 10 out of the horn by the ventral root
    const out = await lmnOut(lmn, "C8", side);
    beats[10] = B({ f: [out.json()] });
    // 11 the spinal nerve, brachial plexus and ulnar nerve to the hand muscles
    const nerve = new Fibre(2).from(out.end, out.seg[out.seg.length - 1][1]);
    await ulnarMotor(nerve, side);
    beats[11] = B({ f: [nerve.json()], syn: soma(nerve.end, `b:muscle_hand_${side}`, 2) });
    beats[12] = B({ stops: [carve(`b:muscle_hand_${side}`, nerve.end, 0.035, "Hand muscles")] });
    return beats;
  },
};

export const PATHWAYS = { lcst };
export { joinFibres, dist, splines };
