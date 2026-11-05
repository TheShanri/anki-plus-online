import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, bankAttempts, activeSpots, levelOf, repsFor, type TrapRow, type PatternRow } from "./traps.ts";
import { Typer } from "./typer.ts";
import { TrapGuard } from "./trapguard.ts";
import { answerVariants } from "./variants.ts";

const now = new Date("2026-03-01T10:00:00Z");
let n = 0;
const newId = () => `t${++n}`;

test("classify names the error and its chunk", () => {
  const [e] = classify("hipocampus", "Hippocampus");
  assert.equal(e.kind, "doubling");
  assert.equal(e.pattern, "dbl:p");
  assert.ok(e.chunk.toLowerCase().includes("pp"));
  const [t] = classify("recieve", "receive");
  assert.equal(t.pattern, "ie/ei");
  const [l] = classify("esophagus", "oesophagus");
  assert.equal(l.pattern, "lat:e/oe");
  assert.deepEqual(classify("hippocampus", "Hippocampus"), []);
  assert.deepEqual(classify("zzzz", "Hippocampus"), []); // a different word, not a typo
});

test("a finger slip fixed while typing is not banked", () => {
  assert.deepEqual(classify("thalsmus", "thalamus", true).filter((e) => e.kind === "slip"), []);
});

test("three strikes: a trap arms at 1.0 (3 fixed typos or 1.5 wrong answers)", () => {
  const answer = "Hippocampus";
  let rows: TrapRow[] = [];
  let pats: PatternRow[] = [];
  for (let i = 0; i < 2; i++) {
    const r = bankAttempts(rows, pats, { cardId: "c1", answer, attempts: [{ typed: "hipo", mode: "typing", partial: true }], now, newId });
    rows = r.traps;
    pats = r.patterns;
  }
  assert.equal(activeSpots(answer, rows).length, 0); // 2/3: not armed yet
  const r3 = bankAttempts(rows, pats, { cardId: "c1", answer, attempts: [{ typed: "hipo", mode: "typing", partial: true }], now, newId });
  rows = r3.traps;
  const spots = activeSpots(answer, rows);
  assert.equal(spots.length, 1);
  assert.equal(spots[0].level, 1);
  assert.ok(spots[0].chunk.toLowerCase().includes("pp"));
  // wrong submissions weigh 2/3 each
  let r2: TrapRow[] = [];
  for (let i = 0; i < 2; i++) r2 = bankAttempts(r2, [], { cardId: "c2", answer, attempts: [{ typed: "hipocampus", mode: "submit" }], now, newId }).traps;
  assert.equal(activeSpots(answer, r2).length, 1);
});

test("clean passes retire a trap only after 5 in a row over 2+ days; a miss brings it back", () => {
  const answer = "Hippocampus";
  let rows = bankAttempts([], [], { cardId: "c", answer, attempts: [{ typed: "hipocampus", mode: "submit" }, { typed: "hipocampus", mode: "submit" }], now, newId }).traps;
  const id = rows[0].id;
  const next = new Date(now.getTime() + 1 * 86_400_000);
  for (let i = 0; i < 4; i++) rows = bankAttempts(rows, [], { cardId: "c", answer, attempts: [], passes: [id], now: next, newId }).traps;
  assert.equal(rows[0].retired, false); // 4 passes, one day since the miss
  const later = new Date(now.getTime() + 3 * 86_400_000);
  rows = bankAttempts(rows, [], { cardId: "c", answer, attempts: [], passes: [id], now: later, newId }).traps;
  assert.equal(rows[0].retired, true);
  assert.equal(activeSpots(answer, rows).length, 0);
  rows = bankAttempts(rows, [], { cardId: "c", answer, attempts: [{ typed: "hipocampus", mode: "submit" }], now: later, newId }).traps;
  assert.equal(rows[0].retired, false);
});

test("strong global patterns guard unseen words gently", () => {
  const pats: PatternRow[] = [{ pattern: "dbl:p", kind: "doubling", misses: 4, hits: 0, streak: 0, last_miss: null, last_hit: null, retired: false }];
  const spots = activeSpots("Opposed pollex", [], pats, { "dbl:p": 3 });
  assert.equal(spots.length, 1);
  assert.equal(spots[0].source, "pattern");
  assert.equal(spots[0].level, 1);
  assert.equal(activeSpots("Opposed pollex", [], pats, { "dbl:p": 1 }).length, 0); // needs 2+ words
});

test("level and reps scale with misses", () => {
  assert.equal(levelOf(1, 0), 1);
  assert.equal(levelOf(2, 0), 2);
  assert.equal(levelOf(4, 0), 3);
  assert.equal(levelOf(4, 2), 2);
  assert.equal(repsFor(1), 3);
  assert.equal(repsFor(3), 5);
  assert.equal(repsFor(6), 10);
});

function guarded(answer: string, level: number, start: number, end: number) {
  const t = new Typer({ variants: answerVariants(answer), now: 0 });
  const g = new TrapGuard(t, [{ id: "x", start, end, chunk: answer.slice(start, end), kind: "doubling", pattern: "dbl:p", label: "", question: "p or pp?", misses: 2, streak: 0, level: level as 1, reps: 3, source: "card" }]);
  return { t, g };
}

test("TrapGuard: level 1 arms without a gate or blind chunk; a first-key miss locks", () => {
  const { t, g } = guarded("Hippocampus", 1, 2, 5);
  t.set("hip", 10);
  const ev = g.update(10);
  assert.ok(ev.some((e) => e.type === "arm" && !e.blind && e.gateMs === 0));
  t.set("hipo", 20);
  const ev2 = g.update(20);
  assert.ok(ev2.some((e) => e.type === "miss"));
  assert.equal(g.locked, true);
  assert.ok(g.repsWanted() >= 3);
});

test("TrapGuard: level 2 gates and types the chunk blind, judged as a unit", () => {
  const { t, g } = guarded("Hippocampus", 2, 2, 5);
  t.set("hi", 100);
  const ev = g.update(100);
  const arm = ev.find((e) => e.type === "arm");
  assert.ok(arm && arm.type === "arm" && arm.blind && arm.gateMs > 0);
  assert.equal(g.gateActive(100 + 100), true);
  assert.equal(g.gateActive(100 + 5000), false);
  assert.ok(g.blindView());
  t.set("hipp", 6000);
  g.update(6000);
  assert.equal(g.blindView()?.dots, 2);
  t.set("hippo", 6100);
  const done = g.update(6100);
  assert.ok(done.some((e) => e.type === "pass"));
  assert.equal(g.blindView(), null);
  assert.deepEqual(g.passed, ["x"]);
});

test("TrapGuard keeps red stretches as raw attempts for the model", () => {
  const { t, g } = guarded("Hippocampus", 1, 2, 5);
  t.set("hi", 1);
  g.update(1);
  t.set("hix", 2);
  g.update(2);
  t.set("hip", 3);
  g.update(3);
  g.finish("right");
  assert.ok(g.attempts.some((a) => a.typed === "hix" && a.partial));
});
