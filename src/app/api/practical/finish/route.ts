import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { fetchAll, fetchRowsByIds } from "@/lib/study/server";
import { toStudyCard, type CardRow } from "@/lib/study/types";
import { readSpelling, scoreStation, type StationDraw } from "@/lib/study/practical";
import { buildKnownNames } from "@/lib/study/grade";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const body = z.object({
  attemptId: z.string().uuid(),
  answers: z
    .array(z.object({ cardId: z.string().uuid(), typed: z.string().max(400).default(""), followups: z.array(z.string().max(600)).max(4).default([]), timedOut: z.boolean().optional() }))
    .max(100),
  activeMs: z.number().int().min(0).max(3 * 3_600_000).default(0),
});

/** POST /api/practical/finish: grade every station on the server (generous spelling per course setting) and store it. */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const { data: attempt } = await sb.from("practical_attempts").select("*").eq("id", p.data.attemptId).eq("user_id", userId).maybeSingle();
  if (!attempt) return bad("Attempt not found", 404);
  if (attempt.finished_at) return NextResponse.json({ id: attempt.id, score: attempt.score, max: attempt.max_score });

  const planned = attempt.stations as Array<{ cardId: string; followups: string[] }>;
  const ids = [...new Set(planned.flatMap((s) => [s.cardId, ...s.followups]))];
  const rows = await fetchRowsByIds<CardRow>(sb, "cards", "id, slug, kind, topic_id, structure_id, position, content", ids);
  const cards = new Map(rows.map((r) => [r.id, toStudyCard(r)]));
  const structIds = [...new Set([...cards.values()].map((c) => c.structureId).filter((x): x is string => !!x))];
  const structs = await fetchRowsByIds<{ id: string; slug: string }>(sb, "structures", "id, slug", structIds);
  const slugOf = new Map(structs.map((s) => [s.id, s.slug]));
  const all = await fetchAll<{ slug: string; canonical_name: string; synonyms: string[] }>((from, to) =>
    sb.from("structures").select("slug, canonical_name, synonyms").eq("course_id", attempt.course_id).order("slug").range(from, to),
  );
  const known = buildKnownNames(all);

  const spelling = readSpelling(attempt.spelling);
  const byCard = new Map(p.data.answers.map((x) => [x.cardId, x]));
  let score = 0;
  let max = 0;
  const stations = planned.map((st) => {
    const pin = cards.get(st.cardId);
    const given = byCard.get(st.cardId);
    if (!pin) return { ...st, typed: "", followupTyped: [], points: 0, max: 0, timedOut: true };
    const draw: StationDraw = { pin, followups: st.followups.map((id) => cards.get(id)).filter((c): c is NonNullable<typeof c> => !!c) };
    const s = scoreStation(draw, { typed: given?.typed ?? "", followups: given?.followups ?? [] }, spelling, known, pin.structureId ? slugOf.get(pin.structureId) : null);
    score += s.points;
    max += s.max;
    return {
      cardId: st.cardId,
      followups: st.followups,
      typed: given?.typed ?? "",
      followupTyped: given?.followups ?? [],
      timedOut: !!given?.timedOut,
      points: s.points,
      max: s.max,
      verdict: s.nameVerdict.result,
      verdictWhy: s.nameVerdict.why,
      followupVerdicts: s.followupVerdicts.map((v) => v.result),
      followupPoints: s.followupVerdicts.map((v) => v.points),
    };
  });
  // The graded fields are written with the service role (the attempt was read above through the student's RLS, so it
  // is theirs): supabase/proposed/0091 stops students writing their own score directly.
  const writer = createAdminClient() ?? sb;
  const { error } = await writer
    .from("practical_attempts")
    .update({ stations, score, max_score: max, finished_at: new Date().toISOString(), active_ms: p.data.activeMs })
    .eq("id", attempt.id)
    .eq("user_id", userId);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ id: attempt.id, score, max });
}
