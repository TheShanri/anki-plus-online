// Trap letters: a model of HOW each student misspells answers. Ported (simplified) from ANKI+ app/traps.py.
//
//  1. The study screen records raw attempts: what was typed when an error happened (mid-word snapshots of a
//     red stretch the student then fixed, plus wrong submissions, retypes and reps).
//  2. classify() aligns an attempt against the answer (Damerau-Levenshtein on the same canonical text the
//     typer compares) and names each error: substitution, omission, insertion, transposition (ie/ei...),
//     doubling, vowel confusion, Latin/Greek spelling pairs (ae/e, ph/f, c/k, y/i, us/um ...). Each error
//     carries its "trap chunk": the few letters around it that must be recalled as a unit.
//  3. bankAttempts() adds strikes per card trap (and per global pattern). Evidence = "three strikes": a typo
//     fixed while typing is 1/3 of a strike, a wrong answer 2/3, a finger slip nothing; a trap ARMS at 1.0.
//  4. activeSpots() ships a card's armed traps (and strong global patterns, gently) to the client.
//  5. Retirement: a card trap after 5 clean passes in a row over >= 2 days; a pattern after 12 clean passes
//     with no miss in the last 5 days. A new miss brings either back.
import { canon, DEFAULT_CANON, type CanonFlags } from "./text.ts";

export const ARM_AT = 0.99;
export const DEFAULT_STRIKES = 3;
export const CARD_RETIRE_STREAK = 5;
export const CARD_RETIRE_DAYS = 2;
export const PATTERN_RETIRE_STREAK = 12;
export const PATTERN_RETIRE_QUIET_DAYS = 5;
export const MAX_TRAPS_PER_CARD = 4;

export type AttemptMode = "typing" | "submit" | "retype" | "rep";
export interface Attempt {
  typed: string;
  mode: AttemptMode;
  /** an unfinished attempt: a red stretch the student fixed while typing */
  partial?: boolean;
}

export interface TrapEvent {
  kind: string;
  pattern: string;
  label: string;
  question: string;
  pos: number;
  expected: string;
  got: string;
  chunkStart: number;
  chunkEnd: number;
  chunk: string;
  weight: number;
}

// ------------------------------------------------------------------ alignment
type Op = { t: "eq" | "sub" | "omit" | "insert" | "trans"; i: number; j: number };

/** OSA alignment of typed (ta) against answer (aa). partial: typed is an unfinished prefix. */
function align(ta: string, aa: string, partial: boolean): { ops: Op[]; dist: number; end: number } {
  const m = ta.length;
  const n = aa.length;
  // an unfinished attempt: a substitution costs a little more than an omission, so "hipo" reads as a missing
  // "p" (hip-p-o) rather than "p" typed as "o"
  const SUB = partial ? 1.1 : 1;
  const EPS = 1e-9;
  const D = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) D[i][0] = i;
  for (let j = 0; j <= n; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = ta[i - 1] === aa[j - 1] ? 0 : SUB;
      let v = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && ta[i - 1] === aa[j - 2] && ta[i - 2] === aa[j - 1]) v = Math.min(v, D[i - 2][j - 2] + 1);
      D[i][j] = v;
    }
  }
  let end = n;
  if (partial) {
    let best = Infinity;
    for (let j = 0; j <= n; j++) {
      const v = D[m][j] + (j >= m ? (j - m) * 0.01 : (m - j) * 0.02);
      if (v < best) {
        best = v;
        end = j;
      }
    }
  }
  const ops: Op[] = [];
  let i = m;
  let j = end;
  const close = (a: number, b: number) => Math.abs(a - b) < EPS;
  while (i > 0 || j > 0) {
    if (i > 1 && j > 1 && ta[i - 1] === aa[j - 2] && ta[i - 2] === aa[j - 1] && ta[i - 1] !== ta[i - 2] && close(D[i][j], D[i - 2][j - 2] + 1)) {
      ops.push({ t: "trans", i: i - 2, j: j - 2 });
      i -= 2;
      j -= 2;
    } else if (i > 0 && j > 0 && close(D[i][j], D[i - 1][j - 1] + (ta[i - 1] === aa[j - 1] ? 0 : SUB))) {
      ops.push({ t: ta[i - 1] === aa[j - 1] ? "eq" : "sub", i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && close(D[i][j], D[i - 1][j] + 1)) {
      ops.push({ t: "insert", i: i - 1, j });
      i--;
    } else {
      ops.push({ t: "omit", i, j: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return { ops, dist: D[m][end], end };
}

// ------------------------------------------------------------------ pattern vocabulary
const VOWELS = new Set("aeiouy");
const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const NEIGH = new Map<string, Set<string>>();
ROWS.forEach((row, r) => {
  [...row].forEach((c, k) => {
    const s = NEIGH.get(c) ?? new Set<string>();
    for (const dr of [-1, 0, 1]) {
      const rr = ROWS[r + dr];
      if (!rr) continue;
      for (const dk of [-1, 0, 1]) {
        const o = rr[k + dk + (dr === 1 ? 0 : 0)];
        if (o && o !== c) s.add(o);
      }
    }
    NEIGH.set(c, s);
  });
});

/** Latin / Greek / English anatomy spelling decisions: [a, b, endOnly]. */
const LATIN: Array<[string, string, boolean]> = [
  ["ae", "e", false],
  ["oe", "e", false],
  ["ph", "f", false],
  ["ch", "k", false],
  ["ch", "c", false],
  ["c", "k", false],
  ["c", "s", false],
  ["y", "i", false],
  ["ii", "i", true],
  ["us", "um", true],
  ["is", "es", true],
  ["a", "ae", true],
  ["i", "ae", true],
  ["us", "i", true],
  ["um", "a", true],
  ["ous", "us", true],
  ["al", "ar", true],
  ["ic", "ical", true],
  ["ior", "ier", false],
  ["ei", "ie", false],
  ["ent", "ant", true],
  ["ence", "ance", true],
  ["ible", "able", true],
  ["ise", "ize", true],
];

function patKey(a: string, b: string): string {
  return [a, b].sort().join("/");
}

const LATIN_BY_KEY = new Map(LATIN.map(([a, b, end]) => [patKey(a, b), { a, b, end }]));

export function describe(pattern: string): { label: string; question: string } {
  if (pattern.startsWith("dbl:")) return { label: `single or double ${pattern.slice(4)}`, question: `${pattern.slice(4)} or ${pattern.slice(4)}${pattern.slice(4)}?` };
  if (pattern === "ie/ei") return { label: "ie or ei", question: "ie or ei?" };
  if (pattern.startsWith("lat:")) {
    const [a, b] = pattern.slice(4).split("/");
    return { label: `${a} or ${b}`, question: `${a} or ${b}?` };
  }
  if (pattern.startsWith("vowel:")) return { label: "which vowel", question: `${pattern.slice(6).replace("/", " or ")}?` };
  if (pattern.startsWith("sub:")) return { label: "which consonant", question: `${pattern.slice(4).replace("/", " or ")}?` };
  if (pattern === "swap") return { label: "two letters swapped", question: "which order?" };
  if (pattern === "omit") return { label: "a letter left out", question: "a missing letter?" };
  if (pattern === "insert") return { label: "an extra letter", question: "one letter too many?" };
  if (pattern === "boundary") return { label: "space or no space", question: "one word or two?" };
  return { label: "spelling spot", question: "how is it spelled?" };
}

// ------------------------------------------------------------------ chunks
function wordBounds(text: string, lo: number, hi: number): [number, number] {
  let s = lo;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  let e = Math.max(hi, lo);
  while (e < text.length && !/\s/.test(text[e])) e++;
  return [s, e];
}

function chunkOf(answer: string, lo0: number, hi0: number, kind: string): [number, number] {
  const n = answer.length;
  let lo = Math.max(0, Math.min(lo0, n));
  let hi = Math.max(0, Math.min(Math.max(hi0, lo), n));
  if (kind === "boundary") return [Math.max(0, lo - 2), Math.min(n, Math.max(hi, lo + 1) + 2)];
  const [ws, we] = wordBounds(answer, lo, hi);
  if (kind === "doubling" && lo < n) {
    const c = answer[Math.min(lo, n - 1)].toLowerCase();
    let a = lo;
    let b = hi;
    while (a > ws && answer[a - 1].toLowerCase() === c) a--;
    while (b < we && answer[b].toLowerCase() === c) b++;
    lo = a;
    hi = Math.max(b, a + 1);
  }
  let cs = Math.max(ws, lo - 1);
  let ce = Math.min(we, Math.max(hi, lo + 1) + 1);
  while (ce - cs < 2 && (cs > ws || ce < we)) {
    if (ce < we) ce++;
    else cs--;
  }
  if (ce - cs > 7) ce = cs + 7;
  return [cs, ce];
}

function makeEvent(kind: string, pattern: string, answer: string, lo: number, hi: number, expected: string, got: string, weight = 1): TrapEvent {
  const [cs, ce] = chunkOf(answer, lo, hi, kind);
  const { label, question } = describe(pattern);
  return { kind, pattern, label, question, pos: lo, expected, got, chunkStart: cs, chunkEnd: ce, chunk: answer.slice(cs, ce), weight };
}

// ------------------------------------------------------------------ classification
/** Name every spelling error in `typed` against `answer`. [] when it is correct or just a different word. */
export function classify(typed: string, answer: string, partial = false, flags: CanonFlags = DEFAULT_CANON): TrapEvent[] {
  const T = canon(typed, flags);
  const A = canon(answer, flags);
  const ta = T.s;
  const aa = A.s;
  if (!ta || !aa) return [];
  if (ta === aa || (partial && aa.startsWith(ta))) return [];
  const { ops, dist, end } = align(ta, aa, partial);
  const reach = partial ? end : aa.length;
  if (dist > Math.max(2, 0.55 * Math.max(ta.length, Math.min(reach, aa.length)))) return []; // a different word, not a typo
  const src = (j: number) => (j < A.map.length ? A.map[j] : answer.length);

  // cluster non-eq ops that touch in the answer
  const groups: Op[][] = [];
  let cur: Op[] = [];
  let last: number | null = null;
  for (const op of ops) {
    if (op.t === "eq") continue;
    if (cur.length && last !== null && op.j - last > 1) {
      groups.push(cur);
      cur = [];
    }
    cur.push(op);
    last = op.j + (op.t === "trans" ? 1 : 0);
  }
  if (cur.length) groups.push(cur);

  const events: TrapEvent[] = [];
  for (const g of groups) {
    const ev = classifyGroup(g, ta, aa, answer, src, partial);
    if (ev) events.push(ev);
  }
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = `${e.chunkStart}|${e.pattern}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function classifyGroup(g: Op[], ta: string, aa: string, answer: string, src: (j: number) => number, partial: boolean): TrapEvent | null {
  const lo = Math.min(...g.map((o) => o.j));
  const hi = Math.max(...g.map((o) => o.j + (o.t === "trans" ? 2 : o.t === "insert" ? 0 : 1)));
  const exp = g.map((o) => (o.t === "sub" || o.t === "omit" ? aa[o.j] : o.t === "trans" ? aa.slice(o.j, o.j + 2) : "")).join("");
  const got = g.map((o) => (o.t === "sub" || o.t === "insert" ? ta[o.i] : o.t === "trans" ? ta.slice(o.i, o.i + 2) : "")).join("");
  const sLo = src(lo);
  const sHi = Math.max(sLo + 1, hi < aa.length ? src(hi - 1) + 1 : answer.length);
  const one = g.length === 1 ? g[0] : null;

  if (one && one.t === "trans") {
    const pair = aa.slice(one.j, one.j + 2);
    const pat = pair === "ie" || pair === "ei" ? "ie/ei" : "swap";
    return makeEvent("transposition", pat, answer, sLo, sHi, exp, got);
  }
  // a finger next to the right key, fixed at once, is not a memory problem
  if (one && one.t === "sub" && partial && NEIGH.get(aa[one.j])?.has(ta[one.i])) return null;

  // known spelling decisions (ae/e, ph/f, us/um ...): by expected/typed strings, including their neighbours
  const lat = latinPattern(g, ta, aa, exp, got);
  if (lat) return makeEvent("latin", lat, answer, sLo, sHi, exp, got);

  if (one && (one.t === "omit" || one.t === "insert")) {
    const ch = one.t === "omit" ? aa[one.j] : ta[one.i];
    const nb = one.t === "omit" ? [aa[one.j - 1], aa[one.j + 1]] : [aa[one.j - 1], aa[one.j]];
    if (ch !== " " && nb.includes(ch) && !VOWELS.has(ch)) return makeEvent("doubling", `dbl:${ch}`, answer, sLo, sHi, exp, got);
    if (ch === " ") return makeEvent("boundary", "boundary", answer, sLo, sHi, exp, got);
    if (VOWELS.has(ch) && nb.includes(ch)) return makeEvent("doubling", `dbl:${ch}`, answer, sLo, sHi, exp, got);
    return makeEvent(one.t === "omit" ? "omission" : "insertion", one.t, answer, sLo, sHi, exp, got);
  }
  if (one && one.t === "sub") {
    const x = aa[one.j];
    const y = ta[one.i];
    if (VOWELS.has(x) && VOWELS.has(y)) return makeEvent("vowel", `vowel:${patKey(x, y)}`, answer, sLo, sHi, exp, got);
    if (!VOWELS.has(x) && !VOWELS.has(y) && x !== " " && y !== " ") {
      const pk = patKey(x, y);
      if (CONFUSABLE.has(pk)) return makeEvent("confusion", `sub:${pk}`, answer, sLo, sHi, exp, got);
    }
    return makeEvent("substitution", "sub", answer, sLo, sHi, exp, got, 0.8);
  }
  return makeEvent("slip", "swap", answer, sLo, sHi, exp, got, 0.8);
}

const CONFUSABLE = new Set(["c/s", "c/k", "f/v", "d/t", "b/p", "m/n", "g/j", "k/q", "s/z", "c/z", "c/x", "g/k"]);

function latinPattern(g: Op[], ta: string, aa: string, exp: string, got: string): string | null {
  const key = (e: string, t: string) => patKey(e, t);
  let hit = LATIN_BY_KEY.get(key(exp, got));
  if (hit) return `lat:${patKey(hit.a, hit.b)}`;
  // pad with the surrounding letters of the answer: "e" for "ae" shows up as omit "a" with exp "a", got ""
  const first = g[0];
  const lastOp = g[g.length - 1];
  const around = aa.slice(Math.max(0, first.j - 1), Math.min(aa.length, lastOp.j + (lastOp.t === "trans" ? 2 : 1) + 1));
  const gotAround = ta.slice(Math.max(0, first.i - 1), Math.min(ta.length, lastOp.i + (lastOp.t === "insert" || lastOp.t === "sub" ? 1 : 0) + 1));
  for (const [x, y] of [[around, gotAround]] as Array<[string, string]>) {
    hit = LATIN_BY_KEY.get(key(x, y));
    if (hit) return `lat:${patKey(hit.a, hit.b)}`;
  }
  for (const e of LATIN) {
    const [a, b] = e;
    if ((around.includes(a) && gotAround.includes(b) && !gotAround.includes(a)) || (around.includes(b) && gotAround.includes(a) && !gotAround.includes(b))) {
      if (around.replace(a, b) === gotAround || around.replace(b, a) === gotAround) return `lat:${patKey(a, b)}`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ sites (where a pattern could bite)
export interface Site {
  start: number;
  end: number;
  pattern: string;
}

/** Spots in `answer` where a structured pattern applies (used to guard words not yet missed). */
export function sites(answer: string): Site[] {
  const out: Site[] = [];
  const low = answer.toLowerCase();
  const wordRe = /[\p{L}]+/gu;
  for (const m of low.matchAll(wordRe)) {
    const w = m[0];
    const w0 = m.index ?? 0;
    for (let k = 1; k < w.length; k++) {
      if (w[k] === w[k - 1] && !VOWELS.has(w[k])) {
        const [cs, ce] = chunkOf(answer, w0 + k - 1, w0 + k + 1, "doubling");
        out.push({ start: cs, end: ce, pattern: `dbl:${w[k]}` });
      }
    }
    for (const [a, b, endOnly] of LATIN) {
      for (const x of [a, b]) {
        if (endOnly ? w.endsWith(x) && w.length > x.length + 1 : w.includes(x) && x.length >= 1) {
          const at = endOnly ? w.length - x.length : w.indexOf(x);
          const [cs, ce] = chunkOf(answer, w0 + at, w0 + at + x.length, "latin");
          out.push({ start: cs, end: ce, pattern: `lat:${patKey(a, b)}` });
        }
      }
    }
    for (const x of ["ie", "ei"]) {
      const at = w.indexOf(x);
      if (at >= 0) {
        const [cs, ce] = chunkOf(answer, w0 + at, w0 + at + 2, "transposition");
        out.push({ start: cs, end: ce, pattern: "ie/ei" });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ banking
export interface TrapRow {
  id: string;
  card_id: string;
  start_pos: number;
  end_pos: number;
  chunk: string;
  kind: string;
  pattern: string;
  misses: number;
  hits: number;
  streak: number;
  /** ISO dates (YYYY-MM-DD) of recent clean passes */
  hit_days: string[];
  miss_day: string | null;
  last_miss: string | null;
  last_hit: string | null;
  retired: boolean;
}

export interface PatternRow {
  pattern: string;
  kind: string;
  misses: number;
  hits: number;
  streak: number;
  last_miss: string | null;
  last_hit: string | null;
  retired: boolean;
}

/** One trap as shipped to the client for a card. */
export interface TrapSpot {
  id: string;
  start: number;
  end: number;
  chunk: string;
  kind: string;
  pattern: string;
  label: string;
  question: string;
  misses: number;
  streak: number;
  level: 1 | 2 | 3;
  reps: number;
  source: "card" | "pattern";
}

export function levelOf(misses: number, streak: number): 1 | 2 | 3 {
  let lvl = misses < 2 ? 1 : misses < 4 ? 2 : 3;
  if (streak >= 2) lvl = Math.max(1, lvl - 1);
  return lvl as 1 | 2 | 3;
}

export function repsFor(misses: number): number {
  return misses <= 1.5 ? 3 : misses <= 3.5 ? 5 : 10;
}

export function strikeScale(partial: boolean, strikes = DEFAULT_STRIKES): number {
  const n = Math.max(1, strikes);
  return partial ? 1 / n : Math.min(1, 2 / n);
}

const MODE_WEIGHT: Record<AttemptMode, number> = { typing: 1, submit: 1, retype: 0.5, rep: 0.5 };

export interface BankInput {
  cardId: string;
  answer: string;
  attempts: Attempt[];
  /** trap ids passed cleanly / missed at the first keystroke while typing */
  passes?: string[];
  firstTryMisses?: string[];
  now: Date;
  newId?: () => string;
}

export interface BankResult {
  traps: TrapRow[];
  patterns: PatternRow[];
  events: TrapEvent[];
  missed: string[];
  retired: string[];
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pure reducer: card's existing trap rows + the user's pattern rows in, changed rows out. */
export function bankAttempts(cardTraps: TrapRow[], patternRows: PatternRow[], input: BankInput): BankResult {
  const now = input.now;
  const nowIso = now.toISOString();
  const today = dayOf(now);
  const newId = input.newId ?? (() => globalThis.crypto.randomUUID());
  const traps = new Map(cardTraps.map((t) => [t.id, { ...t }]));
  const pats = new Map(patternRows.map((p) => [p.pattern, { ...p }]));
  const changedTraps = new Set<string>();
  const changedPats = new Set<string>();
  const touched = new Map<string, number>();
  const events: TrapEvent[] = [];
  const patSeen = new Set<string>();

  const bumpPattern = (pattern: string, kind: string, weight: number, hit: boolean): string | null => {
    if (pattern === "swap" || pattern === "sub" || pattern === "omit" || pattern === "insert") {
      // unstructured: still kept per card, never global
    }
    let row = pats.get(pattern);
    if (!row) {
      row = { pattern, kind, misses: 0, hits: 0, streak: 0, last_miss: null, last_hit: null, retired: false };
      pats.set(pattern, row);
    }
    changedPats.add(pattern);
    if (hit) {
      row.hits += 1;
      row.streak += 1;
      row.last_hit = nowIso;
      const quiet = !row.last_miss || now.getTime() - new Date(row.last_miss).getTime() >= PATTERN_RETIRE_QUIET_DAYS * 86_400_000;
      const was = row.retired;
      if (row.streak >= PATTERN_RETIRE_STREAK && quiet && row.misses > 0) row.retired = true;
      return row.retired && !was ? pattern : null;
    }
    row.misses += weight;
    row.streak = 0;
    row.last_miss = nowIso;
    row.retired = false;
    return null;
  };

  for (const att of input.attempts) {
    if (!att.typed.trim()) continue;
    const partial = !!att.partial;
    const scale = strikeScale(partial);
    for (const ev of classify(att.typed, input.answer, partial)) {
      if (ev.kind === "slip") continue;
      const w = ev.weight * MODE_WEIGHT[att.mode] * scale;
      events.push(ev);
      // merge into an overlapping card trap or open a new one
      let best: TrapRow | null = null;
      let bestOv = 0;
      for (const t of traps.values()) {
        const ov = Math.min(ev.chunkEnd, t.end_pos) - Math.max(ev.chunkStart, t.start_pos);
        if (ov > bestOv) {
          best = t;
          bestOv = ov;
        }
      }
      let id: string;
      if (!best) {
        id = newId();
        traps.set(id, {
          id, card_id: input.cardId, start_pos: ev.chunkStart, end_pos: ev.chunkEnd, chunk: ev.chunk, kind: ev.kind, pattern: ev.pattern,
          misses: 0, hits: 0, streak: 0, hit_days: [], miss_day: null, last_miss: null, last_hit: null, retired: false,
        });
      } else {
        id = best.id;
        const lo = Math.min(ev.chunkStart, best.start_pos);
        const hi = Math.max(ev.chunkEnd, best.end_pos);
        if (hi - lo <= 7 && (lo !== best.start_pos || hi !== best.end_pos)) {
          best.start_pos = lo;
          best.end_pos = hi;
          best.chunk = input.answer.slice(lo, hi);
        }
      }
      touched.set(id, Math.max(touched.get(id) ?? 0, w));
      changedTraps.add(id);
      const pk = `${ev.pattern}@${ev.chunkStart}`;
      if (!patSeen.has(pk)) {
        patSeen.add(pk);
        bumpPattern(ev.pattern, ev.kind, w, false);
      }
    }
  }
  const missedPatterns = new Set([...patSeen].map((k) => k.split("@")[0]));

  for (const tid of input.firstTryMisses ?? []) {
    const t = traps.get(tid);
    if (t) {
      touched.set(tid, 1);
      changedTraps.add(tid);
      if (!missedPatterns.has(t.pattern)) {
        bumpPattern(t.pattern, t.kind, 1, false);
        missedPatterns.add(t.pattern);
      }
    } else if (tid.startsWith("p:")) {
      const pat = tid.slice(2).split("@")[0];
      if (!missedPatterns.has(pat)) {
        bumpPattern(pat, "pattern", 1, false);
        missedPatterns.add(pat);
      }
    }
  }
  for (const [tid, w] of touched) {
    const t = traps.get(tid);
    if (!t) continue;
    t.misses += w;
    t.streak = 0;
    t.last_miss = nowIso;
    t.miss_day = today;
    t.retired = false;
  }

  const retired: string[] = [];
  for (const tid of input.passes ?? []) {
    const t = traps.get(tid);
    if (t) {
      if (touched.has(tid)) continue;
      t.hits += 1;
      t.streak += 1;
      t.last_hit = nowIso;
      if (!t.hit_days.includes(today)) t.hit_days = [...t.hit_days, today].slice(-6);
      const since = t.hit_days.filter((d) => !t.miss_day || d > t.miss_day);
      if (t.streak >= CARD_RETIRE_STREAK && new Set(since).size >= CARD_RETIRE_DAYS) {
        t.retired = true;
        retired.push(tid);
      }
      changedTraps.add(tid);
      if (!missedPatterns.has(t.pattern)) bumpPattern(t.pattern, t.kind, 0, true);
    } else if (tid.startsWith("p:")) {
      const pat = tid.slice(2).split("@")[0];
      if (!missedPatterns.has(pat)) bumpPattern(pat, "pattern", 0, true);
    }
  }

  return {
    traps: [...changedTraps].map((id) => traps.get(id)).filter((x): x is TrapRow => !!x),
    patterns: [...changedPats].map((p) => pats.get(p)).filter((x): x is PatternRow => !!x),
    events,
    missed: [...touched.keys()],
    retired,
  };
}

/** Armed traps for a card (plus gentle pattern traps) for its study payload, sorted by position. */
export function activeSpots(
  answer: string,
  rows: TrapRow[],
  patterns: PatternRow[] = [],
  patternWords: Record<string, number> = {},
  limit = MAX_TRAPS_PER_CARD,
): TrapSpot[] {
  if (!answer) return [];
  const out: TrapSpot[] = [];
  const overlaps = (s: number, e: number) => out.some((o) => !(e <= o.start || s >= o.end));
  const sorted = rows.filter((r) => !r.retired && r.misses >= ARM_AT).sort((a, b) => b.misses - a.misses);
  for (const r of sorted) {
    let { start_pos: s, end_pos: e } = r;
    if (answer.slice(s, e) !== r.chunk) {
      const k = r.chunk ? answer.indexOf(r.chunk) : -1;
      if (k < 0 || answer.indexOf(r.chunk, k + 1) >= 0) continue; // the card was edited: drop it
      s = k;
      e = k + r.chunk.length;
    }
    if (overlaps(s, e)) continue;
    const { label, question } = describe(r.pattern);
    out.push({
      id: r.id, start: s, end: e, chunk: r.chunk, kind: r.kind, pattern: r.pattern, label, question,
      misses: Math.round(r.misses * 100) / 100, streak: r.streak, level: levelOf(r.misses, r.streak), reps: repsFor(r.misses), source: "card",
    });
    if (out.length >= limit) break;
  }
  // strong global patterns guard matching spots of words never missed: 3+ strikes across 2+ words, gently
  const strong = patterns
    .filter((p) => !p.retired && p.misses >= 3 && (patternWords[p.pattern] ?? 0) >= 2 && /^(dbl:|lat:|ie\/ei|vowel:|sub:)/.test(p.pattern))
    .map((p) => ({ pattern: p.pattern, strength: p.misses - 0.35 * p.hits }))
    .filter((p) => p.strength >= 3)
    .sort((a, b) => b.strength - a.strength);
  if (strong.length && out.length < limit) {
    for (const st of sites(answer)) {
      if (out.length >= limit || out.filter((o) => o.source === "pattern").length >= 2) break;
      if (!strong.some((s) => s.pattern === st.pattern) || overlaps(st.start, st.end)) continue;
      const { label, question } = describe(st.pattern);
      out.push({
        id: `p:${st.pattern}@${st.start}`, start: st.start, end: st.end, chunk: answer.slice(st.start, st.end), kind: "pattern", pattern: st.pattern,
        label, question, misses: 0, streak: 0, level: 1, reps: 3, source: "pattern",
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
