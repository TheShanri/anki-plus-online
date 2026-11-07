import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";

export const dynamic = "force-dynamic";
const body = z.object({ id: z.string().uuid(), reason: z.string().trim().max(300).optional() });

/** POST /api/mnemonics/report {id, reason?}: flag a shared mnemonic for moderation (scripts/mnemonics.mjs). */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const v = body.safeParse(await req.json().catch(() => null));
  if (!v.success) return bad("Bad request");
  const { error } = await a.ctx.sb.rpc("mnemonic_report", { p_id: v.data.id, p_reason: v.data.reason ?? null });
  if (error) return bad("Not allowed", 403);
  return NextResponse.json({ ok: true });
}
