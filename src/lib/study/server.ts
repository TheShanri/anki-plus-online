// Server-side helpers for the study engine. All reads/writes use the signed-in user's Supabase client (RLS).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardStateRow } from "../fsrs.ts";
import { readLearnerSettings, type LearnerSettings } from "./settings.ts";
import { buildQueue, solidStructures, type Entry, phaseOf } from "./queue.ts";
import { toStudyCard, type CardRow, type LadderRow, type StructureLite, type StudyCard, type StudyPayload } from "./types.ts";
import { activeSpots, type PatternRow, type TrapRow, type TrapSpot, ARM_AT } from "./traps.ts";
export type { StudyPayload };
import { canonStr } from "./text.ts";

export interface CourseCtx {
  id: string;
  code: string;
  title: string;
  /** media path segment (see src/lib/media.ts) */
  slug: string;
  settings: Record<string, unknown>;
}

export function courseSlug(code: string, settings: Record<string, unknown>): string {
  const s = settings?.slug;
  if (typeof s === "string" && s) return s;
  return code.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/[a-z]$/, "");
}

/** The course to study: ?course=<id|code> if the user belongs to it, else their first enrolment (admins: any course). */
export async function resolveCourse(sb: SupabaseClient, userId: string, wanted?: string | null): Promise<CourseCtx | null> {
  const { data: enr } = await sb.from("enrollments").select("course_id, joined_at").eq("user_id", userId).order("joined_at", { ascending: true });
  let ids = (enr ?? []).map((e: { course_id: string }) => e.course_id);
  const { data: courses } = await sb.from("courses").select("id, code, title, settings").order("code");
  const mine = (courses ?? []) as Array<{ id: string; code: string; title: string; settings: Record<string, unknown> }>;
  let pool = mine.filter((c) => ids.includes(c.id));
  if (!pool.length) pool = mine; // an admin without an enrolment sees every course RLS lets through
  ids = pool.map((c) => c.id);
  const pick = (wanted && pool.find((c) => c.id === wanted || c.code === wanted)) || pool[0];
  if (!pick) return null;
  return { id: pick.id, code: pick.code, title: pick.title, slug: courseSlug(pick.code, pick.settings ?? {}), settings: pick.settings ?? {} };
}

export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await make(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadSettings(sb: SupabaseClient, userId: string): Promise<{ raw: Record<string, unknown>; learner: LearnerSettings }> {
  const { data } = await sb.from("user_settings").select("settings").eq("user_id", userId).maybeSingle();
  const raw = (data?.settings ?? {}) as Record<string, unknown>;
  return { raw, learner: readLearnerSettings(raw) };
}

export interface TopicRow {
  id: string;
  slug: string;
  unit_id: string | null;
  position: number;
  kind: string;
  title: string;
  meta: Record<string, unknown>;
}
export interface UnitRow {
  id: string;
  slug: string;
  position: number;
  title: string;
}

interface LightCard {
  id: string;
  slug: string;
  kind: string;
  topic_id: string | null;
  structure_id: string | null;
  position: number;
}

export interface CourseIndex {
  units: UnitRow[];
  topics: TopicRow[];
  cards: LightCard[];
  states: Map<string, CardStateRow>;
  ladders: Map<string, LadderRow>;
}

/** Light index of a course: units, topics, card ids (no content), and the user's states. */
export async function loadIndex(sb: SupabaseClient, userId: string, courseId: string): Promise<CourseIndex> {
  const [unitsR, topicsR, cards, states, ladders] = await Promise.all([
    sb.from("units").select("id, slug, position, title").eq("course_id", courseId).order("position"),
    sb.from("topics").select("id, slug, unit_id, position, kind, title, meta").eq("course_id", courseId).order("position"),
    fetchAll<LightCard>((a, b) =>
      sb.from("cards").select("id, slug, kind, topic_id, structure_id, position").eq("course_id", courseId).eq("status", "live").order("position").range(a, b),
    ),
    fetchAll<CardStateRow>((a, b) => sb.from("card_states").select("*").eq("user_id", userId).range(a, b)),
    fetchAll<LadderRow>((a, b) => sb.from("card_ladder").select("card_id, step, clean_streak, last_clean_at").eq("user_id", userId).range(a, b)),
  ]);
  const cardIds = new Set(cards.map((c) => c.id));
  return {
    units: (unitsR.data ?? []) as UnitRow[],
    topics: (topicsR.data ?? []) as TopicRow[],
    cards,
    states: new Map(states.filter((s) => cardIds.has(s.card_id)).map((s) => [s.card_id, s])),
    ladders: new Map(ladders.filter((l) => cardIds.has(l.card_id)).map((l) => [l.card_id, l])),
  };
}

function lightToStudy(c: LightCard): StudyCard {
  return { id: c.id, slug: c.slug, kind: c.kind as StudyCard["kind"], topicId: c.topic_id, structureId: c.structure_id, position: c.position, prompt: "", answer: "", accept: [], requireSide: false, format: "type", followups: [], tags: [] };
}

/** Cards sorted in course order (unit, topic, card position). */
export function courseOrder(idx: CourseIndex): LightCard[] {
  const unitPos = new Map(idx.units.map((u) => [u.id, u.position]));
  const topicInfo = new Map(idx.topics.map((t) => [t.id, { pos: t.position, unit: unitPos.get(t.unit_id ?? "") ?? 999 }]));
  return idx.cards.slice().sort((a, b) => {
    const ta = topicInfo.get(a.topic_id ?? "") ?? { pos: 999, unit: 999 };
    const tb = topicInfo.get(b.topic_id ?? "") ?? { pos: 999, unit: 999 };
    return ta.unit - tb.unit || ta.pos - tb.pos || a.position - b.position;
  });
}

export type Scope = { type: "all" } | { type: "unit"; slug: string } | { type: "topic"; slug: string } | { type: "weak" };

export function parseScope(s: string | null | undefined): Scope {
  if (!s || s === "all") return { type: "all" };
  if (s === "weak") return { type: "weak" };
  const [t, slug] = s.split(":");
  if ((t === "unit" || t === "topic") && slug) return { type: t, slug };
  return { type: "all" };
}

export function scopeTopicIds(idx: CourseIndex, scope: Scope): Set<string> | null {
  if (scope.type === "all" || scope.type === "weak") return null;
  if (scope.type === "topic") return new Set(idx.topics.filter((t) => t.slug === scope.slug).map((t) => t.id));
  const unit = idx.units.find((u) => u.slug === scope.slug);
  return new Set(idx.topics.filter((t) => t.unit_id === unit?.id).map((t) => t.id));
}

export function startOfLocalDay(now: Date, tzOffsetMin: number): Date {
  const localNow = now.getTime() - tzOffsetMin * 60_000;
  const midnight = Math.floor(localNow / 86_400_000) * 86_400_000;
  return new Date(midnight + tzOffsetMin * 60_000);
}

export interface Overview {
  total: number;
  due: number;
  learning: number;
  newCount: number;
  learned: number;
}

function emptyOverview(): Overview {
  return { total: 0, due: 0, learning: 0, newCount: 0, learned: 0 };
}

/** Counts for the study home: whole course, per unit, per topic. */
export function computeOverview(idx: CourseIndex, now: Date): { all: Overview; units: Record<string, Overview>; topics: Record<string, Overview> } {
  const all = emptyOverview();
  const units: Record<string, Overview> = {};
  const topics: Record<string, Overview> = {};
  const topicUnit = new Map(idx.topics.map((t) => [t.id, t.unit_id]));
  const { solid, hasName } = solidStructures(idx.cards.map(lightToStudy), idx.states, idx.ladders);
  for (const c of idx.cards) {
    // theory cards that are not yet unlocked do not count as available
    if (c.kind === "theory" && c.structure_id && hasName.has(c.structure_id) && !solid.has(c.structure_id)) continue;
    const st = idx.states.get(c.id) ?? null;
    const ph = phaseOf(st, now);
    const targets = [all];
    if (c.topic_id) {
      topics[c.topic_id] ??= emptyOverview();
      targets.push(topics[c.topic_id]);
      const u = topicUnit.get(c.topic_id);
      if (u) {
        units[u] ??= emptyOverview();
        targets.push(units[u]);
      }
    }
    for (const o of targets) {
      o.total++;
      if (ph === "new") o.newCount++;
      else if (ph === "learning") o.learning++;
      else if (ph === "review") o.due++;
      if (st && st.state === 2 && st.stability >= 7) o.learned++;
    }
  }
  return { all, units, topics };
}

const BATCH = 40;

export async function buildStudyPayload(
  sb: SupabaseClient,
  userId: string,
  course: CourseCtx,
  o: { scope: Scope; scopeKey: string; tzOffsetMin: number; exclude: Set<string>; bootstrap: boolean; now?: Date },
): Promise<StudyPayload> {
  const now = o.now ?? new Date();
  const { learner } = await loadSettings(sb, userId);
  const idx = await loadIndex(sb, userId, course.id);
  const ordered = courseOrder(idx);
  const light = ordered.map(lightToStudy);
  const { solid, hasName } = solidStructures(light, idx.states, idx.ladders);

  // daily counts
  const dayStart = startOfLocalDay(now, o.tzOffsetMin).toISOString();
  const [newDone, revDone] = await Promise.all([
    sb.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("state_before", 0).gte("reviewed_at", dayStart),
    sb.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("state_before", 0).gte("reviewed_at", dayStart),
  ]);
  const newDoneToday = newDone.count ?? 0;
  const reviewsDoneToday = revDone.count ?? 0;
  const newLeft = Math.max(0, learner.study.newPerDay - newDoneToday);
  const reviewsLeft = Math.max(0, learner.study.reviewsPerDay - reviewsDoneToday);

  // scope
  const topicSet = scopeTopicIds(idx, o.scope);
  let scoped = light.filter((c) => !o.exclude.has(c.id) && (!topicSet || (c.topicId && topicSet.has(c.topicId))));
  if (o.scope.type === "weak") {
    // cards that have lapsed or are hard: the "weak spots" scope
    scoped = scoped.filter((c) => {
      const st = idx.states.get(c.id);
      return !!st && (st.lapses > 0 || st.difficulty >= 7) && phaseOf(st, now, 86_400_000 * 365) !== "new";
    });
  }
  const entries = buildQueue(scoped, idx.states, idx.ladders, {
    now,
    newLimit: o.scope.type === "weak" ? 0 : newLeft,
    reviewLimit: o.scope.type === "weak" ? 60 : reviewsLeft,
    solid,
    hasName,
  });
  // weak scope studies cards even when not due: pull them in as reviews
  let picked = entries;
  if (o.scope.type === "weak" && !entries.length) {
    picked = scoped.slice(0, 40).map((card) => ({ card, state: idx.states.get(card.id) ?? null, ladder: idx.ladders.get(card.id) ?? null, source: "review" as const }));
  }
  const counts = {
    new: picked.filter((e) => e.source === "new").length,
    learning: picked.filter((e) => e.source === "learning").length,
    review: picked.filter((e) => e.source === "review").length,
    newDoneToday,
    reviewsDoneToday,
    newLeft,
    reviewsLeft,
  };
  const batch = picked.slice(0, Math.max(BATCH, picked.filter((e) => e.source === "learning").length));

  // content for the batch, plus theory cards of the batch's structures (for follow-ups)
  const ids = new Set(batch.map((e) => e.card.id));
  const structIds = new Set(batch.map((e) => e.card.structureId).filter((x): x is string => !!x));
  const theoryIds = o.scope.type === "weak" ? [] : idx.cards.filter((c) => c.kind === "theory" && c.structure_id && structIds.has(c.structure_id)).map((c) => c.id);
  const allIds = [...new Set([...ids, ...theoryIds])];
  const rows = await fetchRowsByIds<CardRow>(sb, "cards", "id, slug, kind, topic_id, structure_id, position, content, media", allIds);
  const cards = rows.map(toStudyCard);

  const structureIds = [...new Set(cards.map((c) => c.structureId).filter((x): x is string => !!x))];
  const structRows = await fetchRowsByIds<{ id: string; slug: string; canonical_name: string; synonyms: string[]; region: string | null; info: StructureLite["info"] }>(
    sb, "structures", "id, slug, canonical_name, synonyms, region, info", structureIds,
  );
  const structures: Record<string, StructureLite> = {};
  for (const s of structRows) structures[s.id] = { id: s.id, slug: s.slug, name: s.canonical_name, synonyms: s.synonyms ?? [], region: s.region, info: s.info ?? {} };

  // traps
  const [trapRowsAll, patRows, noteRows] = await Promise.all([
    fetchAll<TrapRow>((a, b) => sb.from("card_traps").select("*").eq("user_id", userId).eq("retired", false).gte("misses", ARM_AT).range(a, b)),
    fetchAll<PatternRow>((a, b) => sb.from("user_trap_patterns").select("pattern, kind, misses, hits, streak, last_miss, last_hit, retired").eq("user_id", userId).range(a, b)),
    fetchRowsByIds<{ card_id: string; body: string }>(sb, "user_card_notes", "card_id, body", allIds, "card_id", { user_id: userId }),
  ]);
  const patternWords: Record<string, number> = {};
  const byCard = new Map<string, TrapRow[]>();
  for (const t of trapRowsAll) {
    patternWords[t.pattern] = (patternWords[t.pattern] ?? 0) + 1;
    const a = byCard.get(t.card_id) ?? [];
    a.push(t);
    byCard.set(t.card_id, a);
  }
  const traps: Record<string, TrapSpot[]> = {};
  const trapMisses: Record<string, number> = {};
  for (const c of cards) {
    const rowsFor = byCard.get(c.id) ?? [];
    trapMisses[c.id] = Math.round(rowsFor.reduce((s, r) => s + r.misses, 0) * 100) / 100;
    if (c.format === "type" && c.answer) traps[c.id] = activeSpots(c.answer, rowsFor, patRows, patternWords);
  }

  let names: Record<string, string> | null = null;
  if (o.bootstrap) {
    names = {};
    const all = await fetchAll<{ slug: string; canonical_name: string; synonyms: string[] }>((a, b) =>
      sb.from("structures").select("slug, canonical_name, synonyms").eq("course_id", course.id).range(a, b),
    );
    for (const s of all) {
      for (const n of [s.canonical_name, ...(s.synonyms ?? [])]) {
        const k = canonStr(n);
        if (k && !(k in names)) names[k] = s.slug;
      }
    }
  }

  const states: Record<string, CardStateRow> = {};
  const ladders: Record<string, LadderRow> = {};
  for (const id of allIds) {
    const st = idx.states.get(id);
    if (st) states[id] = st;
    const l = idx.ladders.get(id);
    if (l) ladders[id] = l;
  }
  return {
    course: { id: course.id, code: course.code, title: course.title, slug: course.slug, settings: course.settings },
    settings: learner,
    serverNow: now.toISOString(),
    scope: o.scopeKey,
    queue: batch.map((e) => ({ cardId: e.card.id, source: e.source })),
    cards,
    structures,
    states,
    ladders,
    traps,
    trapMisses,
    notes: Object.fromEntries(noteRows.map((n) => [n.card_id, n.body])),
    counts,
    names,
    units: idx.units.map((u) => ({ slug: u.slug, title: u.title })),
  };
}

/** `select ... where <col> in (ids)` in chunks (URL length), optionally with extra equality filters. */
export async function fetchRowsByIds<T>(sb: SupabaseClient, table: string, columns: string, ids: string[], col = "id", eq: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 60) {
    let q = sb.from(table).select(columns).in(col, ids.slice(i, i + 60));
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}
