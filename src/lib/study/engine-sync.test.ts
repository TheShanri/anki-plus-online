// Session flow and answer sync, from the November 2026 review (docs/CODE_REVIEW_2026-11.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { StudyEngine, excludeForFetch, type AnswerPayload } from "./engine.ts";
import { SCAFFOLD_DEFAULTS, STUDY_DEFAULTS, TYPING_DEFAULTS } from "./settings.ts";
import { beaconBatch } from "./sync.ts";
import { ladderWrite } from "./ladder.ts";
import type { LadderRow, StudyCard, StudyPayload } from "./types.ts";
import { scheduleReview, stateNeedsReplay, type CardStateRow } from "../fsrs.ts";

function card(id: string, over: Partial<StudyCard> = {}): StudyCard {
  return { id, slug: id, kind: "pin", topicId: "t", structureId: "s-" + id, position: 1, prompt: "Name the structure.", answer: id, accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [], ...over };
}

function payload(cards: StudyCard[], extra: Partial<StudyPayload> = {}): StudyPayload {
  return {
    course: { id: "11111111-1111-4111-8111-111111111111", code: "T", title: "T", slug: "t", settings: {} },
    settings: { scaffold: { ...SCAFFOLD_DEFAULTS, focus: false, boss: false }, typing: { ...TYPING_DEFAULTS }, study: { ...STUDY_DEFAULTS } },
    serverNow: new Date(0).toISOString(),
    scope: "all",
    queue: cards.map((c) => ({ cardId: c.id, source: "review" as const })),
    cards,
    structures: {},
    states: {},
    ladders: {},
    traps: {},
    trapMisses: {},
    notes: {},
    counts: { new: 0, learning: 0, review: cards.length, newDoneToday: 0, reviewsDoneToday: 0, newLeft: 99, reviewsLeft: 99 },
    names: {},
    units: [],
    ...extra,
  };
}

const T0 = Date.UTC(2026, 10, 9, 12);
function reviewState(id: string): CardStateRow {
  return { user_id: "me", card_id: id, due: new Date(T0 - 86_400_000).toISOString(), stability: 30, difficulty: 5, elapsed_days: 30, scheduled_days: 30, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(T0 - 31 * 86_400_000).toISOString() };
}
const recall = (id: string): LadderRow => ({ card_id: id, step: 6, clean_streak: 3, last_clean_at: null });
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test("the last card answered while the next batch is still loading waits for it instead of ending the session", async () => {
  let t = T0;
  let release!: (p: StudyPayload | null) => void;
  let calls = 0;
  const first = payload([card("Thalamus")], { states: { Thalamus: reviewState("Thalamus") }, ladders: { Thalamus: recall("Thalamus") } });
  const more = payload([card("Pons")], { states: { Pons: reviewState("Pons") }, ladders: { Pons: recall("Pons") } });
  const e = new StudyEngine(first, {
    now: () => t,
    send: () => {},
    emit: () => {},
    uuid: () => `id-${t}`,
    sessionId: "s",
    rand: () => 0.5,
    fetchMore: () => {
      calls++;
      return calls === 1 ? new Promise((r) => (release = r)) : Promise.resolve(null);
    },
  });
  e.start(); // one card left (< 8): the next batch starts loading at once
  await flush();
  assert.equal(e.cur?.card.id, "Thalamus");
  for (const s of ["T", "Th", "Tha", "Thal", "Thala", "Thalam", "Thalamu", "Thalamus"]) {
    t += 150;
    e.input(s);
  }
  assert.equal(e.phase, "reveal");
  t += 1000;
  e.accept(); // the queue is now empty, the batch is still on its way
  await flush();
  assert.notEqual(e.phase, "done", "the session ended while cards were still loading");
  release(more);
  await flush();
  assert.equal(e.cur?.card.id, "Pons");
  assert.equal(e.phase, "prompt");
});

test("pagehide beacons only what can be stored in any order: no second answer to one card, undo only first", () => {
  const a = (clientId: string, cardId: string) => ({ clientId, cardId }) as unknown as AnswerPayload;
  const u = (clientId: string, cardId: string) => ({ undo: true as const, clientId, cardId, state: null, ladder: null });
  // two answers to the same card (a learning step) would race and the second could be computed from the stale state
  assert.deepEqual(beaconBatch([a("1", "x"), a("2", "y"), a("3", "x"), a("4", "z")]).map((i) => i.clientId), ["1", "2"]);
  // an undo must not overtake the answer it takes back
  assert.deepEqual(beaconBatch([a("1", "x"), u("1", "x")]).map((i) => i.clientId), ["1"]);
  assert.deepEqual(beaconBatch([u("1", "x"), a("2", "y")]).map((i) => i.clientId), ["1", "2"]);
  assert.equal(beaconBatch(Array.from({ length: 30 }, (_, i) => a(String(i), "c" + i))).length, 10);
});

test("the server's ladder write matches what the engine keeps, also for self-graded cards (typing off)", async () => {
  const cases: Array<{ name: string; typing: boolean; grade?: 1 | 2 | 3 | 4; ladder: LadderRow }> = [
    { name: "typing off, recalled well", typing: false, grade: 3, ladder: { card_id: "Insula", step: 2, clean_streak: 1, last_clean_at: null } },
    { name: "typing off, forgot", typing: false, grade: 1, ladder: { card_id: "Insula", step: 2, clean_streak: 1, last_clean_at: null } },
    { name: "typing off, hard", typing: false, grade: 2, ladder: { card_id: "Insula", step: 2, clean_streak: 1, last_clean_at: null } },
    { name: "typing on, recall rung", typing: true, ladder: { card_id: "Insula", step: 6, clean_streak: 1, last_clean_at: null } },
  ];
  for (const k of cases) {
    let t = T0;
    const sent: AnswerPayload[] = [];
    const p = payload([card("Insula")], { states: { Insula: reviewState("Insula") }, ladders: { Insula: k.ladder } });
    p.settings.typing.enabled = k.typing;
    const e = new StudyEngine(p, { now: () => t, send: (x) => sent.push(x), emit: () => {}, uuid: () => "u", sessionId: "s", rand: () => 0.5 });
    e.start();
    await flush();
    if (k.typing) {
      for (const s of ["I", "In", "Ins", "Insu", "Insul", "Insula"]) {
        t += 150;
        e.input(s);
      }
    } else e.submit(false);
    t += 500;
    e.accept(k.grade);
    const client = e.ladders.get("Insula")!;
    const server = ladderWrite({ step: k.ladder.step, clean_streak: k.ladder.clean_streak }, sent[0]);
    const stored = server ?? { step: k.ladder.step, clean_streak: k.ladder.clean_streak };
    assert.deepEqual({ step: stored.step, clean_streak: stored.clean_streak }, { step: client.step, clean_streak: client.clean_streak }, k.name);
  }
});

test("a retried answer whose state write was lost is replayed once, never twice", () => {
  const before = reviewState("Insula");
  const at = new Date(T0);
  const { next } = scheduleReview(before, 3, at);
  // the log exists, the state is still the one from before it: replay
  assert.equal(stateNeedsReplay(before.last_review, at.toISOString()), true);
  // no state at all (a new card's first answer): replay
  assert.equal(stateNeedsReplay(null, at.toISOString()), true);
  // the state carries this review (PostgREST's timestamp format): applied, leave it
  assert.equal(stateNeedsReplay(next.last_review!.replace("Z", "+00:00"), at.toISOString()), false);
  // a later answer has been applied since: leave it
  assert.equal(stateNeedsReplay(new Date(T0 + 60_000).toISOString(), at.toISOString()), false);
});

test("the exclude list of the next batch stays bounded however long the session runs", () => {
  const answered = new Set(Array.from({ length: 1000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`));
  const queued = ["q1", "q2"];
  const ex = excludeForFetch(answered, queued);
  assert.ok(ex.includes("q1") && ex.includes("q2"));
  assert.ok(ex.includes(`00000000-0000-4000-8000-${String(999).padStart(12, "0")}`), "the latest answer is excluded");
  assert.ok(!ex.includes(`00000000-0000-4000-8000-${String(0).padStart(12, "0")}`), "an answer from long ago is not");
  // fits comfortably in a URL (Vercel: 14 KB)
  assert.ok(ex.join(",").length < 8_000, String(ex.join(",").length));
});
