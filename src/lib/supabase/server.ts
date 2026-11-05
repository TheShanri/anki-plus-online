import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

/** Server client for server components, route handlers and server actions. Null when not configured. */
export async function createClient() {
  if (!isSupabaseConfigured()) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes the session.
        }
      },
    },
  });
}
