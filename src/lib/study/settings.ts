// Learner-facing settings: the scaffolding toggles ("How your learning is scaffolded"), typing-off state,
// study limits. Stored in user_settings.settings (jsonb) under the keys `scaffold`, `typing`, `study`.
// Pure helpers; the API merges into the existing jsonb so other agents' keys (theme...) survive.

export interface Scaffold {
  /** ghost-letter hints (Tab / auto after a pause); a hint downgrades the rating */
  hints: boolean;
  /** the Russian-style ladder: copy > skeleton > first letters > recall, fading in half-steps */
  ladder: boolean;
  /** learn each student's own misspelling spots and guard them */
  traps: boolean;
  /** a hard card every ~10 cards becomes a boss fight */
  boss: boolean;
  /** theory follow-ups asked right after a solid name */
  theory: boolean;
  /** micro-sprints, wander catcher, hyperfocus guard, trap-letter slow mode */
  focus: boolean;
  sounds: boolean;
  /** read the answer aloud when it is revealed (pre-generated voice; off by default) */
  speak: boolean;
  /** streak and activity grid */
  streaks: boolean;
  /** offer the student-written mnemonic prompt after repeated misses */
  mnemonics: boolean;
}

export const SCAFFOLD_DEFAULTS: Scaffold = {
  hints: true,
  ladder: true,
  traps: true,
  boss: true,
  theory: true,
  focus: true,
  sounds: true,
  speak: false,
  streaks: true,
  mnemonics: true,
};

export type ScaffoldKey = keyof Scaffold;

export interface TypingMode {
  /** false = typing off: recall, reveal, self-grade */
  enabled: boolean;
  /** ISO time typing was switched off */
  offSince: string | null;
  /** ISO time of the last weekly reminder shown while off */
  lastReminder: string | null;
}

export const TYPING_DEFAULTS: TypingMode = { enabled: true, offSince: null, lastReminder: null };

export interface StudyPrefs {
  newPerDay: number;
  reviewsPerDay: number;
  /** FSRS desired retention */
  retention: number;
  /** micro-sprint size (cards per round) */
  sprintSize: number;
  /** hyperfocus guard: minutes / cards before a stop card */
  guardMinutes: number;
  guardCards: number;
}

export const STUDY_DEFAULTS: StudyPrefs = {
  newPerDay: 15,
  reviewsPerDay: 200,
  retention: 0.9,
  sprintSize: 5,
  guardMinutes: 30,
  guardCards: 75,
};

export interface LearnerSettings {
  scaffold: Scaffold;
  typing: TypingMode;
  study: StudyPrefs;
}

function pickBools<T extends object>(defaults: T, src: unknown): T {
  const out = { ...defaults } as Record<string, unknown>;
  if (src && typeof src === "object") {
    for (const k of Object.keys(defaults)) {
      const v = (src as Record<string, unknown>)[k];
      if (typeof v === typeof (defaults as Record<string, unknown>)[k]) out[k] = v;
    }
  }
  return out as T;
}

/** Normalise whatever is in user_settings.settings into complete, typed settings. */
export function readLearnerSettings(raw: unknown): LearnerSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const study = pickBools(STUDY_DEFAULTS, r.study);
  study.newPerDay = clamp(study.newPerDay, 0, 100);
  study.reviewsPerDay = clamp(study.reviewsPerDay, 0, 1000);
  study.retention = clamp(study.retention, 0.7, 0.97);
  study.sprintSize = clamp(study.sprintSize, 3, 20);
  return {
    scaffold: pickBools(SCAFFOLD_DEFAULTS, r.scaffold),
    typing: readTyping(r.typing),
    study,
  };
}

function readTyping(raw: unknown): TypingMode {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return { enabled: typeof r.enabled === "boolean" ? r.enabled : true, offSince: str(r.offSince), lastReminder: str(r.lastReminder) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

/** Merge a partial update into the raw jsonb, touching only the engine's keys. */
export function mergeLearnerSettings(raw: unknown, patch: Partial<{ scaffold: Partial<Scaffold>; typing: Partial<TypingMode>; study: Partial<StudyPrefs> }>): Record<string, unknown> {
  const base = (raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const cur = readLearnerSettings(raw);
  if (patch.scaffold) base.scaffold = { ...cur.scaffold, ...pickBools(SCAFFOLD_DEFAULTS, { ...cur.scaffold, ...patch.scaffold }) };
  if (patch.typing) base.typing = { ...cur.typing, ...patch.typing };
  if (patch.study) base.study = { ...cur.study, ...pickBools(STUDY_DEFAULTS, { ...cur.study, ...patch.study }) };
  return base;
}

/** Weekly gentle reminder while typing is off. */
export function typingReminderDue(t: TypingMode, now: Date = new Date()): boolean {
  if (t.enabled) return false;
  const week = 7 * 86_400_000;
  const last = t.lastReminder ?? t.offSince;
  if (!last) return true;
  return now.getTime() - new Date(last).getTime() >= week;
}

/** The "solid name" rule (docs: see src/lib/study/queue.ts): consecutive clean recalls needed, or FSRS stability in days. */
export const SOLID_CLEAN_STREAK = 2;
export const SOLID_STABILITY_DAYS = 3;
