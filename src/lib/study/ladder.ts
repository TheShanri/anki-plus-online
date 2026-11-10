// The scaffold ladder, from ANKI+'s Russian training wheels (web/js/ru/wheels.js), made LIGHT for anatomy names
// (not a foreign language: it behaves like ANKI+'s first look -> recall flow, with help only after a miss).
// Rungs: 0 copy (the whole answer as ghost text), 1 skeleton (vowels to fill in: C__d_t_ n_cl__s),
// 2 first letters (C______ n______), 3 recall (no scaffold). The step is 0..6 (rung = step >> 1).
//   - a first look is the copy; the next showing is already from memory
//   - a miss at recall brings back first letters once; another miss, the skeleton (never the copy again)
//   - any clean pass with help goes straight back to recall
// Odd half-steps (a fading word by word) only remain on cards saved by the older, Russian-strength ladder.
// Below the recall rung an answer is practice: graded at most Hard, never counted as a clean recall, and its
// typos never become spelling traps.
import { isLetter } from "./text.ts";

export const RUNGS = ["copy", "skeleton", "first letters", "recall"] as const;
export const MAX_STEP = 6;
const VOWELS = "aeiouyAEIOUY";
const MARK = /\p{M}/u;

export type LadderOutcome = "top" | "up" | "stay" | "down";

export function rungOf(step: number): number {
  return Math.max(0, Math.min(3, step >> 1));
}

export function stepName(step: number): string {
  return step & 1 ? `${RUNGS[step >> 1]} > ${RUNGS[(step >> 1) + 1]}` : RUNGS[step >> 1];
}

/** True once the card is at the recall rung: no scaffold, counts as a real recall. */
export function isRecall(step: number): boolean {
  return step >= MAX_STEP;
}

function wordsOf(answer: string): number {
  return (answer.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Long answers fade in half-steps. */
export function isLong(answer: string): boolean {
  const letters = [...answer].filter(isLetter).length;
  return wordsOf(answer) >= 2 ? letters >= 6 : letters >= 9;
}

/** Split a word into rough syllables at vowel-group boundaries (Latin/Greek/English anatomy terms). */
export function syllables(word: string): string[] {
  const m = word.match(/[^aeiouyAEIOUY]*[aeiouyAEIOUY]+(?:[^aeiouyAEIOUY]+(?![aeiouyAEIOUY]))?/g);
  if (!m) return [word];
  const joined = m.join("");
  if (joined.length < word.length) m[m.length - 1] += word.slice(joined.length);
  return m;
}

interface Unit {
  start: number;
  end: number;
  n: number;
  front?: boolean;
}

function unitsOf(answer: string): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < answer.length; ) {
    if (!isLetter(answer[i])) {
      i++;
      continue;
    }
    const start = i;
    let n = 0;
    while (i < answer.length && (isLetter(answer[i]) || MARK.test(answer[i]))) {
      if (isLetter(answer[i])) n++;
      i++;
    }
    out.push({ start, end: i, n });
  }
  if (out.length === 1 && out[0].n >= 9) {
    const w = out[0];
    const syl = syllables(answer.slice(w.start, w.end));
    let at = w.start;
    let best = -1;
    let bestD = Infinity;
    let seen = 0;
    for (const s of syl.slice(0, -1)) {
      at += s.length;
      seen += [...s].filter(isLetter).length;
      const d = Math.abs(seen - w.n / 2);
      if (d < bestD) {
        bestD = d;
        best = at;
      }
    }
    if (best > 0) return [{ start: w.start, end: best, n: 0, front: true }, { start: best, end: w.end, n: 0 }];
  }
  return out;
}

/** On an odd step: which units fade first (the shorter half of the words, later ones on a tie; one long word: its back half). */
function fadeGroup(units: Unit[]): Set<number> {
  if (units.length === 2 && units[0].front) return new Set([1]);
  const order = units.map((_, k) => k).sort((a, b) => units[a].n - units[b].n || b - a);
  return new Set(order.slice(0, Math.ceil(units.length / 2)));
}

interface Levels {
  lv: number[];
  head: boolean[];
  units: Unit[];
  fade: Set<number>;
}
const CACHE = new Map<string, Levels>();

function levels(answer: string, step: number): Levels {
  const key = `${step}\u0000${answer}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const lo = step >> 1;
  const units = unitsOf(answer);
  const fade = step & 1 ? fadeGroup(units) : new Set<number>();
  const lv = new Array<number>(answer.length).fill(lo);
  const head = new Array<boolean>(answer.length).fill(false);
  units.forEach((u, k) => {
    const l = fade.has(k) ? Math.min(3, lo + 1) : lo;
    for (let i = u.start; i < u.end; i++) lv[i] = l;
    head[u.start] = true;
  });
  const v = { lv, head, units, fade };
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(key, v);
  return v;
}

/** The rest of the answer from `from`, with the letters this step hides as "_" (per word: level 0 all shown,
 *  1 consonants + the first letter, 2 the first letter, 3 none: just the shape). Each level shows a subset of
 *  the one before, so the scaffold only ever thins out. Letters under `hintEnd` are always shown (hints). */
export function scaffold(answer: string, from: number, step: number, hintEnd = 0): string {
  const { lv, head } = levels(answer, step);
  let out = "";
  let shown = true;
  for (let i = from; i < answer.length; i++) {
    const ch = answer[i];
    if (MARK.test(ch)) {
      if (shown) out += ch;
      continue;
    }
    const l = lv[i];
    shown = i < hintEnd || l <= 0 || !isLetter(ch) || (l === 1 && (!VOWELS.includes(ch) || head[i])) || (l === 2 && head[i]);
    out += shown ? ch : "_";
  }
  return out;
}

/** "horn", "horn and of", "horn, of and lateral" */
function listWords(ws: string[]): string {
  if (ws.length <= 1) return ws[0] ?? "";
  return `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`;
}

/** Text for the rung help line: what to do with the scaffold on screen. */
export function helpText(step: number, answer: string): string {
  const r = step >> 1;
  const base = ["Copy: type what you see", "Skeleton: fill in the missing vowels", "First letters: finish each word"][r] ?? "";
  if (!(step & 1) || !answer) return base;
  const { units, fade } = levels(answer, step);
  const ws = units.filter((_, k) => fade.has(k)).map((u) => answer.slice(u.start, u.end));
  const backHalf = ws.length === 1 && units.length === 2 && units[0].front;
  const what = backHalf ? "the end of the word" : listWords(ws);
  const many = !backHalf && ws.length > 1;
  if (r === 0) return `Copy what you see; fill in the missing vowels ${backHalf ? "at the end of the word" : "in " + what}`;
  if (r === 1) return `Fill in the missing vowels; ${what} ${many ? "show" : "shows"} only the first letter`;
  return `Finish each word; ${what} ${many ? "are" : "is"} left blank`;
}

/** The "next time ..." text for a move from `step` to `next`. */
export function nextText(answer: string, step: number, next: number): string {
  if (next === step) return "same help next time";
  if (next < step) return `next time: back to ${stepName(next)}`;
  if (next >= MAX_STEP) return "next time: from memory";
  if (next & 1) return `next time: a little less help (${stepName(next)})`;
  return `next time: ${RUNGS[next >> 1]}`;
}

export interface LadderResult {
  /** the answer was correct (a clean match) */
  right: boolean;
  /** first look on a brand-new card */
  firstLook: boolean;
  /** typed it unaided on first sight / typed the intro copy cleanly */
  introClean?: boolean;
  typos: number;
  hinted: number;
}

/** How this answer moves the card on the ladder. */
export function ladderOutcome(step: number, r: LadderResult): LadderOutcome {
  if (r.firstLook) {
    if (r.right && r.hinted === 0) return "top"; // typed it unaided on first sight
    return r.introClean ? "up" : "stay";
  }
  if (!r.right) return "down";
  if (step >= MAX_STEP) return "stay";
  return r.typos === 0 && r.hinted === 0 ? "up" : "stay";
}

/** The step after a move. */
export function nextStep(step: number, out: LadderOutcome, long: boolean): number {
  void long; // answers of every length move the same (no half-steps for anatomy names)
  if (out === "top" || out === "up") return MAX_STEP;
  if (out === "down") return step >= MAX_STEP ? 4 : 2; // first letters, then the skeleton; never the copy again
  return step === 0 ? MAX_STEP : step; // after the first look's copy: from memory next time
}

/** Clean-recall streak after an answer: only unaided correct answers at the recall rung count. */
export function nextCleanStreak(streak: number, o: { right: boolean; step: number; hinted: number; practice?: boolean }): number {
  if (!o.right) return 0;
  if (o.hinted > 0 || o.step < MAX_STEP || o.practice) return streak;
  return streak + 1;
}

/** The fields of an answer (POST /api/study/answer) that move the card's ladder row. */
export interface LadderAnswer {
  ladder?: { stepBefore: number; stepAfter: number; effectiveStep: number };
  correct?: boolean | null;
  hintCount: number;
  unaided: boolean;
  recall?: "clean" | "miss" | "keep";
}

/** The card_ladder row the server stores after an answer (null: leave the row as it is); `clean` = a clean recall
 *  (stamps last_clean_at). Must agree with what StudyEngine.accept() keeps locally. */
export function ladderWrite(prev: { step: number; clean_streak: number } | null, b: LadderAnswer): { step: number; clean_streak: number; clean: boolean } | null {
  const prevStreak = prev?.clean_streak ?? 0;
  if (b.ladder) {
    const streak = nextCleanStreak(prevStreak, { right: b.correct === true, step: b.ladder.effectiveStep, hinted: b.hintCount });
    return { step: b.ladder.stepAfter, clean_streak: streak, clean: streak > prevStreak };
  }
  // typing off / free text: the self-rating decides (a Hard keeps the streak; only Again resets it)
  if (b.recall === "clean") return { step: prev?.step ?? 0, clean_streak: prevStreak + 1, clean: true };
  if (b.recall === "miss") return { step: prev?.step ?? 0, clean_streak: 0, clean: false };
  if (b.recall === "keep") return null;
  // ladder switched off: every unaided correct answer is a recall
  if (b.correct === true && b.hintCount === 0 && b.unaided) return { step: MAX_STEP, clean_streak: prevStreak + 1, clean: true };
  if (b.correct === false && prev) return { step: prev.step, clean_streak: 0, clean: false };
  return null;
}
