import { test } from "node:test";
import assert from "node:assert/strict";
import { scaffold, nextStep, ladderOutcome, isLong, rungOf, nextCleanStreak, syllables } from "./ladder.ts";

test("scaffold shows the whole answer at copy, vowels hidden at skeleton, first letters, then shape", () => {
  const a = "Caudate nucleus";
  assert.equal(scaffold(a, 0, 0), "Caudate nucleus");
  assert.equal(scaffold(a, 0, 2), "C_ud_t_ n_cl__s".replace("C_ud_t_", "C__d_t_").replace("n_cl__s", "n_cl__s"));
  assert.equal(scaffold(a, 0, 4), "C______ n______");
  assert.equal(scaffold(a, 0, 6), "_______ _______");
});

test("hint letters stay visible and the scaffold only ever thins out", () => {
  const a = "Substantia nigra";
  assert.equal(scaffold(a, 0, 4, 3).slice(0, 3), "Sub");
  let prevShown = Infinity;
  for (const step of [0, 1, 2, 3, 4, 5, 6]) {
    const shown = [...scaffold(a, 0, step)].filter((c) => c !== "_" && c !== " ").length;
    assert.ok(shown <= prevShown, `step ${step} showed more than the one before`);
    prevShown = shown;
  }
});

test("half-steps: the shorter word fades first, the longer keeps the rung", () => {
  const a = "Caudate nucleus"; // 'Caudate' (7) is shorter than 'nucleus' (7)? equal: later word fades first
  const half = scaffold(a, 0, 1);
  assert.notEqual(half, a);
  assert.ok(half.startsWith("Caudate")); // the first word still shows in full at copy
  const b = "Pons cerebelli"; // 'Pons' shorter
  assert.ok(scaffold(b, 0, 1).startsWith("P"));
  assert.ok(scaffold(b, 0, 1).includes("cerebelli"));
  assert.ok(!scaffold(b, 0, 1).startsWith("Pons"));
});

test("a single long word fades its back half first", () => {
  const a = "Hippocampus";
  const half = scaffold(a, 0, 1);
  assert.ok(half.startsWith("Hippo"));
  assert.ok(half.includes("_"));
  assert.equal(syllables("hippocampus").join(""), "hippocampus");
});

test("isLong: phrases of 6+ letters and single words of 9+", () => {
  assert.equal(isLong("Pons"), false);
  assert.equal(isLong("Thalamus"), false);
  assert.equal(isLong("Hippocampus"), true);
  assert.equal(isLong("Red nucleus"), true);
});

test("nextStep (light, anatomy): first look -> recall; a miss brings first letters, then the skeleton; a clean pass -> recall", () => {
  assert.equal(nextStep(0, "up", false), 6);
  assert.equal(nextStep(0, "stay", true), 6); // a first look with typos in the copy: still from memory next time
  assert.equal(nextStep(0, "top", true), 6);
  assert.equal(nextStep(6, "down", true), 4);
  assert.equal(nextStep(4, "down", true), 2);
  assert.equal(nextStep(2, "down", false), 2); // never back to the copy
  assert.equal(nextStep(4, "up", true), 6);
  assert.equal(nextStep(2, "up", true), 6);
  assert.equal(nextStep(4, "stay", true), 4);
  assert.equal(rungOf(5), 2);
});

test("ladderOutcome: clean passes climb, typos hold, misses drop, unaided first look jumps", () => {
  assert.equal(ladderOutcome(2, { right: true, firstLook: false, typos: 0, hinted: 0 }), "up");
  assert.equal(ladderOutcome(2, { right: true, firstLook: false, typos: 1, hinted: 0 }), "stay");
  assert.equal(ladderOutcome(2, { right: true, firstLook: false, typos: 0, hinted: 2 }), "stay");
  assert.equal(ladderOutcome(2, { right: false, firstLook: false, typos: 0, hinted: 0 }), "down");
  assert.equal(ladderOutcome(6, { right: true, firstLook: false, typos: 0, hinted: 0 }), "stay");
  assert.equal(ladderOutcome(0, { right: true, firstLook: true, typos: 0, hinted: 0 }), "top");
  assert.equal(ladderOutcome(0, { right: false, firstLook: true, introClean: true, typos: 0, hinted: 0 }), "up");
});

test("clean streak counts only unaided correct recalls at the recall rung", () => {
  assert.equal(nextCleanStreak(1, { right: true, step: 6, hinted: 0 }), 2);
  assert.equal(nextCleanStreak(1, { right: true, step: 6, hinted: 1 }), 1);
  assert.equal(nextCleanStreak(1, { right: true, step: 2, hinted: 0 }), 1);
  assert.equal(nextCleanStreak(3, { right: false, step: 6, hinted: 0 }), 0);
});
