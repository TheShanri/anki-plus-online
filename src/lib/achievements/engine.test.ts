import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, tiersOf } from "./catalog.ts";
import { applyEvents, evaluate, localDate, newState, rankOf, streaks, summarize, totalXp, DAILY_GOAL_XP, RANKS, type InEvent } from "./engine.ts";
import type { AtlasEvent } from "../atlas/progress.ts";
import * as G from "./groups.ts";
import type { Curriculum } from "./types.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const LINKS = read("../../data/atlas-links.json") as Record<string, unknown>;
const PMAP = read("../../data/pathway-map.json");
const SUPPLY = read("../../data/supply-map.json");

const slugs = Object.keys(LINKS);
const cur: Curriculum = {
  slugs,
  units: [
    { slug: "u1", title: "U1", slugs: slugs.slice(0, 10) },
    { slug: "u2", title: "U2", slugs: slugs.slice(10, 20) },
  ],
};
const T0 = Date.UTC(2026, 10, 2, 15, 0, 0);
let clock = T0;
const ev = (e: AtlasEvent & { at?: number }): InEvent => ({ ...e, at: e.at ?? (clock += 1000) }) as InEvent;
const view = (slug: string, via: "3d" | "mri" = "3d", at?: number) => ev({ type: "structure_viewed", slug, via, at });
const unlockedIds = (st: ReturnType<typeof newState>) => new Set([...st.unlocked.keys()]);

test("catalogue: 80 to 120 achievements, unique ids, valid tiers", () => {
  assert.ok(ACHIEVEMENTS.length >= 80 && ACHIEVEMENTS.length <= 120, `got ${ACHIEVEMENTS.length}`);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    const t = tiersOf(a, cur);
    assert.ok(t.length >= 1 && t.length <= 4, a.id);
    for (let i = 1; i < t.length; i++) assert.ok(t[i].at > t[i - 1].at, `${a.id} thresholds must rise`);
    assert.ok(a.desc.length > 10 && a.name.length > 2, a.id);
  }
  assert.ok(ACHIEVEMENTS.filter((a) => a.secret).length >= 8);
});

test("groups match the data files", () => {
  for (const s of [...Object.values(G.LOBES).flatMap((l) => l.slugs), ...G.VENTRICLE_SLUGS, ...G.CRANIAL_NERVES, ...G.DEEP_NUCLEI, ...G.CORTICAL_AREAS, ...G.BRAINSTEM_PARTS, ...G.FIBER_TYPES, ...G.PAPEZ, ...G.MEDIAL_TEMPORAL, "broca-s-area", "wernicke-s-area", "pineal-gland", "suprachiasmatic-nucleus", "cerebellum", "motor-homunculus", "somatosensory-homunculus", "obex"]) {
    assert.ok(slugs.includes(s), "unknown structure slug " + s);
  }
  assert.deepEqual([...G.PATHWAYS].sort(), Object.keys(PMAP.pathways).sort());
  assert.equal(G.TOTAL_CASES, Object.keys(PMAP.cases).length);
  for (const c of Object.values(G.CASES)) assert.ok(c in PMAP.cases, "unknown case " + c);
  const arteries = SUPPLY.arteries.map((a: { id: string }) => a.id).filter((i: string) => i !== "ica");
  assert.deepEqual([...G.TERRITORY_ARTERIES].sort(), arteries.sort());
  for (const p of [...G.ASCENDING, ...G.DESCENDING, ...G.REFLEXES, ...G.LIMBIC, ...G.AUTONOMIC]) assert.ok(G.PATHWAYS.includes(p), p);
});

test("the top rank is reachable by finishing the catalogue", () => {
  const all = [...ACHIEVEMENTS].reduce((n, a) => n + (a.xp ?? 0) * (a.xp ? 1 : 0) + (a.xp ? 0 : a.tiers.reduce((m, t) => m + ({ bronze: 20, silver: 40, gold: 80, platinum: 160 })[t.tier], 0)), 0);
  assert.ok(all > RANKS[RANKS.length - 1].xp, `catalogue XP ${all}`);
});

test("explorer ladder unlocks at 10 structures, not before", () => {
  clock = T0;
  const st = newState();
  applyEvents(st, slugs.slice(0, 9).map((s) => view(s)));
  assert.ok(!unlockedIds(st).has("ex-tourist|bronze"));
  evaluate(st, cur, T0);
  assert.ok(!unlockedIds(st).has("ex-tourist|bronze"));
  applyEvents(st, [view(slugs[9])]);
  const got = evaluate(st, cur, T0);
  assert.ok(got.some((u) => u.id === "ex-tourist" && u.tier === "bronze"));
  assert.equal(evaluate(st, cur, T0).length, 0, "evaluating again awards nothing twice");
});

test("viewing the same structure again earns nothing, a new view mode earns a little", () => {
  const st = newState();
  const a = applyEvents(st, [view("thalamus")]);
  const b = applyEvents(st, [view("thalamus")]);
  const c = applyEvents(st, [view("thalamus", "mri")]);
  assert.equal(a, 3);
  assert.equal(b, 0);
  assert.equal(c, 1);
});

test("H.M. needs the medial temporal lobe first; Phineas Gage needs the prefrontal region", () => {
  const wrong = newState();
  applyEvents(wrong, [view("hippocampus"), view("parahippocampal-gyrus")]);
  evaluate(wrong, cur, T0);
  assert.ok(!unlockedIds(wrong).has("sc-hm|gold"));
  const right = newState();
  applyEvents(right, [view("parahippocampal-gyrus"), view("hippocampus"), view("orbitofrontal-cortex"), view("broca-s-area")]);
  evaluate(right, cur, T0);
  for (const id of ["sc-hm", "sc-gage", "sc-tan", "sc-famous"]) assert.ok(unlockedIds(right).has(id + "|gold"), id);
});

test("quiz: streaks, typed vs choice, perfect rounds and unit pools", () => {
  const st = newState();
  const answers: InEvent[] = [];
  for (let i = 1; i <= 25; i++) answers.push(ev({ type: "quiz_answer", slug: slugs[i], correct: true, streak: i, pool: "all", mode: i % 2 ? "type" : "choice" }));
  answers.push(ev({ type: "quiz_finished", correct: 10, total: 10, pool: "units:u2" }));
  answers.push(ev({ type: "quiz_finished", correct: 9, total: 10, pool: "units:u1" }));
  answers.push(ev({ type: "quiz_finished", correct: 4, total: 4, pool: "all" }));
  applyEvents(st, answers);
  evaluate(st, cur, T0);
  const u = unlockedIds(st);
  assert.ok(u.has("qz-streak|gold") && !u.has("qz-streak|platinum"));
  assert.ok(u.has("qz-typed|bronze") && u.has("qz-choice|bronze"));
  assert.ok(u.has("qz-perfect10|gold") && u.has("qz-unit-u2|silver"));
  assert.ok(!u.has("qz-unit-u1|silver"), "9/10 is not perfect");
  assert.equal(st.stats.get("quiz:perfect")?.count, 1, "a perfect round needs five or more questions");
});

test("slice match: within 5, 3, 1 mm and exact", () => {
  const st = newState();
  applyEvents(st, [4, 2.5, 1, 0, 9].map((errorMm) => ev({ type: "slice_match_round", errorMm })));
  assert.equal(st.stats.get("slice:rounds")?.count, 5);
  assert.equal(st.stats.get("slice:le5")?.count, 4);
  assert.equal(st.stats.get("slice:le3")?.count, 3);
  assert.equal(st.stats.get("slice:le1")?.count, 2);
  assert.equal(st.stats.get("slice:exact")?.count, 1);
  evaluate(st, cur, T0);
  assert.ok(unlockedIds(st).has("sl-exact|platinum"));
});

test("pathways: ascending set, all 28, and bad slugs are ignored", () => {
  const st = newState();
  applyEvents(st, [...G.ASCENDING.map((pathway) => ev({ type: "pathway_completed", pathway })), ev({ type: "pathway_completed", pathway: "nonsense" })]);
  evaluate(st, cur, T0);
  assert.ok(unlockedIds(st).has("pf-ascending|gold"));
  assert.ok(!unlockedIds(st).has("pf-descending|gold"));
  applyEvents(st, G.PATHWAYS.map((pathway) => ev({ type: "pathway_completed", pathway })));
  evaluate(st, cur, T0);
  assert.ok(unlockedIds(st).has("pf-all|platinum"));
});

test("lesion syndromes and supply territories", () => {
  const st = newState();
  applyEvents(st, [
    ev({ type: "lesion_case", caseId: G.CASES.wallenberg, correct: true }),
    ev({ type: "lesion_case", caseId: G.CASES.brownSequard, correct: false }),
    ...G.BIG_THREE.map((artery) => ev({ type: "supply_answer", slug: "x", correct: true, artery })),
  ]);
  evaluate(st, cur, T0);
  const u = unlockedIds(st);
  assert.ok(u.has("ls-wallenberg|silver") && !u.has("ls-brown|silver"));
  assert.ok(u.has("bs-big3|silver") && u.has("bs-territories|bronze"));
});

test("brainstem: a perfect label run per level, broken by a miss", () => {
  const st = newState();
  const lab = (correct: boolean) => ev({ type: "brainstem_label", level: "mid-pons", slug: "s", correct });
  applyEvents(st, [lab(true), lab(true), lab(true), lab(false), lab(true), lab(true), lab(true), lab(true), lab(true)]);
  assert.ok(!st.stats.has("bsperfect:mid-pons"), "the miss reset the run");
  applyEvents(st, [lab(true)]);
  assert.ok(st.stats.has("bsperfect:mid-pons"));
  evaluate(st, cur, T0);
  assert.ok(unlockedIds(st).has("bd-perfect|bronze"));
});

test("streaks of consecutive days", () => {
  assert.deepEqual(streaks(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-07"], "2026-11-07"), { current: 1, best: 3 });
  assert.deepEqual(streaks(["2026-11-05", "2026-11-06"], "2026-11-07"), { current: 2, best: 2 });
  assert.deepEqual(streaks(["2026-11-01"], "2026-11-07"), { current: 0, best: 1 });
  assert.deepEqual(streaks([], "2026-11-07"), { current: 0, best: 0 });
});

test("habits: a seven-day streak, daily goal bonus, night owl and comeback", () => {
  const st = newState();
  const day = 86_400_000;
  const evs: InEvent[] = [];
  for (let i = 0; i < 7; i++) evs.push(view(slugs[i], "3d", T0 + i * day));
  applyEvents(st, evs);
  evaluate(st, cur, T0 + 7 * day, localDate(T0 + 6 * day, 0));
  assert.ok(unlockedIds(st).has("hb-streak|silver"));

  const owl = newState();
  const night: InEvent[] = [];
  for (let i = 0; i < 10; i++) night.push(view(slugs[i], "3d", Date.UTC(2026, 10, 3, 2, i)));
  applyEvents(owl, night);
  evaluate(owl, cur, T0);
  assert.ok(unlockedIds(owl).has("hb-night|silver"));
  assert.ok(!unlockedIds(owl).has("hb-early|silver"));

  const back = newState();
  applyEvents(back, [view("thalamus", "3d", T0), view("putamen", "3d", T0 + 9 * day)]);
  assert.equal(back.stats.get("comeback")?.count, 1);

  const goal = newState();
  const before = totalXp(goal);
  applyEvents(goal, slugs.slice(0, 20).map((s, i) => view(s, "3d", T0 + i)));
  assert.ok(goal.stats.has("goal:" + localDate(T0, 0)));
  assert.ok(totalXp(goal) - before >= DAILY_GOAL_XP);
});

test("the daily XP cap limits repeatable events", () => {
  const st = newState();
  const evs: InEvent[] = [];
  for (let i = 0; i < 400; i++) evs.push(ev({ type: "slice_match_round", errorMm: 0, at: T0 + i }));
  applyEvents(st, evs);
  assert.ok((st.stats.get("xp")?.count ?? 0) <= 300 + 15 + 25);
  assert.equal(st.stats.get("slice:rounds")?.count, 400, "stats still count");
});

test("timezone: the local day follows the client offset", () => {
  const at = Date.UTC(2026, 10, 3, 3, 0); // 03:00 UTC
  assert.equal(localDate(at, 0), "2026-11-03");
  assert.equal(localDate(at, 300), "2026-11-02"); // UTC-5 (getTimezoneOffset = +300)
});

test("ranks climb with XP and the unit field guide counts percent", () => {
  assert.equal(rankOf(0).name, "Neuron");
  assert.equal(rankOf(150).name, "Synapse");
  assert.equal(rankOf(7000).name, "Neuroanatomist");
  assert.equal(rankOf(7000).pct, 1);
  assert.ok(rankOf(200).pct > 0 && rankOf(200).pct < 1);
  const st = newState();
  applyEvents(st, cur.units[0].slugs.map((s) => view(s)));
  const got = evaluate(st, cur, T0);
  assert.ok(got.some((u) => u.id === "unit-u1" && u.tier === "platinum"));
  assert.ok(!got.some((u) => u.id === "unit-u2"));
  assert.equal(summarize(st, T0).rank.name, rankOf(totalXp(st)).name);
  assert.ok(ACHIEVEMENT_BY_ID.has("unit-u3"));
});
