import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, diffOps, lev, similarity } from "./text.ts";
import { answerVariants } from "./variants.ts";
import { gradeTyped, gradeKeywords, verdictFromKeywords, nearTolerance } from "./grade.ts";

test("canon: case, accents, punctuation, hyphens, whitespace", () => {
  assert.equal(canon("  Grey-Matter,  Café ").s, "grey matter cafe");
  assert.equal(canon("Broca’s area").s, "brocas area");
});

test("lev counts a transposition as one edit", () => {
  assert.equal(lev("thalamus", "thalmaus"), 1);
  assert.equal(lev("abc", "abd"), 1);
  assert.ok(similarity("kitten", "sitting") < 0.6);
});

test("diffOps marks wrong, missing and extra letters", () => {
  const ops = diffOps("thalmus", "thalamus");
  assert.deepEqual(ops.filter((o) => o.op !== "eq").map((o) => [o.op, o.answer]), [["ins", "a"]]);
  const ops2 = diffOps("caudate nucleus", "Caudate Nucleus");
  assert.ok(ops2.every((o) => o.op === "eq"));
});

test("variants: cranial nerve Roman <-> Arabic and CN / cranial nerve", () => {
  const v = answerVariants("Facial nerve", ["CN VII"]);
  for (const want of ["CN VII", "CN 7", "cranial nerve VII", "cranial nerve 7"]) {
    assert.ok(v.some((x) => x.toLowerCase() === want.toLowerCase()), `missing ${want}`);
  }
});

test("variants: n./nucleus, a./artery, leading 'the'", () => {
  const v = answerVariants("Caudate nucleus");
  assert.ok(v.includes("Caudate n."));
  assert.ok(v.includes("the Caudate nucleus"));
  const a = answerVariants("Middle cerebral artery").map((s) => s.toLowerCase());
  assert.ok(a.includes("middle cerebral a."));
  const n = answerVariants("Oculomotor n.").map((s) => s.toLowerCase());
  assert.ok(n.includes("oculomotor nerve"));
});

test("exact answers, synonyms and the accept list are correct", () => {
  const spec = { answer: "Caudate nucleus", accept: ["caudate"] };
  assert.equal(gradeTyped("caudate nucleus", spec).result, "correct");
  assert.equal(gradeTyped("Caudate", spec).result, "correct");
  assert.equal(gradeTyped("the caudate n.", spec).result, "correct");
  assert.equal(gradeTyped("", spec).result, "empty");
});

test("cranial nerve answers in any form", () => {
  const spec = { answer: "Facial nerve", accept: ["CN VII"] };
  for (const t of ["facial nerve", "CN 7", "cn vii", "cranial nerve seven".replace("seven", "7"), "Facial n."]) {
    assert.equal(gradeTyped(t, spec).result, "correct", t);
  }
});

test("near miss scales with length: 1 typo in a long word, none allowed in a tiny one", () => {
  assert.equal(nearTolerance(3), 0);
  assert.equal(nearTolerance(8), 1);
  assert.equal(nearTolerance(15), 2);
  assert.equal(nearTolerance(30), 3);
  const spec = { answer: "Hippocampus" };
  const v = gradeTyped("hipocampus", spec);
  assert.equal(v.result, "near_miss");
  assert.equal(gradeTyped("hippocampys", spec).result, "near_miss");
  assert.equal(gradeTyped("hipocampi", spec).result, "wrong");
  assert.equal(gradeTyped("pons", { answer: "Pons" }).result, "correct");
  assert.equal(gradeTyped("pone", { answer: "Pons" }).result, "wrong");
});

test("direction words are never a typo: superior vs inferior colliculus", () => {
  const spec = { answer: "Superior colliculus" };
  assert.equal(gradeTyped("inferior colliculus", spec).result, "wrong");
  assert.equal(gradeTyped("superior colliculus", spec).result, "correct");
  assert.equal(gradeTyped("superior coliculus", spec).result, "near_miss");
});

test("another structure's exact name is wrong, not a near miss", () => {
  const known = { "fasciculus gracilis": "fasciculus-gracilis", "fasciculus cuneatus": "fasciculus-cuneatus" };
  const v = gradeTyped("fasciculus cuneatus", { answer: "Fasciculus gracilis" }, { knownNames: known, ownSlug: "fasciculus-gracilis" });
  assert.equal(v.result, "wrong");
  assert.equal(v.kind, "other_structure");
});

test("require_side: the side must be present and right", () => {
  const spec = { answer: "Left caudate nucleus", requireSide: true };
  assert.equal(gradeTyped("left caudate nucleus", spec).result, "correct");
  assert.equal(gradeTyped("L caudate nucleus", spec).result, "correct");
  const missing = gradeTyped("caudate nucleus", spec);
  assert.equal(missing.result, "wrong");
  assert.equal(missing.kind, "side");
  assert.equal(gradeTyped("right caudate nucleus", spec).kind, "side");
  // not required: a typed side is simply accepted
  assert.equal(gradeTyped("left caudate nucleus", { answer: "Caudate nucleus" }).result, "correct");
});

test("exam spelling: strict / normal / generous", () => {
  const spec = { answer: "Substantia nigra" };
  const typed = "substantia nigre";
  assert.equal(gradeTyped(typed, spec, { mode: "exam", spelling: "strict" }).points, 0);
  assert.equal(gradeTyped(typed, spec, { mode: "exam", spelling: "normal" }).points, 0.5);
  assert.equal(gradeTyped(typed, spec, { mode: "exam", spelling: "generous" }).points, 1);
  // generous gives one more edit than practice would
  assert.equal(gradeTyped("substnta nigre", spec, { mode: "exam", spelling: "generous" }).result, "correct");
  assert.equal(gradeTyped("substnta nigre", spec).result, "wrong");
});

test("keyword grading: all groups must hit; partial credit is a near miss", () => {
  const groups = [["motor", "movement"], ["cognition", "executive"]];
  assert.equal(verdictFromKeywords(gradeKeywords("Helps with movement and executive function", groups), "x").result, "correct");
  assert.equal(verdictFromKeywords(gradeKeywords("it handles movements", groups), "x").result, "wrong");
  const three = [["a1"], ["b1"], ["c1"]];
  assert.equal(verdictFromKeywords(gradeKeywords("a1 b1", three), "x").result, "near_miss");
});

import { buildKnownNames } from "./grade.ts";
test("structure-aware accept lists: a generic short form shared by several structures is refused", () => {
  const known = buildKnownNames([
    { slug: "body-of-corpus-callosum", canonical_name: "Body of corpus callosum", synonyms: ["body"] },
    { slug: "body-of-caudate", canonical_name: "Body of caudate nucleus", synonyms: ["body"] },
  ]);
  assert.equal(known["body"], "*");
  const spec = { answer: "Body of corpus callosum", accept: ["body"] };
  const v = gradeTyped("body", spec, { knownNames: known, ownSlug: "body-of-corpus-callosum" });
  assert.equal(v.result, "wrong");
  assert.equal(gradeTyped("body of corpus callosum", spec, { knownNames: known, ownSlug: "body-of-corpus-callosum" }).result, "correct");
  // an unambiguous synonym of its own structure is fine
  const k2 = buildKnownNames([{ slug: "caudate", canonical_name: "Caudate nucleus", synonyms: ["caudate"] }]);
  assert.equal(gradeTyped("caudate", { answer: "Caudate nucleus", accept: ["caudate"] }, { knownNames: k2, ownSlug: "caudate" }).result, "correct");
});
