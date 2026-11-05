import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Auth-gated course media: signed-in members of the course (or admins) get a redirect to a signed URL.
// Hot path (every card image), so: lookups run in parallel, and each server instance caches access
// decisions (5 min) and signed URLs (reused for 45 of their 60 min) in memory.

const ACCESS_TTL = 5 * 60_000;
const URL_TTL = 45 * 60_000;
const SIGN_SECONDS = 3600;
const MAX_ENTRIES = 5000;

const access = new Map<string, { ok: boolean; at: number }>(); // `${userId}|${course}`
const signed = new Map<string, { url: string; at: number }>(); // storage path
const courseIds = new Map<string, { id: string | null; at: number }>();

function trim<K, V>(m: Map<K, V>) {
  if (m.size > MAX_ENTRIES) for (const k of [...m.keys()].slice(0, m.size - MAX_ENTRIES / 2)) m.delete(k);
}

export async function GET(_req: Request, ctx: { params: Promise<{ course: string; key: string[] }> }) {
  const { course, key } = await ctx.params;
  const path = `${course}/${key.join("/")}`;
  if (key.some((k) => k === ".." || k === "") || !/^[\w.\-]+$/.test(course)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return new NextResponse("Not configured", { status: 503 });
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return new NextResponse("Sign in required", { status: 401 });
  const uid = u.user.id;
  const now = Date.now();

  const ak = `${uid}|${course}`;
  let ok = access.get(ak);
  if (!ok || now - ok.at > ACCESS_TTL) {
    let cid = courseIds.get(course);
    if (!cid || now - cid.at > ACCESS_TTL) {
      const { data: c } = await admin.from("courses").select("id").eq("slug", course).maybeSingle();
      cid = { id: c?.id ?? null, at: now };
      courseIds.set(course, cid);
    }
    if (!cid.id) return new NextResponse("Not found", { status: 404 });
    const [{ data: prof }, { data: enr }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", uid).maybeSingle(),
      admin.from("enrollments").select("role").eq("course_id", cid.id).eq("user_id", uid).maybeSingle(),
    ]);
    ok = { ok: prof?.role === "admin" || !!enr, at: now };
    access.set(ak, ok);
    trim(access);
  }
  if (!ok.ok) return new NextResponse("Forbidden", { status: 403 });

  let s = signed.get(path);
  if (!s || now - s.at > URL_TTL) {
    const { data, error } = await admin.storage.from("course-media").createSignedUrl(path, SIGN_SECONDS);
    if (error || !data?.signedUrl) return new NextResponse("Not found", { status: 404 });
    s = { url: data.signedUrl, at: now };
    signed.set(path, s);
    trim(signed);
  }
  const res = NextResponse.redirect(s.url, 302);
  // The browser may reuse this redirect while the signed URL is still valid.
  res.headers.set("Cache-Control", `private, max-age=${Math.max(60, Math.floor((URL_TTL - (now - s.at)) / 1000))}`);
  return res;
}
