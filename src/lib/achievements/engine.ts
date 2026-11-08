// The achievements engine: pure functions over an in-memory state, so the rules are unit-testable. The API loads the
// student's rows into an EngineState, applies a batch of events, evaluates the catalogue and writes the dirty rows back.
import type { AtlasEvent } from "../atlas/progress.ts";
import { ACHIEVEMENTS, tiersOf } from "./catalog.ts";
import { BRAINSTEM_PERFECT_RUN, MEDIAL_TEMPORAL, PATHWAYS, TERRITORY_ARTERIES } from "./groups.ts";
import { TIER_XP, type Curriculum, type Snapshot, type Stat, type Tier, type Unlock } from "./types.ts";

export type InEvent = AtlasEvent & { at: number };
export interface SeenRow {
  firstAt: number;
  count: number;
}

export interface EngineState {
  stats: Map<string, Stat>;
  /** slug -> via -> row */
  seen: Map<string, Map<string, SeenRow>>;
  /** "id|tier" -> unlocked at (ms) */
  unlocked: Map<string, number>;
  dirtyStats: Set<string>;
  dirtySeen: Set<string>;
}

export const DAILY_GOAL_XP = 40;
export const DAILY_EVENT_XP_CAP = 300;
const GOAL_BONUS = 15;
const COMEBACK_BONUS = 25;
const DAY_MS = 86_400_000;
const VIAS = new Set(["3d", "mri", "brainstem", "info", "quiz"]);

export function newState(): EngineState {
  return { stats: new Map(), seen: new Map(), unlocked: new Map(), dirtyStats: new Set(), dirtySeen: new Set() };
}

// ------------------------------------------------------------------------------------------------ dates
/** Local calendar date of a timestamp for a client whose Date#getTimezoneOffset() is tzMin. */
export function localDate(at: number, tzMin: number): string {
  return new Date(at - tzMin * 60_000).toISOString().slice(0, 10);
}
function localHour(at: number, tzMin: number): number {
  return new Date(at - tzMin * 60_000).getUTCHours();
}
function dayNum(d: string): number {
  return Math.floor(Date.parse(d + "T00:00:00Z") / DAY_MS);
}

export function activeDays(state: EngineState): string[] {
  const out: string[] = [];
  for (const k of state.stats.keys()) if (k.startsWith("day:")) out.push(k.slice(4));
  return out.sort();
}

/** Current and best run of consecutive active days. The current run may end today or yesterday. */
export function streaks(days: string[], today: string): { current: number; best: number } {
  const nums = [...new Set(days.map(dayNum))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = -Infinity;
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  const t = dayNum(today);
  const last = nums[nums.length - 1];
  let current = 0;
  if (last !== undefined && (last === t || last === t - 1)) current = run;
  return { current, best };
}

// ------------------------------------------------------------------------------------------------ snapshot
export function makeSnapshot(state: EngineState, cur: Curriculum, today = localDate(Date.now(), 0)): Snapshot {
  const via = new Map<string, number>();
  for (const m of state.seen.values()) for (const v of m.keys()) via.set(v, (via.get(v) ?? 0) + 1);
  const best = streaks(activeDays(state), today).best;
  const stats = state.stats;
  return {
    cur,
    n: (k) => stats.get(k)?.count ?? 0,
    best: (k) => stats.get(k)?.best ?? 0,
    sum(prefix) {
      let t = 0;
      for (const [k, v] of stats) if (k.startsWith(prefix)) t += v.count;
      return t;
    },
    distinct(prefix, min = 1) {
      let t = 0;
      for (const [k, v] of stats) if (k.startsWith(prefix) && v.count >= min) t++;
      return t;
    },
    maxOf(prefix) {
      let t = 0;
      for (const [k, v] of stats) if (k.startsWith(prefix) && v.count > t) t = v.count;
      return t;
    },
    seen: (slug) => state.seen.has(slug),
    seenOf: (list) => list.reduce((n, s) => n + (state.seen.has(s) ? 1 : 0), 0),
    seenVia: (v) => via.get(v) ?? 0,
    flag: (id) => (stats.get("secret:" + id)?.count ?? 0) > 0,
    bestStreak: best,
  };
}

// ------------------------------------------------------------------------------------------------ applying events
function bump(state: EngineState, key: string, at: number, by = 1): Stat {
  let s = state.stats.get(key);
  if (!s) {
    s = { count: 0, best: 0, firstAt: at, lastAt: at };
    state.stats.set(key, s);
  }
  s.count += by;
  s.lastAt = Math.max(s.lastAt, at);
  state.dirtyStats.add(key);
  return s;
}
function setBest(state: EngineState, key: string, at: number, v: number): void {
  const s = bump(state, key, at, 0);
  if (v > s.best) s.best = v;
}
function setCount(state: EngineState, key: string, at: number, v: number): void {
  const s = bump(state, key, at, 0);
  s.count = v;
}
function addSeen(state: EngineState, slug: string, via: string, at: number): "new" | "newvia" | "old" {
  let m = state.seen.get(slug);
  const first = !m;
  if (!m) {
    m = new Map();
    state.seen.set(slug, m);
  }
  const row = m.get(via);
  state.dirtySeen.add(slug + "|" + via);
  if (row) {
    row.count++;
    return "old";
  }
  m.set(via, { firstAt: at, count: 1 });
  return first ? "new" : "newvia";
}

const SAFE = /^[a-z0-9][a-z0-9_.-]{0,59}$/i;
const SAFE_CASE = /^clinical-[a-z0-9-]{1,70}$/;
const PATHWAY_SET = new Set(PATHWAYS);
const ARTERY_SET = new Set(TERRITORY_ARTERIES);
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** Apply one event. Returns the XP it earned (before the per-day cap), and updates counters, seen rows and secret flags. */
function applyOne(state: EngineState, e: InEvent): number {
  const at = e.at;
  let xp = 0;
  switch (e.type) {
    case "structure_viewed": {
      if (!SAFE.test(e.slug) || !VIAS.has(e.via)) return 0;
      if (e.slug === "hippocampus" && MEDIAL_TEMPORAL.some((s) => state.seen.has(s))) setCount(state, "secret:hm", at, 1);
      if (e.slug === "wernicke-s-area" && state.seen.has("broca-s-area")) setCount(state, "secret:arcuate", at, 1);
      const r = addSeen(state, e.slug, e.via, at);
      xp = r === "new" ? 3 : r === "newvia" ? 1 : 0;
      bump(state, "view:" + e.via, at);
      return xp;
    }
    case "curious_unlock": {
      if (!SAFE.test(e.mesh)) return 0;
      const fresh = !state.stats.has("curious:" + e.mesh);
      bump(state, "curious:" + e.mesh, at);
      if (fresh) {
        // distinct unlocks in the person's local day are tracked by the caller via the day key
        xp = 8;
      }
      return xp;
    }
    case "view_changed": {
      if (!SAFE.test(e.view)) return 0;
      const fresh = !state.stats.has("viewmode:" + e.view);
      bump(state, "viewmode:" + e.view, at);
      return fresh ? 2 : 0;
    }
    case "multiview_opened":
      return bump(state, "multiview", at).count === 1 ? 5 : 1;
    case "cut_used": {
      if (!SAFE.test(e.plane)) return 0;
      const fresh = !state.stats.has("cut:" + e.plane);
      bump(state, "cut:" + e.plane, at);
      bump(state, "cuts", at);
      return fresh ? 3 : 1;
    }
    case "quiz_answer": {
      if (!SAFE.test(e.slug)) return 0;
      bump(state, "quiz:answers", at);
      if (!e.correct) return 1;
      bump(state, "quiz:correct", at);
      if (e.mode === "type") bump(state, "quiz:typed", at);
      else if (e.mode === "choice") bump(state, "quiz:choice", at);
      const st = num(e.streak, 0, 1000);
      if (st !== null) setBest(state, "quiz:streak", at, Math.floor(st));
      xp = 3;
      if (addSeen(state, e.slug, "quiz", at) !== "old") xp += 4;
      return xp;
    }
    case "quiz_finished": {
      const total = num(e.total, 0, 500);
      const ok = num(e.correct, 0, 500);
      if (!total || ok === null || ok > total) return 0;
      bump(state, "quiz:rounds", at);
      xp = 8;
      if (ok === total && total >= 5) {
        bump(state, "quiz:perfect", at);
        xp += 20;
        if (total >= 10) bump(state, "quiz:perfect10", at);
        if (total >= 20) bump(state, "quiz:perfect20", at);
        const pool = String(e.pool ?? "");
        if (pool.startsWith("units:") && !pool.includes("+")) {
          const u = pool.slice(6);
          if (SAFE.test(u)) bump(state, "quiz:perfect_unit:" + u, at);
        }
      }
      return xp;
    }
    case "pathway_completed": {
      if (!PATHWAY_SET.has(e.pathway)) return 0;
      const first = bump(state, "pathway:" + e.pathway, at).count === 1;
      xp = first ? 25 : 3;
      const qt = num(e.quizTotal, 0, 100);
      const qc = num(e.quizCorrect, 0, 100);
      if (qt && qc === qt && bump(state, "pathwayquiz:" + e.pathway, at).count === 1) xp += 10;
      return xp;
    }
    case "lesion_case": {
      if (!SAFE_CASE.test(e.caseId)) return 0;
      bump(state, "lesionattempts", at);
      if (!e.correct) return 1;
      return bump(state, "lesion:" + e.caseId, at).count === 1 ? 20 : 2;
    }
    case "slice_match_round": {
      const mm = num(e.errorMm, 0, 1000);
      if (mm === null) return 0;
      bump(state, "slice:rounds", at);
      if (mm <= 5) bump(state, "slice:le5", at);
      if (mm <= 3) bump(state, "slice:le3", at);
      if (mm <= 1) bump(state, "slice:le1", at);
      if (mm === 0) bump(state, "slice:exact", at);
      return 2 + Math.max(0, 5 - Math.floor(mm)) * 2;
    }
    case "supply_answer": {
      bump(state, "supply:answers", at);
      if (!e.correct) return 1;
      bump(state, "supply:correct", at);
      xp = 3;
      if (e.artery && ARTERY_SET.has(e.artery) && bump(state, "supply:artery:" + e.artery, at).count === 1) xp += 5;
      return xp;
    }
    case "brainstem_level_viewed": {
      if (!SAFE.test(e.level) || !SAFE.test(e.style)) return 0;
      if (bump(state, "bslevel:" + e.level, at).count === 1) xp += 3;
      if (bump(state, `bsstyle:${e.level}:${e.style}`, at).count === 1) {
        xp += 2;
        let n = 0;
        for (const k of state.stats.keys()) if (k.startsWith(`bsstyle:${e.level}:`)) n++;
        setCount(state, "bsstyles:" + e.level, at, n);
      }
      return xp;
    }
    case "brainstem_label": {
      if (!SAFE.test(e.level)) return 0;
      const runKey = "bslabel:run:" + e.level;
      if (!e.correct) {
        setCount(state, runKey, at, 0);
        return 0;
      }
      bump(state, "bslabel:ok", at);
      const run = bump(state, runKey, at);
      if (run.count > run.best) run.best = run.count;
      xp = 2;
      if (run.count >= BRAINSTEM_PERFECT_RUN && !state.stats.has("bsperfect:" + e.level)) {
        setCount(state, "bsperfect:" + e.level, at, 1);
        xp += 20;
      }
      return xp;
    }
    case "memory_map_opened":
      bump(state, "memory", at);
      return 1;
    default:
      return 0;
  }
}

/** Apply events in time order. Returns the XP actually awarded (after the daily cap, with bonuses). */
export function applyEvents(state: EngineState, events: InEvent[], tzMin = 0): number {
  let total = 0;
  for (const e of events.slice().sort((a, b) => a.at - b.at)) {
    if (!Number.isFinite(e.at)) continue;
    const at = e.at;
    const day = localDate(at, tzMin);
    const dayKey = "day:" + day;
    let bonus = 0;
    if (!state.stats.has(dayKey)) {
      let prev: string | null = null;
      for (const k of state.stats.keys()) if (k.startsWith("day:") && k.slice(4) < day && (!prev || k.slice(4) > prev)) prev = k.slice(4);
      if (prev && dayNum(day) - dayNum(prev) >= 7) {
        bump(state, "comeback", at);
        bonus += COMEBACK_BONUS;
      }
    }
    const hour = localHour(at, tzMin);
    if (hour < 4) bump(state, "hour:night", at);
    else if (hour < 7) bump(state, "hour:early", at);

    const raw = applyOne(state, e);
    if (e.type === "curious_unlock" && raw > 0) {
      const c = bump(state, "curiousday:" + day, at);
      setBest(state, "curious_day_best", at, c.count);
    }

    const d = bump(state, dayKey, at, 0);
    const room = Math.max(0, DAILY_EVENT_XP_CAP - d.count);
    const gained = Math.min(raw, room);
    const before = d.count;
    d.count += gained + bonus;
    d.best += 1;
    setBest(state, "day_events_best", at, d.best);
    if (before < DAILY_GOAL_XP && d.count >= DAILY_GOAL_XP && !state.stats.has("goal:" + day)) {
      setCount(state, "goal:" + day, at, 1);
      d.count += GOAL_BONUS;
      bonus += GOAL_BONUS;
    }
    const earned = gained + bonus;
    if (earned) bump(state, "xp", at, earned);
    total += earned;
  }
  return total;
}

// ------------------------------------------------------------------------------------------------ achievements, XP, ranks
export function evaluate(state: EngineState, cur: Curriculum, now: number, today = localDate(now, 0)): (Unlock & { value: number })[] {
  const snap = makeSnapshot(state, cur, today);
  const out: (Unlock & { value: number })[] = [];
  for (const a of ACHIEVEMENTS) {
    const v = a.metric(snap);
    for (const t of tiersOf(a, cur)) {
      const key = a.id + "|" + t.tier;
      if (v >= t.at && !state.unlocked.has(key)) {
        state.unlocked.set(key, now);
        out.push({ id: a.id, tier: t.tier, at: now, value: v });
      }
    }
  }
  return out;
}

export function achievementXp(id: string, tier: Tier): number {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a?.xp ?? TIER_XP[tier];
}

const XP_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a.xp]));
export function totalXp(state: EngineState): number {
  let xp = state.stats.get("xp")?.count ?? 0;
  for (const key of state.unlocked.keys()) {
    const [id, tier] = key.split("|");
    xp += XP_BY_ID.get(id) ?? TIER_XP[tier as Tier] ?? 0;
  }
  return xp;
}

export const RANKS = [
  { name: "Neuron", xp: 0 },
  { name: "Synapse", xp: 150 },
  { name: "Ganglion", xp: 400 },
  { name: "Nucleus", xp: 800 },
  { name: "Tract", xp: 1500 },
  { name: "Lobe", xp: 2600 },
  { name: "Cortex", xp: 4200 },
  { name: "Neuroanatomist", xp: 6500 },
] as const;

export interface RankInfo {
  index: number;
  name: string;
  next: string | null;
  xp: number;
  from: number;
  to: number | null;
  pct: number;
}
export function rankOf(xp: number): RankInfo {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const from = RANKS[i].xp;
  const to = i + 1 < RANKS.length ? RANKS[i + 1].xp : null;
  return { index: i, name: RANKS[i].name, next: to === null ? null : RANKS[i + 1].name, xp, from, to, pct: to === null ? 1 : (xp - from) / (to - from) };
}

export interface Summary {
  xp: number;
  rank: RankInfo;
  streak: number;
  bestStreak: number;
  todayXp: number;
  goalXp: number;
}
export function summarize(state: EngineState, now: number, tzMin = 0): Summary {
  const today = localDate(now, tzMin);
  const xp = totalXp(state);
  const st = streaks(activeDays(state), today);
  return { xp, rank: rankOf(xp), streak: st.current, bestStreak: st.best, todayXp: state.stats.get("day:" + today)?.count ?? 0, goalXp: DAILY_GOAL_XP };
}
