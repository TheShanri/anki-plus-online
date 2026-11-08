// Accepted spellings of an answer. The grader and the typer match against a SET of variants instead of
// rewriting the typed text, so per-key prefix tracking and ghost hints keep working for every form.
//
// Rules (docs/CONTENT_SCHEMA.md): leading "the", hyphen/space, Roman <-> Arabic cranial-nerve numbers,
// CN / cranial nerve, n. = nerve or nucleus, a. = artery, m. = muscle..., left/right (side words).

export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** [full word, abbreviations]: both directions are generated. */
const WORD_ABBR: Array<[string, string[]]> = [
  ["nerve", ["n.", "n"]],
  ["nerves", ["nn.", "nn"]],
  ["nucleus", ["n.", "n", "nuc.", "nuc"]],
  ["nuclei", ["nn.", "nn"]],
  ["artery", ["a.", "a"]],
  ["arteries", ["aa.", "aa"]],
  ["vein", ["v.", "v"]],
  ["veins", ["vv.", "vv"]],
  ["muscle", ["m.", "m"]],
  ["muscles", ["mm.", "mm"]],
  ["ligament", ["lig.", "lig"]],
  ["fasciculus", ["fasc.", "fasc"]],
  ["ganglion", ["gl.", "gl", "gang.", "gang"]],
  ["tract", ["tr.", "tr"]],
  ["cortex", ["ctx", "ctx."]],
];

const CN_NUM = "(?:XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|12|11|10|[1-9])";
const CN_RE = new RegExp(`\\b(?:cranial\\s+nerve|cranial\\s+n\\.?|cn|c\\.n\\.)\\s*#?\\s*(${CN_NUM})\\b`, "gi");

function romanOf(token: string): { roman: string; arabic: string } | null {
  const up = token.toUpperCase();
  const idx = ROMAN.indexOf(up);
  if (idx > 0) return { roman: ROMAN[idx], arabic: String(idx) };
  const n = Number(token);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return { roman: ROMAN[n], arabic: String(n) };
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cranial-nerve number forms: "CN VII" -> "CN 7", "cranial nerve VII", "cranial nerve 7". */
function cranialVariants(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CN_RE)) {
    const num = romanOf(m[1]);
    if (!num) continue;
    for (const prefix of ["CN", "cranial nerve"]) {
      for (const n of [num.roman, num.arabic]) {
        out.push(text.slice(0, m.index) + `${prefix} ${n}` + text.slice((m.index ?? 0) + m[0].length));
      }
    }
  }
  return out;
}

const SIDE_WORDS = ["left", "right"];

/** left/right (or l/r) as a whole word in the text, else null. */
export function hasSideWord(s: string): "left" | "right" | null {
  const m = /(^|[^a-z])(left|right|l|r)(\.|\)|\s|$)/i.exec(s.replace(/\(/g, " "));
  if (!m) return null;
  const w = m[2].toLowerCase();
  return w === "l" || w === "left" ? "left" : "right";
}

const WORDY = /^[\p{L}' -]+$/u;

/** The parts of "A/B" or "A or B" when they are alternative terms (letters only, no numbers like "L4/L5").
 *  A shared trailing noun is distributed: "Gracile/cuneate nuclei" -> "Gracile nuclei", "cuneate nuclei". */
export function alternativesOf(s: string): string[] {
  const t = s.trim();
  let parts: string[] = [];
  if (t.includes("/")) parts = t.split(/\s*\/\s*/);
  else if (/\s+or\s+/i.test(t)) parts = t.split(/\s+or\s+/i);
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return [];
  if (!parts.every((p) => WORDY.test(p) && p.replace(/[^\p{L}]/gu, "").length >= 3 && p.split(/\s+/).length <= 4)) return [];
  const last = parts[parts.length - 1].split(/\s+/);
  const heads = parts.slice(0, -1);
  if (last.length > 1 && heads.every((h) => !/\s/.test(h))) {
    const tail = last.slice(1).join(" ");
    return [...heads.map((h) => `${h} ${tail}`), parts[parts.length - 1]];
  }
  return parts;
}

export interface VariantOptions {
  requireSide?: boolean;
  max?: number;
}

/** All accepted source spellings, the canonical answer first. */
export function answerVariants(answer: string, accept: string[] = [], opts: VariantOptions = {}): string[] {
  return buildVariants(answer, accept, opts).all;
}

const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Variants added only to be lenient ("the X", "left X", "X right"): they must not stop an auto-submit. */
export function decorativeKeys(answer: string, accept: string[] = [], opts: VariantOptions = {}): Set<string> {
  return buildVariants(answer, accept, opts).decorative;
}

function buildVariants(answer: string, accept: string[], opts: VariantOptions): { all: string[]; decorative: Set<string> } {
  const decorative = new Set<string>();
  const max = opts.max ?? 64;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const k = t.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(t);
  };
  for (const b of [answer, ...accept]) if (b && b.trim()) add(b);
  // "Ventral/anterior", "Rostral or anterior": either term alone is a full answer
  for (const b of [...out]) for (const alt of alternativesOf(b)) add(alt);

  for (const b of [...out]) for (const v of cranialVariants(b)) add(v);

  for (const [full, abbrs] of WORD_ABBR) {
    for (const cur of [...out]) {
      const fullRe = new RegExp(`(^|[^\\p{L}])${escapeRe(full)}(?![\\p{L}])`, "giu");
      if (fullRe.test(cur)) {
        for (const ab of abbrs) add(cur.replace(new RegExp(fullRe.source, "giu"), `$1${ab}`));
      }
    }
    for (const ab of abbrs) {
      for (const cur of [...out]) {
        const abRe = new RegExp(`(^|[^\\p{L}])${escapeRe(ab)}(?=\\s|$)`, "iu");
        if (abRe.test(cur) && cur.trim().length > ab.length + 1) add(cur.replace(abRe, `$1${full}`));
      }
    }
  }

  const before = new Set(out.map(keyOf));
  const sided = out.filter((v) => hasSideWord(v));
  if (opts.requireSide) {
    for (const v of sided) {
      add(v.replace(/\bleft\b/gi, "L").replace(/\bright\b/gi, "R"));
      add(v.replace(/\bleft\b/gi, "l.").replace(/\bright\b/gi, "r."));
    }
  } else {
    // side not required: "left caudate nucleus" must not be marked wrong for "caudate nucleus"
    for (const v of [...out].filter((x) => !hasSideWord(x)).slice(0, 8)) {
      for (const w of SIDE_WORDS) {
        add(`${w} ${v}`);
        add(`${v} ${w}`);
        add(`${w[0]} ${v}`);
      }
    }
  }

  for (const v of [...out]) if (!/^the\s/i.test(v)) add(`the ${v}`);
  for (const v of out) {
    const k = keyOf(v);
    if (before.has(k)) continue;
    // added after the base forms: "the X" always; side-word forms only when the side is not required
    if (/^the\s/i.test(v) || !opts.requireSide) decorative.add(k);
  }
  return { all: out, decorative };
}
