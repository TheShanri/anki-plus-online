// Multi-box answers through the whole engine: first look, retype boxes, auto-submit, hints, grading, undo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StudyEngine, type AnswerPayload } from "./engine.ts";
import { SCAFFOLD_DEFAULTS, STUDY_DEFAULTS, TYPING_DEFAULTS } from "./settings.ts";
import type { StudyCard, StudyPayload } from "./types.ts";
import type { CardStateRow } from "../fsrs.ts";

function card(over: Partial<StudyCard> = {}): StudyCard {
  return {
    id: "c1", slug: "c1", kind: "theory", topicId: "t", structureId: null, position: 1, prompt: "Name the two things.", answer: "Reward and addiction", accept: [], requireSide: false, format: "type",
    followups: [], followupCards: [], tags: [], parts: [{ text: "Reward", accept: ["motivation"] }, { text: "Addiction", accept: [] }], partsOrdered: false, ...over,
  };
}

const review: CardStateRow = { user_id: "u", card_id: "c1", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };

function setup(c: StudyCard, known = true) {
  const p: StudyPayload = {
    course: { id: "11111111-1111-4111-8111-111111111111", code: "T", title: "T", slug: "t", settings: {} },
    settings: { scaffold: { ...SCAFFOLD_DEFAULTS, focus: false }, typing: { ...TYPING_DEFAULTS }, study: { ...STUDY_DEFAULTS } },
    serverNow: new Date(0).toISOString(), scope: "all", queue: [{ cardId: c.id, source: "new" }], cards: [c], structures: {},
    states: known ? { [c.id]: review } : {},
    ladders: known ? { [c.id]: { card_id: c.id, step: 6, clean_streak: 0, last_clean_at: null } } : {},
    traps: {}, trapMisses: {}, notes: {}, counts: { new: 1, learning: 0, review: 0, newDoneToday: 0, reviewsDoneToday: 0, newLeft: 9, reviewsLeft: 9 }, names: {}, units: [],
  };
  let t = 1_000_000;
  const sent: AnswerPayload[] = [];
  let n = 0;
  const e = new StudyEngine(p, { now: () => t, send: (x) => sent.push(x), emit: () => {}, uuid: () => `id-${++n}`, sessionId: "s", rand: () => 0.5 });
  const tick = (ms: number) => (t += ms);
  const type = (box: number, s: string) => {
    for (let i = 1; i <= s.length; i++) {
      e.inputBox(box, s.slice(0, i));
      tick(120);
    }
  };
  return { e, sent, tick, type };
}

test("a card with parts gets one box per part (recall); the card is not a first look when it is known", () => {
  const h = setup(card());
  h.e.start();
  const c = h.e.cur!;
  assert.equal(c.multi?.count, 2);
  assert.equal(c.isFirstLook, false);
  assert.equal(c.typer, c.multi!.boxes[0]);
});

test("auto-submit only when ALL boxes are complete; the caret moves on when a box finishes", () => {
  const h = setup(card());
  h.e.start();
  h.type(0, "Reward");
  assert.equal(h.e.phase, "prompt");
  assert.equal(h.e.cur!.multi!.active, 1); // handed on to the open box
  h.type(1, "Addiction");
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.right, true);
  assert.ok(h.e.cur!.rating >= 3);
  assert.equal(h.e.cur!.partResults?.length, 2);
  assert.equal(h.e.enterBlocked(), true); // the Enter guard after an auto-submit
  h.tick(1000);
  assert.equal(h.e.enterBlocked(), false);
  h.e.accept();
  assert.equal(h.sent[0].correct, true);
  assert.equal(h.sent[0].typed, "Reward | Addiction");
  assert.equal(h.sent[0].keystrokes.parts, 2);
});

test("unordered: the parts can be typed in either box, and an accepted form counts", () => {
  const h = setup(card());
  h.e.start();
  h.type(1, "motivation");
  assert.equal(h.e.phase, "prompt");
  h.type(0, "Addiction");
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.right, true);
});

test("ordered: the wrong order does not complete anything", () => {
  const h = setup(card({ partsOrdered: true }));
  h.e.start();
  h.type(0, "Addiction");
  assert.equal(h.e.cur!.multi!.boxes[0].state, "bad");
  h.e.submit(false);
  assert.equal(h.e.cur!.right, false);
  assert.equal(h.e.cur!.rating, 1);
});

test("one wrong box: the existing wrong flow, per-box results, a retype of every part", () => {
  const h = setup(card());
  h.e.start();
  h.type(0, "Reward");
  h.type(1, "Thalamus");
  h.e.submit(false);
  const c = h.e.cur!;
  assert.equal(c.verdict!.result, "wrong");
  assert.equal(c.right, false);
  assert.equal(c.rating, 1);
  assert.deepEqual(c.partResults!.map((r) => r.verdict.result), ["correct", "wrong"]);
  assert.equal(c.retype?.kind, "fail");
  assert.equal(c.retype?.boxes?.length, 2);
  // retype the parts in order; the caret moves on and it is done after the last
  const r = c.retype!;
  h.e.retypeInput("Reward", 0);
  assert.equal(r.typer, r.boxes![1]);
  assert.equal(r.done, false);
  h.e.retypeInput("Addiction", 1);
  assert.equal(r.done, true);
});

test("a typo in one box is a near miss (Hard) with a retype", () => {
  const h = setup(card());
  h.e.start();
  h.type(0, "Rewrd");
  h.type(1, "Addiction");
  h.e.submit(false);
  assert.equal(h.e.cur!.verdict!.result, "near_miss");
  assert.equal(h.e.cur!.rating, 2);
  assert.equal(h.e.cur!.retype?.kind, "near");
});

test("first look: boxes to type it if you know it; a reveal gives Look-then-type per box", () => {
  const h = setup(card(), false);
  h.e.start();
  const c = h.e.cur!;
  assert.equal(c.isFirstLook, true);
  assert.equal(c.multi!.boxes[0].noHints, true);
  h.e.submit(false); // Enter on nothing: reveal
  assert.equal(h.e.phase, "reveal");
  const r = h.e.cur!.retype!;
  assert.equal(r.kind, "intro");
  assert.equal(r.boxes!.length, 2);
  assert.equal(r.boxes![0].ghost(), "Reward"); // copy mode: each part visible in its own box
  assert.equal(r.boxes![1].ghost(), "Addiction");
  h.e.retypeInput("Reward", 0);
  h.e.retypeInput("Addiction", 1);
  assert.equal(r.done, true);
  assert.equal(h.e.cur!.outcome, "up");
});

test("first look: typing all parts correctly is KNEW IT", () => {
  const h = setup(card(), false);
  h.e.start();
  h.type(0, "Reward");
  h.type(1, "Addiction");
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.headline, "KNEW IT");
});

test("ghost hint follows the caret box and its narrowed target", () => {
  const h = setup(card());
  h.e.start();
  h.type(0, "Reward");
  h.e.hint(true); // the caret moved to the open box: only Addiction is left
  assert.equal(h.e.cur!.multi!.boxes[1].hinted, 1);
  assert.equal(h.e.cur!.multi!.boxes[1].ghost(), "A");
  assert.equal(h.e.cur!.multi!.boxes[0].hinted, 0);
  h.type(1, "Addiction");
  assert.ok(h.e.cur!.rating <= 2); // a hint was used
  h.e.accept();
  assert.equal(h.sent[0].hintCount, 1);
});

test("the ladder skeleton is applied per box", () => {
  const st: CardStateRow = { ...review, state: 1, reps: 1 };
  const c = card();
  const h = setup(c);
  // a card on the skeleton rung
  const p = (h.e as unknown as { payload: StudyPayload }).payload;
  p.states[c.id] = st;
  p.ladders[c.id] = { card_id: c.id, step: 2, clean_streak: 0, last_clean_at: null };
  const e2 = new StudyEngine(p, { now: () => 5, send: () => {}, emit: () => {}, uuid: () => "x", sessionId: "s", rand: () => 0.5 });
  e2.start();
  const cur = e2.cur!;
  assert.equal(cur.practice, true);
  assert.ok(cur.multi!.boxes[0].ghost().includes("_"));
  assert.ok(cur.multi!.boxes[1].ghost().includes("_"));
});

test("undo brings a multi-box card back fresh", () => {
  const h = setup(card());
  h.e.start();
  h.type(0, "Reward");
  h.type(1, "Addiction");
  h.tick(1000);
  h.e.accept();
  assert.equal(h.e.canUndo, true);
  h.e.undo();
  assert.equal(h.e.phase, "prompt");
  assert.equal(h.e.cur!.multi!.boxes[0].typed, "");
  assert.equal(h.e.cur!.multi!.count, 2);
});

test("a card without 2 parts stays a single box", () => {
  const h = setup(card({ parts: undefined }));
  h.e.start();
  assert.equal(h.e.cur!.multi, null);
  const h2 = setup(card({ parts: [{ text: "Only one", accept: [] }] }));
  h2.e.start();
  assert.equal(h2.e.cur!.multi, null);
});
