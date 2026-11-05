import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeFromTyping, newCardState, scheduleReview } from "./fsrs.ts";

const now = new Date("2026-01-01T12:00:00Z");

test("a new card answered Good becomes due later and gets a log row", () => {
  const row = newCardState("u1", "c1", now);
  const { next, log } = scheduleReview(row, 3, now);
  assert.equal(row.state, 0);
  assert.ok(next.reps === 1);
  assert.ok(new Date(next.due).getTime() > now.getTime());
  assert.equal(log.rating, 3);
  assert.equal(log.state_before, 0);
});

test("Again after review increments lapses; Easy schedules further out than Good", () => {
  let row = newCardState("u1", "c1", now);
  const learn = (r: typeof row, t: Date) => scheduleReview(r, 3, t).next;
  let t = now;
  for (let i = 0; i < 4; i++) {
    row = learn(row, t);
    t = new Date(row.due);
  }
  assert.equal(row.state, 2); // Review
  const good = scheduleReview(row, 3, t).next;
  const easy = scheduleReview(row, 4, t).next;
  assert.ok(easy.scheduled_days >= good.scheduled_days);
  const again = scheduleReview(row, 1, t).next;
  assert.equal(again.lapses, row.lapses + 1);
});

test("higher desired retention gives shorter intervals", () => {
  let row = newCardState("u1", "c1", now);
  let t = now;
  for (let i = 0; i < 4; i++) {
    row = scheduleReview(row, 3, t).next;
    t = new Date(row.due);
  }
  const lo = scheduleReview(row, 3, t, { retention: 0.8 }).next.scheduled_days;
  const hi = scheduleReview(row, 3, t, { retention: 0.95 }).next.scheduled_days;
  assert.ok(hi <= lo);
});

test("gradeFromTyping", () => {
  assert.equal(gradeFromTyping({ correct: false, hintCount: 0, durationMs: 1000 }), 1);
  assert.equal(gradeFromTyping({ correct: true, hintCount: 1, durationMs: 1000 }), 2);
  assert.equal(gradeFromTyping({ correct: true, hintCount: 0, durationMs: 9000 }), 3);
  assert.equal(gradeFromTyping({ correct: true, hintCount: 0, durationMs: 1000 }), 4);
});
