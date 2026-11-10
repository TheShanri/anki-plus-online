import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { loadSettings, resolveCourse } from "@/lib/study/server";
import { newCardState, scheduleReview, stateNeedsReplay, type CardStateRow, type Grade } from "@/lib/fsrs";
import { ladderWrite } from "@/lib/study/ladder";
import { activeSpots, bankAttempts, type PatternRow, type TrapRow, ARM_AT } from "@/lib/study/traps";
import { toStudyCard, type CardRow } from "@/lib/study/types";

export const dynamic = "force-dynamic";

const attempt = z.object({ typed: z.string().max(300), mode: z.enum(["typing", "submit", "retype", "rep"]), partial: z.boolean().optional() });

const body = z.object({
  /** idempotency key: becomes review_logs.id */
  clientId: z.string().uuid(),
  cardId: z.string().uuid(),
  sessionId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(4),
  typed: z.string().max(400).nullish(),
  correct: z.boolean().nullable().optional(),
  hintCount: z.number().int().min(0).max(500).default(0),
  durationMs: z.number().int().min(0).max(3_600_000).default(0),
  clientTs: z.number().optional(),
  keystrokes: z.record(z.string(), z.unknown()).default({}),
  /** ladder: the step the card was shown at, and the step after this answer (computed by the client from src/lib/study/ladder.ts) */
  ladder: z.object({ stepBefore: z.number().int().min(0).max(6), stepAfter: z.number().int().min(0).max(6), effectiveStep: z.number().int().min(0).max(6) }).optional(),
  /** the answer was typed unaided (counts toward the clean-recall streak at the recall rung) */
  unaided: z.boolean().default(false),
  /** typing off / free text: the self-rated recall's effect on the clean streak */
  recall: z.enum(["clean", "miss", "keep"]).optional(),
  /** practice (below the recall rung) or a self-graded card never feed the trap model */
  traps: z.object({ attempts: z.array(attempt).max(40), passes: z.array(z.string()).max(10), firstTryMisses: z.array(z.string()).max(10) }).optional(),
  retention: z.number().min(0.7).max(0.97).optional(),
});

/** POST /api/study/answer: one review. The server recomputes the FSRS state (same pure code as the client). */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Bad request");
  const b = parsed.data;

  const nowMs = Date.now();
  // trust the client's clock only within a few minutes (answers can be queued offline briefly)
  const at = b.clientTs && Math.abs(b.clientTs - nowMs) < 6 * 3_600_000 && b.clientTs <= nowMs + 60_000 ? new Date(b.clientTs) : new Date(nowMs);

  // One round trip for everything the log needs. The session row must exist before the log references it
  // (engine_heartbeat is SECURITY INVOKER), so it runs here too.
  const course = b.courseId ? { id: b.courseId } : await resolveCourse(sb, userId, null);
  // trap-letter rows load alongside (they are only needed once the log is stored)
  const trapsP = b.traps
    ? Promise.all([
        sb.from("cards").select("id, slug, kind, topic_id, structure_id, position, content").eq("id", b.cardId).maybeSingle(),
        sb.from("card_traps").select("*").eq("user_id", userId).eq("card_id", b.cardId),
        sb.from("user_trap_patterns").select("pattern, kind, misses, hits, streak, last_miss, last_hit, retired").eq("user_id", userId),
      ])
    : null;
  const [{ learner }, stateR, ladderR] = await Promise.all([
    loadSettings(sb, userId),
    sb.from("card_states").select("*").eq("user_id", userId).eq("card_id", b.cardId).maybeSingle(),
    sb.from("card_ladder").select("step, clean_streak").eq("user_id", userId).eq("card_id", b.cardId).maybeSingle(),
    sb.rpc("engine_heartbeat", { p_id: b.sessionId, p_course: course?.id ?? null, p_kind: "study", p_ms: 0, p_cards: 0 }),
  ]);
  const prev: CardStateRow = (stateR.data as CardStateRow | null) ?? newCardState(userId, b.cardId, at);
  const retention = b.retention ?? learner.study.retention;
  const { next } = scheduleReview(prev, b.rating as Grade, at, { retention });

  // the review log first (its id is the idempotency key): a retry that finds it already stored changes nothing
  const { data: logged, error: logErr } = await sb
    .from("review_logs")
    .upsert(
      {
        id: b.clientId,
        user_id: userId,
        card_id: b.cardId,
        session_id: b.sessionId,
        rating: b.rating,
        typed_answer: b.typed ?? null,
        correct: b.correct ?? null,
        hint_count: b.hintCount,
        keystroke_stats: { ...b.keystrokes, ladder: b.ladder ?? null },
        duration_ms: b.durationMs,
        state_before: prev.state,
        reviewed_at: at.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (logErr) return bad(logErr.message, 500);
  if (!logged || logged.length === 0) {
    // A retry of an answer that is already logged. If the first attempt died after the log insert (timeout, failed
    // write), the card state never moved and every retry would be ignored: apply the logged review now. The stored
    // state is then still the one from before it (an older last_review); a later answer would have a newer one.
    const { data: log } = await sb.from("review_logs").select("rating, reviewed_at").eq("id", b.clientId).eq("user_id", userId).eq("card_id", b.cardId).maybeSingle();
    if (log && stateNeedsReplay(stateR.data?.last_review ?? null, log.reviewed_at)) {
      const loggedAt = new Date(log.reviewed_at);
      const base = (stateR.data as CardStateRow | null) ?? newCardState(userId, b.cardId, loggedAt);
      const { next: replayed } = scheduleReview(base, log.rating as Grade, loggedAt, { retention });
      const { error } = await sb.from("card_states").upsert(replayed, { onConflict: "user_id,card_id" });
      if (error) return bad(error.message, 500);
      return NextResponse.json({ ignored: true, replayed: true, state: replayed, ladder: ladderR.data ?? null });
    }
    return NextResponse.json({ ignored: true, state: prev, ladder: ladderR.data ?? null });
  }

  const writes: PromiseLike<unknown>[] = [
    sb.from("card_states").upsert(next, { onConflict: "user_id,card_id" }),
    sb.rpc("engine_heartbeat", { p_id: b.sessionId, p_course: course?.id ?? null, p_kind: "study", p_ms: 0, p_cards: 1 }),
  ];

  // the ladder row (same rule as the client's StudyEngine.accept, see ladderWrite); last_clean_at only moves on a clean recall
  const lw = ladderWrite(ladderR.data ?? null, b);
  const ladderRow: { step: number; clean_streak: number } | null = lw ? { step: lw.step, clean_streak: lw.clean_streak } : null;
  if (lw) {
    writes.push(
      sb.from("card_ladder").upsert(
        { user_id: userId, card_id: b.cardId, step: lw.step, clean_streak: lw.clean_streak, ...(lw.clean ? { last_clean_at: at.toISOString() } : {}), updated_at: at.toISOString() },
        { onConflict: "user_id,card_id" },
      ),
    );
  }

  // trap letters
  let spots: ReturnType<typeof activeSpots> = [];
  if (b.traps && learner.scaffold.traps && trapsP) {
    const [cardR, trapR, patR] = await trapsP;
    const card = cardR.data ? toStudyCard(cardR.data as CardRow) : null;
    if (card && card.answer) {
      const rows = (trapR.data ?? []) as TrapRow[];
      const pats = (patR.data ?? []) as PatternRow[];
      const res = bankAttempts(rows, pats, { cardId: b.cardId, answer: card.answer, attempts: b.traps.attempts, passes: b.traps.passes, firstTryMisses: b.traps.firstTryMisses, now: at });
      if (res.traps.length) writes.push(sb.from("card_traps").upsert(res.traps.map((t) => ({ ...t, user_id: userId })), { onConflict: "id" }));
      if (res.patterns.length) writes.push(sb.from("user_trap_patterns").upsert(res.patterns.map((p) => ({ ...p, user_id: userId })), { onConflict: "user_id,pattern" }));
      const merged = new Map(rows.map((r) => [r.id, r]));
      for (const t of res.traps) merged.set(t.id, t);
      spots = activeSpots(card.answer, [...merged.values()].filter((t) => t.misses >= ARM_AT), pats, {});
    }
  }
  const results = await Promise.all(writes);
  for (const r of results as Array<{ error?: { message: string } | null }>) {
    if (r && r.error) return bad(r.error.message, 500);
  }
  return NextResponse.json({ ignored: false, state: next, ladder: ladderRow, traps: spots });
}
