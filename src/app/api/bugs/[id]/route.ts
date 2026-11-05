import { NextResponse } from "next/server";
import { cleanLogs } from "@/lib/bugs/clean";
import { createAdminClient } from "@/lib/supabase/admin";

/** Appends the "after" log buffer to a report. Needs the token returned when the report was created. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  let body: { token?: unknown; logsAfter?: unknown };
  try {
    // sendBeacon posts text/plain; both shapes parse as JSON text.
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/.test(id) || typeof body.token !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { data } = await admin.from("bug_reports").select("append_token, logs_after").eq("id", id).maybeSingle();
  if (!data || data.append_token !== body.token) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (Array.isArray(data.logs_after) && data.logs_after.length) return NextResponse.json({ ok: true, already: true });
  const { error } = await admin.from("bug_reports").update({ logs_after: cleanLogs(body.logsAfter) }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
