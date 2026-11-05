"use server";

import { revalidatePath } from "next/cache";
import { labSectionsOf, passwordSchema, profileSchema } from "@/lib/auth";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

/** Edit own profile. Email and role are never editable here (the DB trigger also locks them). */
export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const viewer = await getViewer();
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!viewer || !supabase || !admin) return { error: "Please log in again." };
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: v.displayName,
      pronouns: v.pronouns || null,
      class_year: v.classYear || null,
      major: v.major || null,
      minor: v.minor || null,
    })
    .eq("id", viewer.id);
  if (error) return { error: "Could not save." };

  // Lab section lives on the enrollment; validate against each course's list.
  const courseId = String(form.get("courseId") ?? "");
  if (courseId) {
    const { data: enr } = await admin
      .from("enrollments")
      .select("course_id, courses(settings)")
      .eq("user_id", viewer.id)
      .eq("course_id", courseId)
      .maybeSingle();
    if (enr) {
      const c = Array.isArray(enr.courses) ? enr.courses[0] : enr.courses;
      const sections = labSectionsOf(c?.settings);
      if (sections.length && v.labSection && !sections.includes(v.labSection)) {
        return { error: "Unknown lab section.", fieldErrors: { labSection: "Choose from the list" } };
      }
      await admin
        .from("enrollments")
        .update({ lab_section: v.labSection || null })
        .eq("user_id", viewer.id)
        .eq("course_id", courseId);
    }
  }
  revalidatePath("/profile");
  return { ok: true };
}

export async function changePassword(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const viewer = await getViewer();
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!viewer || !supabase || !admin) return { error: "Please log in again." };
  const parsed = passwordSchema.safeParse(String(form.get("password") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Could not change the password." };
  // Clear the temporary-password flag set by an admin reset, if any.
  const { data: p } = await admin.from("profiles").select("extra").eq("id", viewer.id).maybeSingle();
  const extra = { ...((p?.extra as Record<string, unknown>) ?? {}) };
  if (extra.must_change_password) {
    delete extra.must_change_password;
    await admin.from("profiles").update({ extra }).eq("id", viewer.id);
  }
  revalidatePath("/profile");
  return { ok: true };
}
