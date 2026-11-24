import { lev } from "./text.ts";

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
    const at = (form: string) => text.slice(0, m.index) + form + text.slice((m.index ?? 0) + m[0].length);
    for (const prefix of ["CN", "cranial nerve"]) {
      for (const n of [num.roman, num.arabic]) out.push(at(`${prefix} ${n}`));
    }
    // "CN7", "CNVII": the space is often left out (the normaliser keeps spaces, so these need their own forms)
    for (const n of [num.arabic, num.roman]) out.push(at(`CN${n}`));
  }
  return out;
}

const SIDE_WORDS = ["left", "right"];

/** left/right (or l/r) as a whole word in the text, else null. A hyphen or comma after it ends the word too
 *  ("Right-atrium", "L-caudate", "left, ..."): the normaliser reads those as spaces, so the grader must as well. */
export function hasSideWord(s: string): "left" | "right" | null {
  const m = /(^|[^a-z])(left|right|l|r)(?![a-z0-9])/i.exec(s.replace(/\(/g, " "));
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
  // a shared head: "Arachnoid villi / granulations" is "arachnoid villi" or "arachnoid granulations", never a bare
  // "granulations" (which turned "g" green on that card)
  const first = parts[0].split(/\s+/);
  const rest = parts.slice(1);
  if (first.length > 1 && rest.every((r) => !/\s/.test(r) && !/^[A-Z0-9]+$/.test(r) && r.length >= 5)) {
    const head = first.slice(0, -1).join(" ");
    return [parts[0], ...rest.map((r) => `${head} ${r}`)];
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

  // Forms this loop shortened itself. "n." stands for nerve AND nucleus, so expanding a generated "Oculomotor n." again
  // would turn "Oculomotor nerve" into an accepted "Oculomotor nucleus": only abbreviations the author wrote expand.
  const shortened = new Set<string>();
  for (const [full, abbrs] of WORD_ABBR) {
    for (const cur of [...out]) {
      const fullRe = new RegExp(`(^|[^\\p{L}])${escapeRe(full)}(?![\\p{L}])`, "giu");
      // the word must not be the whole answer: "n" alone is no answer to "Nerve"
      if (fullRe.test(cur) && /\p{L}/u.test(cur.replace(new RegExp(fullRe.source, "giu"), "$1"))) {
        for (const ab of abbrs) {
          const s = cur.replace(new RegExp(fullRe.source, "giu"), `$1${ab}`);
          if (!seen.has(keyOf(s))) shortened.add(keyOf(s));
          add(s);
        }
      }
    }
    for (const ab of abbrs) {
      for (const cur of [...out]) {
        if (shortened.has(keyOf(cur))) continue;
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

/**
 * The other answers a card takes that are worth naming on the reveal: a synonym ("hypophysis" for the pituitary
 * gland), the other direction term ("posterior" for caudal in the cerebrum). Not the spelling forms of the answer
 * itself (case, "the", cranial-nerve numbers, abbreviations, a shortening or a longer form, grey/gray), and not the
 * names `alsoCalled` already shows.
 */
export function alsoAccepted(answer: string, accept: string[], alsoCalled: string[] = []): string[] {
  const k = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/^the /, "");
  const a = k(answer);
  if (!a) return [];
  const own = new Set(buildVariants(answer, [], { max: 96 }).all.map(k));
  const shown = new Set(alsoCalled.map(k));
  const seen = new Set<string>([a]);
  const out: string[] = [];
  for (const x of accept) {
    const kx = k(x);
    if (!kx || seen.has(kx) || shown.has(kx) || own.has(kx)) continue;
    seen.add(kx);
    if (a.includes(kx) || kx.includes(a)) continue; // a shortening or a longer form ("pituitary", "sagittal plane")
    if (/^(?:[ivx]+|\d+)$/.test(kx)) continue; // a bare number: a form of the one in the answer ("III", "3")
    if (lev(kx, a) <= Math.max(1, Math.floor(a.length / 6))) continue; // a spelling ("gray matter")
    if (out.some((o) => kx.includes(k(o)) || k(o).includes(kx))) continue; // a form of one already named ("frontal plane")
    out.push(x.trim());
  }
  return out;
}
