// Thin wrapper around ts-fsrs. Maps between DB rows (card_states / review_logs) and the library's card model.
import { State, createEmptyCard, fsrs, generatorParameters, type Card, type Grade as LibGrade } from "ts-fsrs";

export const DEFAULT_RETENTION = 0.9;

/** Ratings stored in review_logs.rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/** Row shape of public.card_states (timestamps as ISO strings, as PostgREST returns them). */
export interface CardStateRow {
  user_id: string;
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

/** Row shape of public.review_logs insert (the caller adds typed answer, keystrokes, etc.). */
export interface ReviewLogInsert {
  user_id: string;
  card_id: string;
  rating: Grade;
  state_before: number;
  reviewed_at: string;
}

export interface ScheduleOptions {
  retention?: number; // desired retention, default 0.9
  maximumInterval?: number; // days
  fuzz?: boolean;
}

export function newCardState(userId: string, cardId: string, now: Date = new Date()): CardStateRow {
  return toRow(userId, cardId, createEmptyCard(now));
}

function toCard(row: CardStateRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function toRow(userId: string, cardId: string, c: Card, elapsedDays = 0): CardStateRow {
  return {
    user_id: userId,
    card_id: cardId,
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** Schedule one review. Pure: returns the next card_states row and a review_logs insert row. */
export function scheduleReview(
  row: CardStateRow,
  grade: Grade,
  now: Date = new Date(),
  opts: ScheduleOptions = {},
): { next: CardStateRow; log: ReviewLogInsert } {
  const scheduler = fsrs(
    generatorParameters({
      request_retention: opts.retention ?? DEFAULT_RETENTION,
      maximum_interval: opts.maximumInterval ?? 36500,
      enable_fuzz: opts.fuzz ?? false,
    }),
  );
  const card = toCard(row);
  const { card: nextCard } = scheduler.next(card, now, grade as LibGrade);
  const elapsed = card.last_review
    ? Math.max(0, Math.floor((now.getTime() - card.last_review.getTime()) / 86_400_000))
    : 0;
  return {
    next: toRow(row.user_id, row.card_id, nextCard, elapsed),
    log: {
      user_id: row.user_id,
      card_id: row.card_id,
      rating: grade,
      state_before: row.state,
      reviewed_at: now.toISOString(),
    },
  };
}

/**
 * Map a type-the-answer result to a grade.
 * Wrong -> Again. Correct with hints or slow -> Hard. Correct -> Good. Correct, fast, no hints -> Easy.
 */
export function gradeFromTyping(o: { correct: boolean; hintCount: number; durationMs: number; fastMs?: number }): Grade {
  if (!o.correct) return 1;
  if (o.hintCount > 0) return 2;
  return o.durationMs <= (o.fastMs ?? 4000) ? 4 : 3;
}

/** A logged review whose card state never caught up: the stored state's last review is older than the log (or the card
 *  has no state). Equal = applied; newer = a later answer has been applied since. */
export function stateNeedsReplay(stateLastReview: string | null, loggedAt: string): boolean {
  if (!stateLastReview) return true;
  return new Date(stateLastReview).getTime() < new Date(loggedAt).getTime();
}
