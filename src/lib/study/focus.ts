// Focus helpers (pure parts): micro-sprints, wander catcher threshold, hyperfocus guard.
// Ported from ANKI+ web/js/focus/{blitz,wander,guard}.js. UI lives in src/components/study.

export type WanderSensitivity = "low" | "normal" | "high";
const SENS: Record<WanderSensitivity, number> = { low: 3.5, normal: 2.5, high: 1.8 };

/** Idle time (ms) before the wander catcher notices: ~2.5x the card's usual answer time, clamped to 12-60 s. */
export function wanderThreshold(typicalMs: number, sensitivity: WanderSensitivity = "normal"): number {
  return Math.max(12_000, Math.min(60_000, typicalMs * (SENS[sensitivity] ?? 2.5)));
}

export interface GuardRun {
  /** ms timestamp the current uninterrupted run started */
  startedAt: number;
  cards: number;
  /** inside a "one more round" until this many cards */
  until: number;
}

export function newRun(now: number): GuardRun {
  return { startedAt: now, cards: 0, until: 0 };
}

/** Hyperfocus guard: after `minutes` or `cards` of uninterrupted work, a stop card. */
export function guardDue(run: GuardRun, now: number, minutes = 30, cards = 75): boolean {
  if (run.until && run.cards < run.until) return false;
  return (now - run.startedAt) / 60_000 >= minutes || run.cards >= cards;
}

/** A micro-sprint is a short round: after `size` cards the round screen offers "one more round". */
export function sprintProgress(done: number, size: number): { inRound: number; roundsDone: number; atEnd: boolean } {
  const s = Math.max(1, size);
  return { inRound: done % s, roundsDone: Math.floor(done / s), atEnd: done > 0 && done % s === 0 };
}
