// Server-side data for the student home and the course map. Own data only (RLS), plus the anonymous class average.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOverview, loadIndex, loadSettings, resolveCourse, type CourseCtx, type CourseIndex, type Overview } from "@/lib/study/server";
import type { LearnerSettings } from "@/lib/study/settings";

export const TZ = "America/New_York";

export interface ActivityDay {
  day: string;
  reviews: number;
  minutes: number;
}
export interface Pace {
  activeStudents: number;
  classAvgReviews: number | null;
  classAvgMinutes: number | null;
  myReviews: number;
  myMinutes: number;
}

/** Today's date (YYYY-MM-DD) in the course timezone. */
export function todayStr(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function shift(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Consecutive study days ending today (or yesterday, so the streak is still alive until the day is over). */
export function streakOf(days: ActivityDay[], today: string): number {
  const set = new Set(days.filter((d) => d.reviews > 0).map((d) => d.day));
  let cur = set.has(today) ? today : shift(today, -1);
  let n = 0;
  while (set.has(cur)) {
    n++;
    cur = shift(cur, -1);
  }
  return n;
}

export async function loadActivity(sb: SupabaseClient, days = 371): Promise<ActivityDay[]> {
  const { data } = await sb.rpc("theme_activity_days", { p_tz: TZ, p_days: days });
  return ((data ?? []) as Array<{ day: string; reviews: number; minutes: number }>).map((r) => ({ day: String(r.day).slice(0, 10), reviews: r.reviews, minutes: r.minutes }));
}

export async function loadPace(sb: SupabaseClient, courseId: string): Promise<Pace | null> {
  const { data, error } = await sb.rpc("theme_class_pace", { p_course: courseId, p_tz: TZ });
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, number | null> | undefined;
  if (error || !r) return null;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  return {
    activeStudents: Number(r.active_students ?? 0),
    classAvgReviews: n(r.class_avg_reviews),
    classAvgMinutes: n(r.class_avg_minutes),
    myReviews: Number(r.my_reviews ?? 0),
    myMinutes: Number(r.my_minutes ?? 0),
  };
}

export interface CourseView {
  course: CourseCtx;
  idx: CourseIndex;
  overview: ReturnType<typeof computeOverview>;
  learner: LearnerSettings;
}

export async function loadCourseView(sb: SupabaseClient, userId: string): Promise<CourseView | null> {
  const course = await resolveCourse(sb, userId, null);
  if (!course) return null;
  const [idx, { learner }] = await Promise.all([loadIndex(sb, userId, course.id), loadSettings(sb, userId)]);
  return { course, idx, overview: computeOverview(idx, new Date()), learner };
}

export type { Overview };
