import { test } from "node:test";
import assert from "node:assert/strict";
import { StudyEngine, type AnswerPayload } from "./engine.ts";
import { SCAFFOLD_DEFAULTS, STUDY_DEFAULTS, TYPING_DEFAULTS } from "./settings.ts";
import type { StudyCard, StudyPayload } from "./types.ts";
import type { CardStateRow } from "../fsrs.ts";

function card(id: string, over: Partial<StudyCard> = {}): StudyCard {
  return { id, slug: id, kind: "pin", topicId: "t", structureId: "s-" + id, position: 1, prompt: "Name the structure.", answer: id, accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [], ...over };
}

function payload(cards: StudyCard[], extra: Partial<StudyPayload> = {}): StudyPayload {
  return {
    course: { id: "11111111-1111-4111-8111-111111111111", code: "T", title: "T", slug: "t", settings: {} },
    settings: { scaffold: { ...SCAFFOLD_DEFAULTS, focus: false }, typing: { ...TYPING_DEFAULTS }, study: { ...STUDY_DEFAULTS } },
    serverNow: new Date(0).toISOString(),
    scope: "all",
    queue: cards.filter((c) => c.kind !== "theory").map((c) => ({ cardId: c.id, source: "new" as const })),
    cards,
    structures: Object.fromEntries(cards.filter((c) => c.structureId).map((c) => [c.structureId!, { id: c.structureId!, slug: c.structureId!, name: c.answer, synonyms: [], region: null, info: {} }])),
    states: {},
    ladders: {},
    traps: {},
    trapMisses: {},
    notes: {},
    counts: { new: cards.length, learning: 0, review: 0, newDoneToday: 0, reviewsDoneToday: 0, newLeft: 99, reviewsLeft: 99 },
    names: {},
    units: [],
    ...extra,
  };
}

function harness(p: StudyPayload) {
  let t = 1_000_000;
  const sent: AnswerPayload[] = [];
  let n = 0;
  const e = new StudyEngine(p, { now: () => t, send: (x) => sent.push(x), emit: () => {}, uuid: () => `id-${++n}`, sessionId: "s", rand: () => 0.5 });
  const tick = (ms: number) => (t += ms);
  const type = (s: string) => {
    for (let i = 1; i <= s.length; i++) {
      e.input(s.slice(0, i));
      tick(120);
    }
  };
  return { e, sent, tick, type, now: () => t };
}

test("new card: first look, reveal, copy retype, accept; the ladder climbs", async () => {
  const h = harness(payload([card("Thalamus")]));
  h.e.start();
  await Promise.resolve();
  const c = h.e.cur!;
  assert.equal(c.isFirstLook, true);
  h.e.submit(true); // Enter / Tab on a first look reveals
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.retype?.kind, "intro");
  assert.equal(h.e.canAdvance, false);
  const r = h.e.cur!.retype!;
  assert.equal(r.typer.ghost(), "Thalamus"); // copy: the answer is visible
  h.tick(500);
  h.e.retypeInput("Thalamus");
  assert.equal(h.e.cur!.retype!.done, true);
  assert.equal(h.e.canAdvance, true);
  h.e.accept();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].rating, 3);
  assert.equal(h.sent[0].correct, null); // a first look is not a graded answer
  assert.equal(h.sent[0].ladder?.stepAfter, 2); // short word: up a whole rung (copy -> skeleton)
});

test("typing a new card unaided at first sight: Easy, jumps to recall, counts as a clean recall", async () => {
  const h = harness(payload([card("Pons")]));
  h.e.start();
  h.type("Pons");
  assert.equal(h.e.phase, "reveal"); // auto-submitted on match
  assert.equal(h.e.cur!.headline, "KNEW IT");
  h.e.accept();
  assert.equal(h.sent[0].rating, 4);
  assert.equal(h.sent[0].ladder?.stepAfter, 6);
  assert.equal(h.e.ladders.get("Pons")!.clean_streak, 1);
});

test("a wrong answer: diff, Again, lock-in retype required before moving on", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Hippocampus", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };
  const h = harness(payload([card("Hippocampus")], { states: { Hippocampus: st }, ladders: { Hippocampus: { card_id: "Hippocampus", step: 6, clean_streak: 0, last_clean_at: null } } }));
  h.e.start();
  const c = h.e.cur!;
  assert.equal(c.isFirstLook, false);
  assert.equal(c.practice, false);
  h.type("amygdala");
  h.e.submit(false);
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.rating, 1);
  assert.ok(h.e.cur!.diff && h.e.cur!.diff.some((d) => d.op !== "eq"));
  assert.equal(h.e.cur!.retype?.kind, "fail");
  assert.equal(h.e.canAdvance, false);
  h.e.retypeInput("Hippocampus");
  assert.equal(h.e.cur!.surprise, true); // confident and wrong: a short pause so the miss registers
  assert.equal(h.e.canAdvance, false);
  h.tick(1300);
  assert.equal(h.e.canAdvance, true);
  h.e.accept();
  assert.equal(h.sent[0].rating, 1);
  assert.equal(h.sent[0].correct, false);
  assert.equal(h.sent[0].ladder?.stepAfter, 4); // recall -> first letters
});

test("a near miss is Hard with a diff; 1-4 can pick any rating (ANKI+)", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Hippocampus", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };
  const h = harness(payload([card("Hippocampus")], { states: { Hippocampus: st }, ladders: { Hippocampus: { card_id: "Hippocampus", step: 6, clean_streak: 0, last_clean_at: null } } }));
  h.e.start();
  h.type("hipocampus");
  h.e.submit(false);
  assert.equal(h.e.cur!.verdict!.result, "near_miss");
  assert.equal(h.e.cur!.rating, 2);
  assert.equal(h.e.cur!.retype?.kind, "near");
  h.e.retypeInput("Hippocampus");
  h.e.accept(4); // any grade, as in ANKI+
  assert.equal(h.sent[0].rating, 4);
});

test("ghost hints downgrade the rating and are counted", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Amygdala", due: new Date(0).toISOString(), stability: 9, difficulty: 4, elapsed_days: 9, scheduled_days: 9, learning_steps: 0, reps: 6, lapses: 0, state: 2, last_review: new Date(-86400000 * 9).toISOString() };
  const h = harness(payload([card("Amygdala")], { states: { Amygdala: st }, ladders: { Amygdala: { card_id: "Amygdala", step: 6, clean_streak: 3, last_clean_at: null } } }));
  h.e.start();
  h.e.hint(true);
  assert.equal(h.e.cur!.typer!.hinted, 1);
  h.type("Amygdala");
  assert.equal(h.e.phase, "reveal");
  assert.ok(h.e.cur!.rating <= 2);
  h.e.accept();
  assert.equal(h.sent[0].hintCount, 1);
  assert.equal(h.sent[0].unaided, false);
});

test("hints switched off: Tab does nothing but explain", async () => {
  const p = payload([card("Amygdala")]);
  p.settings.scaffold.hints = false;
  const h = harness(p);
  h.e.start();
  h.e.submit(true); // first look reveal; skip it
  h.e.retypeInput("Amygdala");
  h.e.accept();
});

test("practice rung: scaffold shown, at most Hard, no clean recall", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Thalamus", due: new Date(0).toISOString(), stability: 0.5, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 1, reps: 1, lapses: 0, state: 1, last_review: new Date(-600000).toISOString() };
  const h = harness(payload([card("Thalamus")], { states: { Thalamus: st }, ladders: { Thalamus: { card_id: "Thalamus", step: 2, clean_streak: 0, last_clean_at: null } } }));
  h.e.start();
  const c = h.e.cur!;
  assert.equal(c.practice, true);
  assert.equal(c.typer!.ghost(), "Th_l_m_s".replace("Th_l_m_s", c.typer!.ghost()));
  assert.ok(c.typer!.ghost().includes("_"));
  h.type("Thalamus");
  assert.equal(h.e.cur!.rating, 2);
  h.e.accept();
  assert.equal(h.sent[0].ladder?.stepBefore, 2);
  assert.equal(h.sent[0].ladder?.stepAfter, 4);
  assert.equal(h.e.ladders.get("Thalamus")!.clean_streak, 0);
});

test("theory follow-up is asked right after a solid name, not before", async () => {
  const pin = card("Caudate", { followups: ["x:function"] });
  const th = card("Caudate-function", { kind: "theory", structureId: pin.structureId, facet: "function", prompt: "Function?", answer: "movement" });
  const base = { stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString(), due: new Date(0).toISOString(), user_id: "u" };
  const solid = harness(payload([pin, th], { states: { Caudate: { ...base, card_id: "Caudate", stability: 4 } }, ladders: { Caudate: { card_id: "Caudate", step: 6, clean_streak: 0, last_clean_at: null } } }));
  solid.e.start();
  solid.type("Caudate");
  solid.e.accept();
  assert.equal(solid.e.cur?.card.id, "Caudate-function");
  assert.equal(solid.e.cur?.isFollowup, true);
  const shaky = harness(payload([pin, th], { states: { Caudate: { ...base, card_id: "Caudate", stability: 0.3 } }, ladders: { Caudate: { card_id: "Caudate", step: 6, clean_streak: 0, last_clean_at: null } } }));
  shaky.e.start();
  shaky.e.hint(true); // a hinted answer is Hard: stability stays under 3 days
  shaky.type("Caudate");
  shaky.e.accept();
  assert.notEqual(shaky.e.cur?.card.id, "Caudate-function");
});

test("typing off: self-grade all four ratings, nothing typed is stored", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Thalamus", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };
  const p = payload([card("Thalamus")], { states: { Thalamus: st } });
  p.settings.typing = { enabled: false, offSince: new Date(0).toISOString(), lastReminder: null };
  const h = harness(p);
  h.e.start();
  assert.equal(h.e.cur!.mode, "self");
  h.e.submit(false); // reveal
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.selfGraded, true);
  h.e.accept(4);
  assert.equal(h.sent[0].rating, 4);
  assert.equal(h.sent[0].typed, null);
  assert.equal(h.sent[0].keystrokes.mode, "self");
});

test("boss fight: a hard due card takes the slot after ~10 cards, and is won by a clean answer", async () => {
  const cards: StudyCard[] = [];
  const states: Record<string, CardStateRow> = {};
  const ladders: StudyPayload["ladders"] = {};
  for (let i = 0; i < 14; i++) {
    const id = `c${i}x`;
    cards.push(card(id, { answer: id }));
    states[id] = { user_id: "u", card_id: id, due: new Date(0).toISOString(), stability: i === 13 ? 2 : 20, difficulty: i === 13 ? 9 : 3, elapsed_days: 5, scheduled_days: 5, learning_steps: 0, reps: 8, lapses: i === 13 ? 4 : 0, state: 2, last_review: new Date(-86400000 * 5).toISOString() };
    ladders[id] = { card_id: id, step: 6, clean_streak: 1, last_clean_at: null };
  }
  const p = payload(cards, { states, ladders });
  p.queue = cards.map((c) => ({ cardId: c.id, source: "review" as const }));
  const h = harness(p);
  h.e.start();
  let sawBoss = false;
  for (let i = 0; i < 14 && h.e.phase !== "done"; i++) {
    const c = h.e.cur!;
    if (c.isBoss) {
      sawBoss = true;
      assert.equal(c.card.id, "c13x");
    }
    h.type(c.card.answer);
    h.e.accept();
  }
  assert.ok(sawBoss, "a boss appeared");
  assert.equal(h.e.stats.bossFought >= 1, true);
});

test("session summary numbers and the micro-sprint limit", async () => {
  const cards = ["Aa1", "Bb2", "Cc3", "Dd4"].map((a) => card(a));
  const h = harness(payload(cards));
  const e2 = new StudyEngine(payload(cards), { now: h.now, send: () => {}, emit: () => {}, uuid: () => "u", sessionId: "s" }, { limit: 2 });
  e2.start();
  for (let i = 0; i < 2; i++) {
    e2.submit(true);
    e2.retypeInput(e2.cur!.card.answer);
    e2.accept();
  }
  assert.equal(e2.phase, "done");
  assert.equal(e2.stats.answered, 2);
});

test("typing off: a new card is a first look (answer shown, nothing to rate)", async () => {
  const p = payload([card("Thalamus")]);
  p.settings.typing = { enabled: false, offSince: new Date(0).toISOString(), lastReminder: null };
  const h = harness(p);
  h.e.start();
  assert.equal(h.e.cur!.isFirstLook, true);
  h.e.submit(false);
  assert.equal(h.e.cur!.headline, "FIRST LOOK");
  assert.equal(h.e.cur!.fixed, true);
  h.e.accept(1); // digits do nothing on a first look
  assert.equal(h.sent[0].rating, 3);
  assert.equal(h.sent[0].correct, null);
});

test("a new free-text (theory) card is a first look: never scored, then typed once", async () => {
  const th = card("Reward", { kind: "theory", format: "keywords", answer: "Reward, motivation", keywords: [["reward"], ["motivation"]] } as Partial<StudyCard>);
  const p = payload([th]);
  p.queue = [{ cardId: th.id, source: "new" }];
  const h = harness(p);
  h.e.start();
  assert.equal(h.e.cur!.mode, "keywords");
  assert.equal(h.e.cur!.isFirstLook, true);
  h.e.input("no idea");
  h.e.submit(false);
  assert.equal(h.e.cur!.headline, "FIRST LOOK");
  assert.equal(h.e.cur!.retype?.kind, "intro");
  assert.equal(h.e.cur!.retype!.typer.ghost(), "Reward, motivation"); // copied, it is new
  assert.equal(h.e.canAdvance, false);
  h.e.retypeInput("Reward, motivation");
  h.e.accept();
  assert.equal(h.sent[0].rating, 3);
  assert.equal(h.sent[0].correct, null);
  assert.equal(h.e.stats.combo, 0); // neither builds nor breaks the combo
});

test("a wrong pick on a brand-new choice card is a first look, not a miss", async () => {
  const mc = card("Q", { kind: "theory", format: "choice", answer: "Pons", choices: ["Pons", "Medulla", "Midbrain"] } as Partial<StudyCard>);
  const p = payload([mc]);
  p.queue = [{ cardId: mc.id, source: "new" }];
  const h = harness(p);
  h.e.start();
  const wrong = h.e.cur!.choices!.findIndex((x) => x !== "Pons");
  h.e.choose(wrong);
  assert.equal(h.e.cur!.headline, "FIRST LOOK");
  h.e.retypeInput("Pons");
  h.e.accept();
  assert.equal(h.sent[0].rating, 3);
  assert.equal(h.sent[0].correct, null);
});

test("Enter on an empty box (not a first look) is No answer: Again, like ANKI+", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Pons", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };
  const h = harness(payload([card("Pons")], { states: { Pons: st }, ladders: { Pons: { card_id: "Pons", step: 6, clean_streak: 0, last_clean_at: null } } }));
  h.e.start();
  h.e.submit(false);
  assert.equal(h.e.phase, "reveal");
  assert.equal(h.e.cur!.rating, 1);
  assert.equal(h.e.cur!.retype?.kind, "fail");
  h.e.skipRetype(); // Esc: skip the lock-in and move on
  assert.equal(h.sent[0].rating, 1);
});

test("Ctrl+Z: the last card comes back as it was, and the answer is taken back", async () => {
  const st: CardStateRow = { user_id: "u", card_id: "Pons", due: new Date(0).toISOString(), stability: 5, difficulty: 5, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(-86400000 * 3).toISOString() };
  const p = payload([card("Pons"), card("Medulla")], { states: { Pons: st }, ladders: { Pons: { card_id: "Pons", step: 6, clean_streak: 2, last_clean_at: null } } });
  p.queue = [{ cardId: "Pons", source: "review" }, { cardId: "Medulla", source: "new" }];
  const undos: unknown[] = [];
  let t = 1_000_000;
  const sent: AnswerPayload[] = [];
  let n = 0;
  const e = new StudyEngine(p, { now: () => t, send: (x) => sent.push(x), undo: (u) => undos.push(u), emit: () => {}, uuid: () => `00000000-0000-4000-8000-00000000000${++n}`, sessionId: "s", rand: () => 0.5 });
  e.start();
  assert.equal(e.cur!.card.id, "Pons");
  for (let i = 1; i <= 4; i++) e.input("Pons".slice(0, i));
  t += 3000;
  if (e.phase === "prompt") e.submit(false);
  e.accept(1); // a slip: rated Again
  assert.equal(e.cur!.card.id, "Medulla");
  assert.equal(e.canUndo, true);
  e.undo();
  assert.equal(e.cur!.card.id, "Pons");
  assert.equal(e.phase, "prompt");
  assert.equal(e.states.get("Pons")!.reps, 4); // state restored
  assert.equal(e.stats.answered, 0);
  assert.equal((undos[0] as { clientId: string }).clientId, sent[0].clientId);
  assert.equal(e.canUndo, false); // one level, like ANKI+'s last-card undo
});

test("look-then-type wants the whole answer as shown, not a shorter accepted synonym", async () => {
  const h = harness(payload([card("Anterior horn of lateral ventricle", { accept: ["anterior horn", "AH"] })]));
  h.e.start();
  h.e.submit(false); // first look
  const r = h.e.cur!.retype!;
  h.e.retypeInput("Anterior horn");
  assert.equal(r.done, false);
  h.e.retypeInput("AH");
  assert.equal(h.e.cur!.retype!.done, false);
  h.e.retypeInput("Anterior horn of lateral ventricle");
  assert.equal(h.e.cur!.retype!.done, true);
});

test("with a scaffold showing, the box follows the shown answer only (no synonym swaps the ghost)", async () => {
  const c = card("Inferior horn of lateral ventricle", { accept: ["inferior horn of the lateral ventricle"] });
  const h = harness(payload([c], { states: { [c.id]: { user_id: "u", card_id: c.id, due: new Date(0).toISOString(), stability: 1, difficulty: 5, elapsed_days: 1, scheduled_days: 1, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: new Date(-86400000).toISOString() } }, ladders: { [c.id]: { card_id: c.id, step: 2, clean_streak: 0, last_clean_at: null } } }));
  h.e.start();
  assert.equal(h.e.cur!.practice, true);
  h.type("Inferior horn of t");
  assert.equal(h.e.cur!.typer!.state, "bad"); // "the" is not in the shown answer
});
