import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authed, bad } from "@/lib/study/api";
import { loadMnemonics, saveMnemonic } from "@/lib/study/mnemonics-server";
import { resolveCourse } from "@/lib/study/server";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const put = z
  .object({
    id: uuid.optional(),
    cardId: uuid.optional(),
    structureSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/i).max(120).optional(),
    body: z.string().trim().min(1).max(1000),
    visibility: z.enum(["private", "class"]).optional(),
    anonymous: z.boolean().optional(),
  })
  .refine((v) => v.id || v.cardId || v.structureSlug);
const del = z.object({ id: uuid });

/** GET /api/mnemonics?card=<id> | ?structure=<slug>: my mnemonics and the class's shared ones for a card (and its structure) or a structure. */
export async function GET(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const p = req.nextUrl.searchParams;
  const card = p.get("card");
  const slug = p.get("structure");
  try {
    if (card) {
      if (!uuid.safeParse(card).success) return bad("Bad request");
      const { data: c } = await sb.from("cards").select("id, course_id, structure_id").eq("id", card).maybeSingle();
      if (!c) return bad("Card not found", 404);
      const { data: st } = c.structure_id ? await sb.from("structures").select("id, slug, canonical_name").eq("id", c.structure_id).maybeSingle() : { data: null };
      return NextResponse.json(await loadMnemonics(sb, userId, { courseId: c.course_id, cardId: c.id, structure: st ? { id: st.id, slug: st.slug, name: st.canonical_name } : null }));
    }
    if (slug) {
      const course = await resolveCourse(sb, userId, p.get("course"));
      if (!course) return bad("No course", 404);
      const { data: st } = await sb.from("structures").select("id, slug, canonical_name").eq("course_id", course.id).eq("slug", slug).maybeSingle();
      if (!st) return bad("Structure not found", 404);
      return NextResponse.json(await loadMnemonics(sb, userId, { courseId: course.id, structure: { id: st.id, slug: st.slug, name: st.canonical_name } }));
    }
    return bad("Bad request");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Failed", 500);
  }
}

/** PUT /api/mnemonics: create or update my mnemonic (by id, or for a card, or for a structure). */
export async function PUT(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const v = put.safeParse(await req.json().catch(() => null));
  if (!v.success) return bad("Bad request");
  const r = await saveMnemonic(a.ctx.sb, a.ctx.userId, v.data);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const v = del.safeParse(await req.json().catch(() => null));
  if (!v.success) return bad("Bad request");
  const { error } = await a.ctx.sb.from("mnemonics").delete().eq("id", v.data.id).eq("user_id", a.ctx.userId);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
