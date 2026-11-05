import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueue, SessionQueue, solidStructures, isSolidCard, pickFollowups, phaseOf } from "./queue.ts";
import { pickBoss, bossScore, bossWon, nextBossGap } from "./boss.ts";
import { scheduleReview, newCardState, previews, formatInterval } from "./scheduling.ts";
import { guardDue, newRun, wanderThreshold } from "./focus.ts";
import { drawStations, scoreStation } from "./practical.ts";
import { readLearnerSettings, mergeLearnerSettings, typingReminderDue } from "./settings.ts";
import type { StudyCard, LadderRow } from "./types.ts";
import type { CardStateRow } from "../fsrs.ts";

const now = new Date("2026-03-01T10:00:00Z");

function card(id: string, kind: StudyCard["kind"], structureId: string | null, extra: Partial<StudyCard> = {}): StudyCard {
  return { id, slug: id, kind, topicId: "t", structureId, position: 0, prompt: "", answer: id, accept: [], requireSide: false, format: "type", followups: [], tags: [], ...extra };
}
function state(id: string, over: Partial<CardStateRow> = {}): CardStateRow {
  return { ...newCardState("u", id, now), ...over };
}

test("phaseOf: new / learning / review / future", () => {
  assert.equal(phaseOf(null, now), "new");
  assert.equal(phaseOf(state("a", { state: 2, reps: 3, due: "2026-02-28T00:00:00Z" }), now), "review");
  assert.equal(phaseOf(state("a", { state: 2, reps: 3, due: "2026-03-05T00:00:00Z" }), now), "future");
  assert.equal(phaseOf(state("a", { state: 1, reps: 1, due: "2026-03-01T09:59:00Z" }), now), "learning");
});

test("solid name: 2 clean recalls, or stability >= 3 days in Review", () => {
  const L = (s: number): LadderRow => ({ card_id: "p", step: 6, clean_streak: s, last_clean_at: null });
  assert.equal(isSolidCard(null, L(1)), false);
  assert.equal(isSolidCard(null, L(2)), true);
  assert.equal(isSolidCard(state("p", { state: 2, stability: 2.9, reps: 4 }), L(0)), false);
  assert.equal(isSolidCard(state("p", { state: 2, stability: 3, reps: 4 }), L(0)), true);
  assert.equal(isSolidCard(state("p", { state: 3, stability: 9, reps: 4 }), L(0)), false); // relearning
});

test("theory cards are held back until the name is solid; structures without a pin are open", () => {
  const cards = [card("pin1", "pin", "s1"), card("th1", "theory", "s1", { facet: "function" }), card("th2", "theory", "s2", { facet: "function" })];
  const states = new Map<string, CardStateRow>();
  const ladders = new Map<string, LadderRow>();
  let { solid, hasName } = solidStructures(cards, states, ladders);
  let q = buildQueue(cards, states, ladders, { now, newLimit: 10, reviewLimit: 10, solid, hasName });
  assert.deepEqual(q.map((e) => e.card.id).sort(), ["pin1", "th2"]);
  ladders.set("pin1", { card_id: "pin1", step: 6, clean_streak: 2, last_clean_at: null });
  ({ solid, hasName } = solidStructures(cards, states, ladders));
  q = buildQueue(cards, states, ladders, { now, newLimit: 10, reviewLimit: 10, solid, hasName });
  assert.deepEqual(q.map((e) => e.card.id).sort(), ["pin1", "th1", "th2"]);
});

test("queue: learning first, limits respected, new interleaved among reviews", () => {
  const cards: StudyCard[] = [];
  const states = new Map<string, CardStateRow>();
  for (let i = 0; i < 6; i++) {
    cards.push(card(`r${i}`, "pin", `s${i}`));
    states.set(`r${i}`, state(`r${i}`, { state: 2, reps: 3, due: "2026-02-27T00:00:00Z", stability: 5 }));
  }
  for (let i = 0; i < 4; i++) cards.push(card(`n${i}`, "pin", `sn${i}`));
  cards.push(card("L", "pin", "sl"));
  states.set("L", state("L", { state: 1, reps: 1, due: "2026-03-01T09:00:00Z" }));
  const q = buildQueue(cards, states, new Map(), { now, newLimit: 2, reviewLimit: 4, solid: new Set(), hasName: new Set(), rand: () => 0.5 });
  assert.equal(q[0].card.id, "L");
  assert.equal(q.filter((e) => e.source === "review").length, 4);
  assert.equal(q.filter((e) => e.source === "new").length, 2);
  const firstNew = q.findIndex((e) => e.source === "new");
  assert.ok(firstNew > 1 && firstNew < q.length - 1, "new cards are interleaved, not bunched at the end");
});

test("SessionQueue: learning cards return after their step, no immediate repeat, learn-ahead when empty", () => {
  const a = { card: card("a", "pin", "sa"), state: null, ladder: null, source: "new" as const };
  const b = { card: card("b", "pin", "sb"), state: null, ladder: null, source: "new" as const };
  const q = new SessionQueue([a, b]);
  const t0 = now.getTime();
  const first = q.next(t0)!;
  q.take(first);
  const st = state(first.card.id, { state: 1, reps: 1, due: new Date(t0 + 10 * 60_000).toISOString() });
  q.requeue(first, st, t0);
  const second = q.next(t0)!;
  assert.notEqual(second.card.id, first.card.id);
  q.take(second);
  // nothing pending, the learning card is 10 min away: learn-ahead window (20 min) shows it
  assert.equal(q.next(t0 + 1000)!.card.id, first.card.id);
  const tight = new SessionQueue([], 1000);
  tight.learning.push({ entry: a, due: t0 + 60_000 });
  assert.equal(tight.next(t0), null);
});

test("follow-ups: only new or due theory cards of the same structure, listed facets first", () => {
  const parent = card("pin", "pin", "s1", { followups: ["x:lesion"] });
  const theory = [card("t1", "theory", "s1", { facet: "function" }), card("t2", "theory", "s1", { facet: "lesion" }), card("t3", "theory", "s1", { facet: "supply" }), card("t4", "theory", "s9", { facet: "lesion" })];
  const states = new Map([["t3", state("t3", { state: 2, reps: 3, due: "2026-04-01T00:00:00Z" })]]);
  const f = pickFollowups(parent, theory, states, new Map(), now, new Set(), 2);
  assert.deepEqual(f.map((e) => e.card.id), ["t2", "t1"]);
  assert.ok(pickFollowups(parent, theory, states, new Map(), now, new Set(["t1", "t2"]), 2).length === 0);
});

test("boss: due hard cards only, never new; won only by a clean Good/Easy", () => {
  const hard = { card: card("h", "pin", "s"), state: state("h", { state: 2, reps: 9, lapses: 3, difficulty: 8, due: "2026-02-01T00:00:00Z" }), ladder: null, source: "review" as const };
  const easy = { card: card("e", "pin", "s2"), state: state("e", { state: 2, reps: 9, lapses: 0, difficulty: 3 }), ladder: null, source: "review" as const };
  const fresh = { card: card("n", "pin", "s3"), state: null, ladder: null, source: "new" as const };
  const f = (e: typeof hard) => ({ lapses: e.state?.lapses ?? 0, difficulty: e.state?.difficulty ?? 0, trapMisses: 0, recentAgain: 0, relearning: false });
  assert.equal(pickBoss([{ entry: easy, facts: f(easy) }, { entry: fresh, facts: { ...f(hard), lapses: 9 } }])?.card.id, undefined);
  assert.equal(pickBoss([{ entry: easy, facts: f(easy) }, { entry: hard, facts: f(hard) }])?.card.id, "h");
  assert.ok(bossScore(f(hard)) > bossScore(f(easy)));
  assert.equal(bossWon({ right: true, rating: 3, hinted: 0 }), true);
  assert.equal(bossWon({ right: true, rating: 2, hinted: 0 }), false);
  assert.equal(bossWon({ right: true, rating: 4, hinted: 1 }), false);
  for (let i = 0; i < 20; i++) {
    const g = nextBossGap();
    assert.ok(g >= 8 && g <= 12);
  }
});

test("FSRS: Again is soon, Easy is far; previews are formatted", () => {
  const row = newCardState("u", "c", now);
  const again = scheduleReview(row, 1, now).next;
  const easy = scheduleReview(row, 4, now).next;
  assert.ok(new Date(again.due).getTime() < new Date(easy.due).getTime());
  const p = previews(row, now);
  assert.ok(/m$|h$|d$/.test(p[1]) && /d$|mo$/.test(p[4]));
  assert.equal(formatInterval(30_000), "<1m");
  assert.equal(formatInterval(10 * 60_000), "10m");
  assert.equal(formatInterval(3 * 86_400_000), "3d");
  const higher = scheduleReview(row, 3, now, { retention: 0.97 }).next;
  const lower = scheduleReview(scheduleReview(row, 3, now).next, 3, new Date("2026-03-20T00:00:00Z"), { retention: 0.8 }).next;
  assert.ok(higher && lower);
});

test("focus helpers", () => {
  assert.equal(wanderThreshold(1000), 12_000);
  assert.equal(wanderThreshold(100_000), 60_000);
  const run = newRun(0);
  assert.equal(guardDue(run, 29 * 60_000), false);
  assert.equal(guardDue(run, 31 * 60_000), true);
  run.until = 5;
  run.cards = 3;
  assert.equal(guardDue(run, 99 * 60_000), false);
});

test("practical: practical-tagged pins first, one per structure, follow-ups attached, generous spelling", () => {
  const pins = [card("a", "pin", "s1", { answer: "Caudate nucleus" }), card("b", "pin", "s2", { tags: ["practical"], answer: "Putamen" }), card("a2", "pin", "s1")];
  const theory = new Map([["s2", [card("t", "theory", "s2", { facet: "function", answer: "movement" })]]]);
  const draws = drawStations(pins, theory, 5, () => 0.3);
  assert.equal(draws[0].pin.id, "b");
  assert.equal(draws.length, 2);
  assert.equal(draws[0].followups.length, 1);
  const s = scoreStation(draws[0], { typed: "putamne", followups: ["movement"] }, "generous");
  assert.equal(s.points, 2);
  const strict = scoreStation(draws[0], { typed: "putamne", followups: ["movement"] }, "strict");
  assert.equal(strict.points, 1);
});

test("settings: defaults, merge keeps foreign keys, weekly typing reminder", () => {
  const s = readLearnerSettings({ scaffold: { hints: false }, theme: "x" });
  assert.equal(s.scaffold.hints, false);
  assert.equal(s.scaffold.sounds, true);
  assert.equal(s.typing.enabled, true);
  const m = mergeLearnerSettings({ theme: "dark", scaffold: { hints: false } }, { scaffold: { ladder: false }, typing: { enabled: false, offSince: "2026-01-01T00:00:00Z" } });
  assert.equal(m.theme, "dark");
  assert.equal((m.scaffold as Record<string, boolean>).hints, false);
  assert.equal((m.scaffold as Record<string, boolean>).ladder, false);
  const t = readLearnerSettings(m).typing;
  assert.equal(t.enabled, false);
  assert.equal(typingReminderDue(t, new Date("2026-01-05T00:00:00Z")), false);
  assert.equal(typingReminderDue(t, new Date("2026-01-09T00:00:00Z")), true);
});
