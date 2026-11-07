import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";

export const dynamic = "force-dynamic";
const body = z.object({ id: z.string().uuid(), on: z.boolean() });

/** POST /api/mnemonics/vote {id, on}: one vote per student per shared mnemonic (not your own). */
export async function POST(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const v = body.safeParse(await req.json().catch(() => null));
  if (!v.success) return bad("Bad request");
  const { data, error } = await a.ctx.sb.rpc("mnemonic_vote", { p_id: v.data.id, p_on: v.data.on });
  if (error) return bad("Not allowed", 403);
  return NextResponse.json({ ok: true, votes: data as number });
}
