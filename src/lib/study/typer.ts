// The Typer: one answer-typing attempt. Ported from ANKI+ (study.js `Typer`) with three changes:
//   * it tracks a SET of accepted variants and follows whichever the student is typing;
//   * time is passed in (`now` in ms) so it is deterministic in tests;
//   * a ladder `mask` and trap `hintStop` plug in without the Typer knowing about either.
// Modes: grade (graded recall; ghost hints), retype (whole answer shown: copy), covered (look, cover, type:
// the answer shows until the first key, Tab peeks), memory (no hints, not graded).
import { canon, DEFAULT_CANON, isLetter, letterCount, similarity, type Canon, type CanonFlags } from "./text.ts";

export interface TypingParams {
  hintAuto: boolean;
  hintFirstDelayMs: number;
  hintMsPerPromptChar: number;
  hintFreePromptChars: number;
  hintRepeatDelayMs: number;
  hintOnErrorMs: number;
  hintChars: number;
  hintCharsLong: number;
  goodMaxHintFrac: number;
  hardMaxHintFrac: number;
  capHardIfHintBeforeFirst: boolean;
  easyMaxTypos: number;
  easyBaseMs: number;
  easyMsPerChar: number;
  easyMsPerPromptChar: number;
  autoSubmitOnMatch: boolean;
  hintCapFrac: number;
}

export const DEFAULT_TYPING: TypingParams = {
  hintAuto: true,
  hintFirstDelayMs: 8000,
  hintMsPerPromptChar: 30,
  hintFreePromptChars: 80,
  hintRepeatDelayMs: 4000,
  hintOnErrorMs: 3000,
  hintChars: 1,
  hintCharsLong: 3,
  goodMaxHintFrac: 0.15,
  hardMaxHintFrac: 0.5,
  capHardIfHintBeforeFirst: true,
  easyMaxTypos: 0,
  // pin cards need a look at the image before typing: a more generous Easy window than a text prompt
  easyBaseMs: 3000,
  easyMsPerChar: 350,
  easyMsPerPromptChar: 25,
  autoSubmitOnMatch: true,
  hintCapFrac: 0.5,
};

export type TyperMode = "grade" | "retype" | "covered" | "memory";
export type TyperState = "idle" | "track" | "bad" | "match";

export interface TyperOptions {
  variants: string[];
  /** lower-cased variants that are only lenient decorations (not a reason to wait before auto-submitting) */
  decorative?: Set<string>;
  flags?: CanonFlags;
  params?: Partial<TypingParams>;
  promptLen?: number;
  mode?: TyperMode;
  noHints?: boolean;
  /** max share of the answer's letters hints may reveal in graded mode (1 = no cap) */
  cap?: number;
  now: number;
}

interface Variant {
  text: string;
  canon: Canon;
  /** a lenient decoration in front ("the ", "left ", "r "): the canonical text of it, else "" */
  lead: string;
}

/** Leading decorations of lenient variants. Side words only count once typed in full, so "R" for "Neuraxis"
 *  is not tracked as the start of "right neuraxis". */
const LEAD_RE = /^(the|left|right|l|r)\s+/i;

const MARK = /\p{M}/u;

export class Typer {
  readonly params: TypingParams;
  readonly flags: CanonFlags;
  readonly mode: TyperMode;
  readonly noHints: boolean;
  readonly cap: number;
  readonly letters: number;
  readonly easyWindow: number;
  private variants: Variant[];
  private decorative: Set<string>;
  cur = 0;
  capped = false;
  peek: boolean;
  typed = "";
  state: TyperState = "idle";
  /** canonical progress (common prefix) */
  L = 0;
  lcp = 0;
  /** typed source index up to which the typed chars are correct */
  typedOk = 0;
  hinted = 0;
  /** answer source index revealed by ghost */
  hintEnd = 0;
  hintBeforeFirst = false;
  typos = 0;
  start: number;
  lastProgress: number;
  lastHint = 0;
  badSince = 0;
  maxL = 0;
  trapBlocked = false;
  /** typed text matches an accepted form that a longer accepted form continues ("caudate n" -> "caudate nucleus") */
  extendable = false;
  /** ladder scaffold: the rest of the answer from `from`, with the hidden letters as "_" */
  mask: ((answer: string, from: number, hintEnd: number) => string) | null = null;
  /** trap letters: max answer index a hint may reveal from `from` */
  hintStop: ((from: number) => number) | null = null;
  chunked = false;
  private typedC: Canon = { s: "", map: [] };

  constructor(o: TyperOptions) {
    this.params = { ...DEFAULT_TYPING, ...(o.params ?? {}) };
    this.flags = o.flags ?? DEFAULT_CANON;
    this.mode = o.mode ?? "grade";
    this.noHints = !!o.noHints || this.mode === "memory";
    this.cap = o.cap ?? 1;
    this.peek = this.mode === "covered";
    this.decorative = o.decorative ?? new Set();
    this.variants = o.variants.map((text) => {
      const m = this.decorative.has(text.trim().toLowerCase().replace(/\s+/g, " ")) ? LEAD_RE.exec(text.trim()) : null;
      return { text, canon: canon(text, this.flags), lead: m ? canon(m[0], this.flags, true).s : "" };
    });
    if (!this.variants.length) this.variants = [{ text: "", canon: canon("", this.flags), lead: "" }];
    this.letters = Math.max(1, letterCount(this.answer));
    this.start = o.now;
    this.lastProgress = o.now;
    this.easyWindow = this.params.easyBaseMs + this.params.easyMsPerChar * this.letters + this.params.easyMsPerPromptChar * (o.promptLen ?? 0);
  }

  /** the variant currently being typed (the canonical answer until the typed prefix says otherwise) */
  get answer(): string {
    return this.variants[this.cur].text;
  }
  get a(): Canon {
    return this.variants[this.cur].canon;
  }
  /** canonical answer text (variant 0) */
  get primary(): string {
    return this.variants[0].text;
  }

  origPos(Lc: number): number {
    if (Lc <= 0) return 0;
    const a = this.a;
    if (Lc > a.map.length) return this.answer.length;
    let p = a.map[Lc - 1] + 1;
    while (p < this.answer.length && MARK.test(this.answer[p])) p++;
    return p;
  }

  /** Feed the whole input value. */
  set(v: string, now: number): { prev: TyperState; state: TyperState } {
    this.typed = v;
    if (this.mode === "covered") this.peek = false;
    const t = canon(v, this.flags, true);
    this.typedC = t;
    // pick the variant sharing the longest prefix with what's typed (ties: the earlier = canonical)
    let best = 0;
    let bestLcp = -1;
    let match = -1;
    const trimmed = t.s.replace(/ $/, "");
    for (let i = 0; i < this.variants.length; i++) {
      const lead = this.variants[i].lead;
      // a decorated variant is followed only once its decoration is typed ("the" may be typed partially)
      if (lead && !t.s.startsWith(lead) && !(lead === "the " && "the ".startsWith(t.s))) continue;
      const a = this.variants[i].canon.s;
      let l = 0;
      while (l < t.s.length && l < a.length && t.s[l] === a[l]) l++;
      if (trimmed === a && a.length && match < 0) match = i;
      if (l > bestLcp) {
        bestLcp = l;
        best = i;
      }
    }
    this.cur = match >= 0 ? match : best;
    this.extendable = match >= 0 && this.variants.some((v, i) => i !== match && !this.decorative.has(v.text.trim().toLowerCase().replace(/\s+/g, " ")) && v.canon.s.length > trimmed.length && v.canon.s.startsWith(trimmed));
    const a = this.a.s;
    const lcp = Math.max(0, bestLcp);
    const prefix = lcp === t.s.length;
    const prev = this.state;
    if (!v.length) this.state = "idle";
    else if (match >= 0) this.state = "match";
    else if (prefix) this.state = "track";
    else this.state = "bad";
    this.lcp = lcp;
    this.L = prefix ? Math.min(t.s.length, a.length) : lcp;
    this.typedOk = lcp < t.map.length ? t.map[lcp] : v.length;
    if (this.state === "bad" && prev !== "bad") {
      this.typos++;
      this.badSince = now;
    }
    if (this.state !== "bad") this.badSince = 0;
    if (this.L > this.maxL) {
      this.maxL = this.L;
      this.lastProgress = now;
    }
    return { prev, state: this.state };
  }

  canonTypedLength(): number {
    return this.typedC.s.length;
  }

  typedMap(): number[] {
    return this.typedC.map;
  }

  progress(): number {
    return this.a.s.length ? Math.min(1, this.L / this.a.s.length) : 0;
  }

  /** Reveal the next few letters as ghost text. Returns the number of letters revealed. */
  hint(now: number): number {
    if (this.state === "match" || this.noHints) return 0;
    const ans = this.answer;
    const from = Math.max(this.origPos(this.L), this.hintEnd);
    const stop = this.hintStop ? Math.min(ans.length, this.hintStop(from)) : ans.length;
    this.trapBlocked = stop <= from && from < ans.length;
    if (this.trapBlocked) return 0;
    let per = this.letters > 25 ? this.params.hintCharsLong || this.params.hintChars : this.params.hintChars;
    if (this.mode === "grade" && this.cap < 1) {
      const left = Math.floor(this.cap * this.letters) - this.hinted;
      if (left <= 0) {
        this.capped = true;
        return 0;
      }
      per = Math.min(Math.max(1, per), left);
    }
    let i = from;
    let n = 0;
    while (i < stop && n < Math.max(1, per)) {
      if (isLetter(ans[i])) n++;
      i++;
    }
    while (i < stop && !isLetter(ans[i]) && ans[i] !== " ") i++;
    if (i <= from) return 0;
    if (this.mode === "grade") {
      if (this.L === 0 && this.hinted === 0) this.hintBeforeFirst = true;
      this.hinted += n;
    }
    this.hintEnd = i;
    this.lastHint = now;
    this.lastProgress = now;
    return n;
  }

  /** The ghost text to show after the caret. */
  ghost(): string {
    const pos = this.origPos(this.L);
    const ans = this.answer;
    if (this.mode === "retype") return ans.slice(pos);
    if (this.mode === "covered") return this.peek ? ans.slice(pos) : "";
    if (this.mask && this.mode === "grade") return this.mask(ans, pos, this.hintEnd);
    return this.hintEnd > pos ? ans.slice(pos, this.hintEnd) : "";
  }

  elapsed(now: number): number {
    return now - this.start;
  }

  /** Predicted rating for a correct answer (1..4), before the verdict adjusts it. */
  predicted(now: number): 1 | 2 | 3 | 4 {
    const T = this.params;
    if (this.hinted > 0) {
      const frac = this.hinted / this.letters;
      let g: 1 | 2 | 3 = frac <= T.goodMaxHintFrac ? 3 : frac <= T.hardMaxHintFrac ? 2 : 1;
      if (T.capHardIfHintBeforeFirst && this.hintBeforeFirst) g = Math.min(g, 2) as 1 | 2 | 3;
      return g;
    }
    if (this.typos <= T.easyMaxTypos && this.elapsed(now) <= this.easyWindow) return 4;
    return 3;
  }

  accuracy(): number {
    if (this.state === "match") return 1;
    return Math.round(similarity(canon(this.typed, this.flags).s, this.a.s) * 1000) / 1000;
  }

  /** Milliseconds before the first auto-hint: a minimum plus reading time for a long prompt. */
  firstHintDelay(promptLen: number): number {
    const T = this.params;
    return T.hintFirstDelayMs + Math.max(0, promptLen - T.hintFreePromptChars) * T.hintMsPerPromptChar;
  }

  /** Should an automatic hint fire now? (the caller checks the user's hints toggle and pauses) */
  autoHintDue(now: number, firstDelay: number): boolean {
    const T = this.params;
    if (!T.hintAuto || this.noHints || this.state === "match" || this.mode !== "grade") return false;
    if (this.state === "bad") return this.badSince > 0 && now - this.badSince >= T.hintOnErrorMs;
    const idle = now - this.lastProgress;
    return this.hinted === 0 && this.hintEnd === 0 ? idle >= firstDelay : idle >= T.hintRepeatDelayMs;
  }

  /** Stand clocks still (drift / pause): shift every timestamp forward by `ms`. */
  shift(ms: number): void {
    this.start += ms;
    this.lastProgress += ms;
    if (this.badSince) this.badSince += ms;
    if (this.lastHint) this.lastHint += ms;
  }
}
