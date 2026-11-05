import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CreateCourse, UsersTable, type UserRow } from "@/components/admin/AdminPanels";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  await requireAdmin("/admin");
  const db = createAdminClient()!;
  const [courses, users, enrolls, bugs] = await Promise.all([
    db.from("courses").select("id, code, title, term, join_code").order("code"),
    db.from("profiles").select("id, display_name, email, role").order("display_name").limit(2000),
    db.from("enrollments").select("user_id, course_id, role"),
    db.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const codeOf = new Map((courses.data ?? []).map((c) => [c.id, c.code as string]));
  const counts = new Map<string, number>();
  for (const e of enrolls.data ?? []) counts.set(e.course_id, (counts.get(e.course_id) ?? 0) + 1);
  const rows: UserRow[] = (users.data ?? []).map((u) => ({
    id: u.id,
    name: u.display_name,
    email: String(u.email),
    role: u.role,
    courses: (enrolls.data ?? []).filter((e) => e.user_id === u.id).map((e) => ({ id: e.course_id, code: codeOf.get(e.course_id) ?? "?" })),
  }));

  return (
    <PageShell title="Admin" kicker="Owner">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/admin/review" className="btn btn-primary">Content review</Link>
        <Link href="/admin/review/flags" className="btn">Open flags</Link>
        <Link href="/admin/bugs" className="btn">Bug reports{bugs.count ? ` (${bugs.count})` : ""}</Link>
        <Link href="/staff" className="btn">Staff dashboard</Link>
      </div>

      <section className="panel mb-8">
        <h2 className="mb-3 font-display text-lg">Courses</h2>
        <ul className="mb-4 divide-y divide-panel-border text-sm">
          {(courses.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span><b>{c.code}</b> {c.title} <span className="text-text-faint">{c.term}</span></span>
              <span className="text-text-dim">{counts.get(c.id) ?? 0} members · code <code>{c.join_code}</code> · <Link href={`/staff?course=${c.id}`}>dashboard</Link></span>
            </li>
          ))}
        </ul>
        <CreateCourse />
      </section>

      <section className="panel">
        <h2 className="mb-3 font-display text-lg">Users ({rows.length})</h2>
        <UsersTable users={rows} />
      </section>
    </PageShell>
  );
}
