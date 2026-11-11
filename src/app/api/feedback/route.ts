import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { bodyObject, clampState, cleanLogs, ownKey } from "@/lib/bugs/clean";
import { FEEDBACK_TYPES, sendFeedbackEmails, type FeedbackType } from "@/lib/auth/mail";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

const MAX_SCREENSHOT_BYTES = 2_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const viewer = await getViewer();
  const key = viewer?.id ?? req.headers.get("x-forwarded-for") ?? "anon";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 20) return NextResponse.json({ error: "Too many messages; try again later." }, { status: 429 });
  hits.set(key, [...recent, now]);

  let body: Record<string, unknown>;
  try {
    body = bodyObject(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const type: FeedbackType = ownKey(FEEDBACK_TYPES, body.type, "other");
  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (!message && type !== "bug") return NextResponse.json({ error: "Please write a few words." }, { status: 400 });

  const id = randomUUID();
  let screenshotPath: string | null = null;
  const shot = typeof body.screenshot === "string" ? body.screenshot : "";
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(shot);
  if (m) {
    const buf = Buffer.from(m[2], "base64");
    if (buf.length <= MAX_SCREENSHOT_BYTES) {
      const path = `fb-${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      const { error } = await admin.storage.from("bug-reports").upload(path, buf, { contentType: `image/${m[1]}` });
      if (!error) screenshotPath = path;
    }
  }

  const cardId = typeof body.cardId === "string" && UUID.test(body.cardId) ? body.cardId : null;
  const cardSlug = typeof body.cardSlug === "string" ? body.cardSlug.slice(0, 200) : null;
  const route = String(body.route ?? "").slice(0, 300);
  const { data, error } = await admin
    .from("feedback")
    .insert({
      id,
      user_id: viewer?.id ?? null,
      type,
      message: message || null,
      route,
      card_id: cardId,
      card_slug: cardSlug,
      user_agent: String(body.userAgent ?? "").slice(0, 300),
      app_state: clampState(body.appState),
      logs_before: cleanLogs(body.logsBefore),
      screenshot_path: screenshotPath,
    })
    .select("id, append_token")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save your feedback." }, { status: 500 });

  // Emails are best effort: the feedback is already stored.
  let emailed = false;
  try {
    if (process.env.RESEND_API_KEY) {
      const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin");
      const adminEmails = (admins ?? []).map((a) => String(a.email)).filter(Boolean);
      const r = await sendFeedbackEmails(
        {
          id,
          type,
          message,
          route,
          cardSlug,
          senderName: viewer?.displayName ?? "",
          senderEmail: viewer?.email ?? "",
          hasScreenshot: Boolean(screenshotPath),
        },
        adminEmails,
      );
      emailed = r.sender;
      await admin.from("feedback").update({ admin_emailed: r.admin, sender_emailed: r.sender }).eq("id", id);
    }
  } catch {
    /* never fail the request over email */
  }
  return NextResponse.json({ id: data.id, token: data.append_token, emailed });
}
