import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { requireStaff } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Dashboard, type AtRisk, type MockScore, type Overview, type RosterRow, type UnitProgress, type WeakRow } from "@/components/staff/Dashboard";
import type { TrendPoint } from "@/components/staff/Charts";
import { Members, type Member } from "@/components/staff/Members";
import { CourseSettings } from "@/components/staff/CourseSettings";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course: courseParam } = await searchParams;
  const { viewer, courses } = await requireStaff("/staff");
  const course = courses.find((c) => c.id === courseParam) ?? courses[0];
  const supabase = (await createClient())!;
  const admin = createAdminClient()!;

  const [roster, weak, risk, overview, trend, units, mock, members] = await Promise.all([
    supabase.rpc("staff_roster", { cid: course.id }),
    supabase.rpc("staff_weak_spots", { cid: course.id }),
    supabase.rpc("staff_at_risk", { cid: course.id }),
    supabase.rpc("staff_overview", { cid: course.id }),
    supabase.rpc("staff_activity_trend", { cid: course.id, n: 30 }),
    supabase.rpc("staff_unit_progress", { cid: course.id }),
    supabase.rpc("staff_mock_scores", { cid: course.id }),
    admin
      .from("enrollments")
      .select("user_id, role, lab_section, profiles(display_name, email)")
      .eq("course_id", course.id),
  ]);

  const memberRows: Member[] = (members.data ?? []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      role: m.role as Member["role"],
      labSection: m.lab_section,
      name: p?.display_name ?? "",
      email: String(p?.email ?? ""),
    };
  });
  const canManage = course.myRole === "professor" || course.myRole === "admin";
  const error = roster.error?.message ?? weak.error?.message ?? risk.error?.message ?? overview.error?.message ?? trend.error?.message ?? units.error?.message ?? mock.error?.message;

  return (
    <PageShell title={course.myRole === "ta" ? "Staff dashboard" : "Professor dashboard"} kicker={`${course.code} · ${course.title}`}>
      {courses.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/staff?course=${c.id}`} className={`btn ${c.id === course.id ? "btn-primary" : ""}`}>
              {c.code}
            </Link>
          ))}
        </div>
      )}
      {error && <p className="notice mb-4">Could not load summaries: {error}</p>}
      <p className="mb-4 text-sm text-text-dim">
        Summaries only: no individual answers are shown. Class patterns are anonymous and appear once at least 3 students have attempted something.
      </p>
      <Dashboard
        courseId={course.id}
        courseCode={course.code}
        sections={Array.isArray(course.settings.lab_sections) ? (course.settings.lab_sections as string[]) : []}
        roster={(roster.data ?? []) as RosterRow[]}
        weak={(weak.data ?? []) as WeakRow[]}
        atRisk={(risk.data ?? []) as AtRisk[]}
        isAdmin={viewer.role === "admin"}
        overview={((overview.data ?? [])[0] as Overview | undefined) ?? null}
        trend={(trend.data ?? []) as TrendPoint[]}
        units={(units.data ?? []) as UnitProgress[]}
        mock={(mock.data ?? []) as MockScore[]}
      />
      <Members courseId={course.id} members={memberRows} canManage={canManage} isAdmin={viewer.role === "admin"} selfId={viewer.id} />
      {canManage && <CourseSettings course={{ id: course.id, join_code: course.join_code, settings: course.settings }} />}
    </PageShell>
  );
}
