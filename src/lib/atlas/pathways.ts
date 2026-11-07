import mapJson from "@/data/pathway-map.json";

/* ---------------------------------------------------------------------------------------------
 * Pathway tracer + lesion lab: types, the curated anatomy map and the lesion engine.
 *
 * Sides. "L" / "R" are the patient's left / right (the atlas has left = +x). Everything in the map is stored
 * relative to the *body side served* ("i" = same side as the receptor / limb / cerebellar hemisphere,
 * "c" = the opposite side, "m" = midline), so one map serves both the left and the right trace.
 * ------------------------------------------------------------------------------------------- */

export type Side = "L" | "R";
export type Rel = "i" | "c" | "m";
export type Phys = "i" | "c" | "cross";
/** [structure id | "@", side, t, dx, dy, dz, axis]: see resolveWaypoint in PathwayScene. */
export type WP = [string, Rel, ...(number | string)[]];
export type CordLevel = "C" | "T" | "L";

export interface Mark {
  p: WP;
  kind: "soma" | "syn" | "dec";
  text: string;
}
export interface Stretch {
  k: string;
  label: string;
  phys: Phys;
  zones?: string[];
  ids?: string[];
  path?: WP[];
  marks?: Mark[];
  cord?: boolean;
  cordLevels?: CordLevel[];
  lag?: boolean;
  noLesion?: boolean;
  loss?: string;
  region?: string | Record<string, string>;
  note?: string;
}
export interface MapNeuron {
  short: string;
  syn?: string;
  synKeys?: string[];
  stretches: Stretch[];
}
export interface MapPathway {
  loss: string;
  region: string;
  quality: "full" | "partial";
  visual?: boolean;
  neurons: MapNeuron[];
}
export interface Effect {
  side: "same" | "opp" | "both";
  text: string;
}
export interface Site {
  id: string;
  name: string;
  group: string;
  sided: boolean;
  zones: string[];
  cord?: CordLevel[];
  ids: string[];
  pos: WP;
  effects?: Effect[];
  segmental?: boolean;
}
export interface CaseDef {
  site: string;
  side?: Side;
  cord?: CordLevel;
}
interface PathwayMapFile {
  cord: Record<CordLevel, { label: string; t: number }>;
  pathways: Record<string, MapPathway>;
  sites: Site[];
  cases: Record<string, CaseDef>;
}
const MAP = mapJson as unknown as PathwayMapFile;
export const PATHWAY_MAP = MAP.pathways;
export const SITES = MAP.sites;
export const CASES = MAP.cases;
export const CORD = MAP.cord;
export const SITE_BY_ID = new Map(SITES.map((s) => [s.id, s]));

/** The course's pathways.json (read on the server, passed down as props). */
export interface CoursePathway {
  slug: string;
  name: string;
  unit: string;
  modality: string;
  neurons: { order: number; cell_body: string; tract: string; synapse: string; level: string; decussates: boolean }[];
  decussation: string;
  lesion: { below_decussation: string; above: string };
  sources: string[];
}
export interface PathwayCard {
  slug: string;
  pathway: string | null;
  step: string | null;
  prompt: string;
  answer: string;
  topic: string | null;
}
export interface ClinicalCard {
  slug: string;
  vignette: string;
  prompt: string;
  answer: string;
}

export const opp = (s: Side): Side => (s === "L" ? "R" : "L");
export const sideName = (s: Side) => (s === "L" ? "Left" : "Right");
/** Physical side of a stretch (null for crossing stretches) when the body side served is `body`. */
export function physSide(phys: Phys, body: Side): Side | null {
  return phys === "i" ? body : phys === "c" ? opp(body) : null;
}

/* ---------- pathway-card linking ---------- */
const ORD: [RegExp, number][] = [
  [/first/, 1],
  [/second/, 2],
  [/third/, 3],
];
const FIRST_STEPS = new Set(["fiber", "funiculus", "topography", "tract-leg", "tract-arm", "receptors", "receptor", "fast-pain", "slow-pain", "synapse-1", "synapse-skip", "synapse-adelta", "synapse-c", "first-order-shape", "ganglion-location", "ganglion", "cell-body", "modulation", "special", "bone"]);
const CROSS_STEPS = new Set(["decussation", "tract-above", "lesion-above", "lesion-below", "chiasm-field", "lesion-chiasm", "midline", "ipsi-contra", "side", "mlf", "pprf", "fef", "lesion-side"]);
const LAST_STEPS = new Set(["capsule", "cortex", "thalamic", "target", "targets", "orbitofrontal", "thalamus", "lesion-cortex", "output", "peduncle"]);

/** Which neuron (1-based) a pathway card belongs to; 0 = the pathway as a whole. */
export function neuronForCard(card: PathwayCard, course: CoursePathway): number {
  const step = card.step ?? "";
  for (const [re, n] of ORD) if (re.test(step) && n <= course.neurons.length) return n;
  if (FIRST_STEPS.has(step)) return 1;
  if (CROSS_STEPS.has(step)) {
    const i = course.neurons.findIndex((n) => n.decussates);
    return i >= 0 ? i + 1 : 0;
  }
  if (LAST_STEPS.has(step)) return course.neurons.length;
  return 0;
}

/* ---------- tracer: quiz ---------- */
export const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

const STOP = new Set(["the", "and", "of", "nucleus", "same", "side", "contralateral", "ipsilateral", "with", "from", "via", "then", "to"]);
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
/** Typed-answer check: any of the keywords appears as text (keywords come from the map or the course text). */
export function checkTyped(input: string, keys: string[]): boolean {
  const t = normalise(input);
  if (t.length < 2) return false;
  return keys.some((k) => {
    const n = normalise(k);
    return n.length > 0 && (t.includes(n) || (t.length >= 4 && n.includes(t)));
  });
}
export function autoKeys(text: string): string[] {
  return normalise(text)
    .split(" ")
    .filter((w) => w.length >= 5 && !STOP.has(w));
}

/* ---------- lesion engine ---------- */
export interface LesionInput {
  siteId: string;
  /** For sided sites. */
  side: Side;
  cord?: CordLevel;
}
export interface Hit {
  pathway: string;
  name: string;
  neuron: number;
  stretch: Stretch;
  /** Body side where the deficit appears. */
  bodySides: Side[];
  loss: string;
  region: string;
  why: string;
  /** The stretch's physical side(s) at the lesion. */
  physSides: Side[];
  note?: string;
  lag: boolean;
}
export interface LesionResult {
  site: Site;
  side: Side | "both";
  cord?: CordLevel;
  hits: Hit[];
  effects: { side: "same" | "opp" | "both"; text: string; sides: Side[] }[];
  /** Pathways whose course the lesion misses, listed so "what is spared" is explicit. */
  spared: string[];
}

function regionText(st: Stretch, pw: MapPathway, cord?: CordLevel, segmental?: boolean): string {
  if (segmental) return "the dermatome / myotome of the damaged segments only";
  const r = st.region ?? pw.region;
  if (typeof r === "string") return r;
  return (cord && r[cord]) ?? r._ ?? pw.region;
}

function why(st: Stretch, dec: string, site: Site, pw: MapPathway): string {
  if (st.phys === "cross") return `The lesion catches the fibres as they cross (${dec.toLowerCase()}), so both sides are involved.`;
  if (pw.visual) {
    if (st.phys === "i") return "Each optic nerve carries one eye's fibres: the loss is in that eye.";
    return "After the chiasm each tract carries the opposite visual field from both eyes, so the loss is opposite the lesion and affects both eyes.";
  }
  if (st.phys === "i") return `Here the pathway is still on the same side as the body part it serves (before it crosses: ${dec.toLowerCase()}), so the loss is on the lesion side.`;
  return `By this level the pathway has already crossed (${dec.toLowerCase()}), so the loss is on the side opposite the lesion.`;
}

/** What a lesion cuts, which body side loses what, and why. Course decussation text comes from `course`. */
export function predictLesion(input: LesionInput, course: Map<string, CoursePathway>): LesionResult | null {
  const site = SITE_BY_ID.get(input.siteId);
  if (!site) return null;
  const cord = site.cord ? (input.cord && site.cord.includes(input.cord) ? input.cord : site.cord[0]) : undefined;
  const lesionSides: Side[] = site.sided ? [input.side] : ["L", "R"];
  const hits: Hit[] = [];
  const touched = new Set<string>();
  for (const [slug, pw] of Object.entries(PATHWAY_MAP)) {
    const cp = course.get(slug);
    if (!cp) continue;
    pw.neurons.forEach((n, ni) => {
      for (const st of n.stretches) {
        if (st.noLesion || !st.zones?.some((z) => site.zones.includes(z))) continue;
        if (cord && st.cord && st.cordLevels && !st.cordLevels.includes(cord)) continue;
        const bodySides = new Set<Side>();
        const phys = new Set<Side>();
        if (st.phys === "cross") {
          // crossing fibres of both body sides pass through the midline: only a midline / bilateral lesion cuts them
          if (!site.sided) {
            bodySides.add("L");
            bodySides.add("R");
          }
        } else {
          for (const ls of lesionSides) {
            phys.add(ls);
            bodySides.add(st.phys === "i" ? ls : opp(ls));
          }
        }
        if (!bodySides.size) continue;
        if (st.phys === "cross") {
          phys.add("L");
          phys.add("R");
        }
        const key = `${slug}/${st.k}`;
        if (touched.has(key)) continue;
        touched.add(key);
        hits.push({
          pathway: slug,
          name: cp.name,
          neuron: ni + 1,
          stretch: st,
          bodySides: [...bodySides],
          physSides: [...phys],
          loss: st.loss ?? pw.loss,
          region: regionText(st, pw, cord, site.segmental),
          why: why(st, cp.decussation, site, pw),
          note: st.note,
          lag: !!st.lag,
        });
      }
    });
  }
  // merge hits of the same pathway for the list, keeping the first stretch as the headline
  const effects = (site.effects ?? []).map((e) => ({
    ...e,
    sides: (e.side === "both" ? ["L", "R"] : e.side === "same" ? lesionSides : lesionSides.map(opp)) as Side[],
  }));
  const hitSlugs = new Set(hits.map((h) => h.pathway));
  const spared = Object.keys(PATHWAY_MAP)
    .filter((s) => PATHWAY_MAP[s].quality === "full" && !hitSlugs.has(s))
    .map((s) => course.get(s)?.name ?? s);
  return { site, side: site.sided ? input.side : "both", cord, hits, effects, spared };
}

export const sidesText = (s: Side[]) => (s.length === 2 ? "Both sides" : sideName(s[0]));

/** Group the hits of one pathway (several stretches of the same pathway often fall in one lesion). */
export function groupHits(hits: Hit[]): { pathway: string; name: string; hits: Hit[] }[] {
  const out: { pathway: string; name: string; hits: Hit[] }[] = [];
  for (const h of hits) {
    const g = out.find((x) => x.pathway === h.pathway);
    if (g) g.hits.push(h);
    else out.push({ pathway: h.pathway, name: h.name, hits: [h] });
  }
  return out;
}

/** Findings written from the engine (for sites without a course card), one line each. */
export function generatedFindings(r: LesionResult): string[] {
  const clean = (t: string) => t.replace(/\s*\([^)]*\)/g, "").replace(/the lesion/g, "a certain level").replace(/at the level of a certain level/g, "at one level");
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const g of groupHits(r.hits)) {
    const h = g.hits[0];
    if (h.stretch.phys === "cross" && g.hits.length > 1) continue;
    const t = `${sidesText(h.bodySides)}: loss of ${h.loss.replace(/\s*\([^)]*\)/g, "")} in ${clean(h.region)}`;
    if (!seen.has(t)) {
      seen.add(t);
      lines.push(t);
    }
  }
  for (const e of r.effects) lines.push(e.text.split(":")[0].replace(/\.$/, ""));
  return lines.slice(0, 6);
}

/* ---------- display helpers ---------- */
export const CORD_LABEL = (c?: CordLevel) => (c ? CORD[c].label : "");
export function siteLabel(site: Site, side: Side | "both", cord?: CordLevel): string {
  const lower = site.name.charAt(0).toLowerCase() + site.name.slice(1);
  const c = cord ? ` at ${CORD[cord].label}` : "";
  return site.sided && side !== "both" ? `${sideName(side)} ${lower}${c}` : `${site.name}${c}`;
}
