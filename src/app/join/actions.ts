"use server";

import { emailDomainAllowed, joinCodeKey, joinSchema, labSectionsOf } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };
export type CourseLookup =
  | { ok: true; title: string; labSections: string[]; domains: string[] }
  | { ok: false; error: string };

/** Step 1 of joining: validate the course code and tell the form which lab sections exist. */
export async function lookupCourse(code: string): Promise<CourseLookup> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase is not configured yet." };
  const clean = String(code ?? "").trim();
  if (clean.length < 3 || clean.length > 64) return { ok: false, error: "That course code is not valid." };
  const { data: course } = await admin
    .from("courses")
    .select("title, settings")
    .eq("join_code", joinCodeKey(clean))
    .maybeSingle();
  if (!course) return { ok: false, error: "That course code is not valid." };
  const raw = (course.settings as { allowed_email_domains?: unknown } | null)?.allowed_email_domains;
  const domains = Array.isArray(raw) && raw.length ? raw.map(String) : ["uvm.edu"];
  return { ok: true, title: course.title, labSections: labSectionsOf(course.settings), domains };
}

export async function joinCourse(_prev: JoinState, form: FormData): Promise<JoinState> {
  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin || !supabase) return { ok: false, error: "Supabase is not configured yet." };

  const parsed = joinSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;

  // 1. course code (case-insensitive: codes are stored upper-case; `=`, never LIKE, so % and _ are not wildcards)
  const { data: course } = await admin
    .from("courses")
    .select("id, settings")
    .eq("join_code", joinCodeKey(v.joinCode))
    .maybeSingle();
  if (!course) return { ok: false, error: "That course code is not valid.", fieldErrors: { joinCode: "Not valid" } };

  // 2. email domain allowed for this course (default uvm.edu)
  if (!emailDomainAllowed(v.email, course.settings)) {
    return { ok: false, error: "Please use your school email address.", fieldErrors: { email: "Not an allowed school email" } };
  }
  const sections = labSectionsOf(course.settings);
  if (sections.length && !sections.includes(v.labSection)) {
    return { ok: false, error: "Please choose your lab section.", fieldErrors: { labSection: "Choose a section" } };
  }

  // 3. auth user: the school email is the login; accounts are created confirmed (admin API)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    const dupe = /already|registered|exists/i.test(createErr?.message ?? "");
    return {
      ok: false,
      error: dupe ? "An account with that email already exists. Try logging in." : "Could not create the account.",
      fieldErrors: dupe ? { email: "Already registered" } : undefined,
    };
  }
  const userId = created.user.id;

  // 4. profile + enrollment; roll the auth user back on failure
  const { error: pErr } = await admin.from("profiles").insert({
    id: userId,
    email: v.email,
    display_name: v.displayName,
    pronouns: v.pronouns || null,
    class_year: v.classYear || null,
    major: v.major || null,
    minor: v.minor || null,
    role: "student",
  });
  const { error: eErr } = pErr
    ? { error: pErr }
    : await admin
        .from("enrollments")
        .insert({ user_id: userId, course_id: course.id, role: "student", lab_section: v.labSection || null });
  if (pErr || eErr) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: "Could not finish creating the account. Please try again." };
  }

  // 5. sign in (sets cookies)
  const { error: sErr } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
  if (sErr) return { ok: false, error: "Account created. Please log in." };
  return { ok: true };
}
