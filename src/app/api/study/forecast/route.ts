import { NextResponse } from "next/server";
import { authed, bad } from "@/lib/study/api";

export const dynamic = "force-dynamic";

/** GET /api/study/forecast: when the learner's next card falls due, and how many fall due in the next 24 hours (the
 *  session summary's "come back" line). Read-only, the learner's own rows. */
export async function GET() {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const now = new Date();
  const day = new Date(now.getTime() + 24 * 3600_000);
  const [next, soon] = await Promise.all([
    sb.from("card_states").select("due").eq("user_id", userId).gt("reps", 0).gt("due", now.toISOString()).order("due", { ascending: true }).limit(1),
    sb.from("card_states").select("card_id", { count: "exact", head: true }).eq("user_id", userId).gt("reps", 0).gt("due", now.toISOString()).lte("due", day.toISOString()),
  ]);
  if (next.error || soon.error) return bad("Could not read the schedule", 500);
  return NextResponse.json({ next: next.data?.[0]?.due ?? null, within24h: soon.count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
