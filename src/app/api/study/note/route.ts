import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { saveMnemonic } from "@/lib/study/mnemonics-server";

export const dynamic = "force-dynamic";

const put = z.object({ cardId: z.string().uuid(), body: z.string().trim().min(1).max(1000) });
const del = z.object({ cardId: z.string().uuid() });

/** PUT /api/study/note: save (or replace) the student's own mnemonic for a card (private unless they chose to share it). */
export async function PUT(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const p = put.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const r = await saveMnemonic(a.ctx.sb, a.ctx.userId, { cardId: p.data.cardId, body: p.data.body });
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const p = del.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Bad request");
  const { error } = await a.ctx.sb.from("mnemonics").delete().eq("user_id", a.ctx.userId).eq("card_id", p.data.cardId);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
