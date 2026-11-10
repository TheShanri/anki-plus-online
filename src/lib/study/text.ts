// Text utilities for the type-the-answer engine. Ported from ANKI+ (web/js/views/study.js: canon, lev,
// similarity, diffHtml) and adapted for anatomy: case-insensitive by default, hyphen/slash = space,
// accents and punctuation ignored. Pure, no DOM.

export interface CanonFlags {
  ignoreCase: boolean;
  ignorePunctuation: boolean;
  ignoreAccents: boolean;
}

export const DEFAULT_CANON: CanonFlags = { ignoreCase: true, ignorePunctuation: true, ignoreAccents: true };

const QUOTES: Record<string, string> = { "’": "'", "‘": "'", "‚": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " " };
const PUNCT = /[\p{P}\p{S}]/u;
const LETTER = /[\p{L}\p{N}]/u;
// These separate words rather than vanish: "grey-matter" == "grey matter", "dorsal/ventral" == "dorsal ventral".
const SPACEY = new Set(["-", "/", "_"]);
// Every dash (hyphen, non-breaking hyphen, figure dash, minus sign...) is a hyphen: pasted or phone-typed
// "Edinger‑Westphal" must not lose its word break.
const DASH = /[\p{Pd}−]/u;

export interface Canon {
  /** canonical string */
  s: string;
  /** canonical index -> source index */
  map: number[];
}

/** Canonicalise text for comparison; returns the string and a map canonical-index -> source-index. */
export function canon(str: string, f: CanonFlags = DEFAULT_CANON, keepTrailingSpace = false): Canon {
  const out: string[] = [];
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < str.length; i++) {
    let ch = QUOTES[str[i]] ?? str[i];
    if (SPACEY.has(ch) || DASH.test(ch)) ch = " ";
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        out.push(" ");
        map.push(i);
        prevSpace = true;
      }
      continue;
    }
    if (f.ignorePunctuation && PUNCT.test(ch)) continue;
    let p = ch;
    if (f.ignoreAccents) p = p.normalize("NFD").replace(/\p{M}/gu, "");
    if (f.ignoreCase) p = p.toLowerCase();
    for (const c of p) {
      out.push(c);
      map.push(i);
    }
    prevSpace = false;
  }
  if (!keepTrailingSpace) {
    while (out.length && out[out.length - 1] === " ") {
      out.pop();
      map.pop();
    }
  }
  return { s: out.join(""), map };
}

export function canonStr(str: string, f: CanonFlags = DEFAULT_CANON): string {
  return canon(str, f).s;
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transposition counts as one edit). */
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
    }
  }
  return d[m][n];
}

export function similarity(a: string, b: string): number {
  const L = Math.max(a.length, b.length);
  return L ? 1 - lev(a, b) / L : 1;
}

export function letterCount(s: string): number {
  let n = 0;
  for (const c of s) if (LETTER.test(c)) n++;
  return n;
}

export function isLetter(c: string): boolean {
  return LETTER.test(c);
}

export type DiffOp = { op: "eq" | "sub" | "del" | "ins"; typed: string; answer: string };

/** Letter-level alignment of typed vs answer. `del` = extra letter typed, `ins` = letter missing. Differences
 *  the grader ignores (case, accents, punctuation) come back as `eq`. */
export function diffOps(typed: string, answer: string, f: CanonFlags = DEFAULT_CANON): DiffOp[] {
  const units = (s: string) => s.match(/\P{M}\p{M}*/gu) ?? [];
  const a = units(typed);
  const b = units(answer);
  const key = (u: string) => canon(u, { ...f, ignorePunctuation: false }).s || u;
  const ka = a.map(key);
  const kb = b.map(key);
  const eq = (i: number, j: number) => a[i] === b[j] || ka[i] === kb[j];
  const m = a.length;
  const n = b.length;
  const D = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) D[i][0] = i;
  for (let j = 0; j <= n; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (eq(i - 1, j - 1) ? 0 : 1));
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (eq(i - 1, j - 1) ? 0 : 1)) {
      ops.push({ op: eq(i - 1, j - 1) ? "eq" : "sub", typed: a[i - 1], answer: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      const x = a[i - 1];
      // punctuation / separators the grader ignores are not errors
      ops.push({ op: f.ignorePunctuation && PUNCT.test(x) ? "eq" : "del", typed: x, answer: "" });
      i--;
    } else {
      const y = b[j - 1];
      ops.push({ op: f.ignorePunctuation && PUNCT.test(y) ? "eq" : "ins", typed: "", answer: y });
      j--;
    }
  }
  return ops.reverse();
}
