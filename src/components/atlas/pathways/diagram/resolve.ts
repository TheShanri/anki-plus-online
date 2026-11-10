import { PATHWAY_MAP, type MapPathway } from "@/lib/atlas/pathways";
import type { Beat } from "../buildPathwayScene";
import { SCENES } from "./scenes";
import { STACKS } from "./specs";
import { buildStack } from "./stack";
import type { Diagram, EndKind } from "./types";

/* Ties the drawn elements to the live beat list. The beats do not carry the pathway's name, so the pathway is recognised from
 * the captions (they are the stretch labels and neuron names of pathway-map.json); a `slug` prop skips that. */

const cache = new Map<string, Diagram | null>();
export function diagramFor(slug: string): Diagram | null {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  let d: Diagram | null = null;
  try {
    if (SCENES[slug]) d = SCENES[slug]();
    else if (STACKS[slug]) d = buildStack(STACKS[slug]);
  } catch (e) {
    console.error(`pathway diagram ${slug}:`, e);
  }
  cache.set(slug, d);
  return d;
}
export const DIAGRAM_SLUGS = [...Object.keys(SCENES), ...Object.keys(STACKS)];

const cap = (b: Beat) => b.caption.replace(/ · crosses the midline$/, "");

export type Resolved = Map<string, number[]>;

/** key -> the beats it stands for (the first is the main one). */
export function resolveBeats(slug: string, beats: Beat[], keys: Iterable<string>): Resolved {
  const want = new Set(keys);
  const out: Resolved = new Map();
  const owner: (string | null)[] = beats.map(() => null);
  const claim = (key: string, i: number) => {
    if (owner[i] !== null) return;
    owner[i] = key;
    out.set(key, [...(out.get(key) ?? []), i]);
  };
  const mp: MapPathway | undefined = PATHWAY_MAP[slug];
  if (mp) {
    mp.neurons.forEach((nr, ni) => {
      if (want.has(`n${ni}`)) {
        const i = beats.findIndex((b, j) => b.kind === "node" && owner[j] === null && b.caption === nr.short);
        if (i >= 0) claim(`n${ni}`, i);
      }
      for (const s of nr.stretches) {
        if (!want.has(s.k) || out.has(s.k)) continue;
        const i = beats.findIndex((b, j) => b.kind === "path" && owner[j] === null && cap(b) === s.label);
        if (i >= 0) claim(s.k, i);
      }
    });
  }
  for (const k of want) {
    if (!k.startsWith("~") || out.has(k)) continue;
    const t = k.slice(1).toLowerCase();
    beats.forEach((b, i) => {
      if (owner[i] === null && !out.has(k) && b.caption.toLowerCase().includes(t)) claim(k, i);
    });
  }
  const claimed = owner.map((o, i) => (o !== null ? i : -1)).filter((i) => i >= 0);
  if (claimed.length) {
    const first = Math.min(...claimed);
    const last = Math.max(...claimed);
    const lead = beats.map((_, i) => i).filter((i) => owner[i] === null && i < first);
    const trail = beats.map((_, i) => i).filter((i) => owner[i] === null && i > last);
    const leadNode = lead.find((i) => beats[i].kind === "node");
    const leadPath = [...lead].reverse().find((i) => beats[i].kind === "path");
    const trailNode = [...trail].reverse().find((i) => beats[i].kind === "node");
    const trailPath = [...trail].reverse().find((i) => beats[i].kind === "path");
    if (want.has("start") && leadNode !== undefined) claim("start", leadNode);
    if (want.has("startNerve") && leadPath !== undefined) claim("startNerve", leadPath);
    if (want.has("end") && trailNode !== undefined) claim("end", trailNode);
    if (want.has("endNerve") && trailPath !== undefined) claim("endNerve", trailPath);
    // whatever is left lights together with the nearest earlier drawn element (a site's own node, a bare "end" note)
    let prev: string | null = null;
    const nextOwner = (i: number) => owner.slice(i).find((o) => o !== null) ?? null;
    beats.forEach((_, i) => {
      if (owner[i] !== null) prev = owner[i];
      else {
        const k = prev ?? nextOwner(i);
        if (k) out.set(k, [...(out.get(k) ?? []), i]);
      }
    });
  }
  return out;
}

/** The pathway the beats belong to: the diagram whose keys match the most captions. */
export function detectSlug(beats: Beat[]): string | null {
  if (!beats.length) return null;
  if (beats[0].caption.startsWith("Retina:")) return "visual";
  let best: string | null = null;
  let bestScore = 1;
  for (const slug of DIAGRAM_SLUGS) {
    if (slug === "visual") continue;
    const d = diagramFor(slug);
    if (!d) continue;
    const keys = new Set(d.els.flatMap((e) => e.keys).filter((k) => !/^(start|startNerve|end|endNerve)$/.test(k)));
    const r = resolveBeats(slug, beats, keys);
    let hit = 0;
    for (const k of keys) if (r.has(k) && !k.startsWith("~")) hit += 1;
    const score = hit - 0.001 * (keys.size - hit);
    if (score > bestScore) {
      best = slug;
      bestScore = score;
    }
  }
  return best;
}

/** How a path ends: a synapse onto the next neuron (cup), the final target (arrow), or just a stretch of the same fibre. */
export function endKinds(slug: string): Map<string, EndKind> {
  const out = new Map<string, EndKind>();
  const mp = PATHWAY_MAP[slug];
  if (!mp) return out;
  const nn = mp.neurons.length;
  mp.neurons.forEach((nr, ni) => {
    const sts = nr.stretches.filter((s) => s.path && s.path.length > 1);
    const origin = JSON.stringify(sts[0]?.path?.[0]);
    sts.forEach((s, si) => {
      const lastOne = si === sts.length - 1;
      const parallel = sts.length > 1 && JSON.stringify(s.path![0]) === origin;
      if (ni < nn - 1) out.set(s.k, lastOne || parallel ? "cup" : "none");
      else out.set(s.k, lastOne || parallel ? "arrow" : "none");
    });
  });
  return out;
}
