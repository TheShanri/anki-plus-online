import { test } from "node:test";
import assert from "node:assert/strict";
import { StudyEngine } from "./engine.ts";
import { SCAFFOLD_DEFAULTS, STUDY_DEFAULTS, TYPING_DEFAULTS } from "./settings.ts";
import type { StudyCard, StudyPayload } from "./types.ts";

function plateCard(): StudyCard {
  return {
    id: "c1", slug: "bs-plate-pons-mid-red-nucleus", kind: "pin", topicId: "t", structureId: "s1", position: 1, prompt: "Name the highlighted structure.",
    answer: "Red nucleus", accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [],
    image: { key: "plate:pons-mid", plate: { level: "pons-mid", region: "red-nucleus" } },
  };
}
function payload(known?: string[]): StudyPayload {
  const cards = [plateCard()];
  return {
    course: { id: "11111111-1111-4111-8111-111111111111", code: "T", title: "T", slug: "t", settings: {} },
    settings: { scaffold: { ...SCAFFOLD_DEFAULTS, focus: false }, typing: { ...TYPING_DEFAULTS }, study: { ...STUDY_DEFAULTS } },
    serverNow: new Date(0).toISOString(),
    scope: "bslevel:pons-mid",
    queue: [{ cardId: "c1", source: "new" as const }],
    cards,
    structures: { s1: { id: "s1", slug: "red-nucleus", name: "Red nucleus", synonyms: [], region: null, info: {} } },
    states: {}, ladders: {}, traps: {}, trapMisses: {}, notes: {},
    counts: { new: 1, learning: 0, review: 0, newDoneToday: 0, reviewsDoneToday: 0, newLeft: 99, reviewsLeft: 99 },
    names: {}, units: [], known,
  };
}
function engine(p: StudyPayload) {
  let t = 1_000_000;
  let n = 0;
  return new StudyEngine(p, { now: () => t, send: () => {}, emit: () => {}, uuid: () => `id-${++n}`, sessionId: "s", rand: () => 0.5 });
}

test("a new plate card is a first look when the deck does not know the structure yet", async () => {
  const e = engine(payload());
  e.start();
  await Promise.resolve();
  assert.equal(e.cur!.isFirstLook, true);
  assert.equal(e.cur!.step, 0);
});

test("a new plate card of a structure the deck already made solid is a quick known-check, from memory", async () => {
  const e = engine(payload(["s1"]));
  e.start();
  await Promise.resolve();
  assert.equal(e.cur!.isFirstLook, false);
  assert.equal(e.cur!.step, 6);
  assert.equal(e.cur!.practice, false);
});
