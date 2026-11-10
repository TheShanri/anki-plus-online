import { NextResponse } from "next/server";
import { authed, bad } from "@/lib/study/api";
import { resolveCourse } from "@/lib/study/server";
import type { InEvent } from "@/lib/achievements/engine";
import { buildPayload, fallbackCurriculum, loadCurriculum, processBatch } from "@/lib/achievements/server";

export const dynamic = "force-dynamic";

const TYPES = new Set([
  "structure_viewed", "curious_unlock", "view_changed", "multiview_opened", "cut_used", "quiz_answer", "quiz_finished", "pathway_completed",
  "lesion_case", "slice_match_round", "supply_answer", "supply_tour_step", "supply_occlusion", "supply_drainage_step", "supply_bleeds_opened", "brainstem_level_viewed", "brainstem_label", "memory_map_opened",
]);
const MAX_EVENTS = 150;
const WEEK = 7 * 86_400_000;

function clean(raw: unknown, now: number): (InEvent & { id?: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== "string" || !TYPES.has(r.type)) return null;
  const out: Record<string, unknown> = { type: r.type };
  for (const [k, v] of Object.entries(r)) {
    if (k === "type" || k === "at" || k === "id") continue;
    if (typeof v === "string") out[k] = v.slice(0, 80);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : now;
  out.at = at > now + 3_600_000 || at < now - WEEK ? now : at;
  if (typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64) out.id = r.id;
  return out as unknown as InEvent & { id?: string };
}

/** POST /api/atlas/progress  { events: [{ id, type, ..., at }], tz }: apply a batch, return what unlocked. Replaying a batch is harmless. */
export async function POST(req: Request) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  let body: { events?: unknown; tz?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }
  if (!Array.isArray(body.events)) return bad("events must be an array");
  const now = Date.now();
  const events = body.events.slice(0, MAX_EVENTS).map((e) => clean(e, now)).filter((e): e is InEvent & { id?: string } => !!e);
  const tz = typeof body.tz === "number" && Number.isFinite(body.tz) ? Math.max(-840, Math.min(840, Math.round(body.tz))) : 0;
  try {
    const course = await resolveCourse(sb, userId, null);
    const cur = course ? (await loadCurriculum(sb, course.id).catch(() => fallbackCurriculum())).cur : fallbackCurriculum().cur;
    const res = await processBatch(sb, userId, events, tz, cur);
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not record progress", 500);
  }
}

/** GET /api/atlas/progress[?lite=1&tz=300]: XP, rank, streak, achievements, recent unlocks, per-mode stats (and the collection unless lite). */
export async function GET(req: Request) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const url = new URL(req.url);
  const lite = url.searchParams.get("lite") === "1";
  const tzRaw = Number(url.searchParams.get("tz") ?? 0);
  try {
    const course = lite ? null : await resolveCourse(sb, userId, null);
    const payload = await buildPayload(sb, userId, course?.id ?? null, { full: !lite, tzMin: Number.isFinite(tzRaw) ? tzRaw : 0 });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not load progress", 500);
  }
}
