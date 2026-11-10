"use server";

import { randomBytes } from "node:crypto";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { newJoinCode } from "@/lib/auth";
import { courseRole, isProfRole, isStaffRole } from "@/lib/auth/guard";
import { SITE_URL, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: boolean; message?: string; value?: string };

const fail = (message: string): ActionResult => ({ ok: false, message });

// ----------------------------------------------------------------- course settings
function parseList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveCourseSettings(courseId: string, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  const admin = createAdminClient();
  if (!viewer || !admin) return fail("Please log in again.");
  if (!isProfRole(await courseRole(viewer, courseId))) return fail("Only the professor can change settings.");

  const station = Number(form.get("station_seconds"));
  const inactivity = Number(form.get("inactivity_days"));
  const spelling = String(form.get("exam_spelling") ?? "");
  if (!Number.isFinite(station) || station < 10 || station > 600) return fail("Station time must be 10 to 600 seconds.");
  if (!Number.isFinite(inactivity) || inactivity < 1 || inactivity > 60) return fail("Inactivity threshold must be 1 to 60 days.");
  if (spelling !== "strict" && spelling !== "generous") return fail("Choose strict or generous spelling.");

  const domains = parseList(form.get("allowed_email_domains")).map((d) => d.toLowerCase().replace(/^@/, ""));
  if (!domains.length || domains.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) return fail("Enter at least one valid email domain.");

  // Practicals: one per line, "Name | YYYY-MM-DD".
  const practicals = String(form.get("practicals") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, date] = l.split("|").map((s) => s.trim());
      return { name, date };
    });
  if (practicals.some((p) => !p.name || !/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? ""))) {
    return fail("Practical dates: one per line as Name | YYYY-MM-DD.");
  }

  const { data: course } = await admin.from("courses").select("settings").eq("id", courseId).maybeSingle();
  if (!course) return fail("Course not found.");
  const settings = {
    ...(course.settings as Record<string, unknown>),
    lab_sections: parseList(form.get("lab_sections")),
    station_seconds: station,
    exam_spelling: spelling,
    allowed_email_domains: domains,
    practicals,
    inactivity_days: inactivity,
  };
  const { error } = await admin.from("courses").update({ settings }).eq("id", courseId);
  if (error) return fail("Could not save settings.");
  revalidatePath("/staff");
  return { ok: true, message: "Settings saved." };
}

export async function regenerateJoinCode(courseId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const admin = createAdminClient();
  if (!viewer || !admin) return fail("Please log in again.");
  if (!isProfRole(await courseRole(viewer, courseId))) return fail("Only the professor can change the join code.");
  const code = newJoinCode();
  const { error } = await admin.from("courses").update({ join_code: code }).eq("id", courseId);
  if (error) return fail("Could not regenerate the code.");
  revalidatePath("/staff");
  return { ok: true, message: "New join code created. The old one no longer works.", value: code };
}

// ----------------------------------------------------------------- staff management
/** Professor/admin: make a member a TA (or back to student). Admin only: make someone professor. */
export async function setMemberRole(courseId: string, userId: string, role: "student" | "ta" | "professor"): Promise<ActionResult> {
  const viewer = await getViewer();
  const admin = createAdminClient();
  if (!viewer || !admin) return fail("Please log in again.");
  const mine = await courseRole(viewer, courseId);
  if (!isProfRole(mine)) return fail("Only the professor can change roles.");
  if (role === "professor" && mine !== "admin") return fail("Only the site admin can make someone a professor.");
  if (userId === viewer.id && viewer.role !== "admin") return fail("You cannot change your own role.");

  const { data: target } = await admin
    .from("enrollments")
    .select("role")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!target) return fail("That person is not in this course.");
  if (target.role === "professor" && mine !== "admin") return fail("Only the site admin can change a professor.");

  const { error } = await admin.from("enrollments").update({ role }).eq("user_id", userId).eq("course_id", courseId);
  if (error) return fail("Could not change the role.");
  await syncProfileRole(userId);
  revalidatePath("/staff");
  return { ok: true, message: `Role set to ${role}.` };
}

/** profiles.role mirrors the highest course role (the site admin stays admin). */
async function syncProfileRole(userId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: p } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!p || p.role === "admin") return;
  const { data: rows } = await admin.from("enrollments").select("role").eq("user_id", userId);
  const roles = (rows ?? []).map((r) => r.role as string);
  const top = roles.includes("professor") ? "professor" : roles.includes("ta") ? "ta" : "student";
  await admin.from("profiles").update({ role: top }).eq("id", userId);
}

// ----------------------------------------------------------------- password resets
/** Staff sends a reset email to a student of their course. */
export async function sendResetEmail(courseId: string, userId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const admin = createAdminClient();
  if (!viewer || !admin) return fail("Please log in again.");
  if (!isStaffRole(await courseRole(viewer, courseId))) return fail("Not allowed.");
  const { data: enr } = await admin.from("enrollments").select("user_id").eq("user_id", userId).eq("course_id", courseId).maybeSingle();
  if (!enr) return fail("That person is not in this course.");
  const { data: p } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!p?.email) return fail("No email on file.");
  const plain = createPlainClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await plain.auth.resetPasswordForEmail(String(p.email), { redirectTo: `${SITE_URL}/reset` });
  if (error) return fail(`The email could not be sent (${error.message}).`);
  return { ok: true, message: `Reset email sent to ${p.email}.` };
}

/** Site admin only: set a temporary password; the student is asked to change it from /profile. */
export async function setTemporaryPassword(userId: string): Promise<ActionResult> {
  const viewer = await getViewer();
  const admin = createAdminClient();
  if (!viewer || !admin) return fail("Please log in again.");
  if (viewer.role !== "admin") return fail("Admin only.");
  const temp = randomBytes(9).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(userId, { password: temp });
  if (error) return fail("Could not set the password.");
  const { data: p } = await admin.from("profiles").select("extra").eq("id", userId).maybeSingle();
  await admin
    .from("profiles")
    .update({ extra: { ...((p?.extra as Record<string, unknown>) ?? {}), must_change_password: true } })
    .eq("id", userId);
  return { ok: true, message: "Temporary password set. Share it privately; it is shown only once.", value: temp };
}
