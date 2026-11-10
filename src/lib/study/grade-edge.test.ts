// Grading edge cases found in the November 2026 review (docs/CODE_REVIEW_2026-11.md). Each one failed before its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canon } from "./text.ts";
import { answerVariants } from "./variants.ts";
import { gradeTyped, gradeKeywords } from "./grade.ts";
import { classify, bankAttempts } from "./traps.ts";
import { readLearnerSettings } from "./settings.ts";

test("traps: an extra letter before the first one gives a real chunk (end_pos was NaN, the DB write failed)", () => {
  for (const typed of ["ccaudate nucleus", "xCaudate nucleus"]) {
    const ev = classify(typed, "Caudate nucleus");
    assert.ok(ev.length > 0, typed);
    for (const e of ev) {
      assert.ok(Number.isInteger(e.chunkStart) && Number.isInteger(e.chunkEnd), `${typed}: ${e.chunkStart}..${e.chunkEnd}`);
      assert.ok(e.chunkEnd > e.chunkStart && e.chunk.length > 0, `${typed}: empty chunk`);
    }
  }
  const res = bankAttempts([], [], { cardId: "c", answer: "Caudate nucleus", attempts: [{ typed: "ccaudate nucleus", mode: "submit" }], passes: [], firstTryMisses: [], now: new Date("2026-11-09T12:00:00Z"), newId: () => "id1" });
  for (const t of res.traps) assert.ok(Number.isInteger(t.start_pos) && Number.isInteger(t.end_pos) && t.end_pos > t.start_pos, JSON.stringify(t));
});

test("cranial nerves: 'CN7' / 'CN12' without the space are right", () => {
  assert.equal(gradeTyped("cn7", { answer: "Facial nerve", accept: ["CN VII"] }).result, "correct");
  assert.equal(gradeTyped("CN12", { answer: "Hypoglossal nerve", accept: ["CN XII"] }).result, "correct");
  assert.equal(gradeTyped("CNVII", { answer: "Facial nerve", accept: ["CN VII"] }).result, "correct");
});

test("abbreviations do not chain: 'X nerve' never accepts 'X nucleus' (n. means both)", () => {
  assert.notEqual(gradeTyped("Oculomotor nucleus", { answer: "Oculomotor nerve" }).result, "correct");
  assert.notEqual(gradeTyped("Cranial nuclei", { answer: "Cranial nerves" }).result, "correct");
  assert.notEqual(gradeTyped("Oculomotor nerve", { answer: "Oculomotor nucleus" }).result, "correct");
  // still: the abbreviation itself, and an answer written with the ambiguous abbreviation
  assert.equal(gradeTyped("Oculomotor n.", { answer: "Oculomotor nerve" }).result, "correct");
  const v = answerVariants("Oculomotor n.").map((s) => s.toLowerCase());
  assert.ok(v.includes("oculomotor nerve") && v.includes("oculomotor nucleus"));
});

test("a bare abbreviation is not the answer to a one-word name", () => {
  for (const [typed, answer] of [["n", "Nerve"], ["a", "Artery"], ["tr", "Tract"], ["m", "Muscle"]]) {
    assert.notEqual(gradeTyped(typed, { answer }).result, "correct", `${typed} for ${answer}`);
  }
  assert.equal(gradeTyped("Facial n.", { answer: "Facial nerve" }).result, "correct");
});

test("side words: a hyphen or comma after the side still names the side", () => {
  assert.equal(gradeTyped("Right-atrium", { answer: "Right atrium", requireSide: true }).result, "correct");
  assert.equal(gradeTyped("L-caudate-nucleus", { answer: "Left caudate nucleus", requireSide: true }).result, "correct");
  assert.equal(gradeTyped("left, caudate nucleus", { answer: "Left caudate nucleus", requireSide: true }).result, "correct");
  // and words that merely start with l/r are no side
  assert.equal(gradeTyped("lateral caudate nucleus", { answer: "Left caudate nucleus", requireSide: true }).result, "wrong");
  assert.equal(gradeTyped("L4 root", { answer: "Left L4 root", requireSide: true }).kind, "side");
});

test("a different number is a different structure, never a typo (practice or exam)", () => {
  assert.equal(gradeTyped("CN VI", { answer: "CN VII" }).result, "wrong");
  assert.equal(gradeTyped("CN VIII", { answer: "CN VII" }).result, "wrong");
  assert.equal(gradeTyped("T4 vertebra", { answer: "T5 vertebra" }).result, "wrong");
  assert.equal(gradeTyped("CN V", { answer: "CN VI" }, { mode: "exam" }).result, "wrong");
  assert.equal(gradeTyped("CN 7", { answer: "CN 8" }, { mode: "exam", spelling: "generous" }).result, "wrong");
  // typos around the same number stay near misses
  assert.equal(gradeTyped("Brodman area 4", { answer: "Brodmann area 4" }).result, "near_miss");
  assert.equal(gradeTyped("Facal nerve", { answer: "Facial nerve", accept: ["CN VII"] }).result, "near_miss");
  // a vein abbreviation "v" is not a numeral
  assert.equal(gradeTyped("Great cerebral vien", { answer: "Great cerebral vein" }).result, "near_miss");
});

test("abduction / adduction (and -or) are opposites, not typos", () => {
  assert.equal(gradeTyped("Abductor pollicis longus", { answer: "Adductor pollicis longus" }).result, "wrong");
  assert.equal(gradeKeywords("adduction of the eye", [["abduction"], ["eye"]]).hit[0], false);
});

test("keywords: the opposite term is no hit, and a phrase must start at a word", () => {
  assert.equal(gradeKeywords("efferent fibres carry it", [["afferent"], ["fibres"]]).hit[0], false);
  assert.equal(gradeKeywords("within there", [["in the"]]).hit[0], false);
  // unchanged: stems, typos and plural phrases still hit
  assert.equal(gradeKeywords("dorsal columns carry it", [["dorsal column"]]).hit[0], true);
  assert.equal(gradeKeywords("afferant fibres", [["afferent"]]).hit[0], true);
  assert.equal(gradeKeywords("it is motoric", [["motor"]]).hit[0], true);
});

test("every dash character separates words like a hyphen", () => {
  const dashes = [0x2010, 0x2011, 0x2012, 0x2212, 0x2013, 0x2014].map((c) => String.fromCharCode(c));
  for (const d of dashes) {
    assert.equal(canon(`Edinger${d}Westphal nucleus`).s, "edinger westphal nucleus", `U+${d.charCodeAt(0).toString(16)}`);
    assert.equal(gradeTyped(`Edinger${d}Westphal nucleus`, { answer: "Edinger-Westphal nucleus" }).result, "correct");
  }
});

test("settings: guard limits and counts are clamped whole numbers", () => {
  const s = readLearnerSettings({ study: { guardCards: 0, guardMinutes: -5, newPerDay: 4.5, sprintSize: 7.2 } });
  assert.ok(s.study.guardCards >= 10 && s.study.guardMinutes >= 5, JSON.stringify(s.study));
  assert.equal(s.study.newPerDay, 5);
  assert.equal(s.study.sprintSize, 7);
  assert.equal(readLearnerSettings({}).study.guardMinutes, 30);
  assert.equal(readLearnerSettings({}).study.guardCards, 75);
});
