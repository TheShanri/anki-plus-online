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

/** PATCH /api/study/settings: merge changes into user_settings.settings (other keys are kept, also when another
 *  write lands at the same moment). */
export async function PATCH(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const p = patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const { sb, userId } = a.ctx;
  // The whole settings document is written back, so the write only lands if nobody changed it since it was read
  // (updated_at; the theme RPC bumps it too). Before, two quick toggles from the gear, or a toggle next to a theme
  // change, read the same document and the second write dropped the first change.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readErr } = await sb.from("user_settings").select("settings, updated_at").eq("user_id", userId).maybeSingle();
    if (readErr) return bad(readErr.message, 500);
    const raw = (row?.settings ?? {}) as Record<string, unknown>;
    const patchIn = structuredClone(p.data) as Parameters<typeof mergeLearnerSettings>[1];
    // turning typing off stamps the time so the weekly reminder has something to count from
    if (patchIn.typing && patchIn.typing.enabled === false && patchIn.typing.offSince === undefined) {
      const cur = readLearnerSettings(raw).typing;
      patchIn.typing = { ...patchIn.typing, offSince: cur.enabled ? new Date().toISOString() : cur.offSince };
    }
    if (patchIn.typing && patchIn.typing.enabled === true) patchIn.typing = { enabled: true, offSince: null, lastReminder: null };
    const merged = mergeLearnerSettings(raw, patchIn);
    const now = new Date().toISOString();
    const write = row
      ? sb.from("user_settings").update({ settings: merged, updated_at: now }).eq("user_id", userId).eq("updated_at", row.updated_at as string).select("user_id")
      : sb.from("user_settings").upsert({ user_id: userId, settings: merged, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }).select("user_id");
    const { data: done, error } = await write;
    if (error) return bad(error.message, 500);
    if (done && done.length) return NextResponse.json({ settings: readLearnerSettings(merged) });
  }
  return bad("Settings changed at the same time; try again.", 409);
}
