"use server";

import { redirect } from "next/navigation";
import { passwordSchema } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setNewPassword(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(String(form.get("password") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Could not set the password. The link may have expired; request a new one." };
  redirect("/study");
}
