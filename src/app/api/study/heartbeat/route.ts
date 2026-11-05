import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";

export const dynamic = "force-dynamic";

const beat = z.object({
  sessionId: z.string().uuid(),
  courseId: z.string().uuid().nullable().optional(),
  kind: z.enum(["study", "practical", "atlas", "browse"]),
  /** active milliseconds since the last batch */
  ms: z.number().int().min(0).max(120_000),
});

/** POST /api/study/heartbeat: one batch of active time from the ActivityTracker (also sent with sendBeacon). */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  // sendBeacon posts text/plain; parse whatever arrives
  const raw = await req.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const p = beat.safeParse(json);
  if (!p.success) return bad("Bad request");
  if (p.data.ms === 0) return NextResponse.json({ ok: true });
  const { error } = await a.ctx.sb.rpc("engine_heartbeat", { p_id: p.data.sessionId, p_course: p.data.courseId ?? null, p_kind: p.data.kind, p_ms: p.data.ms, p_cards: 0 });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
