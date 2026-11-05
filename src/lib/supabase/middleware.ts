import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

const PROTECTED = ["/study", "/practical", "/course", "/settings", "/professor", "/staff", "/admin", "/profile"];

/** Refresh the Supabase session cookie and gate protected routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Without Supabase the app still renders (pages show a notice), so do not redirect.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() refreshes an expired session and verifies the JWT signature locally (ES256 + cached JWKS),
  // so a page load costs no auth-server round trip. Do not use getSession() here: it does not verify.
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  if (!data?.claims?.sub && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
