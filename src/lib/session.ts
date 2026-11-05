import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export type Viewer = { id: string; email: string; displayName: string; role: string } | null;

/** The signed-in user plus profile, or null (also null when Supabase is not configured). Memoised per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const user = await getAuthUser();
  if (!user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: p?.email ?? user.email ?? "",
    displayName: p?.display_name ?? "",
    role: p?.role ?? "student",
  };
});
