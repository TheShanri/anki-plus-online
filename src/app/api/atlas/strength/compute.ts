import "server-only";
import { FSRS6_DEFAULT_DECAY } from "ts-fsrs";
import type { CourseIndex } from "@/lib/study/server";

export type StructureStrength = {
  slug: string;
  name: string;
  /** 0 (weak) to 1 (solid); null = none of its cards has been answered yet. */
  strength: number | null;
  /** Mean retrievability of the answered cards right now (0..1), null when unseen. */
  retrievability: number | null;
  /** Mean stability of the answered cards, in days. */
  stabilityDays: number | null;
  cards: number;
  seen: number;
  lapses: number;
};

const DAY = 86_400_000;

/** FSRS-6 forgetting curve: probability of recall after `days` with stability `s` (the 90% point sits at t = s). */
export function retrievability(days: number, s: number, decay = FSRS6_DEFAULT_DECAY): number {
  if (!(s > 0)) return 0;
  const factor = Math.pow(0.9, -1 / decay) - 1;
  return Math.pow(1 + (factor * Math.max(0, days)) / s, -decay);
}

/**
 * Per structure: the mean retrievability of its answered cards, scaled by how many of its cards have been answered
 * (strength = meanR * (0.6 + 0.4 * coverage)), so one well-known card of eight does not read as solid.
 */
export function computeStrength(idx: CourseIndex, structs: { id: string; slug: string; canonical_name: string }[], now = new Date()): StructureStrength[] {
  type Acc = { cards: number; seen: number; r: number; s: number; lapses: number };
  const acc = new Map<string, Acc>();
  for (const c of idx.cards) {
    if (!c.structure_id) continue;
    const a = acc.get(c.structure_id) ?? { cards: 0, seen: 0, r: 0, s: 0, lapses: 0 };
    a.cards++;
    const st = idx.states.get(c.id);
    if (st && st.reps > 0 && st.state !== 0) {
      const last = st.last_review ? new Date(st.last_review).getTime() : new Date(st.due).getTime() - st.scheduled_days * DAY;
      a.seen++;
      a.r += retrievability((now.getTime() - last) / DAY, st.stability);
      a.s += st.stability;
      a.lapses += st.lapses;
    }
    acc.set(c.structure_id, a);
  }
  const out: StructureStrength[] = [];
  for (const s of structs) {
    const a = acc.get(s.id);
    if (!a) continue;
    const meanR = a.seen ? a.r / a.seen : null;
    out.push({
      slug: s.slug,
      name: s.canonical_name,
      strength: meanR === null ? null : Math.max(0, Math.min(1, meanR * (0.6 + 0.4 * (a.seen / a.cards)))),
      retrievability: meanR,
      stabilityDays: a.seen ? a.s / a.seen : null,
      cards: a.cards,
      seen: a.seen,
      lapses: a.lapses,
    });
  }
  return out;
}
