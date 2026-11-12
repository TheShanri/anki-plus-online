// Which brainstem plate shows a structure (pure logic; the data is passed in), and what to light there. Built from the plate region ids
// (src/data/brainstem-ref.json, made by tools/brainstem/atlas3/build-ref-map.mjs) plus a short, hand-checked table of
// tracts that the plates draw under the name of the bundle carrying them at a level (the corticospinal fibres are the
// cerebral peduncle in the midbrain, the longitudinal fibres of the pons, then the pyramid).

export type RefSide = "L" | "R" | "M";
export interface RefEntry {
  sides: RefSide[];
  approx: boolean;
  area: number;
}
export interface RefData {
  levels: string[];
  structures: Record<string, { levels: Record<string, RefEntry> }>;
}

/** A tract or group the plates draw under other names: the plate structures that carry it (each lit where present). */
export const VIA: Record<string, string[]> = {
  "lateral-corticospinal-tract": ["cerebral-peduncles", "longitudinal-fibers-of-the-pons", "pyramids", "motor-decussation", "lateral-corticospinal-tract"],
  "anterior-corticospinal-tract": ["cerebral-peduncles", "longitudinal-fibers-of-the-pons", "pyramids"],
  "corticobulbar-tract": ["cerebral-peduncles", "longitudinal-fibers-of-the-pons"],
  "corticopontine-tract": ["cerebral-peduncles", "longitudinal-fibers-of-the-pons", "pontine-nuclei"],
  "dorsal-columns": ["fasciculus-gracilis", "fasciculus-cuneatus"],
  "cerebellar-peduncles": ["superior-cerebellar-peduncle", "middle-cerebellar-peduncle", "inferior-cerebellar-peduncle", "decussation-of-the-superior-cerebellar-peduncle"],
};

/** The level that shows a structure best (its hallmark level), when it appears on several. */
const HALLMARK: Record<string, string> = {
  "medial-longitudinal-fasciculus": "pons-caudal",
  "medial-lemniscus": "medulla-rostral",
  "anterolateral-spinothalamic-tract": "medulla-rostral",
  "lateral-corticospinal-tract": "medulla-caudal",
  "anterior-corticospinal-tract": "medulla-rostral",
  "corticobulbar-tract": "midbrain-sc",
  "corticopontine-tract": "pons-mid",
  "cerebral-peduncles": "midbrain-sc",
  "substantia-nigra": "midbrain-sc",
  "periaqueductal-gray": "midbrain-sc",
  "cerebral-aqueduct": "midbrain-sc",
  "fourth-ventricle": "pons-caudal",
  "superior-cerebellar-peduncle": "pons-mid",
  "middle-cerebellar-peduncle": "pons-mid",
  "inferior-cerebellar-peduncle": "medulla-rostral",
  "cerebellar-peduncles": "pons-mid",
  pyramids: "medulla-rostral",
  "spinal-trigeminal-nucleus": "medulla-mid",
  "vestibulocochlear-complex": "pons-caudal",
  "pontine-nuclei": "pons-mid",
  "longitudinal-fibers-of-the-pons": "pons-mid",
  "transverse-fibers-of-the-pons": "pons-mid",
  "gracile-nucleus": "medulla-mid",
  "cuneate-nucleus": "medulla-mid",
  "fasciculus-cuneatus": "medulla-mid",
  "fasciculus-gracilis": "medulla-caudal",
  "dorsal-columns": "medulla-caudal",
  "dorsal-spinocerebellar-tract": "medulla-mid",
  "nucleus-ambiguus": "medulla-rostral",
  "solitary-nucleus": "medulla-rostral",
  "hypoglossal-nucleus": "medulla-rostral",
  "dorsal-motor-nucleus-of-the-vagus": "medulla-rostral",
  "brachium-of-the-inferior-colliculus": "midbrain-ic",
};

/** The lookups over one reference map (src/data/brainstem-ref.json). */
export function makeRefMap(data: RefData) {
  function at(slug: string, level: string): RefEntry | undefined {
    return data.structures[slug]?.levels[level];
  }

  /** The plate structures to light for `slug` on `level` (itself, or the bundles that carry it there). */
  function resolveAt(slug: string, level: string): string[] {
    if (at(slug, level)) return [slug];
    return (VIA[slug] ?? []).filter((s) => at(s, level));
  }

  /** True when the plates can show this structure somewhere. */
  function onPlates(slug: string): boolean {
    return data.levels.some((l) => resolveAt(slug, l).length > 0);
  }

  /** The levels (rostral to caudal) where any of the structures shows. */
  function levelsFor(structures: string[]): string[] {
    return data.levels.filter((l) => structures.some((s) => resolveAt(s, l).length > 0));
  }

  /** The most representative level for a set of structures: the one showing most of them, then the first structure's
   *  hallmark level, then the largest drawn region. Null when none is on the plates. */
  function pickLevel(structures: string[]): string | null {
    let best: string | null = null;
    let bestScore = -1;
    for (const l of data.levels) {
      const shown = structures.filter((s) => resolveAt(s, l).length > 0);
      if (!shown.length) continue;
      let score = shown.length * 1000;
      if (structures[0] && HALLMARK[structures[0]] === l) score += 500;
      score += shown.filter((s) => HALLMARK[s] === l).length * 100;
      // prefer what the course outlines (not approximate), then size
      for (const s of shown) for (const p of resolveAt(s, l)) {
        const e = at(p, l)!;
        score += (e.approx ? 0 : 20) + Math.min(19, e.area / 2000);
      }
      if (score > bestScore) {
        bestScore = score;
        best = l;
      }
    }
    return best;
  }

  /** Whether a lit structure is drawn only approximately on this level. */
  function isApproxAt(slug: string, level: string): boolean {
    return resolveAt(slug, level).some((s) => at(s, level)?.approx);
  }

  return { levels: data.levels, resolveAt, onPlates, levelsFor, pickLevel, isApproxAt };
}
export type RefMap = ReturnType<typeof makeRefMap>;
