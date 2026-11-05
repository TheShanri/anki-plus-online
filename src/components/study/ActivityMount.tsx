import { createClient } from "@/lib/supabase/server";
import { ActivityTracker } from "./ActivityTracker";

/** Server wrapper for the root layout: renders the ActivityTracker only for signed-in users, with their course. */
export async function ActivityMount() {
  const sb = await createClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: enr } = await sb.from("enrollments").select("course_id").eq("user_id", data.user.id).order("joined_at", { ascending: true }).limit(1);
  return <ActivityTracker courseId={enr?.[0]?.course_id ?? null} />;
}
