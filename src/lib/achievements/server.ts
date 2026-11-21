import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import linksJson from "@/data/atlas-links.json";
import { computeStrength } from "@/app/api/atlas/strength/compute";
import { fetchAll, loadIndex } from "@/lib/study/server";
import { ACHIEVEMENTS, tiersOf } from "./catalog";
import {
  applyEvents, evaluate, localDate, makeSnapshot, newState, rankOf, summarize, totalXp, type EngineState, type InEvent,
} from "./engine";
import { PATHWAYS, TERRITORY_ARTERIES, BRAINSTEM_SECTION_LEVELS, TOTAL_CASES } from "./groups";
import type { AchievementProgress, CollectionState, CollectionUnit, ModeStat, PostResult, ProgressPayload } from "./payload";
import type { Curriculum, Tier } from "./types";

const LINKED = new Set(Object.keys(linksJson as Record<string, unknown>));

// ------------------------------------------------------------------------------------------------ curriculum
interface CurriculumFull {
  cur: Curriculum;
  names: Map<string, string>;
}
const CUR_TTL = 300_000;
const curCache = new Map<string, { at: number; p: Promise<CurriculumFull> }>();

async function fetchCurriculum(sb: SupabaseClient, courseId: string): Promise<CurriculumFull> {
  const [units, structs] = await Promise.all([
    sb.from("units").select("id, slug, title, position").eq("course_id", courseId).order("position"),
    fetchAll<{ slug: string; canonical_name: string; unit_id: string | null }>((a, b) =>
      sb.from("structures").select("slug, canonical_name, unit_id").eq("course_id", courseId).order("slug").range(a, b),
    ),
  ]);
  const u = (units.data ?? []) as { id: string; slug: string; title: string }[];
  const names = new Map<string, string>();
  const byUnit = new Map<string, string[]>();
  const slugs: string[] = [];
  for (const s of structs) {
    if (!LINKED.has(s.slug)) continue; // only structures the atlas can show
    names.set(s.slug, s.canonical_name);
    slugs.push(s.slug);
    if (s.unit_id) byUnit.set(s.unit_id, [...(byUnit.get(s.unit_id) ?? []), s.slug]);
  }
  return { cur: { slugs, units: u.map((x) => ({ slug: x.slug, title: x.title, slugs: byUnit.get(x.id) ?? [] })) }, names };
}

export function loadCurriculum(sb: SupabaseClient, courseId: string): Promise<CurriculumFull> {
  const now = Date.now();
  const hit = curCache.get(courseId);
  if (hit && now - hit.at < CUR_TTL) return hit.p;
  const p = fetchCurriculum(sb, courseId);
  curCache.set(courseId, { at: now, p });
  p.catch(() => curCache.delete(courseId));
  return p;
}

/** Used when the DB lookup fails or the student has no course: every atlas-linked structure, no units. */
export function fallbackCurriculum(): CurriculumFull {
  return { cur: { slugs: [...LINKED], units: [] }, names: new Map() };
}

// ------------------------------------------------------------------------------------------------ rows <-> state
export async function loadState(sb: SupabaseClient, userId: string): Promise<EngineState> {
  const st = newState();
  const [stats, seen, ach] = await Promise.all([
    fetchAll<{ key: string; count: number; best: number; first_at: string; last_at: string }>((a, b) =>
      sb.from("atlas_stats").select("key, count, best, first_at, last_at").eq("user_id", userId).order("key").range(a, b),
    ),
    fetchAll<{ slug: string; via: string; first_at: string; count: number }>((a, b) =>
      sb.from("atlas_seen").select("slug, via, first_at, count").eq("user_id", userId).order("slug").order("via").range(a, b),
    ),
    fetchAll<{ achievement_id: string; tier: string; unlocked_at: string }>((a, b) =>
      sb.from("user_achievements").select("achievement_id, tier, unlocked_at").eq("user_id", userId).order("achievement_id").order("tier").range(a, b),
    ),
  ]);
  for (const r of stats) st.stats.set(r.key, { count: r.count, best: r.best, firstAt: Date.parse(r.first_at), lastAt: Date.parse(r.last_at) });
  for (const r of seen) {
    let m = st.seen.get(r.slug);
    if (!m) st.seen.set(r.slug, (m = new Map()));
    m.set(r.via, { firstAt: Date.parse(r.first_at), count: r.count });
  }
  for (const r of ach) st.unlocked.set(`${r.achievement_id}|${r.tier}`, Date.parse(r.unlocked_at));
  return st;
}

const iso = (ms: number) => new Date(ms).toISOString();

async function saveState(sb: SupabaseClient, userId: string, st: EngineState, newUnlocks: { id: string; tier: Tier; at: number; value: number }[]): Promise<void> {
  const statRows = [...st.dirtyStats].map((key) => {
    const s = st.stats.get(key)!;
    return { user_id: userId, key, count: s.count, best: s.best, first_at: iso(s.firstAt), last_at: iso(s.lastAt) };
  });
  const seenRows = [...st.dirtySeen].map((k) => {
    const [slug, via] = k.split("|");
    const r = st.seen.get(slug)!.get(via)!;
    return { user_id: userId, slug, via, first_at: iso(r.firstAt), count: r.count };
  });
  const achRows = newUnlocks.map((u) => ({ user_id: userId, achievement_id: u.id, tier: u.tier, unlocked_at: iso(u.at), progress: { value: u.value } }));
  const results = await Promise.all([
    statRows.length ? sb.from("atlas_stats").upsert(statRows, { onConflict: "user_id,key" }) : null,
    seenRows.length ? sb.from("atlas_seen").upsert(seenRows, { onConflict: "user_id,slug,via" }) : null,
    achRows.length ? sb.from("user_achievements").upsert(achRows, { onConflict: "user_id,achievement_id,tier", ignoreDuplicates: true }) : null,
  ]);
  for (const r of results) if (r?.error) throw new Error(r.error.message);
  st.dirtyStats.clear();
  st.dirtySeen.clear();
}

// ------------------------------------------------------------------------------------------------ POST: apply a batch
export async function processBatch(
  sb: SupabaseClient,
  userId: string,
  events: (InEvent & { id?: string })[],
  tzMin: number,
  cur: Curriculum,
): Promise<PostResult> {
  const now = Date.now();
  const ids = events.filter((e) => e.id).map((e) => ({ user_id: userId, eid: e.id as string, at: iso(now) }));
  let fresh = events;
  if (ids.length) {
    // ignoreDuplicates + select returns only the rows that were actually inserted: the ones not seen before
    const { data, error } = await sb.from("atlas_event_log").upsert(ids, { onConflict: "user_id,eid", ignoreDuplicates: true }).select("eid");
    if (error) throw new Error(error.message);
    const isNew = new Set((data ?? []).map((r: { eid: string }) => r.eid));
    fresh = events.filter((e) => !e.id || isNew.has(e.id));
  }
  const st = await loadState(sb, userId);
  const before = totalXp(st);
  const rankBefore = rankOf(before).index;
  let unlocked: ReturnType<typeof evaluate> = [];
  if (fresh.length) {
    try {
      applyEvents(st, fresh, tzMin);
      unlocked = evaluate(st, cur, now);
      await saveState(sb, userId, st, unlocked);
    } catch (e) {
      // give the events back so a retry can process them
      const mine = fresh.filter((x) => x.id).map((x) => x.id as string);
      if (mine.length) await sb.from("atlas_event_log").delete().eq("user_id", userId).in("eid", mine);
      throw e;
    }
  }
  if (Math.random() < 0.03) {
    await sb.from("atlas_event_log").delete().eq("user_id", userId).lt("at", iso(now - 7 * 86_400_000));
  }
  const summary = summarize(st, now, tzMin);
  return {
    unlocked: unlocked.map((u) => ({ id: u.id, tier: u.tier, at: u.at })),
    xpGained: summary.xp - before,
    summary,
    rankedUp: summary.rank.index > rankBefore,
  };
}

// ------------------------------------------------------------------------------------------------ GET: the whole picture
function modeStats(st: EngineState, cur: Curriculum): ModeStat[] {
  const n = (k: string) => st.stats.get(k)?.count ?? 0;
  const d = (p: string) => [...st.stats.entries()].filter(([k, v]) => k.startsWith(p) && v.count > 0).length;
  const seenCur = cur.slugs.filter((s) => st.seen.has(s)).length;
  const quizNamed = cur.slugs.filter((s) => st.seen.get(s)?.has("quiz")).length;
  const acc = n("quiz:answers") ? Math.round((100 * n("quiz:correct")) / n("quiz:answers")) : 0;
  return [
    { id: "explore", label: "Explore", href: "/atlas", done: seenCur, of: cur.slugs.length, facts: [`${n("view:3d")} 3D views`, `${n("view:mri")} MRI views`, `${n("cuts")} cuts`, `${d("curious:")} off-syllabus regions`] },
    { id: "quiz", label: "Name that structure", href: "/atlas/quiz", done: quizNamed, of: cur.slugs.length, facts: [`${n("quiz:answers")} answers, ${acc}% right`, `best streak ${st.stats.get("quiz:streak")?.best ?? 0}`, `${n("quiz:perfect")} perfect rounds`] },
    { id: "pathways", label: "Pathway tracer", href: "/atlas/pathways", done: d("pathway:"), of: PATHWAYS.length, facts: [`${d("pathwayquiz:")} perfect pathway quizzes`] },
    { id: "lesion", label: "Lesion lab", href: "/atlas/lesion", done: d("lesion:"), of: TOTAL_CASES, facts: [`${n("lesionattempts")} attempts`] },
    { id: "slice", label: "Slice match", href: "/atlas/slice-match", done: Math.min(n("slice:le5"), 25), of: 25, facts: [`${n("slice:rounds")} rounds`, `${n("slice:le5")} within 5 mm`, `${n("slice:le1")} within 1 mm`] },
    { id: "supply", label: "Blood supply", href: "/atlas/supply", done: d("supply:artery:"), of: TERRITORY_ARTERIES.length, facts: [`${n("supply:correct")} of ${n("supply:answers")} right`] },
    { id: "brainstem", label: "Brainstem sections", href: "/atlas/brainstem", done: BRAINSTEM_SECTION_LEVELS.filter((l) => n("bslevel:" + l) > 0).length, of: BRAINSTEM_SECTION_LEVELS.length, facts: [`${n("bslabel:ok")} labels right`, `${d("bsperfect:")} perfect levels`] },
    { id: "memory", label: "My memory map", href: "/atlas/memory", done: Math.min(n("memory"), 1), of: 1, facts: [`opened ${n("memory")} times`] },
  ];
}

export async function buildPayload(sb: SupabaseClient, userId: string, courseId: string | null, opts: { full: boolean; tzMin?: number }): Promise<ProgressPayload> {
  const now = Date.now();
  const tz = opts.tzMin ?? 0;
  if (!opts.full) {
    // the chip only needs XP, rank and streak: skip the curriculum and the catalogue
    const st = await loadState(sb, userId);
    return { summary: summarize(st, now, tz), achievements: [], recent: [], modes: [], pathways: [], collection: null };
  }
  const [st, curFull] = await Promise.all([
    loadState(sb, userId),
    courseId ? loadCurriculum(sb, courseId).catch(() => fallbackCurriculum()) : Promise.resolve(fallbackCurriculum()),
  ]);
  const { cur, names } = curFull;
  // a fresh evaluation first, so a catalogue that grew since the last batch still awards what is already earned
  const late = evaluate(st, cur, now);
  if (late.length) await saveState(sb, userId, st, late).catch(() => undefined);

  const summary = summarize(st, now, tz);
  const snap = makeSnapshot(st, cur, localDate(now, tz));
  const achievements: AchievementProgress[] = ACHIEVEMENTS.map((a) => {
    return { id: a.id, value: a.metric(snap), tiers: tiersOf(a, cur).map((t) => ({ tier: t.tier, at: t.at, unlockedAt: st.unlocked.get(`${a.id}|${t.tier}`) ?? null })) };
  });
  const recent = [...st.unlocked.entries()]
    .map(([k, at]) => ({ id: k.split("|")[0], tier: k.split("|")[1] as Tier, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  let collection: CollectionUnit[] | null = null;
  if (opts.full && courseId) {
    let mastered = new Set<string>();
    try {
      const [idx, structs] = await Promise.all([
        loadIndex(sb, userId, courseId),
        fetchAll<{ id: string; slug: string; canonical_name: string }>((a, b) => sb.from("structures").select("id, slug, canonical_name").eq("course_id", courseId).order("slug").range(a, b)),
      ]);
      mastered = new Set(computeStrength(idx, structs, new Date(now)).filter((s) => s.strength !== null && s.strength >= 0.7 && s.seen > 0).map((s) => s.slug));
    } catch {
      /* the collection still renders without the mastered tier */
    }
    const stateOf = (slug: string): CollectionState => (mastered.has(slug) ? 3 : st.seen.get(slug)?.has("quiz") ? 2 : st.seen.has(slug) ? 1 : 0);
    collection = cur.units
      .filter((u) => u.slugs.length)
      .map((u) => ({ slug: u.slug, title: u.title, items: u.slugs.map((s) => ({ slug: s, name: names.get(s) ?? s, state: stateOf(s) })) }));
  }
  return { summary, achievements, recent, modes: modeStats(st, cur), pathways: PATHWAYS.filter((p) => (st.stats.get("pathway:" + p)?.count ?? 0) > 0), collection };
}

