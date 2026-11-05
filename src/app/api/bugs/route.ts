import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanLogs } from "@/lib/bugs/clean";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const MAX_SCREENSHOT_BYTES = 2_500_000;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const viewer = await getViewer();
  const key = viewer?.id ?? req.headers.get("x-forwarded-for") ?? "anon";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 20) return NextResponse.json({ error: "Too many reports; try again later." }, { status: 429 });
  hits.set(key, [...recent, now]);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const id = randomUUID();
  let screenshotPath: string | null = null;
  const shot = typeof body.screenshot === "string" ? body.screenshot : "";
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(shot);
  if (m) {
    const buf = Buffer.from(m[2], "base64");
    if (buf.length <= MAX_SCREENSHOT_BYTES) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const path = `${id}.${ext}`;
      const { error } = await admin.storage.from("bug-reports").upload(path, buf, { contentType: `image/${m[1]}` });
      if (!error) screenshotPath = path;
    }
  }

  const { data, error } = await admin
    .from("bug_reports")
    .insert({
      id,
      user_id: viewer?.id ?? null,
      route: String(body.route ?? "").slice(0, 300),
      description: String(body.description ?? "").slice(0, 500) || null,
      user_agent: String(body.userAgent ?? "").slice(0, 300),
      app_state: typeof body.appState === "object" && body.appState ? JSON.parse(JSON.stringify(body.appState).slice(0, 6000)) : {},
      logs_before: cleanLogs(body.logsBefore),
      screenshot_path: screenshotPath,
    })
    .select("id, append_token")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
  return NextResponse.json({ id: data.id, token: data.append_token, screenshot: Boolean(screenshotPath) });
}
