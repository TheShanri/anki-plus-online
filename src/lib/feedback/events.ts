// A tiny typed event bus for study feedback. The study engine EMITS named events; it never plays audio.
// The theme agent subscribes (`onFeedback` / `onAnyFeedback`) and maps each event to the active theme's
// synthesised sound pack and effects. Subscribers should honour `soundsEnabled()` (the "sounds" toggle on
// /settings/scaffolding); events are emitted either way so visual effects can still react.
//
// Event vocabulary (payloads are small and optional):
//   key            a correct key in the answer box            { progress: 0..1 }
//   typo           a key that makes the typed answer go wrong  { progress: 0..1 }
//   hint           a ghost letter was revealed                 { auto: boolean, letters: number }
//   correct        answer right                                { rating: 1..4, combo: number }
//   easy           answer right, fast and flawless             { combo }
//   near_miss      right but for a typo (Hard)                 { edits: number }
//   wrong          wrong / revealed                            { surprise?: boolean }
//   reveal         first look / answer shown without a verdict
//   save           a retype or rep locked in
//   combo          combo milestone (every 5)                   { combo }
//   combo_break    a combo of 5+ ended                         { combo }
//   boss_start / boss_win / boss_lose                          { cardId }
//   trap_arm       a guarded spot is coming                    { level: 1..3 }
//   trap_guard     the pause gate engaged / a key bounced      { level, bounce?: boolean }
//   trap_clear     a guarded spot was typed right              { level }
//   trap_miss      a guarded spot was missed                   { level }
//   followup       a theory follow-up opens                    { facet }
//   ladder_up / ladder_down  scaffold moved                    { step }
//   drift          the wander catcher noticed a drift          { level: 1..3 }
//   guard          hyperfocus guard stop card
//   level_up       a unit or streak level milestone            { level }
//   streak         streak extended                             { days }
//   session_done   session summary shown                       { cards, accuracy }
//   practical_start / practical_tick / practical_end           { station?, seconds? }
//   card_in        a new card appeared
//   ui             generic click / toggle                      { name }

export interface FeedbackPayloads {
  key: { progress?: number };
  typo: { progress?: number };
  hint: { auto?: boolean; letters?: number };
  correct: { rating?: number; combo?: number };
  easy: { combo?: number };
  near_miss: { edits?: number };
  wrong: { surprise?: boolean };
  reveal: Record<string, never>;
  save: Record<string, never>;
  combo: { combo: number };
  combo_break: { combo: number };
  boss_start: { cardId?: string };
  boss_win: { cardId?: string };
  boss_lose: { cardId?: string };
  trap_arm: { level: number };
  trap_guard: { level: number; bounce?: boolean };
  trap_clear: { level: number };
  trap_miss: { level: number };
  followup: { facet?: string };
  ladder_up: { step: number };
  ladder_down: { step: number };
  drift: { level: number };
  guard: Record<string, never>;
  level_up: { level: number };
  streak: { days: number };
  session_done: { cards: number; accuracy?: number };
  practical_start: { stations?: number };
  practical_tick: { seconds: number };
  practical_end: { score?: number; max?: number };
  card_in: Record<string, never>;
  ui: { name: string };
}

export type FeedbackName = keyof FeedbackPayloads;
export type FeedbackListener<K extends FeedbackName = FeedbackName> = (payload: FeedbackPayloads[K], name: K) => void;

type AnyListener = (name: FeedbackName, payload: FeedbackPayloads[FeedbackName]) => void;

const listeners = new Map<FeedbackName, Set<FeedbackListener<never>>>();
const anyListeners = new Set<AnyListener>();
let sounds = true;

/** Emit an event. Listener errors never break the study flow. */
export function emit<K extends FeedbackName>(name: K, payload?: FeedbackPayloads[K]): void {
  const p = (payload ?? {}) as FeedbackPayloads[K];
  for (const l of listeners.get(name) ?? []) {
    try {
      (l as FeedbackListener<K>)(p, name);
    } catch (e) {
      console.warn("feedback listener", name, e);
    }
  }
  for (const l of anyListeners) {
    try {
      l(name, p);
    } catch (e) {
      console.warn("feedback listener", name, e);
    }
  }
}

/** Subscribe to one event. Returns the unsubscribe function. */
export function onFeedback<K extends FeedbackName>(name: K, fn: FeedbackListener<K>): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn as FeedbackListener<never>);
  return () => set.delete(fn as FeedbackListener<never>);
}

/** Subscribe to every event (the theme agent's sound mapper). */
export function onAnyFeedback(fn: AnyListener): () => void {
  anyListeners.add(fn);
  return () => anyListeners.delete(fn);
}

/** The learner's "sounds" toggle. Sound players should check this before playing. */
export function setSoundsEnabled(on: boolean): void {
  sounds = on;
}
export function soundsEnabled(): boolean {
  return sounds;
}

// ------------------------------------------------------------------ temporary fallback beep (for testing)
// Off unless `localStorage["anki.fallbackBeep"] = "1"` or enableFallbackBeep(true). The theme agent's sound
// packs replace it; delete this block (and its call in the study provider) once a theme pack is wired up.
const BEEP_HZ: Partial<Record<FeedbackName, number>> = {
  correct: 660, easy: 880, near_miss: 440, wrong: 180, hint: 520, combo: 990, boss_start: 120, boss_win: 1040, trap_miss: 150,
  trap_clear: 760, level_up: 1100, session_done: 800, save: 600,
};
let beepOn = false;
let ctx: AudioContext | null = null;
let unsub: (() => void) | null = null;

export function enableFallbackBeep(on: boolean): void {
  beepOn = on;
  if (!on) {
    unsub?.();
    unsub = null;
    return;
  }
  if (unsub || typeof window === "undefined") return;
  unsub = onAnyFeedback((name) => {
    const hz = BEEP_HZ[name];
    if (!beepOn || !sounds || !hz) return;
    try {
      ctx = ctx ?? new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.13);
    } catch {
      /* no audio: ignore */
    }
  });
}

export function initFallbackBeepFromStorage(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("anki.fallbackBeep") === "1") enableFallbackBeep(true);
  } catch {
    /* ignore */
  }
}
