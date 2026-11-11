import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyLeft } from "./limits.ts";
import { scheduleReview, newCardState, type CardStateRow } from "../fsrs.ts";

const now = new Date(Date.UTC(2026, 10, 10, 15));
const ids = (n: number, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);

test("dailyLeft: new cards the client still holds count against today's limit", () => {
  // 20 new a day; the first batch had 20 new cards; 13 are answered and stored, 7 are still queued
  const all = ids(40);
  const states = new Map<string, CardStateRow>();
  for (const id of all.slice(0, 13)) states.set(id, scheduleReview(newCardState("u", id, now), 3, now).next);
  const queued = all.slice(13, 20);
  const base = { perDay: 20, doneToday: 13, courseCards: new Set(all), states, now };
  // before: perDay - doneToday = 7 more new cards in the next batch, 27 in all
  assert.equal(base.perDay - base.doneToday, 7);
  assert.equal(dailyLeft({ ...base, excluded: queued }), 0);
  // three answers not stored yet (no state, not in doneToday): held as well
  const unstored = new Map([...states].filter(([id]) => !["c10", "c11", "c12"].includes(id)));
  assert.equal(dailyLeft({ ...base, states: unstored, doneToday: 10, excluded: [...queued, "c10", "c11", "c12"] }), 0);
  // answered and stored: in doneToday, has a state, not counted twice
  assert.equal(dailyLeft({ ...base, doneToday: 13, excluded: all.slice(0, 13) }), 7);
  // "Study more" adds on top; cards of another course in the list are ignored
  assert.equal(dailyLeft({ ...base, extra: 10, excluded: [...queued, "other-course-card"] }), 10);
});

test("dailyLeft: reviews held by the client count against the review limit", () => {
  const due: CardStateRow = { user_id: "u", card_id: "r", due: new Date(now.getTime() - 86_400_000).toISOString(), stability: 10, difficulty: 5, elapsed_days: 10, scheduled_days: 10, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(now.getTime() - 11 * 86_400_000).toISOString() };
  const rev = ids(10, "r");
  const states = new Map(rev.map((id) => [id, { ...due, card_id: id }]));
  assert.equal(dailyLeft({ kind: "review", perDay: 12, doneToday: 2, excluded: rev.slice(0, 6), courseCards: new Set(rev), states, now }), 4);
});
