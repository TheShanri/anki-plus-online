// Grading typed answers. Pure. Practice mode: exact (after normalisation) is correct, a length-scaled
// near miss is "near_miss" (Hard, with a diff), everything else is wrong. Exam mode (mock practical):
// spelling strictness comes from courses.settings.exam_spelling (strict | normal | generous).
import { answerVariants, hasSideWord, type VariantOptions } from "./variants.ts";
import { canon, canonStr, DEFAULT_CANON, lev, similarity, type CanonFlags } from "./text.ts";

export type ExamSpelling = "strict" | "normal" | "generous";
export type VerdictResult = "correct" | "near_miss" | "wrong" | "empty";

export interface AnswerSpec {
  answer: string;
  accept?: string[];
  requireSide?: boolean;
}

export interface GradeOptions {
  /** "practice" (default) or "exam" (mock practical: near misses are scored by `spelling`). */
  mode?: "practice" | "exam";
  spelling?: ExamSpelling;
  /** canonical name -> structure slug of every structure in the course (to catch "that's a different structure"). */
  knownNames?: Record<string, string>;
  ownSlug?: string | null;
  flags?: CanonFlags;
}

export interface Verdict {
  result: VerdictResult;
  /** the variant that matched (or the closest one for a near miss) */
  matched: string | null;
  edits: number;
  why: string;
  kind?: "side" | "other_structure" | "antonym" | "typo" | "keywords";
  /** scoring weight in exam mode: 1, 0.5 or 0 */
  points: number;
}

/** canonical name / synonym -> structure slug; "*" when several structures share it (too generic to accept). */
export function buildKnownNames(rows: Array<{ slug: string; canonical_name: string; synonyms?: string[] | null }>, flags: CanonFlags = DEFAULT_CANON): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    for (const n of [r.canonical_name, ...(r.synonyms ?? [])]) {
      const k = canonStr(n, flags);
      if (!k) continue;
      if (!(k in out)) out[k] = r.slug;
      else if (out[k] !== r.slug) out[k] = "*";
    }
  }
  return out;
}

/** Allowed edits for a near miss, scaled with answer length (letters). */
export function nearTolerance(len: number, bonus = 0): number {
  if (len < 4) return bonus > 0 && len >= 3 ? 1 : 0;
  const base = len < 5 ? 0 : Math.min(3, Math.max(1, Math.floor(len * 0.15)));
  return Math.min(4, base + bonus);
}

/** Directional / paired words: swapping one for its opposite is a different structure, never a typo. */
const ANTONYMS: Array<[string, string]> = [
  ["superior", "inferior"], ["anterior", "posterior"], ["medial", "lateral"], ["dorsal", "ventral"],
  ["rostral", "caudal"], ["left", "right"], ["major", "minor"], ["internal", "external"], ["ascending", "descending"],
  ["afferent", "efferent"], ["sensory", "motor"], ["proximal", "distal"], ["deep", "superficial"], ["greater", "lesser"],
  ["upper", "lower"], ["short", "long"], ["sympathetic", "parasympathetic"], ["intrinsic", "extrinsic"],
  ["abduction", "adduction"], ["abductor", "adductor"], ["abducts", "adducts"],
];
const ANTONYM_OF = new Map<string, string>();
for (const [a, b] of ANTONYMS) {
  ANTONYM_OF.set(a, b);
  ANTONYM_OF.set(b, a);
}

function antonymSwap(typedCanon: string, answerCanon: string): boolean {
  const t = typedCanon.split(" ");
  const a = answerCanon.split(" ");
  const tSet = new Set(t);
  const aSet = new Set(a);
  for (const w of a) {
    const opp = ANTONYM_OF.get(w);
    if (opp && !tSet.has(w) && tSet.has(opp)) return true;
  }
  for (const w of t) {
    const opp = ANTONYM_OF.get(w);
    if (opp && !aSet.has(w) && aSet.has(opp)) return true;
  }
  return false;
}

const ROMAN_VALUE: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** The numbers named in a canonical string (Roman numeral words and digit runs), sorted: "cn vii" -> "7". */
function numbersOf(c: string): string {
  const out: number[] = [];
  for (const w of c.split(" ")) {
    const r = ROMAN_VALUE[w];
    if (r) out.push(r);
    else for (const d of w.match(/\d+/g) ?? []) out.push(Number(d));
  }
  return out.sort((a, b) => a - b).join(",");
}

/** Both name a number and the numbers differ (CN VI for CN VII, T4 for T5): a different structure, not a typo.
 *  A lone "v" (vein) on one side only is not a swap. */
function numberSwap(typedCanon: string, answerCanon: string): boolean {
  const a = numbersOf(typedCanon);
  const b = numbersOf(answerCanon);
  return a !== "" && b !== "" && a !== b;
}

export interface CompiledAnswer {
  variants: string[];
  canon: string[];
}

export function compileAnswer(spec: AnswerSpec, flags: CanonFlags = DEFAULT_CANON): CompiledAnswer {
  const vo: VariantOptions = { requireSide: !!spec.requireSide, max: 96 };
  const variants = answerVariants(spec.answer, spec.accept ?? [], vo);
  return { variants, canon: variants.map((v) => canonStr(v, flags)) };
}

/** Grade one typed answer against an answer spec. */
export function gradeTyped(typed: string, spec: AnswerSpec, opts: GradeOptions = {}, compiled?: CompiledAnswer): Verdict {
  const flags = opts.flags ?? DEFAULT_CANON;
  const exam = opts.mode === "exam";
  const spelling: ExamSpelling = opts.spelling ?? "generous";
  const t = canon(typed, flags).s;
  if (!t) return { result: "empty", matched: null, edits: 0, why: "No answer", points: 0 };
  const comp = compiled ?? compileAnswer(spec, flags);

  // structure-aware: an accepted short form that names another structure (or several) is not accepted.
  // Cards with no linked structure (level / section cards) listed their accepts on purpose: no veto there.
  const owner = opts.knownNames?.[t];
  const exactIdx0 = comp.canon.indexOf(t);
  if (exactIdx0 > 0 && owner && opts.ownSlug && owner !== opts.ownSlug && t !== comp.canon[0]) {
    return { result: "wrong", matched: null, edits: 99, why: owner === "*" ? "Too generic: name the structure fully" : "That is a different structure", kind: "other_structure", points: 0 };
  }

  // exact
  const exactIdx = exactIdx0;
  if (exactIdx >= 0) {
    const side = sideCheck(typed, spec);
    if (side) return side;
    return { result: "correct", matched: comp.variants[exactIdx], edits: 0, why: "", points: 1 };
  }

  // the side is missing or wrong in an otherwise right answer: say so
  if (spec.requireSide && hasSideWord(spec.answer)) {
    const strip = (c: string) => c.split(" ").filter((w) => !["left", "right", "l", "r"].includes(w)).join(" ");
    if (comp.canon.some((c) => strip(c) === strip(t))) {
      const v = sideCheck(typed, spec);
      if (v) return v;
    }
  }

  // another structure's exact name (or synonym): wrong, and say so
  const other = opts.knownNames?.[t];
  if (other && other !== opts.ownSlug && other !== "*") {
    return { result: "wrong", matched: null, edits: 99, why: "That is a different structure", kind: "other_structure", points: 0 };
  }

  // near miss: closest variant by edits
  let best = -1;
  let bestEdits = Infinity;
  for (let i = 0; i < comp.canon.length; i++) {
    const e = lev(t, comp.canon[i]);
    if (e < bestEdits) {
      bestEdits = e;
      best = i;
    }
  }
  if (best < 0) return { result: "wrong", matched: null, edits: 99, why: "", points: 0 };
  const target = comp.canon[best];
  const letters = target.replace(/ /g, "").length;
  const bonus = exam && spelling === "generous" ? 1 : 0;
  const tol = nearTolerance(letters, bonus);
  if (bestEdits <= tol && t.length > 1 && similarity(t, target) >= 0.72) {
    if (antonymSwap(t, target)) {
      return { result: "wrong", matched: comp.variants[best], edits: bestEdits, why: "A different structure (check the direction word)", kind: "antonym", points: 0 };
    }
    if (numberSwap(t, target)) {
      return { result: "wrong", matched: comp.variants[best], edits: bestEdits, why: "A different structure (check the number)", kind: "other_structure", points: 0 };
    }
    const side = sideCheck(typed, spec);
    if (side && side.result === "wrong") return side;
    if (exam) {
      if (spelling === "strict") return { result: "wrong", matched: comp.variants[best], edits: bestEdits, why: "Spelling", kind: "typo", points: 0 };
      if (spelling === "generous") return { result: "correct", matched: comp.variants[best], edits: bestEdits, why: "Spelling forgiven", kind: "typo", points: 1 };
      return { result: "near_miss", matched: comp.variants[best], edits: bestEdits, why: "Near miss", kind: "typo", points: 0.5 };
    }
    return { result: "near_miss", matched: comp.variants[best], edits: bestEdits, why: "Near miss: tiny typo", kind: "typo", points: 0.5 };
  }
  return { result: "wrong", matched: comp.variants[best], edits: bestEdits, why: "", points: 0 };
}

/** When the card needs a side, the typed answer must name the correct one. */
function sideCheck(typed: string, spec: AnswerSpec): Verdict | null {
  if (!spec.requireSide) return null;
  const want = hasSideWord(spec.answer);
  if (!want) return null;
  const got = hasSideWord(typed);
  if (!got) return { result: "wrong", matched: spec.answer, edits: 1, why: "Say which side: left or right", kind: "side", points: 0 };
  if (got !== want) return { result: "wrong", matched: spec.answer, edits: 1, why: `Wrong side (it is ${want})`, kind: "side", points: 0 };
  return null;
}

// ------------------------------------------------------------------ keyword-graded free text
export interface KeywordResult {
  hit: boolean[];
  total: number;
  hits: number;
}

function stemMatch(word: string, key: string): boolean {
  if (word === key) return true;
  // "efferent" is one letter from "afferent": the opposite term is never a hit
  const opp = ANTONYM_OF.get(key);
  if (opp && (word === opp || (word.length >= 5 && word.startsWith(opp.slice(0, -1))))) return false;
  if (key.length >= 5 && word.length >= 5 && (word.startsWith(key.slice(0, key.length - 1)) || key.startsWith(word.slice(0, word.length - 1)))) return true;
  return key.length >= 6 && lev(word, key) <= 1;
}

/** Each inner list is a set of synonyms; every group must hit. Multi-word keys match as phrases. */
export function gradeKeywords(typed: string, groups: string[][], flags: CanonFlags = DEFAULT_CANON): KeywordResult {
  const t = canon(typed, flags).s;
  const words = t.split(" ").filter(Boolean);
  const padded = ` ${t} `;
  const hit = groups.map((g) =>
    g.some((k) => {
      const kc = canonStr(k, flags);
      if (!kc) return false;
      // a phrase starts at a word ("dorsal columns" hits "dorsal column"; "within there" does not hit "in the")
      if (kc.includes(" ")) return padded.includes(` ${kc} `) || lev(t, kc) <= 2 || padded.includes(` ${kc}`);
      return words.some((w) => stemMatch(w, kc));
    }),
  );
  return { hit, total: groups.length, hits: hit.filter(Boolean).length };
}

export function verdictFromKeywords(r: KeywordResult, typed: string): Verdict {
  if (!canonStr(typed)) return { result: "empty", matched: null, edits: 0, why: "No answer", points: 0 };
  if (r.hits === r.total) return { result: "correct", matched: null, edits: 0, why: "", kind: "keywords", points: 1 };
  if (r.total >= 2 && r.hits >= Math.ceil(r.total * 0.6)) {
    return { result: "near_miss", matched: null, edits: r.total - r.hits, why: `${r.hits} of ${r.total} key ideas`, kind: "keywords", points: 0.5 };
  }
  return { result: "wrong", matched: null, edits: r.total - r.hits, why: r.hits ? `${r.hits} of ${r.total} key ideas` : "", kind: "keywords", points: 0 };
}
