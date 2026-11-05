import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/session";

export type StaffCourse = {
  id: string;
  code: string;
  title: string;
  term: string | null;
  join_code: string;
  settings: Record<string, unknown>;
  myRole: "ta" | "professor" | "admin";
};

export async function requireUser(next: string): Promise<NonNullable<Viewer>> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireAdmin(next: string): Promise<NonNullable<Viewer>> {
  const viewer = await requireUser(next);
  if (viewer.role !== "admin") redirect("/study");
  return viewer;
}

/** Courses the viewer may see as staff (all courses for the admin). Empty for students. */
export async function staffCourses(viewer: NonNullable<Viewer>): Promise<StaffCourse[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const cols = "id, code, title, term, join_code, settings";
  if (viewer.role === "admin") {
    const { data } = await admin.from("courses").select(cols).order("code");
    return (data ?? []).map((c) => ({ ...c, myRole: "admin" as const })) as StaffCourse[];
  }
  const { data } = await admin
    .from("enrollments")
    .select(`role, courses(${cols})`)
    .eq("user_id", viewer.id)
    .in("role", ["ta", "professor"]);
  type Row = { role: "ta" | "professor"; courses: Omit<StaffCourse, "myRole"> | Omit<StaffCourse, "myRole">[] | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => {
      const c = Array.isArray(r.courses) ? r.courses[0] : r.courses;
      return c ? ({ ...c, myRole: r.role } as StaffCourse) : null;
    })
    .filter((c): c is StaffCourse => c !== null);
}

export async function requireStaff(next: string) {
  const viewer = await requireUser(next);
  const courses = await staffCourses(viewer);
  if (!courses.length) redirect("/study");
  return { viewer, courses };
}

/** For server actions: the caller's role in a course ("admin" for the owner), or null. */
export async function courseRole(viewer: NonNullable<Viewer>, courseId: string): Promise<"student" | "ta" | "professor" | "admin" | null> {
  if (viewer.role === "admin") return "admin";
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("enrollments")
    .select("role")
    .eq("user_id", viewer.id)
    .eq("course_id", courseId)
    .maybeSingle();
  return (data?.role as "student" | "ta" | "professor" | "admin" | undefined) ?? null;
}

export function isStaffRole(r: string | null): boolean {
  return r === "ta" || r === "professor" || r === "admin";
}
export function isProfRole(r: string | null): boolean {
  return r === "professor" || r === "admin";
}
