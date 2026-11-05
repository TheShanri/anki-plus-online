"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const TYPES = ["recovery", "email", "magiclink", "invite", "signup", "email_change"] as const;
type OtpType = (typeof TYPES)[number];

/** Exchanges the emailed token_hash for a session cookie (works on any device), then redirects. */
export async function confirmToken(form: FormData) {
  const token_hash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "recovery") as OtpType;
  const next = safeNext(String(form.get("next") ?? ""), "/reset");
  const supabase = await createClient();
  if (!supabase || !token_hash || !TYPES.includes(type)) redirect("/forgot?error=1");
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) redirect("/forgot?error=1");
  redirect(next);
}
