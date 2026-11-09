import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlate } from "@/lib/brainstem/plates";

export const dynamic = "force-dynamic";

const access = new Map<string, { ok: boolean; at: number }>();

/** GET /api/atlas/brainstem/plate/<level>: the level's vector plate. Course-derived, so enrolled members (or admins) only. */
export async function GET(_req: Request, ctx: { params: Promise<{ level: string }> }) {
  const { level } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(level)) return new NextResponse("Not found", { status: 404 });
  const user = await getAuthUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  let ok = access.get(user.id);
  if (!ok || Date.now() - ok.at > 5 * 60_000) {
    const admin = createAdminClient();
    if (!admin) return new NextResponse("Not configured", { status: 503 });
    const [{ data: prof }, { data: enr }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      admin.from("enrollments").select("role").eq("user_id", user.id).limit(1),
    ]);
    ok = { ok: prof?.role === "admin" || !!(enr && enr.length), at: Date.now() };
    access.set(user.id, ok);
  }
  if (!ok.ok) return new NextResponse("Forbidden", { status: 403 });
  const plate = getPlate(level);
  if (!plate) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(plate, { headers: { "Cache-Control": "private, max-age=3600" } });
}
