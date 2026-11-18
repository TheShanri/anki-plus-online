import { test } from "node:test";
import assert from "node:assert/strict";
import { answerStyle, applyAnswerStyle, keywordMarks, keywordTrack, vocabularyOf } from "./answerstyle.ts";
import { Typer } from "./typer.ts";
import { toStudyCard } from "./types.ts";
import { StudyEngine, type AnswerPayload } from "./engine.ts";
import { SCAFFOLD_DEFAULTS, STUDY_DEFAULTS, TYPING_DEFAULTS } from "./settings.ts";
import type { LadderRow, StudyCard, StudyPayload } from "./types.ts";
import type { CardStateRow } from "../fsrs.ts";
import type { FeedbackName } from "../feedback/events.ts";

const VTA = { answer: "Ventral tegmental area", accept: [] as string[], keywords: [["ventral tegmental", "VTA"]] };

test("a term answer on a keywords card is typed out; its keyword alternatives become accepted forms", () => {
  const s = answerStyle(VTA);
  assert.equal(s.style, "term");
  assert.ok(s.style === "term" && s.accept.includes("VTA"));
  const c = applyAnswerStyle({ ...VTA, format: "keywords" });
  assert.equal(c.format, "type");
  assert.deepEqual(c.keywords, VTA.keywords); // kept: the grader falls back to them
});

test("explanatory answers keep free text; a term heading an explanation is typed out when it carries every key idea", () => {
  assert.equal(answerStyle({ answer: "Fine distal movements (e.g. fingers) are lost; gross body movements are preserved", accept: [], keywords: [["fine"], ["gross"]] }).style, "free");
  assert.equal(answerStyle({ answer: "Relay of auditory information to the primary auditory cortex", accept: [], keywords: [["auditory"]] }).style, "free");
  const head = answerStyle({ answer: "Muscle spindle: stretch receptor", accept: [], keywords: [["spindle"]] });
  assert.equal(head.style, "term");
  assert.ok(head.style === "term" && head.accept.includes("Muscle spindle"));
});

test("a short list whose items answer the keyword groups one to one becomes one box per item", () => {
  const s = answerStyle({ answer: "Raphe nuclei and locus coeruleus", accept: [], keywords: [["raphe"], ["locus coeruleus", "coeruleus"]] });
  assert.equal(s.style, "parts");
  assert.ok(s.style === "parts" && s.parts.length === 2 && s.parts[1].text === "locus coeruleus");
});

test("toStudyCard derives the format at load (no seed needed)", () => {
  const c = toStudyCard({ id: "x", slug: "x", kind: "theory", topic_id: null, structure_id: null, position: 1, content: { prompt: "Which midbrain area provides dopamine to the nucleus accumbens?", format: "keywords", answer: "Ventral tegmental area", keywords: [["ventral tegmental", "VTA"]] } });
  assert.equal(c.format, "type");
  assert.ok(c.accept.includes("VTA"));
});

test("keyword lenience: a phrasing the keywords accept is never a mistype; a misspelling still is", () => {
  const groups = [["reward", "decision", "value"]];
  const vocab = vocabularyOf({ answer: "Reward valuation", accept: [], keywords: groups });
  assert.deepEqual(keywordTrack("decision making", groups, vocab), { okEnd: 15, done: true });
  assert.equal(keywordTrack("val", groups, vocab).okEnd, 3); // starts a card word
  assert.equal(keywordTrack("rewqrd ", groups, vocab).okEnd, 0); // a typo
});

test("the live box: a keyword alternative tracks green, a typo goes red at the wrong letter", () => {
  const t = new Typer({ variants: ["Reward valuation", "decision"], now: 0 });
  const groups = [["reward", "decision", "value"]];
  const vocab = vocabularyOf({ answer: "Reward valuation", accept: [], keywords: groups });
  t.lenient = (v) => keywordTrack(v, groups, vocab);
  t.set("decision m", 1);
  assert.equal(t.state, "track");
  assert.equal(t.typedOk, 10);
  assert.equal(t.done, true);
  t.set("rewx", 2);
  assert.equal(t.state, "bad");
  assert.equal(t.typedOk, 3);
  assert.equal(t.typos, 1);
});

test("free text: key ideas are highlighted where they were typed", () => {
  const m = keywordMarks("The raphe nuclei and the coeruleus", [["raphe"], ["locus coeruleus", "coeruleus"], ["serotonin"]]);
  assert.deepEqual(m.groups.map((g) => g.hit), [true, true, false]);
  assert.deepEqual(m.spans, [[4, 9], [25, 34]]);
});

// ------------------------------------------------------------------ engine: the dopamine card, typed out live
const T0 = Date.UTC(2026, 10, 18, 12);
const review = (id: string): CardStateRow => ({ user_id: "me", card_id: id, due: new Date(T0 - 86_400_000).toISOString(), stability: 30, difficulty: 5, elapsed_days: 30, scheduled_days: 30, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: new Date(T0 - 31 * 86_400_000).toISOString() });
const recall = (id: string): LadderRow => ({ card_id: id, step: 6, clean_streak: 3, last_clean_at: null });

function harness(card: StudyCard) {
  let t = T0;
  const sent: AnswerPayload[] = [];
  const events: FeedbackName[] = [];
  const p: StudyPayload = {
    course: { id: "11111111-1111-4111-8111-111111111111", code: "T", title: "T", slug: "t", settings: {} },
    settings: { scaffold: { ...SCAFFOLD_DEFAULTS, focus: false }, typing: { ...TYPING_DEFAULTS }, study: { ...STUDY_DEFAULTS } },
    serverNow: new Date(T0).toISOString(),
    scope: "all",
    queue: [{ cardId: card.id, source: "review" as const }],
    cards: [card],
    structures: {},
    states: { [card.id]: review(card.id) },
    ladders: { [card.id]: recall(card.id) },
    traps: {},
    trapMisses: {},
    notes: {},
    counts: { new: 0, learning: 0, review: 1, newDoneToday: 0, reviewsDoneToday: 0, newLeft: 99, reviewsLeft: 99 },
    names: {},
    units: [],
  };
  const e = new StudyEngine(p, { now: () => t, send: (x) => sent.push(x), emit: (n) => void events.push(n), uuid: () => "u", sessionId: "s", rand: () => 0.5 });
  const type = (s: string, from = "") => {
    for (let i = from.length + 1; i <= s.length; i++) {
      e.input(s.slice(0, i));
      t += 120;
    }
  };
  return { e, sent, events, type };
}

const dopamine = () => toStudyCard({ id: "vta", slug: "vta", kind: "theory", topic_id: null, structure_id: null, position: 1, content: { prompt: "Which midbrain area provides dopamine to the nucleus accumbens?", format: "keywords", answer: "Ventral tegmental area", keywords: [["ventral tegmental", "VTA"]] } });

test("the dopamine card is a live type-out: a tick per right letter, a typo sound on a wrong one, keystrokes do not repaint the card", () => {
  const h = harness(dopamine());
  h.e.start();
  assert.equal(h.e.cur!.mode, "type");
  const v0 = h.e.version;
  h.type("Ventrx");
  assert.equal(h.e.version, v0); // keystrokes only bump keyVersion
  assert.equal(h.events.filter((n) => n === "key").length, 5);
  assert.equal(h.events.filter((n) => n === "typo").length, 1);
  h.e.input("Ventr"); // a deletion: no tick
  assert.equal(h.events.filter((n) => n === "key").length, 5);
  h.type("Ventral tegmental area", "Ventr");
  assert.equal(h.e.phase, "reveal"); // auto-submits on the last letter
  assert.equal(h.e.cur!.right, true);
});

test("the dopamine card accepts VTA, and a keyword phrasing via the keyword fallback", () => {
  const a = harness(dopamine());
  a.e.start();
  a.type("VTA");
  assert.equal(a.e.phase, "reveal");
  assert.equal(a.e.cur!.right, true);
  const b = harness(dopamine());
  b.e.start();
  b.type("the ventral tegmental");
  b.e.submit(false);
  assert.equal(b.e.cur!.right, true);
});
