"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminResult = { ok: boolean; message?: string };

async function adminOnly() {
  const viewer = await getViewer();
  const db = createAdminClient();
  if (!viewer || viewer.role !== "admin" || !db) return null;
  return { viewer, db };
}

function joinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  const pick = (n: number) => Array.from({ length: n }, (_, i) => alphabet[b[i] % alphabet.length]).join("");
  return `${pick(5)}-${pick(3)}`;
}

export async function createCourse(form: FormData): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const title = String(form.get("title") ?? "").trim();
  const term = String(form.get("term") ?? "").trim();
  const custom = String(form.get("join_code") ?? "").trim().toUpperCase();
  if (!code || !title) return { ok: false, message: "Course code and title are required." };
  if (custom && !/^[A-Z0-9-]{4,32}$/.test(custom)) return { ok: false, message: "Join code: 4-32 letters, digits or dashes." };
  const { error } = await ctx.db.from("courses").insert({
    code,
    title,
    term: term || null,
    join_code: custom || joinCode(),
    settings: { lab_sections: [], station_seconds: 75, exam_spelling: "generous", allowed_email_domains: ["uvm.edu"], inactivity_days: 5, practicals: [] },
  });
  if (error) return { ok: false, message: /duplicate/.test(error.message) ? "That join code is already in use." : "Could not create the course." };
  revalidatePath("/admin");
  return { ok: true, message: "Course created." };
}

/** Sets the site-wide role, and the same role on all of the person's course enrollments (admin stays global only). */
export async function setUserRole(userId: string, role: "student" | "ta" | "professor" | "admin"): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  if (userId === ctx.viewer.id && role !== "admin") return { ok: false, message: "You cannot demote yourself." };
  const { error } = await ctx.db.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: "Could not change the role." };
  if (role !== "admin") await ctx.db.from("enrollments").update({ role }).eq("user_id", userId);
  revalidatePath("/admin");
  return { ok: true, message: `Role set to ${role}.` };
}

// ----------------------------------------------------------------- content review
export async function submitReview(cardId: string, verdict: "good" | "flag", note: string): Promise<AdminResult & { reviewId?: string }> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  if (verdict === "flag" && !note.trim()) return { ok: false, message: "Add a short note for the flag." };
  const { data, error } = await ctx.db
    .from("content_reviews")
    .insert({ card_id: cardId, reviewer_id: ctx.viewer.id, verdict, note: note.trim() || null })
    .select("id")
    .single();
  if (error) return { ok: false, message: "Could not save the review." };
  return { ok: true, reviewId: data.id };
}

export async function resolveFlag(reviewId: string, resolvedNote: string): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  const { error } = await ctx.db
    .from("content_reviews")
    .update({ resolved_at: new Date().toISOString(), resolved_note: resolvedNote.trim() || null })
    .eq("id", reviewId);
  if (error) return { ok: false, message: "Could not resolve." };
  revalidatePath("/admin/review/flags");
  return { ok: true };
}

// ----------------------------------------------------------------- bug reports
export async function setBugStatus(id: string, status: "open" | "fixed" | "dismissed", note: string): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  const { error } = await ctx.db.from("bug_reports").update({ status, resolved_note: note.trim() || null }).eq("id", id);
  if (error) return { ok: false, message: "Could not update." };
  revalidatePath("/admin/bugs");
  return { ok: true };
}

// ----------------------------------------------------------------- feedback inbox
export async function setFeedbackStatus(id: string, status: "new" | "seen" | "resolved", note: string): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  if (!["new", "seen", "resolved"].includes(status)) return { ok: false, message: "Bad status." };
  const { error } = await ctx.db.from("feedback").update({ status, admin_note: note.trim() || null }).eq("id", id);
  if (error) return { ok: false, message: "Could not update." };
  revalidatePath("/admin/feedback");
  return { ok: true };
}

// ----------------------------------------------------------------- course basics
export async function saveCourseBasics(courseId: string, form: FormData): Promise<AdminResult> {
  const ctx = await adminOnly();
  if (!ctx) return { ok: false, message: "Admin only." };
  const station = Number(form.get("station_seconds"));
  const spelling = String(form.get("exam_spelling") ?? "");
  const term = String(form.get("term") ?? "").trim();
  if (!Number.isFinite(station) || station < 10 || station > 600) return { ok: false, message: "Station time must be 10 to 600 seconds." };
  if (spelling !== "strict" && spelling !== "generous") return { ok: false, message: "Choose strict or generous spelling." };
  const { data: course } = await ctx.db.from("courses").select("settings").eq("id", courseId).maybeSingle();
  if (!course) return { ok: false, message: "Course not found." };
  const settings = { ...(course.settings as Record<string, unknown>), station_seconds: station, exam_spelling: spelling };
  const { error } = await ctx.db.from("courses").update({ settings, term: term || null }).eq("id", courseId);
  if (error) return { ok: false, message: "Could not save." };
  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}
