import { ORDINAL, opp, physSide, type CoursePathway, type MapPathway, type Side, type Stretch, type WP } from "@/lib/atlas/pathways";
import type { AnatFile, SceneAnatomy } from "./AnatomyParts";
import { CENTRAL, CORD_CONTEXT, FIXED_SEG, LEVELS, P, SITES, SYMP_VERTS, type LevelCfg, type Site } from "./anatomySpec";
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

/** Inputs that join a neuron from elsewhere (not a continuation of the chain): drawn as a branch of their own. */
const FORK_MAIN: Record<string, string[]> = { lcst: ["dec", "cord"] };
const SIDE_INPUT = new Set(["snc", "sc", "scn"]);
/** A fork the map does not list: an extra branch drawn after the named stretch, leaving the point that stretch started from. */
const EXTRA_BRANCH: Record<string, Record<string, { label: string; note: string; phys: "i" | "c" | "cross"; path: WP[]; ids?: string[] }>> = {
  lcst: {
    cord: {
      label: "Uncrossed fibres: anterior corticospinal tract",
      note: "the minority of fibres that do not cross in the pyramids descend in the anterior corticospinal tract (the lateral tract carries the crossed majority)",
      phys: "c",
      path: [["pyramid-of-medulla-oblongata", "c", 0] as unknown as WP, ["anterior-corticospinal-tract", "c", 0.9] as unknown as WP, ["anterior-corticospinal-tract", "c", 0.45] as unknown as WP],
      ids: ["anterior-corticospinal-tract"],
    },
  },
};

export const ZONE_NAMES = ["V1 ophthalmic", "V2 maxillary", "V3 mandibular"];

const wpRef = (w: WP) => String(w[0]);
const wpT = (w: WP) => Number((w as unknown as (number | string)[])[2] ?? 0.5);
const wpAxis = (w: WP) => String((w as unknown as (number | string)[])[6] ?? "y");
function at(rel: "i" | "c" | "m", lat: number, dy: number, dz: number, anchor: WP): WP {
  // a part anchor ("spine:drg_C7") stands in for a structure: only its height and depth are used
  if (anchor[0] === "part") return ["@", rel, lat, dy, dz, `part:${String(anchor[2])}`, 0.5, "y"] as unknown as WP;
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
  /** A path that leaves the same point as the one before (a nucleus with several targets), not a continuation of it. */
  branch?: boolean;
  /** Member of a fork: `id` groups the beats of one split, `k` is the branch (0, 1 ...) the beat belongs to. */
  fork?: { id: string; k: number };
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
  anatomy?: SceneAnatomy[];
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
  const { cp, slug, colors, limbPart } = o;
  const cfg = ORIGINS[slug];
  const part: LimbChoice = cfg?.parts ? (cfg.parts.includes(limbPart) ? limbPart : cfg.parts[0]) : "hand";
  const lv = LEVELS[slug];
  const drgLevel = lv?.drg[part];
  // the spinal level of the body part: the ganglion sits on the real column, the central tract starts at that cord level
  const mp: MapPathway = withLevels(o.mp, slug, lv, drgLevel);
  const site = SITES[slug];
  const beats: Beat[] = [];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const layers: SceneLayer[] = [];
  const limbs: SceneLimb[] = [];
  const infos: Record<string, InfoSpec> = {};
  const own: Fit[] = [];
  const hl: Record<string, { match: string; beat: number; color: string }[]> = {};
  const focus: Record<string, [number, number][]> = {};
  const sideCol = (s: Side) => (s === "L" ? colors.left : colors.right);
  const relColor = (r: string, b: Side) => (r === "i" ? sideCol(b) : r === "c" ? sideCol(opp(b)) : colors.hi);
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
  const light = (file: string, match: string | undefined, beat: number, color = colors.hi) => {
    if (match) (hl[file] ??= []).push({ match, beat, color });
  };

  /** A node: one or several marks (a structure on both sides, or several parts of the body). `labels` name each mark. */
  const addNodes = (name: string, wps: WP[], neuron: number, lines: [string, string][], extra: Fit = [], labels?: string[]) => {
    const bi = beats.length;
    const key = `n${bi}`;
    const f: Fit = [...wps.flatMap((wp) => SIDES.map((b) => ({ wp, body: b }))), ...extra];
    beats.push({ kind: "node", neuron, caption: name, info: key, rel: relOf(wps[0]), fit: fitWith(f), fork: curFork ?? undefined });
    own.push(f);
    infos[key] = { kind: "node", title: name, neuron, lines };
    wps.forEach((wp, wi) => {
      const mid = relOf(wp) === "m" && wp[0] === "part";
      for (const b of mid ? (["L"] as Side[]) : SIDES) marks.push({ key: wps.length > 1 ? `${key}:t${wi}:${b}` : `${key}:${b}`, p: wp, body: b, kind: "node", text: labels?.[wi] ?? name, color: relColor(relOf(wp), b), beat: bi, info: key, mid });
    });
    return bi;
  };
  const addNode = (name: string, wp: WP, neuron: number, lines: [string, string][], extra: Fit = []) => addNodes(name, [wp], neuron, lines, extra);
  /** A path: one tube per side (or one per point list for a fan of nerves). */
  const addPath = (st: Stretch, neuron: number, pts: WP[] | WP[][], title: string, lines: [string, string][], extra: Fit = [], flags: { rise?: boolean; branch?: boolean } = {}) => {
    const lists: WP[][] = typeof pts[0]?.[0] === "string" ? [pts as WP[]] : (pts as WP[][]);
    const bi = beats.length;
    const key = `p${bi}`;
    const cross = st.phys === "cross";
    const f: Fit = [...SIDES.flatMap((b) => lists.flat().map((wp) => ({ wp, body: b }))), ...extra];
    beats.push({ kind: "path", neuron, caption: cross ? `${title} · crosses the midline` : title, cross, info: key, phys: st.phys, fit: flags.branch ? f : fitWith(f), branch: flags.branch, fork: curFork ?? undefined });
    own.push(f);
    infos[key] = { kind: "path", title, neuron, lines, ids: st.ids, crossing: cross ? cp.decussation : undefined, loss: st.loss };
    for (const b of SIDES) {
      lists.forEach((l, li) => tubes.push({ key: lists.length > 1 ? `${key}:t${li}:${b}` : `${key}:${b}`, pts: l, body: b, beat: bi, info: key, neuron, rise: flags.rise, meshed: !!st.ids?.length }));
      if (st.ids?.length) {
        const ps = physSide(st.phys, b);
        if (ps || b === "R") layers.push({ key: `${key}:${b}`, ids: st.ids, side: ps ?? "both", color: ps === "L" ? colors.left : ps === "R" ? colors.right : colors.hi, opacity: 0.9, beat: bi, info: key });
      }
    }
    st.marks?.filter((m) => m.kind === "dec").forEach((m, mi) => marks.push({ key: `${key}:dec${mi}`, p: m.p, body: "R", kind: "dec", text: m.text, color: colors.hi, beat: bi, info: key }));
    return bi;
  };
  /** Real anatomy at the start or the end of the pathway: the part's node, and the nerve that joins it to the pathway. */
  const addSite = (s: Site, kind: "start" | "end", joint: WP, neuron: number) => {
    const wps = s.targets.map((t) => P(t.key, t.rel ?? "i"));
    const labels = s.targets.map((t) => t.label);
    const link = (bi: number) => s.targets.forEach((t) => light(t.key.split(":")[0], t.obj, bi));
    const focusOn = (a: number, b: number) => s.targets.forEach((t) => (focus[t.key.split(":")[0]] ??= []).push([a, b]));
    const synth = { k: "site", label: s.path, phys: "i" as const };
    if (kind === "start") {
      const bi = addNodes(s.name, wps, neuron, s.lines, [{ wp: joint, body: "L" }, { wp: joint, body: "R" }], labels);
      link(bi);
      focusOn(bi, bi + 1);
      addPath({ ...synth, path: [wps[0], joint] }, neuron, wps.map((w) => [w, joint]), s.path, [["Neuron", ord(neuron)]]);
    } else {
      const pb = addPath({ ...synth, path: [joint, wps[0]] }, neuron, wps.map((w) => [joint, w]), s.path, [["Neuron", ord(neuron)]]);
      const bi = addNodes(s.name, wps, neuron, s.lines, [], labels);
      link(bi);
      link(pb);
      focusOn(pb, bi);
    }
  };

  const flat = mp.neurons.flatMap((nr, ni) => nr.stretches.filter((s) => s.path && s.path.length > 1).map((st) => ({ st, ni })));
  const firstWP = flat[0]?.st.path?.[0];
  const sensory = !!cfg && cfg.kind !== "muscle";
  const motor = cfg?.kind === "muscle" || !!cfg?.motor;
  let prevEnd: WP | null = null;
  let curFork: { id: string; k: number } | null = null;
  let withSpine = !!lv && !!drgLevel;

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
    addPath({ k: "nerve", label: "Peripheral nerve", phys: "i", path: [contact, mid, firstWP] }, 0, [contact, mid, firstWP], drgLevel ? `Peripheral nerve to the dorsal root ganglion (${drgLevel})` : "Peripheral nerve to the ganglion", [["Neuron", ord(0)], ["Tract", cp.neurons[0]?.tract ?? ""]]);
    const gl: [string, string][] = neuronPairs(0);
    if (drgLevel && lv) gl.push(["Spinal level", lv.range[part] ?? drgLevel]);
    const gb = addNode(mp.neurons[0].short, firstWP, 0, gl);
    if (drgLevel && lv) (lv.verts[part] ?? []).forEach((v) => light("spine", v, gb));
    prevEnd = firstWP;
    for (const b of SIDES) limbs.push({ key: `limb:${b}`, part: isFace ? "face" : part, body: b, skin: [], muscle: [], alpha: 1, at: limbAt, from: 0, to: 2 });
  }

  mp.neurons.forEach((nr, ni) => {
    const sts = nr.stretches.filter((s) => s.path && s.path.length > 1);
    if (!prevEnd && sts[0]?.path) {
      prevEnd = sts[0].path[0];
      if (site?.start) addSite(site.start, "start", prevEnd, ni);
      const b0 = addNode(nr.short, prevEnd, ni, neuronPairs(ni));
      if (slug === "sympathetic") SYMP_VERTS.forEach((v) => light("spine", v, b0));
      if (slug === "parasympathetic") light("spine", "bone_sacrum", b0);
      if (slug === "sympathetic" || slug === "parasympathetic" || CORD_CONTEXT.has(slug)) withSpine = true;
    }
    const origin = sts[0]?.path?.[0];
    const shared = sts.filter((s2) => !!origin && sameWP(s2.path![0], origin)).length;
    let branched = false;
    let bk = 0;
    sts.forEach((st, si) => {
      let pts = st.path!;
      // sibling stretches that all leave the same point (a nucleus with several targets) are branches, not a chain;
      // an extra input into the same neuron (substantia nigra, superior colliculus) is a branch of its own
      const sameStart = !!origin && sameWP(pts[0], origin);
      const side = SIDE_INPUT.has(st.k);
      const member = (shared > 1 && sameStart) || side || !!FORK_MAIN[slug]?.includes(st.k);
      const branch = (si > 0 && sameStart) || side;
      if (member) {
        branched = true;
        curFork = { id: `f${ni}`, k: bk };
        if (branch) bk++;
      } else curFork = null;
      if (!branch && prevEnd && !sameWP(prevEnd, pts[0])) pts = [prevEnd, ...pts];
      addPath(st, ni, pts, st.label, [["Neuron", ord(ni)], ["Tract", cp.neurons[ni]?.tract ?? st.label], ["Level", cp.neurons[ni]?.level ?? ""]], [], { rise: !!lv?.rise.includes(st.k), branch });
      if (!side) prevEnd = pts[pts.length - 1];
      const m = /^To (?:the )?(.+)$/.exec(st.label);
      if (sts.length > 1 && origin && m && ni === n - 1) {
        addNode(m[1][0].toUpperCase() + m[1].slice(1), pts[pts.length - 1], ni, [["Neuron", ord(ni)], ["Synapse", cp.neurons[ni]?.synapse ?? ""]]);
        for (const e of [site?.end, ...(site?.ends ?? [])]) if (e?.after === st.k) addSite(e, "end", pts[pts.length - 1], ni);
      }
      const extra = EXTRA_BRANCH[slug]?.[st.k];
      if (extra) {
        curFork = { id: `f${ni}`, k: bk };
        bk++;
        branched = true;
        const first = extra.path[0];
        addPath({ k: `${st.k}-x`, label: extra.label, phys: extra.phys, path: extra.path, ids: extra.ids }, ni, extra.path, extra.label, [["Neuron", ord(ni)], ["Tract", extra.label], ["Share", extra.note]], [], { branch: true });
        void first;
        curFork = null;
      }
    });
    curFork = null;
    if (!prevEnd) return;
    if (ni < n - 1) {
      // after a split the next neuron starts where its own first tract starts
      const nextStart = branched ? mp.neurons[ni + 1].stretches.find((x) => x.path && x.path.length > 1)?.path?.[0] : undefined;
      if (nextStart) prevEnd = nextStart;
      addNode(mp.neurons[ni + 1].short, prevEnd, ni + 1, neuronPairs(ni + 1));
    } else if (!motor && !branched) addNode(nr.syn ?? cp.neurons[ni]?.synapse ?? "End of the pathway", prevEnd, ni, [["End of the pathway", cp.neurons[ni]?.synapse ?? ""], ["Neuron", ord(ni)]]);
    if (ni === n - 1 && site?.end && !site.end.after && prevEnd) addSite(site.end, "end", prevEnd, ni);
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

  // the anatomy parts that are drawn: the column around the cord, and the objects the sites name
  const anatomy: SceneAnatomy[] = [];
  const addFile = (file: AnatFile, show: string[], ghost: string[] = []) => anatomy.push({ key: file, file, show, ghost, hl: hl[file] ?? [], sided: file === "head-targets", focus: file === "spine" ? undefined : focus[file] });
  if (withSpine) addFile("spine", ["bone_", "nerve_cord", "nerve_drg", "disc_"]);
  for (const [file, sh] of Object.entries(site?.files ?? {}) as [AnatFile, { show: string[]; ghost?: string[] }][]) addFile(file, sh.show, sh.ghost);
  return { beats, tubes, marks, layers, limbs, infos, anatomy };
}

/** The pathway with its spinal-level waypoints moved onto the real ganglion and the real cord centreline of the body part's segment. */
function withLevels(mp: MapPathway, slug: string, lv: LevelCfg | undefined, level: string | undefined): MapPathway {
  const central = CENTRAL[slug];
  const seg = (lv?.cord ?? level ?? FIXED_SEG[slug]) as string | undefined;
  if (!central || !seg) return mp;
  return {
    ...mp,
    neurons: mp.neurons.map((nr) => ({
      ...nr,
      stretches: nr.stretches.map((st) => {
        const fn = central[st.k] as ((s: string, d: string | undefined, o: WP[]) => WP[]) | undefined;
        return fn && st.path ? { ...st, path: fn(seg, level, st.path) } : st;
      }),
    })),
  };
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

  const meshTube = (key: string, pts: WP[], f: Side, color: string, bi: number, width = 1, dx = 0) => tubes.push({ key: `${key}:${f}`, pts, body: f, color, beat: bi, info: `b${bi}`, neuron: bi < 5 ? 1 : 2, width, meshed: true, dx });
  const idLayer2 = (key: string, ids: string[] | undefined, bi: number, phys: "i" | "c" | "cross") => {
    if (!ids?.length) return;
    for (const f of SIDES) layers.push({ key: `${key}:${f}`, ids, side: physSide(phys, f) ?? "both", color: fieldCol(f), opacity: 0.4, beat: bi, info: `b${bi}` });
  };
  const chPath = get("chiasm")?.path ?? [];
  const nasalEnd = chPath[0];
  const tractMid: WP = ["optic-tract", "c", 0.5] as WP;

  // 1 optic nerves: both eyes' nerves run back to the chiasm (nasal fibres of one eye, temporal fibres of the other)
  const n1 = get("nerve");
  const n2 = get("nerve2");
  const n2Nerve = (n2?.path ?? []).slice(0, 2);
  const b1 = beat({ kind: "path", neuron: 1, caption: "Optic nerves: both eyes run back to the chiasm", info: "", fit: [], view: "top", phys: "i" }, sideFit([...(n1?.path ?? []), ...n2Nerve, ...chPath]), { ...course("Optic nerves", 1, [["Neuron", "2nd-order neuron: retinal ganglion cell"], ["Tract", cp.neurons[1].tract], ["Course", "each optic nerve carries nasal fibres (from the nasal half of its retina) and temporal fibres (from the temporal half)"]]), kind: "path" });
  // the two fibre lines of a nerve run side by side inside it: nasal fibres on one side, temporal on the other
  const NASAL = 0.0013;
  for (const f of SIDES) {
    meshTube("nerve", n1?.path ?? [], f, fieldCol(f), b1, 1, NASAL);
    meshTube("nerve2", n2Nerve, f, fieldCol(f), b1, 1, -NASAL);
  }
  idLayer2("nerve", n1?.ids, b1, "i");

  // 2 branch A: the nasal fibres cross in the chiasm
  const b2 = beat({ kind: "path", neuron: 1, caption: "Nasal fibres cross in the chiasm", cross: true, info: "", fit: [], view: "top", phys: "cross", fork: { id: "chiasm", k: 0 } }, sideFit(chPath), { ...course("Chiasm: the nasal fibres cross", 1, [["Fibres", "nasal retinal fibres (temporal visual field of that eye) cross to the opposite optic tract"], ["Crossing", cp.decussation]], { crossing: cp.decussation, loss: "bitemporal hemianopia" }), kind: "path" });
  for (const f of SIDES) meshTube("chiasm", chPath, f, fieldCol(f), b2, 1, NASAL);
  idLayer2("chiasm", get("chiasm")?.ids, b2, "cross");
  marks.push({ key: "dec:chiasm", p: ["optic-chiasm", "m", 0.5] as WP, body: "R", kind: "dec", text: "Nasal fibres cross", color: colors.hi, beat: b2, info: `b${b2}` });

  // 3 branch B: the temporal fibres stay on their own side
  const stay: WP[] = [(n2Nerve[n2Nerve.length - 1] ?? nasalEnd) as WP, ["optic-chiasm", "c", 0.5] as WP, tractMid];
  const b3 = beat({ kind: "path", neuron: 1, caption: "Temporal fibres stay on the same side", info: "", fit: [], view: "top", phys: "c", branch: true, fork: { id: "chiasm", k: 1 } }, sideFit([...stay, ...(get("tract")?.path ?? [])]), { ...course("Chiasm: the temporal fibres stay", 1, [["Fibres", "temporal retinal fibres (nasal visual field of that eye) pass the chiasm without crossing"], ["Result", "each optic tract now carries the opposite visual field of both eyes"]]), kind: "path" });
  for (const f of SIDES) tubes.push({ key: `stay:${f}`, pts: stay, body: f, color: fieldCol(f), beat: b3, info: `b${b3}`, neuron: 1, width: 1, dx: -NASAL });

  // 4 optic tract
  const tr = get("tract");
  const b4 = beat({ kind: "path", neuron: 1, caption: "Optic tract (the opposite visual field of both eyes)", info: "", fit: [], view: "top", phys: "c" }, sideFit(tr?.path ?? []), { ...course("Optic tract", 1, [["Fibres", "ipsilateral temporal retina and contralateral nasal retina: the contralateral visual field"], ["Ends in", "lateral geniculate nucleus (also the superior colliculus and pretectum)"]]), kind: "path", loss: "homonymous hemianopia" });
  for (const f of SIDES) meshTube("tract", tr?.path ?? [], f, fieldCol(f), b4);
  idLayer2("tract", tr?.ids, b4, "c");

  // 5 LGN
  const lgnSt = mp.neurons[2].stretches.find((s) => s.k === "lgn");
  const lgnWP: WP = ["lateral-geniculate-body", "c", 0.5] as WP;
  const b5 = beat({ kind: "node", neuron: 2, caption: "Lateral geniculate nucleus", info: "", fit: [], view: "top", rel: "c" }, sideFit([lgnWP]), course("Lateral geniculate nucleus", 2, [["Neuron", "3rd-order neuron"], ["Cell body", cp.neurons[2].cell_body], ["Course fact", "six-layered thalamic nucleus that relays vision from the optic tract to V1"]]));
  for (const f of SIDES) marks.push({ key: `lgn:${f}`, p: lgnWP, body: f, kind: "node", text: "Lateral geniculate nucleus", color: fieldCol(f), beat: b5, info: `b${b5}` });
  idLayer2("lgn", lgnSt?.ids, b5, "c");

  // 6 and 7: the radiations split, the parietal route (lower field) and Meyer's loop (upper field); both end exactly on the V1 node
  const v1WP: WP = ["calcarine-sulcus", "c", 0.5] as WP;
  const lgn: WP = ["lateral-geniculate-body", "c", 0.5, 0.01, 0.002, -0.014] as WP;
  const meyer: WP[] = [lgnWP, lgn, ["lateral-geniculate-body", "c", 0.5, 0.034, -0.012, 0.03], ["lateral-geniculate-body", "c", 0.5, 0.058, -0.02, -0.005], ["lateral-geniculate-body", "c", 0.5, 0.055, -0.02, -0.05], ["lingual-gyrus", "c", 0.5, 0, 0, 0], v1WP] as WP[];
  const parietal: WP[] = [lgnWP, lgn, ["lateral-geniculate-body", "c", 0.5, 0.036, 0.016, -0.02], ["lateral-geniculate-body", "c", 0.5, 0.04, 0.02, -0.055], ["cuneus", "c", 0.5, 0, 0, 0], v1WP] as WP[];
  const b6 = beat({ kind: "path", neuron: 2, caption: "Parietal route (lower field) to the cuneus", info: "", fit: [], view: "left", phys: "c", fork: { id: "rad", k: 0 } }, sideFit(parietal), { ...course("Optic radiations: the parietal route", 2, [["Tract", cp.neurons[2].tract], ["Route", "superior fibres run through the parietal lobe to the cuneus, above the calcarine fissure"], ["Carries", "the lower visual field"]], { loss: "inferior quadrantanopia" }), kind: "path" });
  const b7 = beat({ kind: "path", neuron: 2, caption: "Meyer's loop (upper field) to the lingual gyrus", info: "", fit: [], view: "left", phys: "c", branch: true, fork: { id: "rad", k: 1 } }, sideFit(meyer), { ...course("Optic radiations: Meyer's loop", 2, [["Tract", cp.neurons[2].tract], ["Route", "inferior fibres loop forward through the temporal lobe, then back to the lingual gyrus below the calcarine fissure"], ["Carries", "the upper visual field"]], { loss: "superior quadrantanopia" }), kind: "path" });
  for (const f of SIDES) {
    meshTube("par", parietal, f, f === "L" ? pal.LL : pal.RL, b6);
    meshTube("meyer", meyer, f, f === "L" ? pal.LU : pal.RU, b7);
  }

  // 8 V1: the calcarine fissure splits the field
  const b8 = beat({ kind: "node", neuron: 2, caption: "Primary visual cortex (V1): the calcarine fissure splits the field", info: "", fit: [], view: "left", rel: "c" }, sideFit([v1WP, ["cuneus", "c", 0.5] as WP, ["lingual-gyrus", "c", 0.5] as WP]), course("Primary visual cortex (V1, BA 17)", 2, [["Place", "banks of the calcarine fissure (occipital lobe)"], ["Upper field", "inferior bank: lingual gyrus (below the fissure)"], ["Lower field", "superior bank: cuneus (above the fissure)"], ["Macula", "central vision at the occipital pole"], ["If damaged", "contralateral homonymous hemianopia (macular sparing possible)"]]));
  for (const f of SIDES) {
    marks.push({ key: `v1:${f}`, p: v1WP, body: f, kind: "node", text: "V1 (BA 17)", color: fieldCol(f), beat: b8, info: `b${b8}` });
    layers.push({ key: `cun:${f}`, ids: ["cuneus"], side: opp(f), color: f === "L" ? pal.LL : pal.RL, opacity: 0.95, beat: b6, info: `b${b6}`, nearView: f === "R" ? "left" : "right" });
    layers.push({ key: `ling:${f}`, ids: ["lingual-gyrus"], side: opp(f), color: f === "L" ? pal.LU : pal.RU, opacity: 0.95, beat: b7, info: `b${b7}`, nearView: f === "R" ? "left" : "right" });
    layers.push({ key: `calc:${f}`, ids: ["calcarine-sulcus"], side: opp(f), color: "#ffffff", opacity: 1, beat: b8, info: `b${b8}`, nearView: f === "R" ? "left" : "right" });
  }
  marks.push({ key: "cun:lbl", p: ["cuneus", "c", 0.5, 0, 0.012, 0] as WP, body: "L", kind: "syn", text: "Cuneus (above the fissure): LOWER field", color: pal.LL, beat: b8, info: `b${b8}` });
  marks.push({ key: "ling:lbl", p: ["lingual-gyrus", "c", 0.5, 0, -0.012, 0] as WP, body: "L", kind: "syn", text: "Lingual gyrus (below): UPPER field", color: pal.LU, beat: b8, info: `b${b8}` });

  const eyes: SceneEyes = { nerve: eyeWP(), spec: { fieldColors: { L: [pal.LU, pal.LL], R: [pal.RU, pal.RL] }, alpha: { L: 1, R: 1 } } };
  return { beats, tubes, marks, layers, limbs: [], eyes, infos };
}
