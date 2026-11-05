// Rating and scheduling glue: typing result -> rating (1..4) -> FSRS (via src/lib/fsrs.ts).
import { newCardState, scheduleReview, DEFAULT_RETENTION, type CardStateRow, type Grade } from "../fsrs.ts";
import type { VerdictResult } from "./grade.ts";

export { DEFAULT_RETENTION };
export type { CardStateRow, Grade };

export interface RatingInput {
  result: VerdictResult;
  /** the typer's own prediction for a correct answer (hints and speed): 1..4 */
  predicted: Grade;
  gaveUp: boolean;
  /** the ladder is below the recall rung: practice, at most Hard */
  practice: boolean;
  /** a guarded trap was missed at the first try: at most Hard */
  trapMissed: boolean;
  hinted: number;
}

/** Typing result -> rating. Wrong or revealed -> Again; near miss -> Hard; correct -> the typer's prediction
 *  (Good, Easy when fast and flawless, Hard/Again by how much was hinted), capped by practice and trap misses. */
export function ratingFor(i: RatingInput): Grade {
  if (i.gaveUp || i.result === "wrong" || i.result === "empty") return 1;
  let g: Grade = i.result === "near_miss" ? (Math.min(2, i.predicted) as Grade) : i.predicted;
  if (i.practice) g = Math.min(g, 2) as Grade;
  if (i.trapMissed) g = Math.min(g, 2) as Grade;
  return g;
}

/** Ease prediction shown live while typing (the ANKI+ meter). */
export function predictLive(o: { predicted: Grade; practice: boolean; trapMissed: boolean }): Grade {
  let g = o.predicted;
  if (o.practice) g = Math.min(g, 2) as Grade;
  if (o.trapMissed) g = Math.min(g, 2) as Grade;
  return g;
}

export function formatInterval(ms: number): string {
  const m = ms / 60_000;
  if (m < 1) return "<1m";
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  const mo = d / 30.4;
  if (mo < 12) return `${mo < 10 ? mo.toFixed(1).replace(/\.0$/, "") : Math.round(mo)}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, "")}y`;
}

/** Interval previews for the four grade buttons. */
export function previews(row: CardStateRow, now: Date, retention = DEFAULT_RETENTION): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  for (const g of [1, 2, 3, 4] as Grade[]) {
    const { next } = scheduleReview(row, g, now, { retention });
    out[g] = formatInterval(new Date(next.due).getTime() - now.getTime());
  }
  return out;
}

export { newCardState, scheduleReview };
