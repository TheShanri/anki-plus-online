import { test } from "node:test";
import assert from "node:assert/strict";
import { Typer } from "./typer.ts";
import { alternativesOf, answerVariants, decorativeKeys } from "./variants.ts";
import { ratingFor } from "./scheduling.ts";

const mk = (answer: string, accept: string[] = [], o: Partial<ConstructorParameters<typeof Typer>[0]> = {}) =>
  new Typer({ variants: answerVariants(answer, accept), decorative: decorativeKeys(answer, accept), now: 0, ...o });

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

test("an accepted short form that a longer form continues does not auto-submit (caudate n -> nucleus)", () => {
  const t = mk("Caudate nucleus", ["caudate"]);
  t.set("caudate", 10);
  assert.equal(t.state, "match");
  assert.equal(t.extendable, true);
  t.set("caudate nucleus", 20);
  assert.equal(t.state, "match");
  assert.equal(t.extendable, false);
  const p = mk("Pons");
  p.set("pons", 5);
  assert.equal(p.extendable, false);
});

test("lenient decorations: a side word is not tracked from its first letter", () => {
  const t = new Typer({ variants: answerVariants("Neuraxis"), decorative: decorativeKeys("Neuraxis"), now: 0 });
  assert.equal(t.set("R", 1).state, "bad");
  assert.equal(t.set("right n", 2).state, "track");
  assert.equal(t.set("th", 3).state, "idle");
  assert.equal(t.set("N", 4).state, "track");
});

test("alternatives: either term of A/B or A or B is a full answer", () => {
  const v = answerVariants("Ventral/anterior");
  assert.ok(v.includes("Ventral") && v.includes("anterior"));
  const w = answerVariants("Rostral or anterior");
  assert.ok(w.includes("Rostral") && w.includes("anterior"));
  assert.deepEqual(alternativesOf("Gracile/cuneate nuclei"), ["Gracile nuclei", "cuneate nuclei"]);
  assert.deepEqual(alternativesOf("L4/L5"), []);
});

test("a partial article stays neutral: 't' on a non-T answer is neither green nor a typo", () => {
  const t = new Typer({ variants: answerVariants("Horizontal plane"), decorative: decorativeKeys("Horizontal plane"), now: 0 });
  assert.equal(t.set("t", 1).state, "idle");
  assert.equal(t.set("the h", 2).state, "track");
  assert.equal(t.typos, 0);
});

// ---- punctuation the student already typed must not be drawn again by the ghost / skeleton / hints
const AC = "The two temporal lobes (amygdalae) and olfactory structures";

test("retype: typed '(' that also comes next in the answer is not repeated by the ghost", () => {
  const t = mk(AC, [], { mode: "retype" });
  t.set("The two temporal lobes", 1);
  assert.equal(t.ghost(), " (amygdalae) and olfactory structures");
  t.set("The two temporal lobes (", 2);
  assert.equal(t.ghost(), "amygdalae) and olfactory structures");
  t.set("The two temporal lobes(", 3); // no space before it: still not repeated
  assert.equal(t.ghost(), "amygdalae) and olfactory structures");
  t.set("The two temporal lobes (amygdalae", 4);
  assert.equal(t.ghost(), ") and olfactory structures");
  t.set("The two temporal lobes (amygdalae)", 5);
  assert.equal(t.ghost(), " and olfactory structures");
  assert.equal(t.state, "track");
});

test("covered: the peeked answer continues past typed punctuation", () => {
  const t = mk(AC, [], { mode: "covered" });
  t.set("The two temporal lobes (", 1);
  t.peek = true;
  assert.equal(t.ghost(), "amygdalae) and olfactory structures");
});

test("skeleton and ghost hints continue after typed punctuation", () => {
  const t = mk(AC);
  t.mask = (answer, from) => answer.slice(from).replace(/[a-z]/gi, "_");
  t.set("The two temporal lobes (", 1);
  assert.equal(t.ghost(), "_________) ___ _________ __________");
  t.mask = null;
  t.hint(2);
  assert.equal(t.ghost(), "amy"); // not "(amy": the "(" is already typed (long answer: 3 letters a hint)
  t.hint(3);
  assert.equal(t.ghost(), "amygda");
});

test("commas, hyphens, slashes and apostrophes typed early are not repeated", () => {
  const ghost = (answer: string, typed: string) => {
    const t = mk(answer, [], { mode: "retype" });
    t.set(typed, 1);
    return t.ghost();
  };
  assert.equal(ghost("Reward, motivation", "Reward,"), " motivation");
  assert.equal(ghost("Reward, motivation", "Reward, "), "motivation");
  assert.equal(ghost("Anterior-posterior axis", "Anterior-"), "posterior axis");
  assert.equal(ghost("Dorsal/ventral stream", "Dorsal/"), "ventral stream");
  assert.equal(ghost("Broca's area", "Broca'"), "s area");
  assert.equal(ghost("Layer IV (granular) cortex", "Layer IV ("), "granular) cortex");
  assert.equal(ghost("Layer IV (granular) cortex", "Layer IV (granular)"), " cortex");
});

test("typed punctuation the answer does not have does not move or break the ghost", () => {
  const ghost = (answer: string, typed: string) => {
    const t = mk(answer, [], { mode: "retype" });
    t.set(typed, 1);
    return t.ghost();
  };
  assert.equal(ghost("Thalamus", "Thal."), "amus");
  assert.equal(ghost("Reward, motivation", "Reward ["), "motivation");
  assert.equal(ghost("The two lobes (amygdalae)", "The two lobes, ("), "amygdalae)");
  const t = mk("Thalamus", [], { mode: "retype" });
  t.set("Thal.", 1);
  assert.equal(t.state, "track");
});
