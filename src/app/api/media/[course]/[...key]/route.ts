import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Auth-gated course media: signed-in members of the course (or admins) get a redirect to a ~1 h signed URL.
export async function GET(_req: Request, ctx: { params: Promise<{ course: string; key: string[] }> }) {
  const { course, key } = await ctx.params;
  const path = `${course}/${key.join("/")}`;
  if (key.some((k) => k === ".." || k === "") || !/^[\w.\-]+$/.test(course)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return new NextResponse("Not configured", { status: 503 });
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return new NextResponse("Sign in required", { status: 401 });

  const { data: c } = await admin.from("courses").select("id").eq("slug", course).maybeSingle();
  if (!c) return new NextResponse("Not found", { status: 404 });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
  if (prof?.role !== "admin") {
    const { data: enr } = await admin.from("enrollments").select("role").eq("course_id", c.id).eq("user_id", u.user.id).maybeSingle();
    if (!enr) return new NextResponse("Forbidden", { status: 403 });
  }

  const { data, error } = await admin.storage.from("course-media").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, max-age=1800");
  return res;
}
