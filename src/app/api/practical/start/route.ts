import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { fetchAll, resolveCourse } from "@/lib/study/server";
import { toStudyCard, type CardRow, type StudyCard } from "@/lib/study/types";
import { DEFAULT_STATION_SECONDS, drawStations, publicCard, readSpelling } from "@/lib/study/practical";

export const dynamic = "force-dynamic";

const body = z.object({
  /** unit slugs; empty = the whole course */
  units: z.array(z.string()).max(40).default([]),
  count: z.number().int().min(1).max(100).default(20),
  courseId: z.string().optional(),
});

/** POST /api/practical/start: draw stations, create the attempt, return the questions (no answers). */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const course = await resolveCourse(sb, userId, p.data.courseId ?? null);
  if (!course) return bad("No course", 404);

  const [unitsR, topicsR] = await Promise.all([
    sb.from("units").select("id, slug").eq("course_id", course.id),
    sb.from("topics").select("id, unit_id").eq("course_id", course.id),
  ]);
  const unitIds = new Set((unitsR.data ?? []).filter((u: { slug: string }) => !p.data.units.length || p.data.units.includes(u.slug)).map((u: { id: string }) => u.id));
  const topicIds = new Set((topicsR.data ?? []).filter((t: { unit_id: string | null }) => t.unit_id && unitIds.has(t.unit_id)).map((t: { id: string }) => t.id));

  const rows = await fetchAll<CardRow>((from, to) =>
    sb.from("cards").select("id, slug, kind, topic_id, structure_id, position, content").eq("course_id", course.id).eq("status", "live").range(from, to),
  );
  const cards = rows.map(toStudyCard);
  const pins = cards.filter((c) => c.kind === "pin" && c.answer && c.image && (!p.data.units.length || (c.topicId && topicIds.has(c.topicId))));
  if (!pins.length) return bad("There are no pin cards in that selection yet.", 404);
  const theory = new Map<string, StudyCard[]>();
  for (const c of cards) {
    if (c.kind !== "theory" || !c.structureId || !c.answer) continue;
    const arr = theory.get(c.structureId) ?? [];
    arr.push(c);
    theory.set(c.structureId, arr);
  }
  const draws = drawStations(pins, theory, p.data.count, Math.random, new Map(cards.map((c) => [c.slug, c])));
  const seconds = Number(course.settings.station_seconds) > 0 ? Math.round(Number(course.settings.station_seconds)) : DEFAULT_STATION_SECONDS;
  const spelling = readSpelling(course.settings.exam_spelling);
  const stations = draws.map((d) => ({ cardId: d.pin.id, followups: d.followups.map((f) => f.id) }));
  const { data: attempt, error } = await sb
    .from("practical_attempts")
    .insert({ user_id: userId, course_id: course.id, unit_slugs: p.data.units, station_seconds: seconds, spelling, stations })
    .select("id")
    .single();
  if (error || !attempt) return bad(error?.message ?? "Could not start", 500);
  return NextResponse.json({
    attemptId: attempt.id,
    seconds,
    course: { id: course.id, slug: course.slug },
    stations: draws.map((d) => ({ pin: publicCard(d.pin), followups: d.followups.map(publicCard) })),
  });
}
