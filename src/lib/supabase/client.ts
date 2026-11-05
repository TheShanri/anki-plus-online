import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

/** Browser client. Returns null when Supabase is not configured. */
export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
