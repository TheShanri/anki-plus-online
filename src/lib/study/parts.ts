// Multi-box answers. A card with `parts` (2 or more genuinely separate items, never synonyms) is typed in one
// box per part. Unordered (the default): every box is matched against ALL parts no other box has completed
// yet, so "R" or "A" is a fine start for "Reward" / "Addiction" in either box, the box narrows to what still
// fits, and a completed part is claimed (the other boxes stop offering it, so a duplicate can never count).
// Ordered (`parts_ordered`): box i is part i only. Each box is an ordinary Typer; this class only decides which
// parts it follows and grades the set. Pure, time passed in.
import { DEFAULT_TYPING, Typer, predictRating, type TyperMode, type TypingParams } from "./typer.ts";
import { answerVariants, decorativeKeys } from "./variants.ts";
import { gradeTyped, type Verdict } from "./grade.ts";
import { DEFAULT_CANON, diffOps, letterCount, type DiffOp } from "./text.ts";
import type { AnswerPart } from "./types.ts";
import type { TrapSpot } from "./traps.ts";

export interface PartBoxesOptions {
  parts: AnswerPart[];
  ordered: boolean;
  requireSide?: boolean;
  /** ladder practice: only the part's own spelling forms (no accept list), like a retype */
  strict?: boolean;
  mode?: TyperMode;
  noHints?: boolean;
  cap?: number;
  params?: Partial<TypingParams>;
  promptLen?: number;
  /** show the names a box has narrowed to (off: only how many still fit) */
  reveal?: boolean;
  now: number;
}

export type ChipKind = "done" | "one" | "many";
export interface PartChip {
  kind: ChipKind;
  text: string;
}

export interface PartResult {
  box: number;
  /** the part this box is graded against (-1: none) */
  part: number;
  /** the part's text (the expected answer) */
  text: string;
  typed: string;
  verdict: Verdict;
  diff: DiffOp[] | null;
}

interface Cand {
  variants: string[];
  decorative: Set<string>;
}

export class PartBoxes {
  readonly parts: AnswerPart[];
  readonly ordered: boolean;
  readonly boxes: Typer[];
  readonly params: TypingParams;
  readonly easyWindow: number;
  readonly letters: number;
  reveal: boolean;
  /** the box that has the caret */
  active = 0;
  start: number;
  private cands: Cand[];
  private keys: string[];
  private requireSide: boolean;

  constructor(o: PartBoxesOptions) {
    this.parts = o.parts;
    this.ordered = o.ordered;
    this.requireSide = !!o.requireSide;
    this.reveal = o.reveal ?? true;
    this.params = { ...DEFAULT_TYPING, ...(o.params ?? {}) };
    this.start = o.now;
    this.cands = o.parts.map((p) => ({
      variants: answerVariants(p.text, o.strict ? [] : p.accept, { requireSide: this.requireSide, max: 24 }),
      decorative: decorativeKeys(p.text, o.strict ? [] : p.accept, { requireSide: this.requireSide, max: 24 }),
    }));
    this.letters = Math.max(1, o.parts.reduce((n, p) => n + letterCount(p.text), 0));
    this.easyWindow = this.params.easyBaseMs + this.params.easyMsPerChar * this.letters + this.params.easyMsPerPromptChar * (o.promptLen ?? 0);
    this.keys = o.parts.map(() => "");
    this.boxes = o.parts.map((_, i) => {
      const list = this.candidates(i, new Map());
      const { variants, tags, decorative } = this.variantsFor(list);
      this.keys[i] = list.join(",");
      const t = new Typer({ variants, tags, decorative, mode: o.mode ?? "grade", noHints: o.noHints, cap: o.cap, params: o.params, promptLen: o.promptLen, now: o.now });
      t.chunked = o.parts.some((p) => /\s/.test(p.text.trim()));
      return t;
    });
  }

  get count(): number {
    return this.parts.length;
  }
  get activeBox(): Typer {
    return this.boxes[this.active];
  }

  /** The parts box i may follow, in the order its hints prefer (unordered: its own number first). */
  private candidates(i: number, claims: Map<number, number>): number[] {
    if (this.ordered) return [i];
    const n = this.parts.length;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = (i + k) % n;
      const by = claims.get(p);
      if (by === undefined || by === i) out.push(p);
    }
    return out;
  }

  private variantsFor(list: number[]): { variants: string[]; tags: number[]; decorative: Set<string> } {
    const variants: string[] = [];
    const tags: number[] = [];
    const decorative = new Set<string>();
    for (const p of list) {
      for (const v of this.cands[p].variants) {
        variants.push(v);
        tags.push(p);
      }
      for (const d of this.cands[p].decorative) decorative.add(d);
    }
    return { variants, tags, decorative };
  }

  /** a box that spells one of its parts in full, with nothing longer still possible */
  complete(i: number): boolean {
    const t = this.boxes[i];
    return t.state === "match" && !t.extendable && t.part >= 0;
  }

  /** part -> the box that completed it (the lowest box wins a tie) */
  claims(): Map<number, number> {
    const m = new Map<number, number>();
    for (let i = 0; i < this.boxes.length; i++) {
      if (!this.complete(i)) continue;
      const p = this.boxes[i].part;
      if (!m.has(p)) m.set(p, i);
    }
    return m;
  }

  allComplete(): boolean {
    for (let i = 0; i < this.boxes.length; i++) if (!this.complete(i)) return false;
    return this.claims().size === this.parts.length;
  }

  anyTyped(): boolean {
    return this.boxes.some((b) => b.typed.length > 0);
  }

  /** Feed box i its whole input value; claims and the other boxes' candidates follow. */
  input(i: number, value: string, now: number): void {
    this.active = i;
    this.boxes[i].set(value, now);
    this.sync(now);
  }

  /** Recompute claims and give every box the parts it may still follow. */
  sync(now: number): void {
    if (this.ordered) return;
    for (let round = 0; round <= this.boxes.length; round++) {
      const claims = this.claims();
      let changed = false;
      for (let j = 0; j < this.boxes.length; j++) {
        const list = this.candidates(j, claims);
        const key = list.join(",");
        if (key === this.keys[j]) continue;
        this.keys[j] = key;
        const { variants, tags, decorative } = this.variantsFor(list);
        this.boxes[j].setVariants(variants, tags, decorative, now);
        changed = true;
      }
      if (!changed) return;
    }
  }

  /** Move the caret to box i (its idle clock restarts, so a hint does not fire the moment you arrive). */
  focus(i: number, now: number): boolean {
    if (i < 0 || i >= this.boxes.length || i === this.active) return false;
    this.active = i;
    this.boxes[i].touch(now);
    return true;
  }

  /** The next box after `from` that is not complete (wrapping), or -1. */
  nextOpen(from: number): number {
    const n = this.boxes.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      if (!this.complete(j)) return j;
    }
    return -1;
  }

  /** What box i has narrowed down to (null: nothing typed yet, or nothing fits). */
  chip(i: number): PartChip | null {
    const t = this.boxes[i];
    if (this.complete(i)) return { kind: "done", text: this.parts[t.part].text };
    if (this.ordered || !t.typed.trim()) return null;
    const fits = t.fits();
    if (!fits.length) return null;
    if (!this.reveal) return { kind: fits.length === 1 ? "one" : "many", text: fits.length === 1 ? "1 fits" : `${fits.length} fit` };
    if (fits.length === 1) return { kind: "one", text: this.parts[fits[0]].text };
    const names = fits.slice(0, 3).map((p) => this.parts[p].text);
    return { kind: "many", text: names.join(" / ") + (fits.length > 3 ? "…" : "") };
  }

  typedList(): string[] {
    return this.boxes.map((b) => b.typed);
  }
  /** all boxes' text for the payload / records; "" when nothing is typed */
  joined(): string {
    return this.anyTyped() ? this.typedList().join(" | ") : "";
  }

  get hinted(): number {
    return this.boxes.reduce((n, b) => n + b.hinted, 0);
  }
  get typos(): number {
    return this.boxes.reduce((n, b) => n + b.typos, 0);
  }
  get hintBeforeFirst(): boolean {
    return this.boxes.some((b) => b.hintBeforeFirst);
  }
  elapsed(now: number): number {
    return now - this.start;
  }
  predicted(now: number): 1 | 2 | 3 | 4 {
    return predictRating(this.params, { hinted: this.hinted, letters: this.letters, hintBeforeFirst: this.hintBeforeFirst, typos: this.typos, elapsed: this.elapsed(now), easyWindow: this.easyWindow });
  }

  shift(ms: number): void {
    this.start += ms;
    for (const b of this.boxes) b.shift(ms);
  }

  /** Grade what is typed against the parts. */
  grade(): { verdict: Verdict; results: PartResult[] } {
    return gradeParts(this.typedList(), this.parts, this.ordered, this.requireSide);
  }
}

// ------------------------------------------------------------------ grading

const EMPTY: Verdict = { result: "empty", matched: null, edits: 0, why: "No answer", points: 0 };

function score(v: Verdict): number {
  if (v.result === "correct") return 4;
  if (v.result === "near_miss") return 2 - v.edits * 0.01;
  if (v.result === "empty") return -1;
  return -Math.min(v.edits, 50) * 0.01;
}

/** Best one-to-one assignment of boxes to parts (exhaustive up to 7 parts, greedy beyond). */
function assign(m: number[][]): number[] {
  const n = m.length;
  if (n > 7) {
    const out = new Array<number>(n).fill(-1);
    const used = new Set<number>();
    const cells: Array<[number, number, number]> = [];
    for (let b = 0; b < n; b++) for (let p = 0; p < n; p++) cells.push([m[b][p], b, p]);
    cells.sort((x, y) => y[0] - x[0]);
    for (const [, b, p] of cells) if (out[b] < 0 && !used.has(p)) {
        out[b] = p;
        used.add(p);
      }
    return out;
  }
  let best = -Infinity;
  let bestPick: number[] = Array.from({ length: n }, (_, i) => i);
  const pick = new Array<number>(n).fill(-1);
  const go = (b: number, used: number, sum: number) => {
    if (b === n) {
      if (sum > best + 1e-9) {
        best = sum;
        bestPick = pick.slice();
      }
      return;
    }
    for (let p = 0; p < n; p++) {
      if (used & (1 << p)) continue;
      pick[b] = p;
      go(b + 1, used | (1 << p), sum + m[b][p]);
    }
  };
  go(0, 0, 0);
  return bestPick;
}

/** Each box graded with the ordinary grader against its part (typo tolerance and `accept` included). Unordered
 *  sets pair boxes with parts so the most boxes come out right; one part can never be credited twice. */
export function gradeParts(typed: string[], parts: AnswerPart[], ordered: boolean, requireSide = false): { verdict: Verdict; results: PartResult[] } {
  const n = parts.length;
  const spec = (p: number) => ({ answer: parts[p].text, accept: parts[p].accept, requireSide });
  const cell = (b: number, p: number): Verdict => (typed[b]?.trim() ? gradeTyped(typed[b], spec(p)) : EMPTY);
  const grid = Array.from({ length: n }, (_, b) => Array.from({ length: n }, (_, p) => cell(b, p)));
  const pick = ordered ? Array.from({ length: n }, (_, i) => i) : assign(grid.map((row) => row.map(score)));
  const results: PartResult[] = pick.map((p, b) => {
    const v = grid[b][p];
    const text = parts[p].text;
    const t = typed[b] ?? "";
    const diff = t.trim() && v.result !== "correct" ? diffOps(t, v.matched ?? text, DEFAULT_CANON) : null;
    return { box: b, part: p, text, typed: t, verdict: v, diff };
  });
  const right = results.filter((r) => r.verdict.result === "correct").length;
  const near = results.filter((r) => r.verdict.result === "near_miss").length;
  const edits = results.reduce((s, r) => s + (r.verdict.result === "correct" ? 0 : Math.min(r.verdict.edits, 99)), 0);
  const all = parts.map((p) => p.text).join(", ");
  const sideMiss = results.find((r) => r.verdict.kind === "side" && r.verdict.result === "wrong");
  let verdict: Verdict;
  if (right === n) verdict = { result: "correct", matched: all, edits: 0, why: "", points: 1 };
  else if (right + near === n) verdict = { result: "near_miss", matched: all, edits, why: `Near miss: a tiny typo in ${near} of ${n}`, kind: "typo", points: 0.5 + right / (2 * n) };
  else if (typed.every((t) => !t.trim())) verdict = EMPTY;
  else verdict = { result: "wrong", matched: null, edits, why: `${right} of ${n} right`, kind: sideMiss ? "side" : undefined, points: right / n };
  return { verdict, results };
}

/** Which part spots belong to: a spot of the card's answer is kept for a part when its chunk text is in that part. */
export function spotsForPart(spots: TrapSpot[], part: string): TrapSpot[] {
  const low = part.toLowerCase();
  const out: TrapSpot[] = [];
  for (const s of spots) {
    const at = s.chunk ? low.indexOf(s.chunk.toLowerCase()) : -1;
    if (at >= 0) out.push({ ...s, start: at, end: at + s.chunk.length });
  }
  return out;
}
