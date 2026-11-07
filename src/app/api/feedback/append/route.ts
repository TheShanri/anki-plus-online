import { NextResponse } from "next/server";
import { cleanLogs } from "@/lib/bugs/clean";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Appends the "after" log buffer to a bug. Needs the token returned when the feedback was created. */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  let body: { id?: unknown; token?: unknown; logsAfter?: unknown };
  try {
    body = JSON.parse(await req.text()); // sendBeacon posts text/plain
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !UUID.test(body.id) || typeof body.token !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { data } = await admin.from("feedback").select("append_token, logs_after").eq("id", body.id).maybeSingle();
  if (!data || data.append_token !== body.token) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (Array.isArray(data.logs_after) && data.logs_after.length) return NextResponse.json({ ok: true, already: true });
  const { error } = await admin.from("feedback").update({ logs_after: cleanLogs(body.logsAfter) }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

