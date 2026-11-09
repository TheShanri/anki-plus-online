import { ORDINAL, opp, physSide, type CoursePathway, type MapPathway, type Side, type Stretch, type WP } from "@/lib/atlas/pathways";
import type { SceneColors, SceneEyes, SceneLayer, SceneLimb, SceneMark, SceneTube, View } from "./PathwayScene";
import { RECEPTORS, type ReceptorId } from "./receptorInfo";
import { fieldPalette } from "./visualField";

/* Turns one pathway of the map (plus the step, the side focus and the body part) into the plain data the 3D scene draws.
 * Both sides are always drawn, in separate lanes; the side that is not focused is dimmed, not removed. */

export type SideMode = Side | "both";
export type LimbChoice = "hand" | "foot" | "leg";

export interface OriginCfg {
  kind: "limb" | "face" | "muscle";
  parts?: LimbChoice[];
  /** Cutaneous endings (course: pathway cards, theory and practical receptor cards). */
  skin: ReceptorId[];
  /** Muscle endings (course: Unit 1 written exam, lab 5, the spinocerebellar pathway card). */
  muscle: ReceptorId[];
  /** The motor neuron also ends on a muscle (reflex arcs). */
  motor?: boolean;
  /** One line on where in the course these come from, shown under the origin list. */
  source: string;
}
export const ORIGINS: Record<string, OriginCfg> = {
  dcml: {
    kind: "limb",
    parts: ["hand", "foot"],
    skin: ["meissner", "merkel", "pacinian", "ruffini"],
    muscle: ["spindle", "gto"],
    source: "Course pathway card (DCML receptors) and the Unit 1 receptor cards: Meissner, Merkel, Pacinian and Ruffini endings, plus muscle spindles and Golgi tendon organs for proprioception.",
  },
  alst: {
    kind: "limb",
    parts: ["hand", "foot"],
    skin: ["free"],
    muscle: [],
    source: "Course cards (lab 5, Unit 1 written exam): free nerve endings carry pain, temperature and itch (A-delta and C fibres).",
  },
  dsct: {
    kind: "limb",
    parts: ["foot"],
    skin: [],
    muscle: ["spindle", "gto"],
    source: "Course pathway card: A-alpha (Ia / Ib) fibres from muscle spindles and Golgi tendon organs.",
  },
  "stretch-reflex": { kind: "limb", parts: ["leg"], skin: [], muscle: ["spindle"], motor: true, source: "Course: the muscle spindle (Ia) afferent synapses directly on the alpha motor neuron, no interneuron (knee jerk, L3/L4)." },
  "withdrawal-reflex": { kind: "limb", parts: ["hand"], skin: [], muscle: [], motor: true, source: "Course: a skin stimulus withdraws the limb through spinal interneurons (polysynaptic)." },
  "trigeminal-discriminative": { kind: "face", skin: [], muscle: [], source: "Course: the three divisions of the trigeminal nerve (V1, V2, V3)." },
  "trigeminal-pain": { kind: "face", skin: [], muscle: [], source: "Course: the three divisions of the trigeminal nerve (V1, V2, V3)." },
  lcst: { kind: "muscle", skin: [], muscle: [], source: "Course pathway card: the alpha motor neuron ends on limb skeletal muscle." },
  "umn-lmn": { kind: "muscle", skin: [], muscle: [], source: "Course pathway card: the lower motor neuron (lamina IX) ends on skeletal muscle." },
};

export const ZONE_NAMES = ["V1 ophthalmic", "V2 maxillary", "V3 mandibular"];

const wpRef = (w: WP) => String(w[0]);
const wpT = (w: WP) => Number((w as unknown as (number | string)[])[2] ?? 0.5);
const wpAxis = (w: WP) => String((w as unknown as (number | string)[])[6] ?? "y");
function at(rel: "i" | "c" | "m", lat: number, dy: number, dz: number, anchor: WP): WP {
  return ["@", rel, lat, dy, dz, wpRef(anchor), wpT(anchor), wpAxis(anchor)] as unknown as WP;
}

export interface BuildOpts {
  mp: MapPathway;
  cp: CoursePathway;
  slug: string;
  colors: SceneColors;
  limbPart: LimbChoice;
}
/** One click: a node (where something starts or arrives) or a path (a tract that draws itself between two nodes). */
export interface Beat {
  kind: "node" | "path";
  /** Neuron (0-based) this beat belongs to: the dots under the scene follow it. */
  neuron: number;
  /** One short line: the structure for a node, the tract (and a crossing note) for a path. */
  caption: string;
  cross?: boolean;
  info: string;
  /** Path: which side it runs on relative to the body part (i same, c opposite, cross = crosses). Node: the side of its position. */
  phys?: "i" | "c" | "cross";
  rel?: string;
  /** Points to frame: this beat and the one before. */
  fit: { wp: WP; body: Side }[];
  view?: View;
}
export interface InfoSpec {
  kind: "node" | "path";
  title: string;
  neuron: number;
  /** [label, value] pairs from the course data (pathway card, structure info). */
  lines: [string, string][];
  ids?: string[];
  crossing?: string;
  loss?: string;
}
export interface BeatScene {
  beats: Beat[];
  tubes: SceneTube[];
  marks: SceneMark[];
  layers: SceneLayer[];
  limbs: SceneLimb[];
  eyes?: SceneEyes;
  infos: Record<string, InfoSpec>;
}

const SIDES: Side[] = ["L", "R"];
export const alphaOf = (mode: SideMode, b: Side) => (mode === "both" || mode === b ? 1 : 0.13);
export const primaryOf = (mode: SideMode): Side => (mode === "both" ? "R" : mode);
const sameWP = (a: WP, b: WP) => JSON.stringify(a) === JSON.stringify(b);
const relOf = (w: WP) => String(w[1]);
type Fit = { wp: WP; body: Side }[];

export function buildBeatScene(o: BuildOpts): BeatScene {
  return o.mp.visual ? buildVisualBeats(o) : buildGeneralBeats(o);
}

function startName(slug: string, part: LimbChoice | "face", cfg: OriginCfg): string {
  if (part === "face") return "Face skin (V1, V2, V3)";
  if (slug === "stretch-reflex") return "Muscle spindle (Ia afferent)";
  if (slug === "withdrawal-reflex") return "Skin receptor";
  const label = part === "hand" ? "Hand" : part === "leg" ? "Leg" : "Foot";
  if (cfg.skin.length > 1) return `${label}: ${cfg.muscle.length ? "skin and muscle receptors" : "skin receptors"}`;
  if (cfg.skin.length === 1) return `${label}: ${RECEPTORS[cfg.skin[0]].name.toLowerCase()}`;
  return `${label}: ${cfg.muscle.map((id) => RECEPTORS[id].name.toLowerCase()).join(", ")}`;
}

function buildGeneralBeats(o: BuildOpts): BeatScene {
  const { mp, cp, slug, colors, limbPart } = o;
  const beats: Beat[] = [];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const layers: SceneLayer[] = [];
  const limbs: SceneLimb[] = [];
  const infos: Record<string, InfoSpec> = {};
  const own: Fit[] = [];
  const sideCol = (s: Side) => (s === "L" ? colors.left : colors.right);
  const relColor = (r: string, b: Side) => (r === "i" ? sideCol(b) : r === "c" ? sideCol(opp(b)) : colors.hi);
  const cfg = ORIGINS[slug];
  const n = mp.neurons.length;
  const ord = (i: number) => `${ORDINAL[i + 1] ?? `${i + 1}th`}-order neuron`;
  const neuronPairs = (i: number): [string, string][] => {
    const c = cp.neurons[i];
    if (!c) return [];
    const out: [string, string][] = [["Neuron", ord(i)], ["Cell body", c.cell_body], ["Tract", c.tract], ["Synapse", c.synapse], ["Level", c.level]];
    out.push(["Crossing", c.decussates ? `crosses the midline (${cp.decussation})` : "does not cross here"]);
    return out;
  };
  const fitWith = (f: Fit): Fit => [...f, ...(own.length ? own[own.length - 1] : [])];

  const addNode = (name: string, wp: WP, neuron: number, lines: [string, string][], extra: Fit = []) => {
    const bi = beats.length;
    const key = `n${bi}`;
    const f: Fit = [...SIDES.map((b) => ({ wp, body: b })), ...extra];
    beats.push({ kind: "node", neuron, caption: name, info: key, rel: relOf(wp), fit: fitWith(f) });
    own.push(f);
    infos[key] = { kind: "node", title: name, neuron, lines };
    for (const b of SIDES) marks.push({ key: `${key}:${b}`, p: wp, body: b, kind: "node", text: name, color: relColor(relOf(wp), b), beat: bi, info: key });
    return bi;
  };
  const addPath = (st: Stretch, neuron: number, pts: WP[], title: string, lines: [string, string][], extra: Fit = []) => {
    const bi = beats.length;
    const key = `p${bi}`;
    const cross = st.phys === "cross";
    const f: Fit = [...SIDES.flatMap((b) => pts.map((wp) => ({ wp, body: b }))), ...extra];
    beats.push({ kind: "path", neuron, caption: cross ? `${title} · crosses the midline` : title, cross, info: key, phys: st.phys, fit: fitWith(f) });
    own.push(f);
    infos[key] = { kind: "path", title, neuron, lines, ids: st.ids, crossing: cross ? cp.decussation : undefined, loss: st.loss };
    for (const b of SIDES) {
      tubes.push({ key: `${key}:${b}`, pts, body: b, beat: bi, info: key, neuron });
      if (st.ids?.length) {
        const ps = physSide(st.phys, b);
        if (ps || b === "R") layers.push({ key: `${key}:${b}`, ids: st.ids, side: ps ?? "both", color: ps === "L" ? colors.left : ps === "R" ? colors.right : colors.hi, opacity: 0.9, beat: bi });
      }
    }
    st.marks?.filter((m) => m.kind === "dec").forEach((m, mi) => marks.push({ key: `${key}:dec${mi}`, p: m.p, body: "R", kind: "dec", text: m.text, color: colors.hi, beat: bi, info: key }));
    return bi;
  };

  const flat = mp.neurons.flatMap((nr, ni) => nr.stretches.filter((s) => s.path && s.path.length > 1).map((st) => ({ st, ni })));
  const firstWP = flat[0]?.st.path?.[0];
  const sensory = !!cfg && cfg.kind !== "muscle";
  const motor = cfg?.kind === "muscle" || !!cfg?.motor;
  const part: LimbChoice = cfg?.parts ? (cfg.parts.includes(limbPart) ? limbPart : cfg.parts[0]) : "hand";
  let prevEnd: WP | null = null;

  // where the signal comes from: the body part, then the peripheral nerve to the dorsal root ganglion (or ganglion)
  if (sensory && firstWP && cfg) {
    const isFace = cfg.kind === "face";
    const lat = isFace ? 0 : part === "hand" ? 0.2 : 0.14;
    const dy = isFace ? -0.03 : part === "hand" ? -0.17 : part === "leg" ? -0.45 : -0.4;
    const dz = isFace ? 0.17 : 0.02;
    const tall = part === "leg" ? 0.72 : 0.2;
    const limbAt = at("i", lat, dy, dz, firstWP);
    const contact = isFace ? at("i", 0.03, dy, dz - 0.02, firstWP) : part === "leg" ? at("i", lat, dy + 0.3, dz, firstWP) : limbAt;
    const mid = isFace ? at("i", 0.03, dy / 2, dz / 2, firstWP) : at("i", lat / 2 + 0.01, dy / 2, dz / 2, firstWP);
    const extra: Fit = SIDES.flatMap((b) =>
      isFace
        ? [{ wp: at("i", 0.1, dy + 0.11, dz, firstWP), body: b }, { wp: at("i", 0.1, dy - 0.11, dz, firstWP), body: b }]
        : [{ wp: at("i", lat + 0.08, dy + tall * 0.6, dz, firstWP), body: b }, { wp: at("i", lat + 0.08, dy - tall * 0.6, dz, firstWP), body: b }],
    );
    const recLines: [string, string][] = [...cfg.skin, ...cfg.muscle].map((id) => [RECEPTORS[id].name, RECEPTORS[id].senses ?? "named in the course"]);
    if (isFace) ZONE_NAMES.forEach((z) => recLines.push([z, "division of the trigeminal nerve"]));
    addNode(startName(slug, isFace ? "face" : part, cfg), contact, 0, recLines.length ? recLines : [["Origin", cfg.source]], extra);
    addPath({ k: "nerve", label: "Peripheral nerve", phys: "i", path: [contact, mid, firstWP] }, 0, [contact, mid, firstWP], "Peripheral nerve to the ganglion", [["Neuron", ord(0)], ["Tract", cp.neurons[0]?.tract ?? ""]]);
    addNode(mp.neurons[0].short, firstWP, 0, neuronPairs(0));
    prevEnd = firstWP;
    for (const b of SIDES) limbs.push({ key: `limb:${b}`, part: isFace ? "face" : part, body: b, skin: [], muscle: [], alpha: 1, at: limbAt, from: 0, to: 2 });
  }

  mp.neurons.forEach((nr, ni) => {
    const sts = nr.stretches.filter((s) => s.path && s.path.length > 1);
    if (!prevEnd && sts[0]?.path) {
      prevEnd = sts[0].path[0];
      addNode(nr.short, prevEnd, ni, neuronPairs(ni));
    }
    for (const st of sts) {
      let pts = st.path!;
      if (prevEnd && !sameWP(prevEnd, pts[0])) pts = [prevEnd, ...pts];
      addPath(st, ni, pts, st.label, [["Neuron", ord(ni)], ["Tract", cp.neurons[ni]?.tract ?? st.label], ["Level", cp.neurons[ni]?.level ?? ""]]);
      prevEnd = pts[pts.length - 1];
    }
    if (!prevEnd) return;
    if (ni < n - 1) addNode(mp.neurons[ni + 1].short, prevEnd, ni + 1, neuronPairs(ni + 1));
    else if (!motor) addNode(nr.syn ?? cp.neurons[ni]?.synapse ?? "End of the pathway", prevEnd, ni, [["End of the pathway", cp.neurons[ni]?.synapse ?? ""], ["Neuron", ord(ni)]]);
  });

  // where the signal goes: the nerve to the muscle
  if (motor && prevEnd) {
    const lat = 0.17;
    const dy = -0.09;
    const dz = 0.03;
    const muscleAt = at("i", lat, dy, dz, prevEnd);
    const mid = at("i", lat / 2, dy / 2, dz / 2, prevEnd);
    const target = at("i", lat - 0.05, dy, dz, prevEnd);
    const nb = beats.length;
    const extra: Fit = SIDES.flatMap((b) => [{ wp: at("i", lat + 0.12, dy + 0.06, dz, prevEnd!), body: b }, { wp: at("i", lat + 0.12, dy - 0.06, dz, prevEnd!), body: b }]);
    addPath({ k: "motor-nerve", label: "Peripheral nerve to the muscle", phys: "i", path: [prevEnd, mid, target] }, n - 1, [prevEnd, mid, target], "Peripheral nerve to the muscle", [["Neuron", ord(n - 1)], ["Ends on", "skeletal muscle"]], extra);
    addNode(slug === "lcst" || slug === "umn-lmn" ? "Limb skeletal muscle" : "Skeletal muscle", target, n - 1, [["End of the pathway", cp.neurons[n - 1]?.synapse ?? "skeletal muscle"]]);
    for (const b of SIDES) limbs.push({ key: `muscle:${b}`, part: "muscle", body: b, skin: [], muscle: [], motor: true, alpha: 1, at: muscleAt, from: nb - 1, to: beats.length });
  }
  return { beats, tubes, marks, layers, limbs, infos };
}

/* ------------------------------------------------------------------------------------------------------------
 * Visual pathway: colour = the visual field (left field one colour, right field the other; upper lighter, lower darker)
 * from retina to V1, line style = which side of the head the fibres are on. `body` is the side of the visual field.
 * Beats: retina, optic nerves, chiasm, tract, LGN, optic radiations, V1.
 * ---------------------------------------------------------------------------------------------------------- */
function buildVisualBeats(o: BuildOpts): BeatScene {
  const { mp, cp, slug, colors } = o;
  void slug;
  const beats: Beat[] = [];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const layers: SceneLayer[] = [];
  const infos: Record<string, InfoSpec> = {};
  const pal = fieldPalette(colors.left, colors.right);
  const fieldCol = (f: Side) => (f === "L" ? colors.left : colors.right);
  const eyeWP = (): WP => ["optic-nerve-ii", "i", 1, 0, 0, 0, "z"] as WP;
  const nerve = mp.neurons[1].stretches;
  const get = (k: string) => nerve.find((s) => s.k === k);
  const own: Fit[] = [];
  const fitWith = (f: Fit): Fit => [...f, ...(own.length ? own[own.length - 1] : [])];
  const sideFit = (wps: WP[]): Fit => SIDES.flatMap((b) => wps.map((wp) => ({ wp, body: b })));
  const course = (title: string, neuron: number, lines: [string, string][], extra?: Partial<InfoSpec>): InfoSpec => ({ kind: "node", title, neuron, lines, ...extra });

  const beat = (b: Beat, f: Fit, info: InfoSpec) => {
    beats.push({ ...b, info: `b${beats.length}`, fit: fitWith(f) });
    own.push(f);
    infos[`b${beats.length - 1}`] = info;
    return beats.length - 1;
  };

  // 0 retina
  const b0 = beat({ kind: "node", neuron: 0, caption: "Retina: nasal and temporal halves of each eye", info: "", fit: [], view: "anterior", rel: "i" }, [
    { wp: ["optic-nerve-ii", "i", 1, 0.03, 0.03, 0.03, "z"] as WP, body: "L" },
    { wp: ["optic-nerve-ii", "i", 1, -0.03, -0.03, 0.03, "z"] as WP, body: "R" },
    { wp: ["optic-nerve-ii", "i", 1, 0.03, -0.03, 0.0, "z"] as WP, body: "L" },
    { wp: ["optic-nerve-ii", "i", 1, -0.03, 0.03, 0.0, "z"] as WP, body: "R" },
  ], course("Retina", 0, [["Neuron", "1st-order neuron"], ["Cell body", cp.neurons[0].cell_body], ["Receptors", "rods and cones"], ["Synapse", cp.neurons[0].synapse], ["Halves", "each retina has a nasal and a temporal half; the left half of the visual field falls on the right half of each retina"]]));
  for (const e of SIDES) marks.push({ key: `ret:${e}`, p: eyeWP(), body: e, kind: "node", text: `${e === "L" ? "Left" : "Right"} retina`, color: fieldCol(e), beat: b0, info: "b0", dir: 0 });

  const fieldTubes = (key: string, st: Stretch | undefined, bi: number, chains?: string[]) => {
    if (!st?.path) return;
    void chains;
    for (const f of SIDES) tubes.push({ key: `${key}:${f}`, pts: st.path, body: f, color: fieldCol(f), beat: bi, info: `b${bi}`, neuron: bi < 4 ? 1 : 2 });
  };
  const idLayer = (key: string, ids: string[] | undefined, bi: number, phys: "i" | "c" | "cross") => {
    if (!ids?.length) return;
    for (const f of SIDES) layers.push({ key: `${key}:${f}`, ids, side: physSide(phys, f) ?? "both", color: fieldCol(f), opacity: 0.8, beat: bi });
  };

  // 1 optic nerves
  const n1 = get("nerve");
  const n2 = get("nerve2");
  const b1 = beat({ kind: "path", neuron: 1, caption: "Optic nerves (retinal ganglion cell axons)", info: "", fit: [], view: "top", phys: "i" }, sideFit([...(n1?.path ?? []), ...(n2?.path ?? [])]), { ...course("Optic nerves", 1, [["Neuron", "2nd-order neuron: retinal ganglion cell"], ["Tract", cp.neurons[1].tract], ["Course", "nasal fibres of the eye on the field's side, temporal fibres of the other eye"]]), kind: "path" });
  fieldTubes("nerve", n1, b1);
  fieldTubes("nerve2", n2, b1);
  idLayer("nerve", n1?.ids, b1, "i");

  // 2 chiasm
  const ch = get("chiasm");
  const b2 = beat({ kind: "path", neuron: 1, caption: "Optic chiasm: nasal fibres cross, temporal fibres stay", cross: true, info: "", fit: [], view: "top", phys: "cross" }, sideFit(ch?.path ?? []), { ...course("Optic chiasm", 1, [["Fibres", "nasal retinal fibres cross to the opposite optic tract; temporal fibres stay on the same side"], ["Crossing", cp.decussation]], { crossing: cp.decussation, loss: "bitemporal hemianopia" }), kind: "path" });
  fieldTubes("chiasm", ch, b2);
  idLayer("chiasm", ch?.ids, b2, "cross");
  marks.push({ key: "dec:chiasm", p: ["optic-chiasm", "m", 0.5] as WP, body: "R", kind: "dec", text: "OPTIC CHIASM: nasal fibres cross, temporal fibres stay", color: colors.hi, beat: b2, info: "b2" });
  const scn = get("scn");
  if (scn?.path) for (const f of SIDES) tubes.push({ key: `scn:${f}`, pts: scn.path, body: f, color: fieldCol(f), beat: b2, info: "b2", neuron: 1, width: 0.7 });

  // 3 optic tract
  const tr = get("tract");
  const b3 = beat({ kind: "path", neuron: 1, caption: "Optic tract (the opposite visual field of both eyes)", info: "", fit: [], view: "top", phys: "c" }, sideFit(tr?.path ?? []), { ...course("Optic tract", 1, [["Fibres", "ipsilateral temporal retina and contralateral nasal retina: the contralateral visual field"], ["Ends in", "lateral geniculate nucleus (also the superior colliculus and pretectum)"]]), kind: "path", loss: "homonymous hemianopia" });
  fieldTubes("tract", tr, b3);
  idLayer("tract", tr?.ids, b3, "c");
  const sc = get("sc");
  if (sc?.path) for (const f of SIDES) tubes.push({ key: `sc:${f}`, pts: sc.path, body: f, color: fieldCol(f), beat: b3, info: "b3", neuron: 1, width: 0.7 });

  // 4 LGN
  const lgnSt = mp.neurons[2].stretches.find((s) => s.k === "lgn");
  const lgnWP: WP = ["lateral-geniculate-body", "c", 0.5] as WP;
  const b4 = beat({ kind: "node", neuron: 2, caption: "Lateral geniculate nucleus", info: "", fit: [], view: "top", rel: "c" }, sideFit([lgnWP]), course("Lateral geniculate nucleus", 2, [["Neuron", "3rd-order neuron"], ["Cell body", cp.neurons[2].cell_body], ["Course fact", "six-layered thalamic nucleus that relays vision from the optic tract to V1"]]));
  for (const f of SIDES) marks.push({ key: `lgn:${f}`, p: lgnWP, body: f, kind: "node", text: "Lateral geniculate nucleus", color: fieldCol(f), beat: b4, info: "b4" });
  idLayer("lgn", lgnSt?.ids, b4, "c");

  // 5 optic radiations: Meyer's loop (upper field) and the parietal route (lower field); both end exactly on the V1 node
  const v1WP: WP = ["calcarine-sulcus", "c", 0.5] as WP;
  const lgn: WP = ["lateral-geniculate-body", "c", 0.5, 0.01, 0.002, -0.014] as WP;
  const meyer: WP[] = [lgnWP, lgn, ["lateral-geniculate-body", "c", 0.5, 0.034, -0.012, 0.03], ["lateral-geniculate-body", "c", 0.5, 0.058, -0.02, -0.005], ["lateral-geniculate-body", "c", 0.5, 0.055, -0.02, -0.05], ["lingual-gyrus", "c", 0.5, 0, 0, 0], v1WP] as WP[];
  const parietal: WP[] = [lgnWP, lgn, ["lateral-geniculate-body", "c", 0.5, 0.036, 0.016, -0.02], ["lateral-geniculate-body", "c", 0.5, 0.04, 0.02, -0.055], ["cuneus", "c", 0.5, 0, 0, 0], v1WP] as WP[];
  const b5 = beat({ kind: "path", neuron: 2, caption: "Optic radiations: Meyer's loop (upper field) and the parietal route (lower field)", info: "", fit: [], view: "top", phys: "c" }, sideFit([...meyer, ...parietal]), { ...course("Optic radiations", 2, [["Tract", cp.neurons[2].tract], ["Meyer's loop", "through the temporal lobe: the upper visual field (to the lingual gyrus, below the calcarine fissure)"], ["Parietal route", "the lower visual field (to the cuneus, above the fissure)"]], { loss: "quadrantanopia" }), kind: "path" });
  for (const f of SIDES) {
    const up = f === "L" ? pal.LU : pal.RU;
    const low = f === "L" ? pal.LL : pal.RL;
    tubes.push({ key: `meyer:${f}`, pts: meyer, body: f, color: up, beat: b5, info: "b5", neuron: 2 });
    tubes.push({ key: `par:${f}`, pts: parietal, body: f, color: low, beat: b5, info: "b5", neuron: 2 });
  }

  // 6 V1: the calcarine fissure splits the field
  const b6 = beat({ kind: "node", neuron: 2, caption: "Primary visual cortex (V1): the calcarine fissure splits the field", info: "", fit: [], view: "left", rel: "c" }, sideFit([v1WP, ["cuneus", "c", 0.5] as WP, ["lingual-gyrus", "c", 0.5] as WP]), course("Primary visual cortex (V1, BA 17)", 2, [["Place", "banks of the calcarine fissure (occipital lobe)"], ["Upper field", "inferior bank: lingual gyrus (below the fissure)"], ["Lower field", "superior bank: cuneus (above the fissure)"], ["Macula", "central vision at the occipital pole"], ["If damaged", "contralateral homonymous hemianopia (macular sparing possible)"]]));
  for (const f of SIDES) {
    const up = f === "L" ? pal.LU : pal.RU;
    const low = f === "L" ? pal.LL : pal.RL;
    marks.push({ key: `v1:${f}`, p: v1WP, body: f, kind: "node", text: "V1 (BA 17)", color: fieldCol(f), beat: b6, info: "b6" });
    layers.push({ key: `cun:${f}`, ids: ["cuneus"], side: opp(f), color: low, opacity: 0.95, beat: b6, nearView: f === "R" ? "left" : "right" });
    layers.push({ key: `ling:${f}`, ids: ["lingual-gyrus"], side: opp(f), color: up, opacity: 0.95, beat: b6, nearView: f === "R" ? "left" : "right" });
    layers.push({ key: `calc:${f}`, ids: ["calcarine-sulcus"], side: opp(f), color: "#ffffff", opacity: 1, beat: b6, nearView: f === "R" ? "left" : "right" });
  }
  marks.push({ key: "cun:lbl", p: ["cuneus", "c", 0.5, 0, 0.012, 0] as WP, body: "L", kind: "syn", text: "Cuneus (above the fissure): LOWER field", color: pal.LL, beat: b6, info: "b6" });
  marks.push({ key: "ling:lbl", p: ["lingual-gyrus", "c", 0.5, 0, -0.012, 0] as WP, body: "L", kind: "syn", text: "Lingual gyrus (below): UPPER field", color: pal.LU, beat: b6, info: "b6" });

  const eyes: SceneEyes = { nerve: eyeWP(), spec: { fieldColors: { L: [pal.LU, pal.LL], R: [pal.RU, pal.RL] }, alpha: { L: 1, R: 1 } } };
  return { beats, tubes, marks, layers, limbs: [], eyes, infos };
}
