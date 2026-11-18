// How a "keywords" card is answered, derived from its data at load (no seed needed):
//   * a term or short phrase (a structure, area, nerve, number...; at most TERM_MAX_WORDS words) is TYPED OUT live
//     (per-letter checking) against the answer, its accept forms and the forms its keyword groups allow;
//   * a short list whose items each answer one keyword group ("Raphe nuclei and locus coeruleus") becomes one
//     type-out box per item (parts);
//   * only a genuinely explanatory answer (a sentence of reasoning) keeps the free-text box, graded by keywords.
// The keyword groups stay on the card either way: the grader falls back to them, so a phrasing the keywords
// accept is never marked wrong. Also here: the live "on track" check for typed-out keyword cards, and the
// keyword highlighting shown on a free-text answer after submit.
import { canon, canonStr, DEFAULT_CANON, lev } from "./text.ts";
import { gradeKeywords } from "./grade.ts";
import type { AnswerPart } from "./types.ts";

export const TERM_MAX_WORDS = 6;
const SENTENCE = /\b(is|are|was|were|they|it|this|these|which|has|have|does|do)\b/i;

export interface KeywordCardLike {
  answer: string;
  accept: string[];
  keywords?: string[][];
  parts?: AnswerPart[];
}

export type AnswerStyle =
  | { style: "term"; accept: string[] }
  | { style: "parts"; parts: AnswerPart[] }
  | { style: "free"; why: string };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
/** the answer without "(...)" asides: "Ventral horn (lower motor neurons)" -> "Ventral horn" */
export const stripAsides = (s: string) => s.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const allHit = (typed: string, groups: string[][]) => {
  const r = gradeKeywords(typed, groups);
  return r.total > 0 && r.hits === r.total;
};

/** Pieces of a list answer: "A, B and C" / "A and B". Null when it is not a plain list of terms. */
function listPieces(answer: string): string[] | null {
  const a = stripAsides(answer);
  // clauses (":" ";" ".") are an explanation, not a list of terms
  if (/[:;.?!]/.test(a.replace(/\b\p{L}\./gu, ""))) return null;
  const pieces = a.split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  return pieces.length >= 2 ? pieces : null;
}

/** Decide how a keywords card is answered (see the file comment). */
export function answerStyle(card: KeywordCardLike): AnswerStyle {
  const groups = card.keywords ?? [];
  const answer = card.answer.trim();
  if (!answer) return { style: "free", why: "no answer text" };
  if (!groups.length) return { style: "term", accept: [] };
  const bare = stripAsides(answer);
  // "Upper motor neuron lesion: spastic paralysis": a term heading the explanation, and the term alone hits every
  // key idea: type the term out (the explanation shows after answering)
  const head = bare.split(/\s*[:;]\s*/)[0];
  if (head !== bare && words(head).length <= TERM_MAX_WORDS && !SENTENCE.test(head) && allHit(head, groups)) return { style: "term", accept: [head, ...termAccepts(card, groups)] };
  // a sentence ("They are neurons and are replaced throughout life") is an explanation, however short
  if (SENTENCE.test(bare)) return { style: "free", why: "a sentence" };
  // a list whose items answer the keyword groups one to one: one box per item
  if (groups.length >= 2) {
    const pieces = listPieces(answer);
    if (pieces && pieces.length === groups.length && pieces.every((p) => words(p).length <= TERM_MAX_WORDS)) {
      const used = new Set<number>();
      const parts: AnswerPart[] = [];
      for (const p of pieces) {
        const g = groups.findIndex((grp, i) => !used.has(i) && allHit(p, [grp]));
        if (g < 0) break;
        used.add(g);
        parts.push({ text: p, accept: groups[g].filter((k) => canonStr(k) !== canonStr(p) && words(k).length <= TERM_MAX_WORDS) });
      }
      if (parts.length === pieces.length) return { style: "parts", parts };
    }
  }
  if (/[:;]/.test(bare) || /\.\s+\p{L}/u.test(bare)) return { style: "free", why: "explanatory (several clauses)" };
  if (words(bare).length > TERM_MAX_WORDS) return { style: "free", why: `explanatory (${words(bare).length} words)` };
  return { style: "term", accept: termAccepts(card, groups) };
}

/** Extra accepted forms for a typed-out keyword card: each one the keyword grader accepts on its own. */
function termAccepts(card: KeywordCardLike, groups: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set([card.answer, ...card.accept].map((s) => canonStr(s)));
  const add = (s: string) => {
    const k = canonStr(s);
    if (!k || seen.has(k) || !allHit(s, groups)) return;
    seen.add(k);
    out.push(s.trim());
  };
  add(stripAsides(card.answer));
  if (groups.length === 1) for (const k of groups[0]) add(k);
  else {
    const firsts = groups.map((g) => g[0]);
    add(firsts.join(" and "));
    add(firsts.join(" "));
  }
  return out;
}

/** Normalise a keywords card at load: a term becomes a typed answer, a list becomes parts; free text stays. */
export function applyAnswerStyle<T extends KeywordCardLike & { format: string }>(card: T): T {
  if (card.format !== "keywords" || (card.parts && card.parts.length >= 2)) return card;
  const s = answerStyle(card);
  if (s.style === "term") return { ...card, format: "type", accept: [...card.accept, ...s.accept] };
  if (s.style === "parts") return { ...card, format: "type", parts: s.parts, partsOrdered: false };
  return card;
}

// ------------------------------------------------------------------ live "on track" check for keyword cards

/** inflection endings: "nuclei" and "nucleus", "ganglia" and "ganglion", "arteries" and "artery" share a stem */
const SUFFIXES = ["ies", "es", "us", "um", "on", "s", "i", "a", "y", "e"];
const CONNECTORS = ["and", "or", "the", "a", "an", "of", "to", "in", "on", "from", "with", "via", "by", "for", "is", "are", "its", "into", "at", "as", "both", "then", "not", "no", "&"];

/** Every word a right answer to this card is likely made of (canonical): the answer, accept forms, keywords. */
export function vocabularyOf(card: KeywordCardLike): Set<string> {
  const v = new Set(CONNECTORS);
  for (const s of [card.answer, ...card.accept, ...(card.keywords ?? []).flat()]) for (const w of canonStr(s).split(" ")) if (w) v.add(w);
  return v;
}

/** Where typed text stops being on track (source index), for a keyword card whose text left every accepted
 *  form: the keyword grader already accepts it (then all of it is fine), or every finished word is one of the
 *  card's words (or a form of one) and the word being typed starts one. `done`: the keywords are all hit. */
export function keywordTrack(typed: string, groups: string[][], vocab: Set<string>): { okEnd: number; done: boolean } {
  const hitAll = groups.length > 0 && allHit(typed, groups);
  const re = /[\p{L}\p{N}]+/gu;
  const toks = [...typed.matchAll(re)].map((m) => ({ w: canonStr(m[0]), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const vs = [...vocab];
  const stem = (w: string) => {
    const suf = SUFFIXES.find((x) => w.length - x.length >= 3 && w.endsWith(x));
    return suf ? w.slice(0, -suf.length) : w;
  };
  const lcp = (a: string, b: string) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  };
  // the word, or another form of it ("nuclei" for "nucleus", "fibres" for "fibers")
  const known = (w: string) => vocab.has(w) || (w.length >= 4 && vs.some((v) => v.length >= 4 && lcp(v, w) >= 3 && stem(v) === stem(w)));
  // a letter or two off a card word is a misspelling: red even where the typo-tolerant keyword grader would pass it
  const misspelt = (w: string) => vs.some((v) => v.length >= 4 && v !== w && lev(v, w) <= (v.length >= 7 ? 2 : 1));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const last = i === toks.length - 1 && t.end === typed.length;
    const ok = known(t.w) || (last && vs.some((v) => v.startsWith(t.w))) || (hitAll && !misspelt(t.w));
    if (!ok) return { okEnd: t.at, done: false };
  }
  return { okEnd: typed.length, done: hitAll };
}

// ------------------------------------------------------------------ free-text answers: highlight the key ideas

export interface KeywordMark {
  /** source ranges of the typed text that hit a key idea */
  spans: Array<[number, number]>;
  /** per group: hit or not, and its first keyword to show */
  groups: Array<{ label: string; hit: boolean }>;
}

/** Which key ideas a free-text answer hit, and where in the text. */
export function keywordMarks(typed: string, groups: string[][]): KeywordMark {
  const r = gradeKeywords(typed, groups);
  const c = canon(typed, DEFAULT_CANON);
  const spans: Array<[number, number]> = [];
  for (const g of groups) {
    for (const k of g) {
      const kc = canonStr(k);
      if (!kc) continue;
      // phrase at a word start, or a word that shares the keyword's stem
      const stem = kc.includes(" ") ? kc : kc.length >= 5 ? kc.slice(0, kc.length - 1) : kc;
      let from = 0;
      for (;;) {
        const i = c.s.indexOf(stem, from);
        if (i < 0) break;
        from = i + 1;
        if (i > 0 && c.s[i - 1] !== " ") continue;
        let j = i + stem.length;
        while (j < c.s.length && c.s[j] !== " " && !kc.includes(" ")) j++;
        if (kc.includes(" ")) j = i + kc.length;
        const a = c.map[i];
        const b = c.map[Math.min(j, c.map.length) - 1] + 1;
        if (allHit(c.s.slice(i, j), [g])) spans.push([a, b]);
      }
    }
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [];
  for (const s of spans) {
    const l = merged[merged.length - 1];
    if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return { spans: merged, groups: groups.map((g, i) => ({ label: g[0], hit: r.hit[i] })) };
}
