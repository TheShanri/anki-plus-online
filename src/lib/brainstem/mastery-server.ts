import "server-only";
// Brainstem mastery for the atlas page: per structure, level, region and the whole brainstem, from the FSRS states of
// ALL cards linked to each plate structure (deck name cards, theory cards and the plate cards themselves).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIndex } from "@/lib/study/server";
import { BRAINSTEM_REGIONS, plateOfSlug, rollup, structureMastery, type MasteryRollup } from "@/lib/study/mastery";
import type { StudyCard } from "@/lib/study/types";

export interface BrainstemMastery {
  /** per level: roll-up and each structure's mastery 0..1 */
  levels: Record<string, MasteryRollup & { structures: Record<string, number> }>;
  regions: Record<string, MasteryRollup>;
  all: MasteryRollup;
  /** the first level (top to bottom) that is not mastered yet, if any */
  next: string | null;
}

export async function loadBrainstemMastery(sb: SupabaseClient, userId: string, courseId: string): Promise<BrainstemMastery> {
  const idx = await loadIndex(sb, userId, courseId);
  const cards: StudyCard[] = idx.cards.map((c) => ({
    id: c.id, slug: c.slug, kind: c.kind as StudyCard["kind"], topicId: c.topic_id, structureId: c.structure_id, position: c.position,
    prompt: "", answer: "", accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [],
  }));
  const mastery = structureMastery(cards, idx.states, idx.ladders);
  const perLevel: Record<string, Record<string, number>> = {};
  for (const c of cards) {
    const p = plateOfSlug(c.slug);
    if (!p || !c.structureId) continue;
    (perLevel[p.level] ??= {})[p.structure] = mastery.get(c.structureId) ?? 0;
  }
  const levels: BrainstemMastery["levels"] = {};
  const regionVals: Record<string, number[]> = {};
  const allVals: number[] = [];
  for (const level of Object.keys(BRAINSTEM_REGIONS)) {
    const s = perLevel[level];
    if (!s) continue;
    const vals = Object.values(s);
    levels[level] = { ...rollup(vals), structures: s };
    (regionVals[BRAINSTEM_REGIONS[level]] ??= []).push(...vals);
    allVals.push(...vals);
  }
  const regions: BrainstemMastery["regions"] = {};
  for (const [r, v] of Object.entries(regionVals)) regions[r] = rollup(v);
  const next = Object.keys(BRAINSTEM_REGIONS).find((l) => levels[l] && !levels[l].mastered) ?? null;
  return { levels, regions, all: rollup(allVals), next };
}
