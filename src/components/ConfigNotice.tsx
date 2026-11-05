import { isSupabaseConfigured } from "@/lib/env";

/** Friendly notice shown instead of crashing when Supabase env vars are missing. */
export function ConfigNotice() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="notice mb-6">
      Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
      SUPABASE_SERVICE_ROLE_KEY (see .env.example). Pages render as placeholders until then.
    </div>
  );
}
