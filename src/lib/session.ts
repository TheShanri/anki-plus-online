import { createClient } from "@/lib/supabase/server";

export type Viewer = { id: string; email: string; displayName: string; role: string } | null;

/** The signed-in user plus profile, or null (also null when Supabase is not configured). */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("email, display_name, role")
    .eq("id", data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: p?.email ?? data.user.email ?? "",
    displayName: p?.display_name ?? "",
    role: p?.role ?? "student",
  };
}
