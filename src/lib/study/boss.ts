// Boss fights: every ~10 cards a hard card that is due anyway takes the slot (ANKI+ focus/study-hooks.js +
// focus_api.py). A boss never serves a card early: candidates come only from cards the queue would show today.
import type { Entry } from "./queue.ts";

export interface BossConfig {
  /** average cards between bosses */
  every: number;
}
export const DEFAULT_BOSS: BossConfig = { every: 10 };

/** Cards until the next boss: every-2 .. every+2. */
export function nextBossGap(cfg: BossConfig = DEFAULT_BOSS, rand: () => number = Math.random): number {
  const e = Math.max(4, cfg.every);
  return e - 2 + Math.floor(rand() * 5);
}

export interface BossFacts {
  lapses: number;
  difficulty: number;
  trapMisses: number;
  recentAgain: number;
  relearning: boolean;
}

/** How "hard" a card is for this student. */
export function bossScore(f: BossFacts): number {
  return f.lapses * 2 + Math.max(0, f.difficulty - 5) + f.trapMisses * 2 + f.recentAgain * 3 + (f.relearning ? 2 : 0);
}

export const BOSS_MIN_SCORE = 2;

export function factsOf(e: Entry, trapMisses: number, recentAgain: number): BossFacts {
  return {
    lapses: e.state?.lapses ?? 0,
    difficulty: e.state?.difficulty ?? 0,
    trapMisses,
    recentAgain,
    relearning: e.state?.state === 3,
  };
}

/** Pick the hardest due (not new) entry, or null when nothing is hard enough. */
export function pickBoss(candidates: Array<{ entry: Entry; facts: BossFacts }>): Entry | null {
  let best: Entry | null = null;
  let bestScore = BOSS_MIN_SCORE - 0.001;
  for (const c of candidates) {
    if (c.entry.source === "new" || c.entry.source === "followup") continue;
    const s = bossScore(c.facts);
    if (s > bestScore) {
      best = c.entry;
      bestScore = s;
    }
  }
  return best;
}

/** A boss is defeated by a clean, unaided, correct answer (rating Good or Easy). */
export function bossWon(o: { right: boolean; rating: number; hinted: number }): boolean {
  return o.right && o.rating >= 3 && o.hinted === 0;
}
