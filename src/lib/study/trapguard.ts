// TrapGuard: runtime companion of one Typer. Ported from ANKI+ web/js/focus/traps.js (TrapRun) without any DOM.
// A card's armed trap spots arrive with its payload (indices into the canonical answer string). When the
// caret reaches a spot:
//   pause gate     the box freezes for ~0.7-1.1 s at level 2-3 (keys bounce): "slow mode"
//   chunk recall   at level >= 2 the spot's letters are typed blind (dots in slots, no per-letter colour) and
//                  judged as a unit once the last one is in: no trial and error possible
//   first-try lock the first committed attempt is final: fixing it afterwards still counts as a miss
//                  (the grade is capped at Hard by the session)
//   no ghost hints at trap spots (Typer.hintStop)
// Every red stretch the student fixes, and every wrong submission, is kept as a raw attempt for the model.
import type { Typer } from "./typer.ts";
import type { Attempt, AttemptMode, TrapSpot } from "./traps.ts";

export interface GuardConfig {
  /** freeze the box for a moment at level >= 2 */
  gate: boolean;
  /** blind chunk recall at level >= 2 */
  chunkRecall: boolean;
  /** first committed attempt is final */
  firstTryLock: boolean;
  /** retype / rep boxes: shorter gate, no lock */
  light: boolean;
  /** no ghost hints at a trap */
  noHints: boolean;
}

export const DEFAULT_GUARD: GuardConfig = { gate: true, chunkRecall: true, firstTryLock: true, light: false, noHints: true };

export type GuardEvent =
  | { type: "arm"; spot: TrapSpot; blind: boolean; gateMs: number }
  | { type: "pass"; spot: TrapSpot }
  | { type: "miss"; spot: TrapSpot }
  | { type: "bounce" };

interface Live {
  spot: TrapSpot;
  cs: number;
  ce: number;
  st: "pending" | "armed" | "passed" | "missed" | "skipped";
  lvl: number;
  blind: boolean;
  judged: boolean;
}

function canonAt(map: number[], src: number): number {
  for (let k = 0; k < map.length; k++) if (map[k] >= src) return k;
  return map.length;
}

export interface BlindView {
  /** typed text before the chunk (shown normally) */
  okText: string;
  /** number of dots (letters typed inside the chunk) */
  dots: number;
  /** number of empty slots left in the chunk */
  slots: number;
}

export class TrapGuard {
  readonly cfg: GuardConfig;
  readonly mode: AttemptMode;
  private t: Typer;
  private list: Live[];
  private idx = 0;
  private active: Live | null = null;
  gateUntil = 0;
  attempts: Attempt[] = [];
  passed: string[] = [];
  missed: string[] = [];
  locked = false;
  private inBad = false;
  private badMax = "";
  private len = 0;
  private srcCs = 0;
  private done = false;
  private sessionMisses: Map<string, number>;

  constructor(typer: Typer, spots: TrapSpot[], cfg: Partial<GuardConfig> = {}, mode: AttemptMode = "typing", sessionMisses: Map<string, number> = new Map()) {
    this.cfg = { ...DEFAULT_GUARD, ...cfg };
    this.mode = mode;
    this.t = typer;
    this.sessionMisses = sessionMisses;
    const map = typer.a.map; // the canonical answer's map (variant 0 when nothing typed yet)
    this.list = spots
      .map((s) => ({
        spot: s,
        cs: canonAt(map, s.start),
        ce: canonAt(map, s.end),
        st: "pending" as const,
        lvl: Math.min(3, s.level + (sessionMisses.get(s.id) ?? 0)),
        blind: false,
        judged: false,
      }))
      .filter((l) => l.ce > l.cs)
      .sort((a, b) => a.cs - b.cs);
    if (this.list.length && this.cfg.noHints) typer.hintStop = (from) => this.hintStop(from);
  }

  get has(): boolean {
    return this.list.length > 0;
  }
  get missedAny(): boolean {
    return this.missed.length > 0;
  }
  /** a trap's spot is armed right now (the UI tints the box) */
  get armed(): TrapSpot | null {
    return this.active ? this.active.spot : null;
  }
  get armedLevel(): number {
    return this.active ? this.active.lvl : 0;
  }

  hintStop(from: number): number {
    let stop = this.t.answer.length;
    for (const l of this.list) {
      if (l.st === "passed") continue;
      if (from >= l.spot.start && from < l.spot.end) return from;
      if (l.spot.start >= from && l.spot.start < stop) stop = l.spot.start;
    }
    return stop;
  }

  /** The first spot is on the very first letter: arm it as soon as the card is up. */
  initial(now: number): GuardEvent[] {
    const l = this.list[0];
    if (l && l.cs === 0 && l.st === "pending" && !this.t.typed) return [this.arm(l, now)];
    return [];
  }

  gateActive(now: number): boolean {
    return now < this.gateUntil;
  }

  /** Call after every Typer.set(). */
  update(now: number): GuardEvent[] {
    const t = this.t;
    const events: GuardEvent[] = [];
    // raw error capture: the longest red stretch
    if (t.state === "bad") {
      if (!this.inBad) {
        this.inBad = true;
        this.badMax = "";
      }
      if (t.typed.length >= this.badMax.length) this.badMax = t.typed;
    } else if (this.inBad) {
      this.inBad = false;
      if (this.badMax.trim()) this.attempts.push({ typed: this.badMax, mode: this.mode, partial: true });
      this.badMax = "";
    }
    if (!this.list.length || t.cur !== 0) return events;
    this.len = t.a.map.length ? (t.typed ? this.canonLen() : 0) : 0;
    const pos = t.state === "bad" ? t.lcp : t.L;
    if (!this.active) {
      const l = this.list[this.idx];
      if (!l) return events;
      if (pos >= l.ce && t.state !== "bad") {
        l.st = "skipped";
        this.idx++;
        return events;
      }
      if (pos < l.cs || (t.state === "bad" && t.lcp < l.cs)) return events;
      events.push(this.arm(l, now));
    }
    const l = this.active;
    if (!l) return events;
    this.srcCs = l.cs < t.a.map.length ? this.srcIndexOfCanon(l.cs) : t.typed.length;
    if (l.judged) {
      if (t.state !== "bad" && t.L >= l.ce) this.leave(l);
      return events;
    }
    if (this.len < l.cs || (t.state === "bad" && t.lcp < l.cs)) return events; // backed out / slip before it
    if (l.blind) {
      const complete = t.state === "match" || this.len >= l.ce;
      if (!complete) return events;
      if (t.state === "match" || t.lcp >= l.ce || (t.state !== "bad" && t.L >= l.ce)) events.push(this.pass(l));
      else events.push(this.miss(l));
      return events;
    }
    if (t.state === "bad" && t.lcp >= l.cs && t.lcp < l.ce) events.push(this.miss(l));
    else if (t.state !== "bad" && t.L >= l.ce) events.push(this.pass(l));
    return events;
  }

  private canonLen(): number {
    // canonical length of what is typed: count via the typer's flags-based canon of the typed text
    return this.t.canonTypedLength();
  }

  private srcIndexOfCanon(cIdx: number): number {
    // typed source index where canonical position cIdx starts (approximation: same index when typing is clean)
    const tm = this.t.typedMap();
    return cIdx < tm.length ? tm[cIdx] : this.t.typed.length;
  }

  private arm(l: Live, now: number): GuardEvent {
    this.active = l;
    l.st = "armed";
    l.blind = this.cfg.chunkRecall && l.lvl >= 2;
    const gateMs = !this.cfg.gate || l.lvl < 2 ? 0 : this.cfg.light ? 350 : [0, 0, 700, 1100][l.lvl] || 900;
    if (gateMs) this.gateUntil = now + gateMs;
    return { type: "arm", spot: l.spot, blind: l.blind, gateMs };
  }

  private pass(l: Live): GuardEvent {
    l.judged = true;
    l.st = "passed";
    if (!this.passed.includes(l.spot.id)) this.passed.push(l.spot.id);
    this.leave(l);
    return { type: "pass", spot: l.spot };
  }

  private miss(l: Live): GuardEvent {
    l.judged = true;
    l.st = "missed";
    if (!this.missed.includes(l.spot.id)) this.missed.push(l.spot.id);
    this.sessionMisses.set(l.spot.id, (this.sessionMisses.get(l.spot.id) ?? 0) + 1);
    if (this.cfg.firstTryLock && !this.cfg.light) this.locked = true;
    return { type: "miss", spot: l.spot };
  }

  private leave(l: Live): void {
    if (this.active !== l) return;
    this.active = null;
    this.idx = Math.max(this.idx, this.list.indexOf(l) + 1);
  }

  /** Blind chunk display for the UI while a blind trap is armed and unjudged; null otherwise. */
  blindView(): BlindView | null {
    const l = this.active;
    if (!l || !l.blind || l.judged) return null;
    const total = l.spot.end - l.spot.start;
    const inChunk = Math.max(0, Math.min(total, this.canonLen() - l.cs));
    return { okText: this.t.typed.slice(0, this.srcCs), dots: inChunk, slots: Math.max(0, total - inChunk) };
  }

  /** Bounce a key during the pause gate. */
  bounceEvent(): GuardEvent {
    return { type: "bounce" };
  }

  /** The card is over. how: right | wrong | gaveup | abort. */
  finish(how: "right" | "wrong" | "gaveup" | "abort"): void {
    if (this.done) return;
    this.done = true;
    if (this.inBad && this.badMax.trim() && how !== "wrong") this.attempts.push({ typed: this.badMax, mode: this.mode, partial: true });
    this.inBad = false;
    const l = this.active;
    if (l && !l.judged && (how === "wrong" || how === "gaveup")) this.miss(l);
    this.active = null;
    this.gateUntil = 0;
  }

  /** Repetitions after a miss: 3 / 5 / 10 by the worst missed trap. */
  repsWanted(): number {
    let n = 0;
    for (const l of this.list) {
      if (!this.missed.includes(l.spot.id)) continue;
      n = Math.max(n, l.spot.reps || 3, l.lvl >= 3 ? 10 : l.lvl === 2 ? 5 : 3);
    }
    return Math.min(10, n);
  }

  /** After the answer: the traps met, with the question each guards (feedback, never a hint before). */
  report(): Array<{ chunk: string; question: string; label: string; passed: boolean; level: number; pattern: boolean }> {
    return this.list
      .filter((l) => l.st === "passed" || l.st === "missed")
      .map((l) => ({ chunk: l.spot.chunk, question: l.spot.question, label: l.spot.label, passed: l.st === "passed", level: l.lvl, pattern: l.spot.source === "pattern" }));
  }
}

/** What the session and the UI need from a card's trap guard (one Typer, or one per box of a multi-box answer). */
export interface GuardLike {
  readonly has: boolean;
  readonly missedAny: boolean;
  readonly armed: TrapSpot | null;
  readonly armedLevel: number;
  readonly attempts: Attempt[];
  readonly passed: string[];
  readonly missed: string[];
  gateActive(now: number): boolean;
  initial(now: number): GuardEvent[];
  update(now: number): GuardEvent[];
  blindView(): BlindView | null;
  finish(how: "right" | "wrong" | "gaveup" | "abort"): void;
  repsWanted(): number;
  report(): ReturnType<TrapGuard["report"]>;
}

/** Multi-box answer: one guard per box (ordered parts only), the caret box is the live one. */
export class GuardGroup implements GuardLike {
  active = 0;
  readonly guards: Array<TrapGuard | null>;
  constructor(guards: Array<TrapGuard | null>) {
    this.guards = guards;
  }
  private g(): TrapGuard | null {
    return this.guards[this.active] ?? null;
  }
  private all(): TrapGuard[] {
    return this.guards.filter((g): g is TrapGuard => !!g);
  }
  get has(): boolean {
    return this.all().some((g) => g.has);
  }
  get missedAny(): boolean {
    return this.all().some((g) => g.missedAny);
  }
  get armed(): TrapSpot | null {
    return this.g()?.armed ?? null;
  }
  get armedLevel(): number {
    return this.g()?.armedLevel ?? 0;
  }
  get attempts(): Attempt[] {
    return this.all().flatMap((g) => g.attempts);
  }
  get passed(): string[] {
    return this.all().flatMap((g) => g.passed);
  }
  get missed(): string[] {
    return this.all().flatMap((g) => g.missed);
  }
  gateActive(now: number): boolean {
    return this.g()?.gateActive(now) ?? false;
  }
  initial(now: number): GuardEvent[] {
    return this.g()?.initial(now) ?? [];
  }
  update(now: number): GuardEvent[] {
    return this.g()?.update(now) ?? [];
  }
  blindView(): BlindView | null {
    return this.g()?.blindView() ?? null;
  }
  finish(how: "right" | "wrong" | "gaveup" | "abort"): void {
    for (const g of this.all()) g.finish(how);
  }
  repsWanted(): number {
    return Math.min(10, this.all().reduce((n, g) => Math.max(n, g.repsWanted()), 0));
  }
  report(): ReturnType<TrapGuard["report"]> {
    return this.all().flatMap((g) => g.report());
  }
}
