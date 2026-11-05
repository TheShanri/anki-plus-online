// The study queue: which cards, in what order, and the "solid name" rule that gates theory follow-ups.
//
// SOLID NAME (documented rule): a structure's name is solid when at least one of its name (pin) cards has
//   * 2 consecutive clean recalls (correct, no hints, at the recall rung, no trap miss), OR
//   * FSRS stability >= 3 days in the Review state (not currently relearning).
// Structures without any pin card are always solid (their theory cards are available at once).
// Theory cards of a structure only enter the queue (or are asked as follow-ups right after its name) once the
// name is solid.
import type { CardStateRow } from "../fsrs.ts";
import { SOLID_CLEAN_STREAK, SOLID_STABILITY_DAYS } from "./settings.ts";
import type { LadderRow, StudyCard } from "./types.ts";

export type EntrySource = "new" | "learning" | "review" | "followup" | "boss";

export interface Entry {
  card: StudyCard;
  state: CardStateRow | null;
  ladder: LadderRow | null;
  source: EntrySource;
  parentId?: string;
}

export type Phase = "new" | "learning" | "review" | "future";

/** New = never reviewed. Learning = learning/relearning and due. Review = due review. Future = not due. */
export function phaseOf(state: CardStateRow | null, now: Date, learnAheadMs = 0): Phase {
  if (!state || (state.state === 0 && state.reps === 0)) return "new";
  const due = new Date(state.due).getTime();
  if (state.state === 1 || state.state === 3) return due <= now.getTime() + learnAheadMs ? "learning" : "future";
  return due <= now.getTime() ? "review" : "future";
}

export function isSolidCard(state: CardStateRow | null, ladder: LadderRow | null): boolean {
  if (ladder && ladder.clean_streak >= SOLID_CLEAN_STREAK) return true;
  return !!state && state.state === 2 && state.stability >= SOLID_STABILITY_DAYS;
}

/** Structure ids whose name is solid (or that have no name card at all). */
export function solidStructures(
  cards: StudyCard[],
  states: Map<string, CardStateRow>,
  ladders: Map<string, LadderRow>,
): { solid: Set<string>; hasName: Set<string> } {
  const hasName = new Set<string>();
  const solid = new Set<string>();
  for (const c of cards) {
    if (c.kind !== "pin" || !c.structureId) continue;
    hasName.add(c.structureId);
    if (isSolidCard(states.get(c.id) ?? null, ladders.get(c.id) ?? null)) solid.add(c.structureId);
  }
  return { solid, hasName };
}

export interface BuildOptions {
  now: Date;
  newLimit: number;
  reviewLimit: number;
  solid: Set<string>;
  hasName: Set<string>;
  rand?: () => number;
}

function theoryAllowed(c: StudyCard, o: BuildOptions): boolean {
  if (c.kind !== "theory") return true;
  if (!c.structureId) return true;
  return !o.hasName.has(c.structureId) || o.solid.has(c.structureId);
}

/** Avoid back-to-back cards of the same structure where the list allows it. */
export function spread(entries: Entry[]): Entry[] {
  const out = entries.slice();
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].card.structureId;
    if (prev && out[i].card.structureId === prev) {
      for (let j = i + 1; j < Math.min(out.length, i + 8); j++) {
        if (out[j].card.structureId !== prev) {
          [out[i], out[j]] = [out[j], out[i]];
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Build today's queue. `cards` must already be in course order (unit, topic, card position) for new-card order.
 * Order: due learning cards, then reviews (oldest due first, same-day ties shuffled, structures spread), with
 * new cards interleaved at an even rate. Limits: newLimit new cards, reviewLimit reviews.
 */
export function buildQueue(cards: StudyCard[], states: Map<string, CardStateRow>, ladders: Map<string, LadderRow>, o: BuildOptions): Entry[] {
  const rand = o.rand ?? Math.random;
  const learning: Entry[] = [];
  const reviews: Entry[] = [];
  const news: Entry[] = [];
  for (const card of cards) {
    if (!theoryAllowed(card, o)) continue;
    const state = states.get(card.id) ?? null;
    const ladder = ladders.get(card.id) ?? null;
    const ph = phaseOf(state, o.now);
    if (ph === "learning") learning.push({ card, state, ladder, source: "learning" });
    else if (ph === "review") reviews.push({ card, state, ladder, source: "review" });
    else if (ph === "new") news.push({ card, state, ladder, source: "new" });
  }
  const due = (e: Entry) => new Date(e.state!.due).getTime();
  learning.sort((a, b) => due(a) - due(b));
  // oldest day first, shuffled within the day
  const dayKey = (e: Entry) => Math.floor(due(e) / 86_400_000);
  reviews.sort((a, b) => dayKey(a) - dayKey(b) || rand() - 0.5);
  const revs = spread(reviews).slice(0, Math.max(0, o.reviewLimit));
  const newest = news.slice(0, Math.max(0, o.newLimit));
  const merged: Entry[] = [];
  if (!newest.length) merged.push(...revs);
  else if (!revs.length) merged.push(...newest);
  else {
    const every = Math.max(2, Math.floor(revs.length / (newest.length + 1)));
    let ni = 0;
    revs.forEach((r, i) => {
      merged.push(r);
      if ((i + 1) % every === 0 && ni < newest.length) merged.push(newest[ni++]);
    });
    while (ni < newest.length) merged.push(newest[ni++]);
  }
  return [...learning, ...spread(merged)];
}

export interface LearningItem {
  entry: Entry;
  due: number;
}

/** Client-side session queue: pending list, cards in learning steps, follow-ups pushed to the front. */
export class SessionQueue {
  pending: Entry[];
  learning: LearningItem[] = [];
  private last: string | null = null;
  /** minutes ahead of due a learning card may be shown when nothing else is left */
  learnAheadMs: number;

  constructor(entries: Entry[], learnAheadMs = 20 * 60_000) {
    this.pending = entries.slice();
    this.learnAheadMs = learnAheadMs;
  }

  push(entries: Entry[]): void {
    const have = new Set([...this.pending.map((e) => e.card.id), ...this.learning.map((l) => l.entry.card.id)]);
    for (const e of entries) if (!have.has(e.card.id)) this.pending.push(e);
  }

  front(entries: Entry[]): void {
    this.pending.unshift(...entries);
  }

  /** Next entry to show, or null when nothing is left. Does not remove learning cards until `take`. */
  next(nowMs: number): Entry | null {
    const dueLearning = this.learning.filter((l) => l.due <= nowMs).sort((a, b) => a.due - b.due);
    let pick: { from: "learning"; idx: number } | { from: "pending"; idx: number } | null = null;
    const pickLearning = dueLearning.find((l) => l.entry.card.id !== this.last) ?? (this.pending.length ? null : dueLearning[0]);
    if (pickLearning) pick = { from: "learning", idx: this.learning.indexOf(pickLearning) };
    else if (this.pending.length) {
      let idx = 0;
      if (this.pending[0].card.id === this.last) {
        const alt = this.pending.findIndex((e) => e.card.id !== this.last);
        if (alt > 0) idx = alt;
      }
      pick = { from: "pending", idx };
    } else {
      const ahead = this.learning
        .filter((l) => l.due <= nowMs + this.learnAheadMs)
        .sort((a, b) => a.due - b.due)
        .find((l) => l.entry.card.id !== this.last) ?? this.learning.filter((l) => l.due <= nowMs + this.learnAheadMs)[0];
      if (ahead) pick = { from: "learning", idx: this.learning.indexOf(ahead) };
    }
    if (!pick) return null;
    const entry = pick.from === "learning" ? this.learning[pick.idx].entry : this.pending[pick.idx];
    return entry;
  }

  /** Remove the entry from wherever it waits (called when it is put on screen). */
  take(entry: Entry): void {
    const li = this.learning.findIndex((l) => l.entry.card.id === entry.card.id);
    if (li >= 0) this.learning.splice(li, 1);
    const pi = this.pending.findIndex((e) => e.card.id === entry.card.id);
    if (pi >= 0) this.pending.splice(pi, 1);
    this.last = entry.card.id;
  }

  /** After an answer: a card still in learning steps comes back this session. */
  requeue(entry: Entry, state: CardStateRow, nowMs: number): void {
    const due = new Date(state.due).getTime();
    if ((state.state === 1 || state.state === 3) && due - nowMs <= 60 * 60_000) {
      this.learning.push({ entry: { ...entry, state, source: "learning" }, due });
    }
  }

  counts(nowMs: number): { new: number; learning: number; review: number } {
    let n = 0;
    let r = 0;
    for (const e of this.pending) {
      if (e.source === "new") n++;
      else r++;
    }
    return { new: n, learning: this.learning.length, review: r };
  }

  get size(): number {
    return this.pending.length + this.learning.length;
  }
}

/** Theory follow-ups to ask right after `parent`'s name: new or due theory cards of the same structure. */
export function pickFollowups(
  parent: StudyCard,
  theory: StudyCard[],
  states: Map<string, CardStateRow>,
  ladders: Map<string, LadderRow>,
  now: Date,
  answered: Set<string>,
  max = 2,
): Entry[] {
  if (!parent.structureId) return [];
  const mine = theory.filter((c) => c.kind === "theory" && c.structureId === parent.structureId && !answered.has(c.id));
  const wanted = parent.followups.map((f) => f.split(":").pop() ?? "");
  const rank = (c: StudyCard) => {
    const i = wanted.indexOf(c.facet ?? "");
    return i >= 0 ? i : 100 + c.position;
  };
  const out: Entry[] = [];
  for (const c of mine.sort((a, b) => rank(a) - rank(b))) {
    const st = states.get(c.id) ?? null;
    const ph = phaseOf(st, now);
    if (ph === "future") continue;
    out.push({ card: c, state: st, ladder: ladders.get(c.id) ?? null, source: "followup", parentId: parent.id });
    if (out.length >= max) break;
  }
  return out;
}
