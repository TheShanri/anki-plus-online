// Shapes the progress API returns and the trophy room renders. No server-only imports, safe for client components.
import type { Summary } from "./engine.ts";
import type { Tier } from "./types.ts";

export interface AchievementProgress {
  id: string;
  value: number;
  /** Thresholds against the real curriculum, with the unlock time (ms) when reached. */
  tiers: { tier: Tier; at: number; unlockedAt: number | null }[];
}

export interface ModeStat {
  id: string;
  label: string;
  href: string;
  done: number;
  of: number;
  /** Small extra facts shown under the bar. */
  facts: string[];
}

/** 0 unseen, 1 seen in the atlas, 2 named correctly in the quiz, 3 mastered (strong FSRS cards). */
export type CollectionState = 0 | 1 | 2 | 3;
export interface CollectionUnit {
  slug: string;
  title: string;
  items: { slug: string; name: string; state: CollectionState }[];
}

export interface ProgressPayload {
  summary: Summary;
  achievements: AchievementProgress[];
  recent: { id: string; tier: Tier; at: number }[];
  modes: ModeStat[];
  /** Traced pathway slugs (the stamp book). */
  pathways: string[];
  collection: CollectionUnit[] | null;
}

export interface PostResult {
  unlocked: { id: string; tier: Tier; at: number }[];
  xpGained: number;
  summary: Summary;
  rankedUp: boolean;
}
