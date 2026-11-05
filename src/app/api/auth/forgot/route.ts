import { NextResponse } from "next/server";
import { emailSchema } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/env";

// Same answer whether or not the address has an account: no account enumeration.
export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  try {
    const parsed = emailSchema.safeParse(((await req.json()) as { email?: unknown }).email);
    if (parsed.success) {
      // The email template links to /auth/confirm?token_hash=...&type=recovery, so it works on any device.
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${SITE_URL}/reset` });
      if (error) console.error("[forgot] send failed:", error.message);
    }
  } catch {
    // fall through to the generic answer
  }
  return NextResponse.json({ ok: true });
}
