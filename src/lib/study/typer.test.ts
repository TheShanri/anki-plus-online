import { test } from "node:test";
import assert from "node:assert/strict";
import { Typer } from "./typer.ts";
import { answerVariants } from "./variants.ts";
import { ratingFor } from "./scheduling.ts";

const mk = (answer: string, accept: string[] = [], o: Partial<ConstructorParameters<typeof Typer>[0]> = {}) =>
  new Typer({ variants: answerVariants(answer, accept), now: 0, ...o });

test("typing the answer tracks, matches, and follows an accepted variant", () => {
  const t = mk("Caudate nucleus", ["caudate"]);
  t.set("c", 10);
  assert.equal(t.state, "track");
  t.set("cau", 20);
  t.set("caudate", 30);
  assert.equal(t.state, "match"); // the short accepted form
  t.set("caudate nu", 40);
  assert.equal(t.state, "track"); // ... and the long form is still being typed
  t.set("caudate nucleus", 50);
  assert.equal(t.state, "match");
});

test("a wrong key is 'bad' and counts one typo until fixed", () => {
  const t = mk("Thalamus");
  t.set("thal", 5);
  t.set("thalo", 6);
  assert.equal(t.state, "bad");
  assert.equal(t.typos, 1);
  t.set("thalo!", 7);
  assert.equal(t.typos, 1);
  t.set("thala", 8);
  assert.equal(t.state, "track");
});

test("hints reveal ghost letters, downgrade the prediction, and respect the cap", () => {
  const t = mk("Hippocampus", [], { cap: 0.5 });
  assert.equal(t.predicted(1000), 4);
  assert.equal(t.hint(1000), 1);
  assert.equal(t.ghost(), "H");
  assert.equal(t.hintBeforeFirst, true);
  assert.equal(t.predicted(1000), 2); // hinted before the first letter: at most Hard
  let n = 1;
  while (t.hint(2000 + n)) n++;
  assert.ok(t.hinted <= Math.floor(0.5 * t.letters));
  assert.equal(t.capped, true);
});

test("hints never pass a trap spot (hintStop)", () => {
  const t = mk("Substantia nigra");
  t.hintStop = (from) => Math.min(from === 0 ? 5 : 99, 5);
  while (t.hint(1)) {
    /* drain */
  }
  assert.ok(t.hintEnd <= 5);
  assert.equal(t.trapBlocked, true);
});

test("Easy needs a flawless and quick answer; slow or typo = Good", () => {
  const t = mk("Pons");
  t.set("pons", 500);
  assert.equal(t.predicted(500), 4);
  assert.equal(t.predicted(60_000), 3);
  const u = mk("Pons");
  u.set("pa", 100);
  u.set("po", 200);
  u.set("pons", 300);
  assert.equal(u.predicted(300), 3);
});

test("ratingFor: wrong/gave up = Again, near miss = Hard, practice and trap miss cap at Hard", () => {
  const base = { predicted: 4 as const, gaveUp: false, practice: false, trapMissed: false, hinted: 0 };
  assert.equal(ratingFor({ ...base, result: "correct" }), 4);
  assert.equal(ratingFor({ ...base, result: "near_miss" }), 2);
  assert.equal(ratingFor({ ...base, result: "wrong" }), 1);
  assert.equal(ratingFor({ ...base, result: "correct", gaveUp: true }), 1);
  assert.equal(ratingFor({ ...base, result: "correct", practice: true }), 2);
  assert.equal(ratingFor({ ...base, result: "correct", trapMissed: true }), 2);
});

test("covered mode shows the answer until the first key", () => {
  const t = mk("Pons", [], { mode: "covered" });
  assert.equal(t.ghost(), "Pons");
  t.set("p", 5);
  assert.equal(t.ghost(), ""); // covered
  t.peek = true;
  assert.equal(t.ghost(), "ons");
});

test("auto hint timing: after the first delay, repeat delay, and on error", () => {
  const t = mk("Amygdala");
  const first = t.firstHintDelay(10);
  assert.equal(t.autoHintDue(first - 1, first), false);
  assert.equal(t.autoHintDue(first + 1, first), true);
  t.hint(first + 1);
  assert.equal(t.autoHintDue(first + 1000, first), false);
  assert.equal(t.autoHintDue(first + 1 + t.params.hintRepeatDelayMs, first), true);
  const b = mk("Amygdala");
  b.set("x", 100);
  assert.equal(b.autoHintDue(100 + b.params.hintOnErrorMs, first), true);
});
