// Daily limits for the study queue. Pure, so it is unit-tested (limits.test.ts).
import type { CardStateRow } from "../fsrs.ts";
import { phaseOf } from "./queue.ts";

/**
 * How many more new cards (or reviews) today's limit allows in the next batch. `doneToday` counts the stored
 * answers; `excluded` are the cards the client already holds (still queued, or answered but maybe not stored yet).
 * Those of the same kind will be studied today but are not in `doneToday` yet, so they count too. Without that,
 * every follow-up batch handed out the full remainder again: with 20 new a day, the batch fetched after 13 answers
 * added 7 more new cards on top of the 7 still queued (27 in all).
 */
export function dailyLeft(o: { kind?: "new" | "review"; perDay: number; extra?: number; doneToday: number; excluded: Iterable<string>; courseCards: Set<string>; states: Map<string, CardStateRow>; now: Date }): number {
  const kind = o.kind ?? "new";
  let held = 0;
  for (const id of o.excluded) {
    if (o.courseCards.has(id) && phaseOf(o.states.get(id) ?? null, o.now) === kind) held++;
  }
  const extra = Math.max(0, Math.min(200, o.extra ?? 0));
  return Math.max(0, o.perDay + extra - o.doneToday - held);
}
