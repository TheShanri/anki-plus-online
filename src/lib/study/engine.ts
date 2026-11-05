// StudyEngine: the framework-free heart of a study session (ANKI+ study.js, as a testable class).
// It owns the queue, the current card (typer, trap guard, scaffold step), grading, the local FSRS update, the
// answer payloads to sync, follow-ups, boss fights, focus helpers and session stats. React only renders it
// (subscribe/version) and forwards keys. Time and IO are injected so it runs under Node tests.
import { answerVariants, decorativeKeys } from "./variants.ts";
import { DEFAULT_CANON, diffOps, type DiffOp } from "./text.ts";
import { gradeTyped, gradeKeywords, verdictFromKeywords, type Verdict } from "./grade.ts";
import { Typer } from "./typer.ts";
import { TrapGuard, type GuardEvent } from "./trapguard.ts";
import { type Attempt, type TrapSpot } from "./traps.ts";
import { isLong, ladderOutcome, nextStep, nextText, scaffold, MAX_STEP, helpText, rungOf, nextCleanStreak, type LadderOutcome } from "./ladder.ts";
import { newCardState, previews, ratingFor, scheduleReview, type CardStateRow, type Grade } from "./scheduling.ts";
import { SessionQueue, isSolidCard, pickFollowups, phaseOf, type Entry } from "./queue.ts";
import { DEFAULT_BOSS, bossWon, factsOf, nextBossGap, pickBoss } from "./boss.ts";
import { guardDue, newRun, wanderThreshold, type GuardRun } from "./focus.ts";
import type { LadderRow, StructureLite, StudyCard, StudyPayload } from "./types.ts";
import type { LearnerSettings } from "./settings.ts";
import { emit as defaultEmit } from "../feedback/events.ts";

export type Phase = "loading" | "prompt" | "reveal" | "done" | "empty";
export type AnswerMode = "type" | "keywords" | "choice" | "tf" | "self";

export interface AnswerPayload {
  clientId: string;
  cardId: string;
  sessionId: string;
  courseId?: string;
  rating: Grade;
  typed: string | null;
  correct: boolean | null;
  hintCount: number;
  durationMs: number;
  clientTs: number;
  keystrokes: Record<string, unknown>;
  ladder?: { stepBefore: number; stepAfter: number; effectiveStep: number };
  unaided: boolean;
  traps?: { attempts: Attempt[]; passes: string[]; firstTryMisses: string[] };
  retention?: number;
}

export interface Retype {
  kind: "fail" | "intro" | "near" | "reps";
  typer: Typer;
  repsLeft: number;
  done: boolean;
  guard: TrapGuard | null;
}

export interface Current {
  entry: Entry;
  card: StudyCard;
  structure: StructureLite | null;
  mode: AnswerMode;
  isFirstLook: boolean;
  isBoss: boolean;
  isFollowup: boolean;
  parent: StudyCard | null;
  /** the scaffold step shown (0..6); 6 = recall */
  step: number;
  /** below the recall rung: practice (at most Hard, never banks traps) */
  practice: boolean;
  typer: Typer | null;
  guard: TrapGuard | null;
  spots: TrapSpot[];
  hintFirstMs: number;
  shownAt: number;
  /** typed text for non-Typer modes (keywords) */
  typed: string;
  choices: string[] | null;
  picked: number | null;
  // after the answer
  verdict: Verdict | null;
  right: boolean;
  gaveUp: boolean;
  rating: Grade;
  /** a student may lower, never raise, the suggested rating (typing off: any) */
  maxRating: Grade;
  fixed: boolean;
  headline: string;
  why: string;
  diff: DiffOp[] | null;
  surprise: boolean;
  lockUntil: number;
  outcome: LadderOutcome | null;
  stepAfter: number;
  ladderNote: string;
  trapReport: ReturnType<TrapGuard["report"]>;
  retype: Retype | null;
  previews: Record<Grade, string> | null;
  mnemonicOffer: boolean;
  durationMs: number;
  /** the student rated the typed answer themselves (typing off) */
  selfGraded: boolean;
  note: string | null;
}

export interface Stats {
  answered: number;
  ratings: Record<Grade, number>;
  graded: number;
  correct: number;
  hints: number;
  combo: number;
  bestCombo: number;
  bossFought: number;
  bossWon: number;
  trapsMet: number;
  trapsCleared: number;
  followups: number;
  newCards: number;
  startedAt: number;
  missed: Array<{ cardId: string; name: string }>;
  drifts: number;
}

export interface EngineDeps {
  now: () => number;
  send: (p: AnswerPayload) => void;
  emit?: typeof defaultEmit;
  /** load more cards (excluding ids already used this session) */
  fetchMore?: (exclude: string[]) => Promise<StudyPayload | null>;
  rand?: () => number;
  uuid: () => string;
  sessionId: string;
}

export interface EngineOptions {
  /** micro-sprint: stop after this many cards */
  limit?: number;
}

const EMPTY_RATINGS = (): Record<Grade, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

function shuffle<T>(a: T[], rand: () => number): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export class StudyEngine {
  phase: Phase = "loading";
  cur: Current | null = null;
  stats: Stats;
  settings: LearnerSettings;
  version = 0;
  /** the hyperfocus guard stop card is showing */
  guardOpen = false;
  /** the micro-sprint round is over */
  roundOver = false;
  /** wander catcher: 0 none, 1 soft, 2 chime, 3 second chime */
  drift = 0;
  driftBackMs = 0;
  toast: { text: string; at: number } | null = null;
  fetching = false;
  noMore = false;

  readonly deps: EngineDeps;
  readonly payload: StudyPayload;
  cards = new Map<string, StudyCard>();
  structures = new Map<string, StructureLite>();
  states = new Map<string, CardStateRow>();
  ladders = new Map<string, LadderRow>();
  traps = new Map<string, TrapSpot[]>();
  trapMisses = new Map<string, number>();
  notes = new Map<string, string>();
  names: Record<string, string>;
  queue: SessionQueue;
  private emit: typeof defaultEmit;
  private rand: () => number;
  private listeners = new Set<() => void>();
  private answered = new Set<string>();
  private sessionMisses = new Map<string, number>();
  private cardMisses = new Map<string, number>();
  private bossGap: number;
  private sinceBoss = 0;
  private run: GuardRun;
  private lastActivity: number;
  private driftStart = 0;
  private away = false;
  private opts: EngineOptions;

  constructor(payload: StudyPayload, deps: EngineDeps, opts: EngineOptions = {}) {
    this.payload = payload;
    this.deps = deps;
    this.emit = deps.emit ?? defaultEmit;
    this.rand = deps.rand ?? Math.random;
    this.settings = payload.settings;
    this.opts = opts;
    this.names = payload.names ?? {};
    this.stats = { answered: 0, ratings: EMPTY_RATINGS(), graded: 0, correct: 0, hints: 0, combo: 0, bestCombo: 0, bossFought: 0, bossWon: 0, trapsMet: 0, trapsCleared: 0, followups: 0, newCards: 0, startedAt: deps.now(), missed: [], drifts: 0 };
    this.bossGap = nextBossGap(DEFAULT_BOSS, this.rand);
    this.run = newRun(deps.now());
    this.lastActivity = deps.now();
    this.ingest(payload);
    const entries = this.entriesFrom(payload);
    this.queue = new SessionQueue(entries);
  }

  // ------------------------------------------------------------------ plumbing
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
  say(text: string): void {
    this.toast = { text, at: this.deps.now() };
    this.changed();
  }

  private ingest(p: StudyPayload): void {
    for (const c of p.cards) this.cards.set(c.id, c);
    for (const [k, v] of Object.entries(p.structures)) this.structures.set(k, v);
    for (const [k, v] of Object.entries(p.states)) if (!this.answered.has(k)) this.states.set(k, v);
    for (const [k, v] of Object.entries(p.ladders)) if (!this.answered.has(k)) this.ladders.set(k, v);
    for (const [k, v] of Object.entries(p.traps)) this.traps.set(k, v);
    for (const [k, v] of Object.entries(p.trapMisses)) this.trapMisses.set(k, v);
    for (const [k, v] of Object.entries(p.notes)) this.notes.set(k, v);
    if (p.names) this.names = { ...this.names, ...p.names };
  }

  private entriesFrom(p: StudyPayload): Entry[] {
    const out: Entry[] = [];
    for (const q of p.queue) {
      const card = this.cards.get(q.cardId);
      if (!card) continue;
      out.push({ card, state: this.states.get(card.id) ?? null, ladder: this.ladders.get(card.id) ?? null, source: q.source });
    }
    return out;
  }

  opts_limit(): number {
    return this.opts.limit ?? 0;
  }

  get typingOn(): boolean {
    return this.settings.typing.enabled;
  }

  /** Image keys of the next few queued cards, so the UI can warm them before they're shown. */
  upcomingImageKeys(n = 4): string[] {
    const keys: string[] = [];
    for (const e of this.queue.pending) {
      const k = e.card.image?.key;
      if (k && !keys.includes(k)) keys.push(k);
      if (keys.length >= n) break;
    }
    return keys;
  }

  updateSettings(s: LearnerSettings): void {
    this.settings = s;
    this.changed();
  }

  // ------------------------------------------------------------------ session flow
  start(): void {
    this.nextCard();
  }

  private remaining(): number {
    return this.queue.size;
  }

  private async prefetch(): Promise<void> {
    if (this.fetching || this.noMore || !this.deps.fetchMore) return;
    this.fetching = true;
    try {
      const exclude = [...this.answered, ...this.queue.pending.map((e) => e.card.id), ...this.queue.learning.map((l) => l.entry.card.id)];
      const p = await this.deps.fetchMore(exclude);
      if (p) {
        this.ingest(p);
        const more = this.entriesFrom(p);
        if (more.length) this.queue.push(more);
        else this.noMore = true;
      } else this.noMore = true;
    } catch {
      /* offline: carry on with what we have */
    } finally {
      this.fetching = false;
      this.changed();
    }
  }

  private async nextCard(): Promise<void> {
    const now = this.deps.now();
    if (this.opts.limit && this.stats.answered >= this.opts.limit && !this.roundOver) {
      this.roundOver = true;
      this.finish();
      return;
    }
    if (this.queue.pending.length < 8) void this.prefetch();
    // hyperfocus guard
    if (this.settings.scaffold.focus && !this.guardOpen && guardDue(this.run, now, this.settings.study.guardMinutes, this.settings.study.guardCards)) {
      this.guardOpen = true;
      this.emit("guard");
      this.changed();
      return;
    }
    let entry = this.maybeBoss(now);
    let boss = !!entry;
    if (!entry) entry = this.queue.next(now);
    if (!entry && this.fetching) {
      this.phase = "loading";
      this.changed();
      await this.prefetch();
      entry = this.queue.next(this.deps.now());
    }
    if (!entry && !this.noMore && this.deps.fetchMore) {
      this.phase = "loading";
      this.changed();
      await this.prefetch();
      entry = this.queue.next(this.deps.now());
    }
    if (!entry) {
      this.finish();
      return;
    }
    this.queue.take(entry);
    boss = boss || entry.source === "boss";
    this.present(entry, boss);
  }

  private maybeBoss(now: number): Entry | null {
    if (!this.settings.scaffold.boss || this.sinceBoss < this.bossGap) return null;
    const pool = [...this.queue.pending, ...this.queue.learning.filter((l) => l.due <= now).map((l) => l.entry)];
    const cand = pool
      .filter((e) => e.card.format === "type" && e.card.kind !== "theory")
      .map((e) => ({ entry: e, facts: factsOf(e, this.trapMisses.get(e.card.id) ?? 0, this.cardMisses.get(e.card.id) ?? 0) }));
    const pick = pickBoss(cand);
    if (!pick) return null;
    return { ...pick, source: "boss" };
  }

  finish(): void {
    this.phase = "done";
    this.cur = null;
    this.emit("session_done", { cards: this.stats.answered, accuracy: this.stats.graded ? this.stats.correct / this.stats.graded : undefined });
    this.changed();
  }

  /** "one more round" after a micro-sprint */
  moreRound(): void {
    this.opts = { ...this.opts, limit: this.stats.answered + (this.opts.limit ? Math.max(3, this.settings.study.sprintSize) : 0) };
    this.roundOver = false;
    this.phase = "loading";
    void this.nextCard();
  }

  resumeAfterGuard(round: boolean): void {
    this.guardOpen = false;
    this.run = newRun(this.deps.now());
    if (round) this.run.until = this.run.cards + Math.max(1, this.settings.study.sprintSize);
    void this.nextCard();
  }

  // ------------------------------------------------------------------ presenting a card
  private present(entry: Entry, boss: boolean): void {
    const now = this.deps.now();
    const card = entry.card;
    const structure = card.structureId ? this.structures.get(card.structureId) ?? null : null;
    const state = this.states.get(card.id) ?? entry.state ?? null;
    const ladder = this.ladders.get(card.id) ?? entry.ladder ?? null;
    const sc = this.settings.scaffold;
    const typing = this.typingOn;
    const isFollowup = entry.source === "followup";
    const parent = isFollowup && entry.parentId ? this.cards.get(entry.parentId) ?? null : null;

    let mode: AnswerMode = "type";
    if (!typing) mode = "self";
    else if (card.format === "keywords") mode = "keywords";
    else if (card.format === "tf") mode = "tf";
    else if (card.format === "choice") mode = "choice";

    const isNew = !state || (state.state === 0 && state.reps === 0);
    // ANKI+ stage 1: every brand-new card is a first look (never scored), in every answer format
    const isFirstLook = isNew && (mode === "choice" || mode === "tf" || !!card.answer);
    const ladderOn = sc.ladder && mode === "type";
    const step = ladderOn ? (isFirstLook ? 0 : ladder?.step ?? 0) : MAX_STEP;
    const practice = ladderOn && !isFirstLook && step < MAX_STEP;

    let typer: Typer | null = null;
    let guard: TrapGuard | null = null;
    let spots: TrapSpot[] = [];
    const promptLen = (card.prompt + (card.vignette ?? "")).length;
    if (mode === "type") {
      const variants = answerVariants(card.answer, card.accept, { requireSide: card.requireSide, max: 96 });
      const hintsOn = sc.hints;
      const relearn = state?.state === 3;
      typer = new Typer({
        variants,
        decorative: decorativeKeys(card.answer, card.accept, { requireSide: card.requireSide, max: 96 }),
        promptLen,
        mode: "grade",
        params: { hintAuto: hintsOn },
        noHints: isFirstLook || !hintsOn,
        cap: relearn ? 0.5 : 1,
        now,
      });
      typer.chunked = /\s/.test(card.answer.trim());
      if (practice) typer.mask = (answer, from, hintEnd) => scaffold(answer, from, step, hintEnd);
      if (sc.traps && !practice && !isFirstLook) {
        spots = this.traps.get(card.id) ?? [];
        if (spots.length) guard = new TrapGuard(typer, spots, { gate: sc.focus, light: false }, "typing", this.sessionMisses);
      }
    }
    const choices =
      mode === "choice" && card.choices ? shuffle(card.choices, this.rand) : mode === "tf" ? ["True", "False"] : null;

    this.cur = {
      entry, card, structure, mode, isFirstLook, isBoss: boss, isFollowup, parent, step, practice, typer, guard, spots,
      hintFirstMs: typer ? typer.firstHintDelay(promptLen) : 0, shownAt: now, typed: "", choices, picked: null,
      verdict: null, right: false, gaveUp: false, rating: 3, maxRating: 4, fixed: false, headline: "", why: "", diff: null, surprise: false, lockUntil: 0,
      outcome: null, stepAfter: step, ladderNote: "", trapReport: [], retype: null, previews: null, mnemonicOffer: false, durationMs: 0, selfGraded: false,
      note: this.notes.get(card.id) ?? null,
    };
    this.phase = "prompt";
    this.lastActivity = now;
    this.drift = 0;
    this.driftBackMs = 0;
    if (boss) {
      this.stats.bossFought++;
      this.sinceBoss = 0;
      this.bossGap = nextBossGap(DEFAULT_BOSS, this.rand);
      this.emit("boss_start", { cardId: card.id });
    } else this.emit("card_in");
    if (isFollowup) this.emit("followup", { facet: card.facet });
    if (guard) for (const ev of guard.initial(now)) this.onGuard(ev);
    this.changed();
  }

  /** The prompt's ghost text / scaffold help line for the UI. */
  helpLine(): string {
    const c = this.cur;
    if (!c || !c.typer) return "";
    if (c.isFirstLook) return "";
    if (c.practice) return helpText(c.step, c.card.answer);
    return "";
  }

  // ------------------------------------------------------------------ typing
  activity(): void {
    const now = this.deps.now();
    this.lastActivity = now;
    if (this.drift) this.back(now);
  }

  setAway(away: boolean): void {
    if (!this.settings.scaffold.focus) return;
    const now = this.deps.now();
    this.away = away;
    if (away && this.phase === "prompt" && !this.drift) {
      this.drift = 1;
      this.driftStart = now;
      this.stats.drifts++;
      this.changed();
    } else if (!away && this.drift) this.back(now);
  }

  private back(now: number): void {
    const c = this.cur;
    const ms = Math.max(0, now - this.driftStart);
    this.drift = 0;
    this.driftBackMs = ms;
    if (c?.typer && this.phase === "prompt") {
      c.typer.shift(ms);
      c.shownAt += ms;
    }
    this.run.startedAt += ms;
    this.changed();
  }

  /** Called every ~150 ms by the UI while a card is up. */
  tick(): void {
    const c = this.cur;
    if (!c || this.phase !== "prompt") return;
    const now = this.deps.now();
    if (this.settings.scaffold.focus) {
      const typical = Math.max(c.typer?.easyWindow ?? 6000, 6000);
      const N = wanderThreshold(typical);
      if (!this.drift && !this.away && now - this.lastActivity >= N) {
        this.drift = 1;
        this.driftStart = this.lastActivity;
        this.stats.drifts++;
        this.emit("drift", { level: 1 });
        this.changed();
      } else if (this.drift) {
        const since = now - this.driftStart - N;
        const level = since >= 45_000 ? 3 : since >= 15_000 ? 2 : 1;
        if (level > this.drift) {
          this.drift = level;
          this.emit("drift", { level });
          this.changed();
        }
        return; // clocks and auto hints stand still while away
      } else if (this.away) return;
    }
    const t = c.typer;
    if (t && this.settings.scaffold.hints && !c.isFirstLook && !c.retype && (!c.practice || c.step >= 2) && t.autoHintDue(now, c.hintFirstMs)) this.hint(false);
  }

  input(value: string): void {
    const c = this.cur;
    if (!c || this.phase !== "prompt") return;
    const now = this.deps.now();
    this.activity();
    if (c.mode === "keywords") {
      c.typed = value;
      this.changed();
      return;
    }
    const t = c.typer;
    if (!t) return;
    const before = t.state;
    t.set(value, now);
    if (c.guard) for (const ev of c.guard.update(now)) this.onGuard(ev);
    if (t.state === "track" || t.state === "match") {
      if (value.length > 0 && before !== "match") this.emit("key", { progress: t.progress() });
    }
    this.changed();
    if (t.state === "match" && t.params.autoSubmitOnMatch && !t.extendable) {
      const v = this.judge(c);
      // a right name that still lacks the side is not done yet: let the student add it
      if (!(v.result === "wrong" && v.kind === "side")) this.submit(false);
    }
  }

  /** Key presses that should bounce off a trap's pause gate. Returns true if the key must be swallowed. */
  gateBlocks(): boolean {
    const c = this.cur;
    if (!c?.guard || this.phase !== "prompt") return false;
    const now = this.deps.now();
    if (!c.guard.gateActive(now)) return false;
    this.emit("trap_guard", { level: c.guard.armedLevel, bounce: true });
    return true;
  }

  private onGuard(ev: GuardEvent): void {
    switch (ev.type) {
      case "arm":
        this.emit("trap_arm", { level: ev.spot.level });
        if (ev.gateMs) this.emit("trap_guard", { level: ev.spot.level });
        break;
      case "pass":
        this.stats.trapsMet++;
        this.stats.trapsCleared++;
        this.emit("trap_clear", { level: ev.spot.level });
        break;
      case "miss":
        this.stats.trapsMet++;
        this.emit("trap_miss", { level: ev.spot.level });
        break;
      default:
        break;
    }
  }

  hint(manual: boolean): void {
    const c = this.cur;
    if (!c || this.phase !== "prompt") return;
    if (c.mode === "self") return;
    if (c.isFirstLook && manual) {
      this.submit(true);
      return;
    }
    const t = c.typer;
    if (!t) return;
    if (!this.settings.scaffold.hints) {
      if (manual) this.say("Hints are switched off. Esc shows the answer.");
      return;
    }
    const n = t.hint(this.deps.now());
    if (!n) {
      if (manual && t.capped) this.say("Hint limit reached. Esc shows the answer.");
      else if (manual && t.trapBlocked) this.say("No ghost letters at a trap spot: recall it. Esc shows the answer.");
      return;
    }
    this.emit("hint", { auto: !manual, letters: n });
    this.changed();
  }

  /** Live rating prediction for the meter. */
  predicted(): Grade {
    const c = this.cur;
    if (!c?.typer) return 3;
    let g = c.typer.predicted(this.deps.now());
    if (c.practice) g = Math.min(g, 2) as Grade;
    if (c.guard?.missedAny) g = Math.min(g, 2) as Grade;
    return g;
  }

  private judge(c: Current): Verdict {
    const typed = c.typer?.typed ?? c.typed;
    if (c.mode === "keywords" && c.card.keywords) return verdictFromKeywords(gradeKeywords(typed, c.card.keywords), typed);
    return gradeTyped(typed, { answer: c.card.answer, accept: c.card.accept, requireSide: c.card.requireSide }, { knownNames: this.names, ownSlug: c.structure?.slug ?? null });
  }

  // ------------------------------------------------------------------ submitting
  /** Choice / true-false pick. */
  choose(i: number): void {
    const c = this.cur;
    if (!c || this.phase !== "prompt" || !c.choices) return;
    c.picked = i;
    const typed = c.choices[i];
    const right = typed.trim().toLowerCase() === c.card.answer.trim().toLowerCase();
    if (c.isFirstLook && !right) {
      c.typed = typed;
      c.durationMs = Math.round(this.deps.now() - c.shownAt);
      return this.introReveal(c, "not that one: here it is", c.mode === "choice" && !!c.card.answer);
    }
    this.conclude(c, { result: right ? "correct" : "wrong", matched: c.card.answer, edits: right ? 0 : 1, why: "", points: right ? 1 : 0 }, false, typed);
  }

  submit(giveUp = false): void {
    const c = this.cur;
    if (!c || this.phase !== "prompt") return;
    if (c.mode === "self") {
      if (c.isFirstLook) return this.firstLookSelf(c);
      this.revealSelf(c);
      return;
    }
    const typed = c.typer?.typed ?? c.typed;
    if ((c.mode === "type" || c.mode === "keywords") && c.isFirstLook) return this.submitFirstLook(c, giveUp);
    if ((c.mode === "choice" || c.mode === "tf") && c.isFirstLook) {
      c.durationMs = Math.round(this.deps.now() - c.shownAt);
      return this.introReveal(c, "", c.mode === "choice" && !!c.card.answer);
    }
    const verdict: Verdict = giveUp ? { result: "empty", matched: null, edits: 0, why: "Revealed", points: 0 } : !typed.trim() ? { result: "empty", matched: null, edits: 0, why: "No answer", points: 0 } : this.judge(c);
    this.conclude(c, verdict, giveUp, typed);
  }

  private revealSelf(c: Current): void {
    c.selfGraded = true;
    c.rating = 3;
    c.maxRating = 4;
    c.verdict = null;
    c.right = false;
    c.headline = "How well did you recall it?";
    this.enterReveal(c, false);
  }

  private submitFirstLook(c: Current, giveUp: boolean): void {
    const t = c.typer;
    const now = this.deps.now();
    c.fixed = true;
    c.durationMs = Math.round(t ? t.elapsed(now) : now - c.shownAt);
    const typed = (t?.typed ?? c.typed).trim();
    c.typed = typed;
    const verdict = typed && !giveUp ? this.judge(c) : null;
    const known = t ? t.state === "match" && verdict?.result !== "wrong" : verdict?.result === "correct";
    if (!giveUp && known) {
      c.right = true;
      c.rating = 4;
      c.maxRating = 4;
      c.verdict = verdict;
      c.headline = "KNEW IT";
      c.why = "known on sight: it skips the copy steps";
      c.outcome = "top";
      c.stepAfter = nextStep(0, "top", isLong(c.card.answer));
      this.emit("easy", { combo: this.stats.combo + 1 });
      this.enterReveal(c, false);
      return;
    }
    if (!giveUp && typed && verdict?.result === "near_miss") {
      c.right = false;
      c.rating = 2;
      c.maxRating = 2;
      c.verdict = verdict;
      c.headline = "SO CLOSE";
      c.why = "almost: one more go";
      if (t) c.diff = diffOps(typed, verdict.matched ?? c.card.answer, DEFAULT_CANON);
      this.emit("near_miss", { edits: verdict.edits });
      this.enterReveal(c, true, "near");
      return;
    }
    this.introReveal(c, typed ? "not quite: here it is" : "", true);
  }

  /** The first look itself: the answer, never scored, then look and type it once (ANKI+ stage 1). */
  private introReveal(c: Current, why: string, retype: boolean): void {
    c.fixed = true;
    c.right = false;
    c.gaveUp = true;
    c.rating = 3;
    c.maxRating = 3;
    c.headline = "FIRST LOOK";
    c.why = why;
    this.emit("reveal");
    this.enterReveal(c, retype, "intro");
  }

  /** Typing off: a new card's first look just shows the answer (no rating asked). */
  private firstLookSelf(c: Current): void {
    c.durationMs = Math.round(this.deps.now() - c.shownAt);
    this.introReveal(c, "", false);
  }

  private conclude(c: Current, verdict: Verdict, giveUp: boolean, typed: string): void {
    const now = this.deps.now();
    const t = c.typer;
    c.durationMs = Math.round(now - c.shownAt);
    c.verdict = verdict;
    c.gaveUp = giveUp;
    const right = verdict.result === "correct";
    c.right = right;
    if (c.guard) c.guard.finish(right ? "right" : giveUp ? "gaveup" : "wrong");
    const predicted: Grade = t ? t.predicted(now) : 3;
    let rating = ratingFor({
      result: verdict.result,
      predicted: (c.mode === "tf" || c.mode === "choice" ? (right ? (c.durationMs < 5000 ? 4 : 3) : 1) : predicted) as Grade,
      gaveUp: giveUp,
      practice: c.practice,
      trapMissed: !!c.guard?.missedAny,
      hinted: t?.hinted ?? 0,
    });
    // a choice is recognition, not recall: never better than Good
    if (c.mode === "choice" || c.mode === "tf") rating = Math.min(rating, 3) as Grade;
    c.rating = rating;
    c.maxRating = rating;
    c.surprise = !right && !giveUp && !!typed.trim() && (t?.hinted ?? 0) === 0 && !!t && c.durationMs <= t.easyWindow && rating === 1 && c.mode === "type";
    if (c.surprise) c.lockUntil = now + 1200;
    c.why = verdict.why;
    const hinted = t?.hinted ?? 0;
    c.headline = giveUp ? "HERE IT IS" : right ? (rating === 4 ? "FLAWLESS" : rating === 3 ? (hinted ? "GOT IT" : "NICE") : "PULLED IT OFF") : verdict.result === "near_miss" ? "SO CLOSE" : "NOT QUITE";
    if (!right && typed.trim() && c.mode !== "choice" && c.mode !== "tf" && c.mode !== "keywords") {
      c.diff = diffOps(typed, verdict.matched ?? c.card.answer, DEFAULT_CANON);
    }
    if (right) this.emit(rating === 4 ? "easy" : "correct", { rating, combo: this.stats.combo + 1 });
    else if (verdict.result === "near_miss") this.emit("near_miss", { edits: verdict.edits });
    else this.emit("wrong", { surprise: c.surprise });
    c.typed = typed;
    // ladder + retype
    let retype: Retype["kind"] | undefined;
    if (c.mode === "type") {
      const long = isLong(c.card.answer);
      c.outcome = ladderOutcome(c.step, { right, firstLook: false, typos: t?.typos ?? 0, hinted });
      c.stepAfter = this.settings.scaffold.ladder ? nextStep(c.step, c.outcome, long) : MAX_STEP;
      if (this.settings.scaffold.ladder) c.ladderNote = nextText(c.card.answer, c.step, c.stepAfter);
      if (verdict.result === "near_miss") retype = "near";
      else if (!right && c.rating === 1) retype = "fail";
      else if (c.guard?.missedAny) retype = "reps";
    }
    this.enterReveal(c, !!retype, retype);
  }

  private enterReveal(c: Current, wantRetype: boolean, kind?: Retype["kind"]): void {
    const now = this.deps.now();
    this.phase = "reveal";
    if (c.guard) c.trapReport = c.guard.report();
    const state = this.states.get(c.card.id) ?? null;
    const row = state ?? newCardState("me", c.card.id, new Date(now));
    c.previews = previews(row, new Date(now), this.settings.study.retention);
    c.fixed = c.fixed || c.isFirstLook;
    // mnemonic offer: gentle, after repeated misses
    const lapses = (state?.lapses ?? 0) + (c.right ? 0 : 1);
    const misses = (this.cardMisses.get(c.card.id) ?? 0) + (c.right ? 0 : 1);
    c.mnemonicOffer = this.settings.scaffold.mnemonics && !c.isFirstLook && !c.note && (lapses >= 2 || misses >= 2) && c.card.kind !== "clinical";
    if (wantRetype && kind && c.card.answer) {
      const reps = kind === "reps" ? Math.max(2, c.guard?.repsWanted() ?? 3) : 1;
      c.retype = this.makeRetype(c, kind, reps);
    }
    this.changed();
  }

  private makeRetype(c: Current, kind: Retype["kind"], reps: number): Retype {
    const now = this.deps.now();
    const ladderCopy = (this.settings.scaffold.ladder && c.step < MAX_STEP) || (kind === "intro" && c.mode !== "type");
    // look-cover-type by default; with the scaffold on below recall, the answer stays visible (copy)
    const mode = kind === "intro" || kind === "near" || kind === "fail" ? (ladderCopy ? "retype" : "covered") : "covered";
    const typer = new Typer({ variants: answerVariants(c.card.answer, c.card.accept, { requireSide: c.card.requireSide, max: 96 }), mode, now });
    return { kind, typer, repsLeft: reps, done: false, guard: null };
  }

  /** Keystrokes in the retype box (copy / lock-in / reps). */
  retypeInput(value: string): void {
    const c = this.cur;
    const r = c?.retype;
    if (!c || !r || r.done || this.phase !== "reveal") return;
    const now = this.deps.now();
    this.activity();
    r.typer.set(value, now);
    if (r.typer.state === "track" || r.typer.state === "match") this.emit("key", { progress: r.typer.progress() });
    if (r.typer.state === "match") {
      r.repsLeft--;
      if (r.repsLeft > 0 && r.kind === "reps") {
        this.emit("save");
        r.typer = new Typer({ variants: answerVariants(c.card.answer, c.card.accept, { requireSide: c.card.requireSide, max: 96 }), mode: "covered", now });
      } else {
        r.done = true;
        this.emit("save");
        if (r.kind === "intro" || r.kind === "near") {
          // a clean copy on a first look climbs the ladder (no typos, no hints)
          if (r.kind === "intro" && r.typer.typos === 0) {
            c.outcome = ladderOutcome(0, { right: false, firstLook: true, introClean: true, typos: 0, hinted: 0 });
            c.stepAfter = nextStep(0, c.outcome, isLong(c.card.answer));
            c.ladderNote = nextText(c.card.answer, 0, c.stepAfter);
          }
        }
      }
    }
    this.changed();
  }

  peekRetype(): void {
    const r = this.cur?.retype;
    if (!r || r.typer.mode !== "covered") return;
    r.typer.peek = true;
    this.changed();
  }

  skipRetype(): void {
    const r = this.cur?.retype;
    if (!r || r.done) return;
    if (r.kind === "intro" || r.kind === "near") {
      this.peekRetype(); // those are part of learning the card: Esc shows it again instead
      return;
    }
    r.done = true;
    this.changed();
    this.accept();
  }

  setNote(body: string | null): void {
    const c = this.cur;
    if (!c) return;
    if (body) this.notes.set(c.card.id, body);
    else this.notes.delete(c.card.id);
    c.note = body;
    c.mnemonicOffer = false;
    this.changed();
  }

  get canAdvance(): boolean {
    const c = this.cur;
    if (!c || this.phase !== "reveal") return false;
    if (this.deps.now() < c.lockUntil) return false;
    return !c.retype || c.retype.done;
  }

  // ------------------------------------------------------------------ accepting
  /** Rate (self-grade or lower the suggestion) and move on. */
  accept(rating?: Grade): void {
    const c = this.cur;
    if (!c || this.phase !== "reveal") return;
    if (!this.canAdvance) return;
    const now = this.deps.now();
    const chosen = (c.fixed && !c.selfGraded ? c.rating : Math.max(1, Math.min(rating ?? c.rating, 4))) as Grade;
    const wasBoss = c.isBoss;
    const t = c.typer;
    const hinted = t?.hinted ?? 0;
    const date = new Date(now);
    const prev = this.states.get(c.card.id) ?? newCardState("me", c.card.id, date);
    const { next } = scheduleReview(prev, chosen, date, { retention: this.settings.study.retention });
    this.states.set(c.card.id, next);
    this.answered.add(c.card.id);

    // ladder
    const prevLadder = this.ladders.get(c.card.id);
    const stepBefore = c.mode === "type" ? (c.isFirstLook ? 0 : c.step) : MAX_STEP;
    let ladderPayload: AnswerPayload["ladder"];
    const unaided = c.mode === "type" && c.right && hinted === 0 && !c.practice;
    if (c.mode === "type" && this.settings.scaffold.ladder) {
      let stepAfter = c.stepAfter;
      if (chosen < c.rating) stepAfter = Math.min(stepAfter, c.step); // the student rated themselves lower: no climb
      const effective = c.isFirstLook && c.right ? MAX_STEP : c.step;
      ladderPayload = { stepBefore, stepAfter, effectiveStep: effective };
      this.ladders.set(c.card.id, {
        card_id: c.card.id,
        step: stepAfter,
        clean_streak: nextCleanStreak(prevLadder?.clean_streak ?? 0, { right: c.right, step: effective, hinted }),
        last_clean_at: null,
      });
    } else if (c.mode === "type") {
      const streak = c.right && hinted === 0 ? (prevLadder?.clean_streak ?? 0) + 1 : c.right ? prevLadder?.clean_streak ?? 0 : 0;
      this.ladders.set(c.card.id, { card_id: c.card.id, step: MAX_STEP, clean_streak: streak, last_clean_at: null });
    } else if (c.mode === "self" || c.mode === "keywords") {
      // typing off / free text: a good self-rating of a recall counts as a clean recall
      const clean = chosen >= 3 && (c.mode === "self" || c.right);
      const streak = clean ? (prevLadder?.clean_streak ?? 0) + 1 : chosen === 1 ? 0 : prevLadder?.clean_streak ?? 0;
      this.ladders.set(c.card.id, { card_id: c.card.id, step: prevLadder?.step ?? 0, clean_streak: streak, last_clean_at: null });
    }

    // payload
    const correct = c.selfGraded ? chosen >= 2 : c.isFirstLook && !c.right ? null : c.verdict ? c.verdict.result === "correct" : null;
    const attempts: Attempt[] = [...(c.guard?.attempts ?? [])];
    if (c.mode === "type" && !c.right && c.typed.trim() && !c.practice && !c.isFirstLook) attempts.push({ typed: c.typed, mode: "submit" });
    const payload: AnswerPayload = {
      clientId: this.deps.uuid(),
      cardId: c.card.id,
      sessionId: this.deps.sessionId,
      courseId: this.payload.course.id,
      rating: chosen,
      typed: c.mode === "self" ? null : c.typed || t?.typed || null,
      correct,
      hintCount: hinted,
      durationMs: c.durationMs,
      clientTs: now,
      keystrokes: {
        mode: c.mode,
        typos: t?.typos ?? 0,
        firstLook: c.isFirstLook,
        boss: wasBoss,
        followup: c.isFollowup,
        step: c.step,
        practice: c.practice,
        drift: this.drift > 0,
      },
      ladder: ladderPayload,
      unaided,
      retention: this.settings.study.retention,
    };
    if (this.settings.scaffold.traps && c.mode === "type" && !c.practice && !c.isFirstLook) {
      payload.traps = { attempts, passes: c.guard?.passed ?? [], firstTryMisses: c.guard?.missed ?? [] };
    }
    this.deps.send(payload);

    // stats and combo
    const s = this.stats;
    s.answered++;
    s.ratings[chosen]++;
    if (correct !== null) {
      s.graded++;
      if (correct) s.correct++;
    }
    s.hints += hinted;
    if (prev.reps === 0 && prev.state === 0) s.newCards++;
    if (c.isFollowup) s.followups++;
    const comboBefore = s.combo;
    if (chosen === 1) {
      s.combo = 0;
      this.cardMisses.set(c.card.id, (this.cardMisses.get(c.card.id) ?? 0) + 1);
      s.missed.push({ cardId: c.card.id, name: c.structure?.name ?? c.card.answer });
      if (comboBefore >= 5) this.emit("combo_break", { combo: comboBefore });
    } else if (!(c.isFirstLook && !c.right)) {
      s.combo++;
      if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      if (s.combo % 5 === 0) this.emit("combo", { combo: s.combo });
    }
    if (wasBoss) {
      const won = bossWon({ right: c.right, rating: chosen, hinted });
      if (won) s.bossWon++;
      this.emit(won ? "boss_win" : "boss_lose", { cardId: c.card.id });
    } else this.sinceBoss++;
    if (c.outcome === "up" || c.outcome === "top") this.emit("ladder_up", { step: c.stepAfter });
    else if (c.outcome === "down") this.emit("ladder_down", { step: c.stepAfter });
    this.run.cards++;
    this.queue.requeue(c.entry, next, now);

    // theory follow-ups right after a solid name
    if (c.card.kind === "pin" && !c.isFollowup && this.settings.scaffold.theory && chosen >= 2 && c.card.structureId && !(c.isFirstLook && !c.right)) {
      const lad = this.ladders.get(c.card.id) ?? null;
      const solid = isSolidCard(next, lad) || this.structureSolid(c.card.structureId);
      if (solid) {
        const theory = [...this.cards.values()].filter((x) => x.kind !== "pin");
        const ups = pickFollowups(c.card, theory, this.states, this.ladders, date, this.answered, 2);
        if (ups.length) this.queue.front(ups);
      }
    }
    void this.nextCard();
  }

  private structureSolid(structureId: string): boolean {
    for (const x of this.cards.values()) {
      if (x.kind === "pin" && x.structureId === structureId && isSolidCard(this.states.get(x.id) ?? null, this.ladders.get(x.id) ?? null)) return true;
    }
    return false;
  }

  /** Rung for display. */
  rung(): number {
    return this.cur ? rungOf(this.cur.step) : 3;
  }

  /** Cards still to come (for the header counters). */
  counts(): { new: number; learning: number; review: number } {
    const c = this.queue.counts();
    return c;
  }

  phaseOfCard(c: StudyCard): string {
    return phaseOf(this.states.get(c.id) ?? null, new Date(this.deps.now()));
  }
}
