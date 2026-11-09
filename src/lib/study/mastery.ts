// Mastery of brainstem structures, levels and regions, read from the FSRS card states of ALL cards linked to a structure
// (the deck's name cards, theory follow-ups and the brainstem plate cards). Pure, so it is unit-tested.
//
// A card's knowledge is 0 while it is new; for a card in Review it is its stability over two weeks (capped at 1);
// a card still in learning or relearning earns a little for each clean recall. A solid card (see queue.ts) counts at
// least MASTERED_AT. A structure's mastery is the mean over its cards; a level's (or region's, or the whole
// brainstem's) mastery is the mean over its (level, structure) pairs. At or above MASTERED_AT counts as mastered.
import type { CardStateRow } from "../fsrs.ts";
import { isSolidCard } from "./queue.ts";
import type { LadderRow, StudyCard } from "./types.ts";

export const MASTERED_AT = 0.7;
const FULL_STABILITY_DAYS = 14;

/** The plate cards are the cards whose slug starts with this (bs-plate-<level>-<structure>). */
export const PLATE_PREFIX = "bs-plate-";
export const isPlateCard = (c: { slug: string }): boolean => c.slug.startsWith(PLATE_PREFIX);

/** Levels top to bottom and the region each belongs to. */
export const BRAINSTEM_REGIONS: Record<string, string> = {
  "midbrain-sc": "midbrain",
  "midbrain-ic": "midbrain",
  "pons-rostral": "pons",
  "pons-mid": "pons",
  "pons-caudal": "pons",
  "medulla-rostral": "medulla",
  "medulla-mid": "medulla",
  "medulla-caudal": "medulla",
  cervicomedullary: "medulla",
};

/** (level, structure slug) of a plate card slug, or null. */
export function plateOfSlug(slug: string): { level: string; structure: string } | null {
  if (!slug.startsWith(PLATE_PREFIX)) return null;
  const rest = slug.slice(PLATE_PREFIX.length);
  for (const level of Object.keys(BRAINSTEM_REGIONS)) if (rest.startsWith(level + "-")) return { level, structure: rest.slice(level.length + 1) };
  return null;
}

export function cardKnowledge(state: CardStateRow | null, ladder: LadderRow | null): number {
  if (!state || (state.state === 0 && state.reps === 0)) return 0;
  let k: number;
  if (state.state === 2) k = Math.min(1, state.stability / FULL_STABILITY_DAYS);
  else k = Math.min(0.5, 0.15 + 0.1 * (ladder?.clean_streak ?? 0));
  if (isSolidCard(state, ladder)) k = Math.max(k, MASTERED_AT);
  return k;
}

/** Mean knowledge over all the cards linked to each structure id. */
export function structureMastery(cards: StudyCard[], states: Map<string, CardStateRow>, ladders: Map<string, LadderRow>): Map<string, number> {
  const sum = new Map<string, number>();
  const n = new Map<string, number>();
  for (const c of cards) {
    if (!c.structureId) continue;
    sum.set(c.structureId, (sum.get(c.structureId) ?? 0) + cardKnowledge(states.get(c.id) ?? null, ladders.get(c.id) ?? null));
    n.set(c.structureId, (n.get(c.structureId) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [id, s] of sum) out.set(id, s / (n.get(id) ?? 1));
  return out;
}

export interface MasteryRollup {
  mean: number;
  mastered: boolean;
  /** pairs at or above MASTERED_AT / all pairs */
  done: number;
  total: number;
}
export function rollup(values: number[]): MasteryRollup {
  const total = values.length;
  const mean = total ? values.reduce((a, b) => a + b, 0) / total : 0;
  return { mean, mastered: total > 0 && mean >= MASTERED_AT, done: values.filter((v) => v >= MASTERED_AT).length, total };
}

/**
 * Structure ids whose name is already solid from the deck's own cards: the brainstem plate cards are left out of the
 * test, so a plate card of such a structure opens with a quick known-check instead of a first look.
 */
export function knownStructures(cards: StudyCard[], states: Map<string, CardStateRow>, ladders: Map<string, LadderRow>): Set<string> {
  const known = new Set<string>();
  for (const c of cards) {
    if (c.kind !== "pin" || !c.structureId || isPlateCard(c)) continue;
    if (isSolidCard(states.get(c.id) ?? null, ladders.get(c.id) ?? null)) known.add(c.structureId);
  }
  return known;
}

export type PlateScope = { type: "bslevel"; level: string } | { type: "bsregion"; region: string } | { type: "bsall" };

/** Does a plate card slug belong to a brainstem scope? */
export function plateScopeMatch(slug: string, scope: PlateScope): boolean {
  const p = plateOfSlug(slug);
  if (!p) return false;
  if (scope.type === "bsall") return true;
  if (scope.type === "bslevel") return p.level === scope.level;
  return BRAINSTEM_REGIONS[p.level] === scope.region;
}
