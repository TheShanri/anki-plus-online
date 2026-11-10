import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlate } from "@/lib/brainstem/plates";
import { resolveCourse } from "@/lib/study/server";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

const access = new Map<string, { ok: boolean; slug: string | null; at: number }>();

/** GET /api/atlas/brainstem/plate/<level>: the level's plate (vector illustration + the section photo's media URL).
 *  Course-derived, so enrolled members (or admins) only; the photo itself is served by the auth-gated media route. */
export async function GET(_req: Request, ctx: { params: Promise<{ level: string }> }) {
  const { level } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(level)) return new NextResponse("Not found", { status: 404 });
  const user = await getAuthUser();
  if (!user) return new NextResponse("Sign in required", { status: 401 });
  let ok = access.get(user.id);
  if (!ok || Date.now() - ok.at > 5 * 60_000) {
    const admin = createAdminClient();
    const sb = await createClient();
    if (!admin || !sb) return new NextResponse("Not configured", { status: 503 });
    const [{ data: prof }, { data: enr }, course] = await Promise.all([
      admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      admin.from("enrollments").select("role").eq("user_id", user.id).limit(1),
      resolveCourse(sb, user.id, null),
    ]);
    ok = { ok: prof?.role === "admin" || !!(enr && enr.length), slug: course?.slug ?? null, at: Date.now() };
    access.set(user.id, ok);
  }
  if (!ok.ok) return new NextResponse("Forbidden", { status: 403 });
  const plate = getPlate(level);
  if (!plate) return new NextResponse("Not found", { status: 404 });
  const body = plate.photo && ok.slug ? { ...plate, photo: { ...plate.photo, src: mediaUrl(ok.slug, plate.photo.key) } } : plate;
  return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=3600" } });
}
