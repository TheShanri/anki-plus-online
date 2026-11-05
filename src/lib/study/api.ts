// Small helpers shared by the engine's route handlers.
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface AuthedCtx {
  sb: SupabaseClient;
  userId: string;
}

/** The signed-in user's Supabase client, or a JSON error response. */
export async function authed(): Promise<{ ok: true; ctx: AuthedCtx } | { ok: false; res: NextResponse }> {
  const sb = await createClient();
  if (!sb) return { ok: false, res: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }) };
  const { data } = await sb.auth.getUser();
  if (!data.user) return { ok: false, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { ok: true, ctx: { sb, userId: data.user.id } };
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
