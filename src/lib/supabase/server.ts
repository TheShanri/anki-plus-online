import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

/** Server client for server components, route handlers and server actions. Null when not configured.
 *  Memoised per request in server components (layout, nav and page share one client). */
export const createClient = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; the proxy refreshes the session.
        }
      },
    },
  });
});

export type AuthUser = { id: string; email: string };

/**
 * The signed-in user, from the session JWT verified locally against the project's ES256 signing key
 * (getClaims; JWKS cached per server instance), so no round trip to the auth server per call.
 * Memoised per request in server components.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const sb = await createClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : "" };
});
