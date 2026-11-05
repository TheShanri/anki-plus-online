import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { loadSettings } from "@/lib/study/server";
import { mergeLearnerSettings, readLearnerSettings } from "@/lib/study/settings";

export const dynamic = "force-dynamic";

const patch = z.object({
  scaffold: z.record(z.string(), z.boolean()).optional(),
  typing: z.object({ enabled: z.boolean().optional(), offSince: z.string().nullable().optional(), lastReminder: z.string().nullable().optional() }).optional(),
  study: z.record(z.string(), z.number()).optional(),
});

export async function GET() {
  const a = await authed();
  if (!a.ok) return a.res;
  const { learner } = await loadSettings(a.ctx.sb, a.ctx.userId);
  return NextResponse.json({ settings: learner });
}

/** PATCH /api/study/settings: merge changes into user_settings.settings (other keys are kept). */
export async function PATCH(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const p = patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const { raw } = await loadSettings(a.ctx.sb, a.ctx.userId);
  const patchIn = p.data as Parameters<typeof mergeLearnerSettings>[1];
  // turning typing off stamps the time so the weekly reminder has something to count from
  if (patchIn.typing && patchIn.typing.enabled === false && patchIn.typing.offSince === undefined) {
    const cur = readLearnerSettings(raw).typing;
    patchIn.typing = { ...patchIn.typing, offSince: cur.enabled ? new Date().toISOString() : cur.offSince };
  }
  if (patchIn.typing && patchIn.typing.enabled === true) patchIn.typing = { enabled: true, offSince: null, lastReminder: null };
  const merged = mergeLearnerSettings(raw, patchIn);
  const { error } = await a.ctx.sb.from("user_settings").upsert({ user_id: a.ctx.userId, settings: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ settings: readLearnerSettings(merged) });
}
