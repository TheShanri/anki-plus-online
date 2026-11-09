import { test } from "node:test";
import assert from "node:assert/strict";
import { cardKnowledge, structureMastery, rollup, knownStructures, plateOfSlug, plateScopeMatch, MASTERED_AT } from "./mastery.ts";
import type { CardStateRow } from "../fsrs.ts";
import type { LadderRow, StudyCard } from "./types.ts";

const st = (over: Partial<CardStateRow>): CardStateRow =>
  ({ card_id: "x", state: 2, stability: 1, difficulty: 5, reps: 3, lapses: 0, due: new Date().toISOString(), ...over }) as CardStateRow;
const card = (id: string, slug: string, structureId: string | null, kind: StudyCard["kind"] = "pin"): StudyCard => ({
  id, slug, kind, topicId: null, structureId, position: 0, prompt: "", answer: "", accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [],
});

test("cardKnowledge: new is zero, review scales with stability, solid counts at least as mastered", () => {
  assert.equal(cardKnowledge(null, null), 0);
  assert.equal(cardKnowledge(st({ state: 0, reps: 0 }), null), 0);
  assert.ok(Math.abs(cardKnowledge(st({ state: 2, stability: 2 }), null) - 2 / 14) < 1e-9);
  assert.equal(cardKnowledge(st({ state: 2, stability: 7 }), null), 0.7); // solid (3+ days) counts as mastered
  assert.equal(cardKnowledge(st({ state: 2, stability: 40 }), null), 1);
  assert.ok(cardKnowledge(st({ state: 1, stability: 0.5 }), null) <= 0.5);
  const lad = { card_id: "x", step: 6, clean_streak: 2, last_clean_at: null } as LadderRow;
  assert.ok(cardKnowledge(st({ state: 1, stability: 0.5 }), lad) >= MASTERED_AT);
});

test("structureMastery averages every card linked to the structure, deck and plate cards alike", () => {
  const cards = [card("a", "deck-1", "s1"), card("b", "bs-plate-pons-mid-s1", "s1"), card("c", "t-1", "s2", "theory")];
  const states = new Map([["a", st({ stability: 14 })], ["c", st({ stability: 14 })]]);
  const m = structureMastery(cards, states, new Map());
  assert.equal(m.get("s1"), 0.5); // one card at 1, the plate card still new
  assert.equal(m.get("s2"), 1);
});

test("rollup: mean and mastered flag", () => {
  assert.deepEqual(rollup([]), { mean: 0, mastered: false, done: 0, total: 0 });
  const r = rollup([1, 0.8, 0.2]);
  assert.equal(r.done, 2);
  assert.equal(r.total, 3);
  assert.equal(r.mastered, false);
  assert.equal(rollup([0.9, 0.8]).mastered, true);
});

test("knownStructures ignores the plate cards themselves", () => {
  const cards = [card("a", "deck-1", "s1"), card("b", "bs-plate-pons-mid-s1", "s1"), card("c", "bs-plate-pons-mid-s2", "s2")];
  const states = new Map([["a", st({ stability: 5 })], ["b", st({ stability: 30 })], ["c", st({ stability: 30 })]]);
  const known = knownStructures(cards, states, new Map());
  assert.equal(known.has("s1"), true); // solid from the deck card
  assert.equal(known.has("s2"), false); // only its own plate card is solid
});

test("plateOfSlug and plateScopeMatch", () => {
  assert.deepEqual(plateOfSlug("bs-plate-medulla-rostral-inferior-olivary-nucleus"), { level: "medulla-rostral", structure: "inferior-olivary-nucleus" });
  assert.equal(plateOfSlug("lab-8-io-1"), null);
  assert.equal(plateScopeMatch("bs-plate-pons-mid-x", { type: "bslevel", level: "pons-mid" }), true);
  assert.equal(plateScopeMatch("bs-plate-pons-mid-x", { type: "bslevel", level: "pons-caudal" }), false);
  assert.equal(plateScopeMatch("bs-plate-pons-caudal-x", { type: "bsregion", region: "pons" }), true);
  assert.equal(plateScopeMatch("bs-plate-midbrain-sc-x", { type: "bsregion", region: "pons" }), false);
  assert.equal(plateScopeMatch("bs-plate-midbrain-sc-x", { type: "bsall" }), true);
  assert.equal(plateScopeMatch("deck-1", { type: "bsall" }), false);
});
