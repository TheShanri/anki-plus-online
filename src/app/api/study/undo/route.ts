import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";

export const dynamic = "force-dynamic";

const state = z
  .object({
    due: z.string(),
    stability: z.number(),
    difficulty: z.number(),
    elapsed_days: z.number(),
    scheduled_days: z.number(),
    learning_steps: z.number().int().default(0),
    reps: z.number().int(),
    lapses: z.number().int(),
    state: z.number().int().min(0).max(3),
    last_review: z.string().nullable(),
  })
  .passthrough();

const body = z.object({
  undo: z.literal(true),
  clientId: z.string().uuid(),
  cardId: z.string().uuid(),
  state: state.nullable(),
  ladder: z.object({ step: z.number().int().min(0).max(6), clean_streak: z.number().int().min(0) }).nullable(),
});

/**
 * POST /api/study/undo (Ctrl+Z): take back one answer. Its review log goes, and the card's state and scaffold step
 * return to what they were before it. Own rows only (RLS); a student can only ever rewind their own memory model.
 */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Bad request");
  const b = parsed.data;
  const at = new Date().toISOString();

  const { error: logErr } = await sb.from("review_logs").delete().eq("id", b.clientId).eq("user_id", userId).eq("card_id", b.cardId);
  if (logErr) return bad(logErr.message, 500);

  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (b.state) {
    const s = b.state;
    writes.push(
      sb.from("card_states").upsert(
        {
          user_id: userId,
          card_id: b.cardId,
          due: s.due,
          stability: s.stability,
          difficulty: s.difficulty,
          elapsed_days: s.elapsed_days,
          scheduled_days: s.scheduled_days,
          learning_steps: s.learning_steps,
          reps: s.reps,
          lapses: s.lapses,
          state: s.state,
          last_review: s.last_review,
        },
        { onConflict: "user_id,card_id" },
      ),
    );
  } else writes.push(sb.from("card_states").delete().eq("user_id", userId).eq("card_id", b.cardId));
  if (b.ladder) {
    writes.push(sb.from("card_ladder").upsert({ user_id: userId, card_id: b.cardId, step: b.ladder.step, clean_streak: b.ladder.clean_streak, updated_at: at }, { onConflict: "user_id,card_id" }));
  } else writes.push(sb.from("card_ladder").delete().eq("user_id", userId).eq("card_id", b.cardId));
  for (const r of await Promise.all(writes)) if (r.error) return bad(r.error.message, 500);
  return NextResponse.json({ ok: true });
}
