import { opp, physSide, sideName, type MapPathway, type Side, type WP } from "@/lib/atlas/pathways";
import type { SceneColors, SceneLayer, SceneLimb, SceneMark, SceneTube, SceneEyes } from "./PathwayScene";
import type { ReceptorId } from "./receptorInfo";
import { fieldPalette } from "./visualField";

/* Turns one pathway of the map (plus the step, the side focus and the body part) into the plain data the 3D scene draws.
 * Both sides are always drawn, in separate lanes; the side that is not focused is dimmed, not removed. */

export type SideMode = Side | "both";
export type LimbChoice = "hand" | "foot";

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
  "stretch-reflex": { kind: "limb", parts: ["foot"], skin: [], muscle: ["spindle"], motor: true, source: "Course: the muscle spindle (Ia) afferent synapses directly on the alpha motor neuron, no interneuron (knee jerk, L3/L4)." },
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
  slug: string;
  cur: number;
  lastShown: number;
  summary: boolean;
  follow: boolean;
  playing: boolean;
  colors: SceneColors;
  sideMode: SideMode;
  limbPart: LimbChoice;
  focusStretch: string;
}
export interface BuiltScene {
  layers: SceneLayer[];
  tubes: SceneTube[];
  marks: SceneMark[];
  fit: { wp: WP; body: Side }[];
  limbs: SceneLimb[];
  eyes?: SceneEyes;
}

const SIDES: Side[] = ["L", "R"];

export function buildPathwayScene(o: BuildOpts): BuiltScene {
  return o.mp.visual ? buildVisual(o) : buildGeneral(o);
}

const alphaOf = (mode: SideMode, b: Side) => (mode === "both" || mode === b ? 1 : 0.13);
const focused = (mode: SideMode, b: Side) => mode === "both" || mode === b;
const primaryOf = (mode: SideMode): Side => (mode === "both" ? "R" : mode);

function buildGeneral(o: BuildOpts): BuiltScene {
  const { mp, slug, cur, lastShown, summary, follow, playing, colors, sideMode, limbPart, focusStretch } = o;
  const layers: SceneLayer[] = [];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const fit: { wp: WP; body: Side }[] = [];
  const limbs: SceneLimb[] = [];
  const n = mp.neurons.length;
  const cfg = ORIGINS[slug];
  const sideCol = (s: Side) => (s === "L" ? colors.left : colors.right);
  let seq = 10;

  const flat = mp.neurons.flatMap((nr, ni) => nr.stretches.map((st) => ({ st, ni })));
  const firstPath = flat.find((x) => x.st.path && x.st.path.length > 1)?.st.path?.[0];
  const lastPathStretch = [...flat].reverse().find((x) => x.st.path && x.st.path.length > 1);
  const lastPoint = lastPathStretch?.st.path?.[lastPathStretch.st.path.length - 1];

  const part: LimbChoice = cfg?.parts ? (cfg.parts.includes(limbPart) ? limbPart : cfg.parts[0]) : "hand";
  const sensoryOrigin = !!cfg && cfg.kind !== "muscle";
  const motorTarget = cfg?.kind === "muscle" || !!cfg?.motor;

  for (const b of SIDES) {
    const al = alphaOf(sideMode, b);
    const foc = focused(sideMode, b);
    const primary = b === primaryOf(sideMode);
    const relColor = (rel: string) => (rel === "i" ? sideCol(b) : rel === "c" ? sideCol(opp(b)) : colors.hi);

    mp.neurons.forEach((nr, ni) => {
      const visible = ni <= lastShown;
      const isCur = ni === cur || summary;
      const inFit = follow && !summary ? ni === cur : true;
      for (const st of nr.stretches) {
        if (inFit && (!follow || summary || ni !== cur || !focusStretch || focusStretch === "all" || st.k === focusStretch)) {
          st.path?.forEach((w) => fit.push({ wp: w, body: b }));
          st.marks?.forEach((m) => fit.push({ wp: m.p, body: b }));
        }
        if (!visible) continue;
        const ps = physSide(st.phys, b);
        if (st.ids?.length) {
          layers.push({
            key: `${b}:${ni}:${st.k}`,
            ids: st.ids,
            side: ps ?? "both",
            color: ps === "L" ? colors.left : ps === "R" ? colors.right : colors.hi,
            opacity: (isCur ? 0.9 : 0.5) * (st.phys === "cross" ? 1 : al),
          });
        }
        if (st.path && st.path.length > 1) {
          tubes.push({
            key: `${slug}:${b}:${ni}:${st.k}`,
            pts: st.path,
            body: b,
            opacity: (isCur ? 1 : 0.55) * al,
            reveal: 1,
            pulse: ni === cur && !summary && foc && !playing,
            width: isCur ? 1 : 0.75,
            seq: seq++,
            neuron: ni,
          });
        }
        st.marks?.forEach((m, mi) => {
          const isDec = m.kind === "dec";
          const boundary = (slug === "lcst" || slug === "umn-lmn") && m.kind === "syn";
          if (!isDec && !boundary && !isCur) return;
          if (isDec ? !primary : !foc) return;
          const text = boundary ? "UMN | LMN boundary: the upper motor neuron ends on the lower motor neuron in the ventral horn (lamina IX)" : m.text;
          marks.push({
            key: `${slug}:${b}:${ni}:${st.k}:${mi}`,
            p: m.p,
            body: b,
            kind: boundary ? "bound" : m.kind,
            text: sideMode === "both" && !isDec && !boundary ? `${b} · ${text}` : text,
            color: isDec || boundary ? colors.hi : relColor(String(m.p[1])),
            prio: isCur || boundary ? 2 : 1,
          });
        });
      }
    });

    /* ----- where the signal comes from / goes to ----- */
    if (cfg && firstPath && lastPoint) {
      const sensoryShown = sensoryOrigin && lastShown >= 0;
      const motorShown = motorTarget && lastShown >= n - 1;
      const prom = summary || (sensoryOrigin ? cur === 0 : cur === n - 1);
      if (sensoryShown) {
        const a = firstPath;
        const isFace = cfg.kind === "face";
        const lat = isFace ? 0 : part === "hand" ? 0.2 : 0.14;
        const dy = isFace ? -0.03 : part === "hand" ? -0.17 : -0.4;
        const dz = isFace ? 0.17 : 0.02;
        const limbAt = at("i", lat, dy, dz, a);
        limbs.push({ key: `limb:${b}`, part: isFace ? "face" : part, body: b, skin: [], muscle: [], alpha: al * (prom ? 1 : 0.5), at: limbAt });
        const contact = isFace ? at("i", 0.03, dy, dz - 0.02, a) : limbAt;
        const mid = isFace ? at("i", 0.03, dy / 2, dz / 2, a) : at("i", lat / 2 + 0.01, dy / 2, dz / 2, a);
        tubes.push({ key: `${slug}:${b}:nerve`, pts: [contact, mid, a], body: b, opacity: (prom ? 1 : 0.5) * al, reveal: 1, width: 0.9, seq: 0, neuron: 0 });
        if (cur === 0 || summary) {
          fit.push({ wp: limbAt, body: b });
          fit.push({ wp: at("i", lat + 0.08, dy + 0.1, dz, a), body: b }, { wp: at("i", lat + 0.08, dy - 0.12, dz, a), body: b });
        }
        if (foc && (cur === 0 || summary)) {
          const nm = isFace ? "Face (trigeminal divisions)" : part === "hand" ? "Hand" : "Foot";
          marks.push({ key: `lab:${b}:part`, p: at("i", lat, dy - (isFace ? 0.1 : 0.075), dz, a), body: b, kind: "recept", text: `${sideName(b)} ${nm.toLowerCase()}`, color: sideCol(b), prio: 1, dir: 0 });
          if (isFace) {
            ZONE_NAMES.forEach((zn, zi) =>
              marks.push({ key: `lab:${b}:z${zi}`, p: at("i", 0.03, dy + 0.045 - zi * 0.045, dz + 0.06, a), body: b, kind: "recept", text: zn, color: sideCol(b), prio: 2 }),
            );
          }
        }
      }
      if (motorShown) {
        const a = lastPoint;
        const lat = 0.17;
        const dy = -0.09;
        const dz = 0.03;
        const muscleAt = at("i", lat, dy, dz, a);
        limbs.push({ key: `limb:${b}`, part: "muscle", body: b, skin: [], muscle: [], motor: true, alpha: al * (prom ? 1 : 0.5), at: muscleAt });
        tubes.push({ key: `${slug}:${b}:motor-nerve`, pts: [a, at("i", lat / 2, dy / 2, dz / 2, a), at("i", lat - 0.05, dy, dz, a)], body: b, opacity: (prom ? 1 : 0.5) * al, reveal: 1, width: 0.9, seq: 999, neuron: n - 1 });
        if (cur === n - 1 || summary) {
          fit.push({ wp: muscleAt, body: b }, { wp: at("i", lat + 0.12, dy + 0.06, dz, a), body: b }, { wp: at("i", lat + 0.12, dy - 0.06, dz, a), body: b });
        }
        if (foc && (cur === n - 1 || summary)) marks.push({ key: `lab:${b}:muscle`, p: at("i", lat, dy - 0.05, dz, a), body: b, kind: "recept", text: "Limb skeletal muscle", color: sideCol(b), prio: 2, dir: 0 });
      }
    }
  }
  return { layers: dedupeLayers(layers), tubes, marks, fit, limbs };
}

function dedupeLayers(l: SceneLayer[]): SceneLayer[] {
  const seen = new Set<string>();
  return l.filter((x) => {
    const k = `${x.ids.join(",")}|${x.side}|${x.color}`;
    if (x.side === "both" && seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------------------------------------------------------------
 * Visual pathway: colour = the visual field (left field one colour, right field the other; upper lighter, lower darker)
 * from retina to V1, line style = which side of the head the fibres are on.
 * `body` here is the side of the visual field.
 * ---------------------------------------------------------------------------------------------------------- */
function buildVisual(o: BuildOpts): BuiltScene {
  const { mp, slug, cur, lastShown, summary, follow, playing, colors, sideMode } = o;
  const layers: SceneLayer[] = [];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const fit: { wp: WP; body: Side }[] = [];
  const pal = fieldPalette(colors.left, colors.right);
  const fieldCol = (f: Side) => (f === "L" ? colors.left : colors.right);
  const nerveWP = (rel: "i" | "c", t: number): WP => ["optic-nerve-ii", rel, t, 0, 0, 0, "z"] as WP;
  let seq = 10;

  for (const f of SIDES) {
    const al = alphaOf(sideMode, f);
    const foc = focused(sideMode, f);
    const fc = fieldCol(f);
    const up = f === "L" ? pal.LU : pal.RU;
    const low = f === "L" ? pal.LL : pal.RL;
    mp.neurons.forEach((nr, ni) => {
      const visible = ni <= lastShown;
      const isCur = ni === cur || summary;
      const inFit = follow && !summary ? ni === cur : true;
      for (const st of nr.stretches) {
        if (inFit && ni > 0) {
          st.path?.forEach((w) => fit.push({ wp: w, body: f }));
        }
        if (!visible) continue;
        const op = (isCur ? 1 : 0.6) * al;
        const w = isCur ? 1 : 0.8;
        const base = { body: f, reveal: 1, width: w, neuron: ni, pulse: ni === cur && !summary && foc && !playing && ni > 0 } as const;
        if (st.k === "retina" || st.k === "v1") continue;
        if (st.k === "sc" || st.k === "scn") {
          // branches: drawn in the field colour, not part of the travelling impulse
          if (st.path) tubes.push({ ...base, key: `${slug}:${f}:${ni}:${st.k}`, pts: st.path, color: fc, opacity: op * 0.8, pulse: false });
          if (foc && isCur && f === primaryOf(sideMode)) {
            const last = st.path![st.path!.length - 1];
            marks.push({ key: `${slug}:${f}:${st.k}`, p: last, body: f, kind: "recept", text: st.k === "sc" ? "Superior colliculus" : "Suprachiasmatic nucleus", color: fc, prio: 1 });
          }
          continue;
        }
        if (st.k === "rad") {
          // Meyer's loop (upper field, through the temporal lobe to the lingual gyrus) and the parietal route (lower field, to the cuneus)
          const lgn: WP = ["lateral-geniculate-body", "c", 0.5, 0.01, 0.002, -0.014] as WP;
          const meyer: WP[] = [lgn, ["lateral-geniculate-body", "c", 0.5, 0.034, -0.012, 0.03], ["lateral-geniculate-body", "c", 0.5, 0.058, -0.02, -0.005], ["lateral-geniculate-body", "c", 0.5, 0.055, -0.02, -0.05], ["lingual-gyrus", "c", 0.5, 0, 0, 0]] as WP[];
          const parietal: WP[] = [lgn, ["lateral-geniculate-body", "c", 0.5, 0.036, 0.016, -0.02], ["lateral-geniculate-body", "c", 0.5, 0.04, 0.02, -0.055], ["cuneus", "c", 0.5, 0, 0, 0]] as WP[];
          for (const [name, pts, col] of [["meyer", meyer, up], ["parietal", parietal, low]] as const) {
            tubes.push({ ...base, key: `${slug}:${f}:${name}`, pts, color: col, opacity: op, seq: seq++, chains: ["nm", "tm"].map((c) => c.replace("m", name === "meyer" ? "m" : "p")) });
            pts.forEach((p) => {
              if (inFit) fit.push({ wp: p, body: f });
            });
          }
          if (foc && isCur && f === primaryOf(sideMode)) {
            marks.push({ key: `${slug}:${f}:meyer`, p: ["lateral-geniculate-body", "c", 0.5, 0.058, -0.02, -0.005] as WP, body: f, kind: "recept", text: `${sideMode === "both" ? `${f} field · ` : ""}Meyer's loop (temporal lobe): upper field`, color: up, prio: 2 });
            marks.push({ key: `${slug}:${f}:par`, p: ["lateral-geniculate-body", "c", 0.5, 0.04, 0.02, -0.055] as WP, body: f, kind: "recept", text: `${sideMode === "both" ? `${f} field · ` : ""}Parietal route: lower field`, color: low, prio: 2 });
          }
          continue;
        }
        if (st.ids?.length && st.k !== "chiasm") {
          layers.push({ key: `${f}:${ni}:${st.k}`, ids: st.ids, side: physSide(st.phys, f) ?? "both", color: fc, opacity: (isCur ? 0.85 : 0.45) * al });
        }
        if (st.path && st.path.length > 1) {
          // nasal fibres cross (they belong to the eye on the field's side), temporal fibres stay (the other eye): each only on its own branch
          const chains = st.k === "nerve" || st.k === "chiasm" ? ["nm", "np"] : st.k === "nerve2" ? ["tm", "tp"] : undefined;
          tubes.push({ ...base, key: `${slug}:${f}:${ni}:${st.k}`, pts: st.path, color: fc, opacity: op, seq: st.k === "nerve2" ? 5 : seq++, chains });
        }
        st.marks?.forEach((m, mi) => {
          if (m.kind !== "dec") return;
          if (f !== primaryOf(sideMode)) return;
          marks.push({ key: `${slug}:${f}:${ni}:${st.k}:${mi}`, p: m.p, body: f, kind: "dec", text: "OPTIC CHIASM: nasal fibres cross, temporal fibres stay", color: colors.hi, prio: ni === cur || summary ? 2 : 1 });
        });
        if (st.k === "lgn" && foc && isCur && f === primaryOf(sideMode)) marks.push({ key: `${slug}:${f}:lgn`, p: ["lateral-geniculate-body", "c", 0.5] as WP, body: f, kind: "soma", text: "Lateral geniculate nucleus", color: fc, prio: 2 });
      }
    });
    // V1: the calcarine fissure splits the field: cuneus (above) = lower field, lingual gyrus (below) = upper field
    if (lastShown >= 2) {
      const isCur = cur === 2 || summary;
      layers.push({ key: `${f}:v1:cuneus`, ids: ["cuneus"], side: opp(f), color: low, opacity: (isCur ? 0.92 : 0.5) * al });
      layers.push({ key: `${f}:v1:lingual`, ids: ["lingual-gyrus"], side: opp(f), color: up, opacity: (isCur ? 0.92 : 0.5) * al });
      layers.push({ key: `${f}:v1:calc`, ids: ["calcarine-sulcus"], side: opp(f), color: colors.text, opacity: (isCur ? 0.9 : 0.5) * al });
      if (cur === 2 || summary) {
        for (const w of [["cuneus", "c", 0.5], ["lingual-gyrus", "c", 0.5]] as WP[]) fit.push({ wp: w, body: f });
        if (foc && f === primaryOf(sideMode)) {
          marks.push({ key: `${slug}:${f}:cun`, p: ["cuneus", "c", 0.5, 0, 0.012, 0] as WP, body: f, kind: "recept", text: `${sideMode === "both" ? `${f} field · ` : ""}Cuneus (above the fissure): LOWER field`, color: low, prio: 2 });
          marks.push({ key: `${slug}:${f}:ling`, p: ["lingual-gyrus", "c", 0.5, 0, -0.012, 0] as WP, body: f, kind: "recept", text: `${sideMode === "both" ? `${f} field · ` : ""}Lingual gyrus (below): UPPER field`, color: up, prio: 2 });
        }
      }
    }
  }

  // the eyes: retinas split into nasal / temporal halves and upper / lower quadrants, coloured by the field quadrant each receives
  const eyes: SceneEyes = {
    nerve: nerveWP("i", 1),
    spec: { fieldColors: { L: [pal.LU, pal.LL], R: [pal.RU, pal.RL] }, alpha: { L: alphaOf(sideMode, "L"), R: alphaOf(sideMode, "R") } },
  };
  if (cur === 0 || summary || !follow) {
    for (const e of SIDES) {
      const lbl = (k: string, text: string, dx: number, dy: number, dz: number, prio: 0 | 1 | 2, dir?: -1 | 0 | 1) =>
        marks.push({ key: `eye:${e}:${k}`, p: ["optic-nerve-ii", "i", 1, dx, dy, dz, "z"] as WP, body: e, kind: "recept", text, color: fieldCol(e), prio, dir });
      lbl("name", `${sideName(e)} eye`, 0, 0.0185, 0.012, 1, 0);
      if (cur === 0 || summary) {
        lbl("nasal", "Nasal retina", -0.011, -0.0, 0.008, 2);
        lbl("temp", "Temporal retina", 0.011, 0.0, 0.008, 2);
      }
      fit.push({ wp: ["optic-nerve-ii", "i", 1, 0.03, 0.03, 0.03, "z"] as WP, body: e }, { wp: ["optic-nerve-ii", "i", 1, -0.03, -0.025, 0.0, "z"] as WP, body: e });
    }
  }
  return { layers, tubes, marks, fit, limbs: [], eyes };
}

export { primaryOf, alphaOf, focused };
