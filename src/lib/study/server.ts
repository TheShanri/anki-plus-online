// Server-side helpers for the study engine. All reads/writes use the signed-in user's Supabase client (RLS).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardStateRow } from "../fsrs.ts";
import { readLearnerSettings, type LearnerSettings } from "./settings.ts";
import { buildQueue, solidStructures, phaseOf } from "./queue.ts";
import { dailyLeft } from "./limits.ts";
import { toStudyCard, type CardRow, type LadderRow, type StructureLite, type StudyCard, type StudyPayload } from "./types.ts";
import { activeSpots, type PatternRow, type TrapRow, type TrapSpot, ARM_AT } from "./traps.ts";
export type { StudyPayload };
import { buildKnownNames } from "./grade.ts";

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
  const [{ data: enr }, { data: courses }] = await Promise.all([
    sb.from("enrollments").select("course_id, joined_at").eq("user_id", userId).order("joined_at", { ascending: true }),
    sb.from("courses").select("id, code, title, settings").order("code"),
  ]);
  let ids = (enr ?? []).map((e: { course_id: string }) => e.course_id);
  const mine = (courses ?? []) as Array<{ id: string; code: string; title: string; settings: Record<string, unknown> }>;
  let pool = mine.filter((c) => ids.includes(c.id));
  if (!pool.length) pool = mine; // an admin without an enrolment sees every course RLS lets through
  ids = pool.map((c) => c.id);
  const pick = (wanted && pool.find((c) => c.id === wanted || c.code === wanted)) || pool[0];
  if (!pick) return null;
  return { id: pick.id, code: pick.code, title: pick.title, slug: courseSlug(pick.code, pick.settings ?? {}), settings: pick.settings ?? {} };
}

/** All rows of a paged query (PostgREST caps a response at 1,000 rows). The first page is fetched alone; when it is
 *  full, the following pages are fetched in parallel waves, so ~3,000 rows cost two round trips instead of three. */
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const page = 1000;
  const wave = 4;
  const first = await make(0, page - 1);
  if (first.error) throw new Error(first.error.message);
  const out: T[] = [...(first.data ?? [])];
  if (!first.data || first.data.length < page) return out;
  for (let from = page; ; from += page * wave) {
    const res = await Promise.all(Array.from({ length: wave }, (_, i) => make(from + i * page, from + (i + 1) * page - 1)));
    let short = false;
    for (const { data, error } of res) {
      if (error) throw new Error(error.message);
      if (short) continue;
      out.push(...(data ?? []));
      if (!data || data.length < page) short = true;
    }
    if (short) return out;
  }
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

// Course content (units, topics, the light card list) is the same for every member, changes rarely, and is the
// biggest read on the study pages, so each server instance keeps it for a couple of minutes. It is only ever
// read through resolveCourse(), which goes through the caller's RLS, so a cached course is one they may see.
type CourseContent = { units: UnitRow[]; topics: TopicRow[]; cards: LightCard[] };
const CONTENT_TTL = 120_000;
const contentCache = new Map<string, { at: number; p: Promise<CourseContent> }>();

async function fetchCourseContent(sb: SupabaseClient, courseId: string): Promise<CourseContent> {
  const [unitsR, topicsR, cards] = await Promise.all([
    sb.from("units").select("id, slug, position, title").eq("course_id", courseId).order("position"),
    sb.from("topics").select("id, slug, unit_id, position, kind, title, meta").eq("course_id", courseId).order("position"),
    fetchAll<LightCard>((a, b) =>
      sb.from("cards").select("id, slug, kind, topic_id, structure_id, position").eq("course_id", courseId).eq("status", "live").order("position").order("id").range(a, b),
    ),
  ]);
  if (unitsR.error) throw new Error(unitsR.error.message);
  if (topicsR.error) throw new Error(topicsR.error.message);
  return { units: (unitsR.data ?? []) as UnitRow[], topics: (topicsR.data ?? []) as TopicRow[], cards };
}

export function loadCourseContent(sb: SupabaseClient, courseId: string): Promise<CourseContent> {
  const now = Date.now();
  const hit = contentCache.get(courseId);
  if (hit && now - hit.at < CONTENT_TTL) return hit.p;
  const p = fetchCourseContent(sb, courseId);
  contentCache.set(courseId, { at: now, p });
  // never keep a failure or an empty read (e.g. a caller RLS hid the rows from)
  p.then((c) => { if (!c.cards.length) contentCache.delete(courseId); }, () => contentCache.delete(courseId));
  return p;
}

/** Light index of a course: units, topics, card ids (no content), and the user's states. */
export async function loadIndex(sb: SupabaseClient, userId: string, courseId: string): Promise<CourseIndex> {
  const [{ units, topics, cards }, states, ladders] = await Promise.all([
    loadCourseContent(sb, courseId),
    fetchAll<CardStateRow>((a, b) => sb.from("card_states").select("*").eq("user_id", userId).order("card_id").range(a, b)),
    fetchAll<LadderRow>((a, b) => sb.from("card_ladder").select("card_id, step, clean_streak, last_clean_at").eq("user_id", userId).order("card_id").range(a, b)),
  ]);
  const cardIds = new Set(cards.map((c) => c.id));
  return {
    units,
    topics,
    cards,
    states: new Map(states.filter((s) => cardIds.has(s.card_id)).map((s) => [s.card_id, s])),
    ladders: new Map(ladders.filter((l) => cardIds.has(l.card_id)).map((l) => [l.card_id, l])),
  };
}

function lightToStudy(c: LightCard): StudyCard {
  return { id: c.id, slug: c.slug, kind: c.kind as StudyCard["kind"], topicId: c.topic_id, structureId: c.structure_id, position: c.position, prompt: "", answer: "", accept: [], requireSide: false, format: "type", followups: [], followupCards: [], tags: [] };
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

import { parseScope, isContentScope, type Scope } from "./scope.ts";
import { knownStructures, structureMastery, plateScopeMatch, MASTERED_AT } from "./mastery.ts";
export { parseScope };
export type { Scope };

export function scopeTopicIds(idx: CourseIndex, scope: Scope): Set<string> | null {
  if (isContentScope(scope) || (scope.type !== "unit" && scope.type !== "topic")) return null;
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
  o: { scope: Scope; scopeKey: string; tzOffsetMin: number; exclude: Set<string>; bootstrap: boolean; now?: Date; /** "Study more": extra new cards on top of today's limit */ extraNew?: number },
): Promise<StudyPayload> {
  const now = o.now ?? new Date();
  const dayStart = startOfLocalDay(now, o.tzOffsetMin).toISOString();
  // Everything that does not depend on the queue starts at once (one round trip of latency, not six).
  const trapsP = Promise.all([
    fetchAll<TrapRow>((a, b) => sb.from("card_traps").select("*").eq("user_id", userId).eq("retired", false).gte("misses", ARM_AT).order("card_id").order("pattern").range(a, b)),
    fetchAll<PatternRow>((a, b) => sb.from("user_trap_patterns").select("pattern, kind, misses, hits, streak, last_miss, last_hit, retired").eq("user_id", userId).order("pattern").range(a, b)),
  ]);
  const namesP = o.bootstrap ? loadKnownNames(sb, course.id) : Promise.resolve(null);
  // awaited further down; mark handled now so an early failure is not an unhandled rejection
  trapsP.catch(() => {});
  namesP.catch(() => {});
  const [{ learner }, idx, newDone, revDone] = await Promise.all([
    loadSettings(sb, userId),
    loadIndex(sb, userId, course.id),
    sb.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("state_before", 0).gte("reviewed_at", dayStart),
    sb.from("review_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).neq("state_before", 0).gte("reviewed_at", dayStart),
  ]);
  const ordered = courseOrder(idx);
  const light = ordered.map(lightToStudy);
  const { solid, hasName } = solidStructures(light, idx.states, idx.ladders);

  // daily counts
  const newDoneToday = newDone.count ?? 0;
  const reviewsDoneToday = revDone.count ?? 0;
  // cards the client still holds (queued, or answered but not stored yet) count against today's limits too
  const held = { excluded: o.exclude, courseCards: new Set(idx.cards.map((c) => c.id)), states: idx.states, now };
  const newLeft = dailyLeft({ ...held, kind: "new", perDay: learner.study.newPerDay, extra: o.extraNew, doneToday: newDoneToday });
  const reviewsLeft = dailyLeft({ ...held, kind: "review", perDay: learner.study.reviewsPerDay, doneToday: reviewsDoneToday });

  // scope
  const topicSet = scopeTopicIds(idx, o.scope);
  let scoped = light.filter((c) => !o.exclude.has(c.id) && (!topicSet || (c.topicId && topicSet.has(c.topicId))));
  if (o.scope.type === "structure") {
    // one structure (from the atlas): its name cards, plus its theory cards once the name is solid
    const { data: st } = await sb.from("structures").select("id").eq("course_id", course.id).eq("slug", o.scope.slug).maybeSingle();
    scoped = scoped.filter((c) => !!st && c.structureId === st.id);
  } else if (o.scope.type === "structures") {
    // several structures (e.g. "Study my red zones"): same rule as one structure
    const { data: sts } = await sb.from("structures").select("id").eq("course_id", course.id).in("slug", o.scope.slugs);
    const want = new Set((sts ?? []).map((r: { id: string }) => r.id));
    scoped = scoped.filter((c) => !!c.structureId && want.has(c.structureId));
  } else if (o.scope.type === "tag") {
    // every live card carrying the tag (tags live in the card's content JSON)
    const tagged = await fetchAll<{ id: string }>((a, b) =>
      sb.from("cards").select("id").eq("course_id", course.id).eq("status", "live").contains("content", { tags: [o.scope.type === "tag" ? o.scope.tag : ""] }).order("id").range(a, b),
    );
    const want = new Set(tagged.map((r) => r.id));
    scoped = scoped.filter((c) => want.has(c.id));
  }
  const bs = o.scope.type === "bslevel" || o.scope.type === "bsregion" || o.scope.type === "bsall" ? o.scope : null;
  if (bs) {
    // brainstem plate cards of one level, one region or the whole brainstem (practice: only the mastered ones)
    const ps = bs.type === "bslevel" ? ({ type: "bslevel", level: bs.level } as const) : bs.type === "bsregion" ? ({ type: "bsregion", region: bs.region } as const) : ({ type: "bsall" } as const);
    scoped = scoped.filter((c) => plateScopeMatch(c.slug, ps));
    if (bs.practice) {
      const mastery = structureMastery(light, idx.states, idx.ladders);
      scoped = scoped.filter((c) => !!c.structureId && (mastery.get(c.structureId) ?? 0) >= MASTERED_AT);
    }
  }
  if (o.scope.type === "weak") {
    // cards that have lapsed or are hard: the "weak spots" scope
    scoped = scoped.filter((c) => {
      const st = idx.states.get(c.id);
      return !!st && (st.lapses > 0 || st.difficulty >= 7) && phaseOf(st, now, 86_400_000 * 365) !== "new";
    });
  }
  const focused = o.scope.type === "tag" || o.scope.type === "structures" || !!bs;
  const entries = buildQueue(scoped, idx.states, idx.ladders, {
    now,
    newLimit: o.scope.type === "weak" ? 0 : focused ? Math.max(newLeft, 15) : newLeft,
    reviewLimit: o.scope.type === "weak" ? 60 : focused ? Math.max(reviewsLeft, 40) : reviewsLeft,
    solid,
    hasName,
  });
  // weak scope studies cards even when not due: pull them in as reviews
  let picked = entries;
  if (o.scope.type === "weak" && !entries.length) {
    picked = scoped.slice(0, 40).map((card) => ({ card, state: idx.states.get(card.id) ?? null, ladder: idx.ladders.get(card.id) ?? null, source: "review" as const }));
  }
  if (bs?.practice) {
    // practice studies what is already mastered, due or not: pull the cards in as reviews
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
  type StructRow = { id: string; slug: string; canonical_name: string; synonyms: string[]; region: string | null; info: StructureLite["info"] };
  const STRUCT_COLS = "id, slug, canonical_name, synonyms, region, info";
  const firstIds = [...new Set([...ids, ...theoryIds])];
  type NoteRow = { card_id: string; body: string };
  // the student's own notes load with the cards (one round trip less); only explicit follow-ups need a second look
  const [firstRows, structFirst, notesFirst] = await Promise.all([
    fetchRowsByIds<CardRow>(sb, "cards", "id, slug, kind, topic_id, structure_id, position, content, media", firstIds),
    fetchRowsByIds<StructRow>(sb, "structures", STRUCT_COLS, [...structIds]),
    fetchRowsByIds<NoteRow>(sb, "mnemonics", "card_id, body", firstIds, "card_id", { user_id: userId }),
  ]);
  // explicit follow-up cards named by the batch's pins (practical exam stems), resolved by slug
  const slugToId = new Map(idx.cards.map((c) => [c.slug, c.id]));
  const explicitIds = new Set<string>();
  for (const r of firstRows) {
    if (r.kind !== "pin" || !r.structure_id) continue;
    const fc = (r.content as { followup_cards?: unknown } | null)?.followup_cards;
    if (Array.isArray(fc)) for (const slug of fc) { const id = typeof slug === "string" ? slugToId.get(slug) : undefined; if (id) explicitIds.add(id); }
  }
  const have = new Set(firstRows.map((r) => r.id));
  const extraIds = [...explicitIds].filter((i) => !have.has(i));
  const extraRows = extraIds.length ? await fetchRowsByIds<CardRow>(sb, "cards", "id, slug, kind, topic_id, structure_id, position, content, media", extraIds) : [];
  const rows = [...firstRows, ...extraRows];
  const allIds = rows.map((r) => r.id);
  const cards = rows.map(toStudyCard);

  const haveStruct = new Set(structFirst.map((r) => r.id));
  const moreStructIds = [...new Set(cards.map((c) => c.structureId).filter((x): x is string => !!x && !haveStruct.has(x)))];
  const [structMore, notesMore, [trapRowsAll, patRows], names] = await Promise.all([
    moreStructIds.length ? fetchRowsByIds<StructRow>(sb, "structures", STRUCT_COLS, moreStructIds) : Promise.resolve([] as StructRow[]),
    extraRows.length ? fetchRowsByIds<NoteRow>(sb, "mnemonics", "card_id, body", extraRows.map((r) => r.id), "card_id", { user_id: userId }) : Promise.resolve([] as NoteRow[]),
    trapsP,
    namesP,
  ]);
  const noteRows = [...notesFirst, ...notesMore];
  const structures: Record<string, StructureLite> = {};
  for (const s of [...structFirst, ...structMore]) structures[s.id] = { id: s.id, slug: s.slug, name: s.canonical_name, synonyms: s.synonyms ?? [], region: s.region, info: s.info ?? {} };

  // traps
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
    known: bs ? [...knownStructures(light, idx.states, idx.ladders)].filter((id) => structIds.has(id)) : undefined,
  };
}

/** `select ... where <col> in (ids)` in chunks (URL length), fetched in parallel, optionally with extra equality filters. */
export async function fetchRowsByIds<T>(sb: SupabaseClient, table: string, columns: string, ids: string[], col = "id", eq: Record<string, string> = {}): Promise<T[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
  const res = await Promise.all(
    chunks.map((chunk) => {
      let q = sb.from(table).select(columns).in(col, chunk);
      for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
      return q;
    }),
  );
  const out: T[] = [];
  for (const { data, error } of res) {
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as T[]));
  }
  return out;
}

// Known structure names of a course (for "that is another structure" feedback): static content, cached like loadCourseContent.
const namesCache = new Map<string, { at: number; p: Promise<Record<string, string>> }>();
export function loadKnownNames(sb: SupabaseClient, courseId: string): Promise<Record<string, string>> {
  const now = Date.now();
  const hit = namesCache.get(courseId);
  if (hit && now - hit.at < CONTENT_TTL) return hit.p;
  const p = fetchAll<{ slug: string; canonical_name: string; synonyms: string[] }>((a, b) =>
    sb.from("structures").select("slug, canonical_name, synonyms").eq("course_id", courseId).order("slug").range(a, b),
  ).then((all) => {
    if (!all.length) namesCache.delete(courseId);
    return buildKnownNames(all);
  });
  namesCache.set(courseId, { at: now, p });
  p.catch(() => namesCache.delete(courseId));
  return p;
}
