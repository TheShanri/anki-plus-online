import { test } from "node:test";
import assert from "node:assert/strict";
import { PartBoxes, gradeParts, spotsForPart } from "./parts.ts";
import type { AnswerPart } from "./types.ts";

const P = (...t: string[]): AnswerPart[] => t.map((text) => ({ text, accept: [] }));
const mk = (parts: AnswerPart[], ordered = false, o: Partial<ConstructorParameters<typeof PartBoxes>[0]> = {}) => new PartBoxes({ parts, ordered, now: 0, ...o });

test("unordered: R or A is a fine start in any box, and the box says what it narrowed to", () => {
  const m = mk(P("Reward", "Addiction"));
  m.input(0, "R", 1);
  assert.equal(m.boxes[0].state, "track");
  assert.deepEqual(m.chip(0), { kind: "one", text: "Reward" });
  m.input(1, "A", 2);
  assert.equal(m.boxes[1].state, "track");
  assert.deepEqual(m.chip(1), { kind: "one", text: "Addiction" });
  // the other way round works too
  const n = mk(P("Reward", "Addiction"));
  n.input(0, "A", 1);
  assert.equal(n.boxes[0].state, "track");
  assert.deepEqual(n.chip(0), { kind: "one", text: "Addiction" });
});

test("several parts still fit a short prefix: the chip lists them, then narrows as you type", () => {
  const m = mk(P("Reward", "Rostral", "Addiction"));
  m.input(0, "R", 1);
  assert.deepEqual(m.chip(0), { kind: "many", text: "Reward / Rostral" });
  m.input(0, "Ro", 2);
  assert.deepEqual(m.chip(0), { kind: "one", text: "Rostral" });
  m.input(0, "Rx", 3);
  assert.equal(m.boxes[0].state, "bad");
  assert.equal(m.chip(0), null);
  m.input(1, "", 4);
  assert.equal(m.chip(1), null); // nothing typed: nothing to narrow
});

test("chips only name the parts when hints are on", () => {
  const m = mk(P("Reward", "Addiction"), false, { reveal: false });
  m.input(0, "R", 1);
  assert.deepEqual(m.chip(0), { kind: "one", text: "1 fits" });
});

test("a completed part is claimed: the other boxes stop offering it, so a duplicate cannot count", () => {
  const m = mk(P("Reward", "Addiction"));
  m.input(0, "Reward", 1);
  assert.equal(m.complete(0), true);
  assert.deepEqual([...m.claims()], [[0, 0]]);
  assert.deepEqual(m.chip(0), { kind: "done", text: "Reward" });
  // box 1 can no longer be Reward; R fits nothing now, A still does
  m.input(1, "R", 2);
  assert.equal(m.boxes[1].state, "bad");
  m.input(1, "Reward", 3);
  assert.equal(m.complete(1), false);
  assert.equal(m.allComplete(), false);
  m.input(1, "A", 4);
  assert.deepEqual(m.chip(1), { kind: "one", text: "Addiction" });
  m.input(1, "Addiction", 5);
  assert.equal(m.allComplete(), true);
});

test("a claim is released when the box is edited, and the part is offered again", () => {
  const m = mk(P("Reward", "Addiction"));
  m.input(1, "Reward", 1); // the second box may claim part 0
  m.input(0, "Rew", 2);
  assert.equal(m.boxes[0].state, "bad"); // taken
  m.input(1, "Rewar", 3); // box 1 backs off
  assert.equal(m.complete(1), false);
  assert.equal(m.boxes[0].state, "track"); // Rew fits Reward again
});

test("typing a part in the other box works, and typos are not counted again when parts move", () => {
  const m = mk(P("Reward", "Addiction"));
  m.input(0, "Addiction", 1);
  m.input(1, "Reward", 2);
  assert.equal(m.allComplete(), true);
  assert.equal(m.typos, 0);
});

test("ordered: box i is part i only", () => {
  const m = mk(P("Reward", "Addiction"), true);
  m.input(0, "A", 1);
  assert.equal(m.boxes[0].state, "bad");
  assert.equal(m.chip(0), null); // no narrowing to show: the order is known
  m.input(0, "Reward", 2);
  assert.equal(m.complete(0), true);
  m.input(1, "Reward", 3);
  assert.equal(m.complete(1), false);
  m.input(1, "Addiction", 4);
  assert.equal(m.allComplete(), true);
});

test("accepted forms and decorations of a part count", () => {
  const parts: AnswerPart[] = [{ text: "Reward", accept: ["motivation"] }, { text: "Addiction", accept: [] }];
  const m = mk(parts);
  m.input(0, "motivation", 1);
  assert.equal(m.complete(0), true);
  assert.equal(m.parts[m.boxes[0].part].text, "Reward");
  m.input(1, "the addiction", 2);
  assert.equal(m.allComplete(), true);
});

test("an accepted short form that a longer one continues is not complete yet", () => {
  const m = mk([{ text: "Caudate nucleus", accept: ["caudate"] }, { text: "Putamen", accept: [] }]);
  m.input(0, "caudate", 1);
  assert.equal(m.complete(0), false);
  m.input(0, "caudate nucleus", 2);
  assert.equal(m.complete(0), true);
});

test("hints target the box's own part first, then the narrowed one", () => {
  const m = mk(P("Reward", "Addiction"));
  m.boxes[1].hint(1);
  assert.equal(m.boxes[1].ghost(), "A"); // box 2 hints the second part, not the first again
  const n = mk(P("Reward", "Addiction"));
  n.input(0, "Reward", 1);
  n.boxes[1].hint(2);
  assert.equal(n.boxes[1].ghost(), "A");
  const o = mk(P("Reward", "Addiction"));
  o.input(0, "A", 1);
  o.boxes[0].hint(2);
  assert.equal(o.boxes[0].ghost(), "d"); // follows Addiction, which is what A narrowed to
});

test("aggregate: hints and typos add up over the boxes; the rating predictor sees them", () => {
  const m = mk(P("Reward", "Addiction"));
  m.input(0, "Reward", 100);
  m.input(1, "Ax", 200);
  m.input(1, "Addiction", 300);
  assert.equal(m.typos, 1);
  assert.equal(m.predicted(400), 3); // a typo: not Easy
  const k = mk(P("Reward", "Addiction"));
  k.input(0, "Reward", 100);
  k.input(1, "Addiction", 200);
  assert.equal(k.predicted(300), 4);
  const j = mk(P("Reward", "Addiction"));
  j.boxes[1].hint(50);
  j.input(0, "Reward", 100);
  j.input(1, "Addiction", 200);
  assert.equal(j.hinted, 1);
  assert.ok(j.predicted(300) <= 2); // a hint before the first letter caps at Hard
});

// ---- grading
test("grading: every box right, in any order, is correct", () => {
  const parts = P("Reward", "Addiction");
  assert.equal(gradeParts(["Reward", "Addiction"], parts, false).verdict.result, "correct");
  const swapped = gradeParts(["Addiction", "Reward"], parts, false);
  assert.equal(swapped.verdict.result, "correct");
  assert.deepEqual(swapped.results.map((r) => r.part), [1, 0]);
  // in an ordered set the same typing is wrong
  const ord = gradeParts(["Addiction", "Reward"], parts, true);
  assert.equal(ord.verdict.result, "wrong");
  assert.equal(ord.verdict.why, "0 of 2 right");
});

test("grading: a tiny typo in a box is a near miss, a wrong or empty box makes the whole answer wrong", () => {
  const parts = P("Reward", "Addiction");
  const near = gradeParts(["Rewrd", "Addiction"], parts, false);
  assert.equal(near.verdict.result, "near_miss");
  assert.equal(near.results[0].verdict.result, "near_miss");
  assert.ok(near.results[0].diff);
  const wrong = gradeParts(["Reward", "Thalamus"], parts, false);
  assert.equal(wrong.verdict.result, "wrong");
  assert.equal(wrong.verdict.why, "1 of 2 right");
  assert.equal(wrong.verdict.points, 0.5);
  assert.equal(wrong.results[1].text, "Addiction");
  const empty = gradeParts(["Reward", ""], parts, false);
  assert.equal(empty.verdict.result, "wrong");
  assert.equal(gradeParts(["", ""], parts, false).verdict.result, "empty");
});

test("grading: one part can never be credited twice", () => {
  const dup = gradeParts(["Reward", "Reward"], P("Reward", "Addiction"), false);
  assert.equal(dup.verdict.result, "wrong");
  assert.equal(dup.results.filter((r) => r.verdict.result === "correct").length, 1);
});

test("grading: per-part accept forms and the best pairing is found", () => {
  const parts: AnswerPart[] = [{ text: "Reward", accept: ["motivation"] }, { text: "Addiction", accept: ["dependence"] }, { text: "Learning", accept: [] }];
  const r = gradeParts(["learning", "dependence", "motivation"], parts, false);
  assert.equal(r.verdict.result, "correct");
  assert.deepEqual(r.results.map((x) => x.part), [2, 1, 0]);
});

test("trap spots are carried to the part that contains their text", () => {
  const spot = { id: "s", start: 10, end: 14, chunk: "tion", kind: "k", pattern: "p", label: "l", question: "q", misses: 1, streak: 0, level: 1 as const, reps: 3, source: "card" as const };
  assert.deepEqual(spotsForPart([spot], "Addiction").map((s) => [s.start, s.end]), [[5, 9]]);
  assert.deepEqual(spotsForPart([spot], "Reward"), []);
});
