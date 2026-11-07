import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CreateCourse, UsersTable, type UserRow } from "@/components/admin/AdminPanels";
import { CourseAdmin, type CourseRow } from "@/components/admin/CourseAdmin";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  await requireAdmin("/admin");
  const db = createAdminClient()!;
  const supabase = (await createClient())!;
  const [courses, users, enrolls, bugs, fb, cards, topics, latest] = await Promise.all([
    db.from("courses").select("id, code, title, term, join_code, settings").order("code"),
    db.from("profiles").select("id, display_name, email, role").order("display_name").limit(2000),
    db.from("enrollments").select("user_id, course_id, role"),
    db.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("cards").select("id, course_id, topic_id, status").eq("status", "draft").limit(5000),
    db.from("topics").select("id, title, course_id, position").order("position"),
    supabase.rpc("review_latest"),
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
  const courseRows: CourseRow[] = (courses.data ?? []).map((c) => {
    const s = (c.settings ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      code: c.code,
      title: c.title,
      term: c.term,
      join_code: c.join_code,
      members: counts.get(c.id) ?? 0,
      station_seconds: Number(s.station_seconds) || 75,
      exam_spelling: s.exam_spelling === "strict" ? "strict" : "generous",
    };
  });

  // Content health: live / draft / retired, and drafts that have no verdict yet, by topic.
  const verdict = new Map<string, string>((latest.data ?? []).map((r: { card_id: string; verdict: string }) => [r.card_id, r.verdict]));
  const topicTitle = new Map((topics.data ?? []).map((t) => [t.id, t.title as string]));
  const countOf = async (cid: string, st: string) =>
    (await db.from("cards").select("id", { count: "exact", head: true }).eq("course_id", cid).eq("status", st)).count ?? 0;
  const health = await Promise.all((courses.data ?? []).map(async (c) => {
    const [live, draftN, retired] = await Promise.all([countOf(c.id, "live"), countOf(c.id, "draft"), countOf(c.id, "retired")]);
    const drafts = (cards.data ?? []).filter((x) => x.course_id === c.id);
    const byTopic = new Map<string, { total: number; unreviewed: number }>();
    for (const d of drafts) {
      if (!d.topic_id) continue;
      const t = byTopic.get(d.topic_id) ?? { total: 0, unreviewed: 0 };
      t.total++;
      if (!verdict.has(d.id)) t.unreviewed++;
      byTopic.set(d.topic_id, t);
    }
    return { id: c.id, code: c.code as string, live, draft: draftN, retired, topics: [...byTopic.entries()].filter(([, v]) => v.unreviewed > 0) };
  }));

  return (
    <PageShell title="Admin" kicker="Owner">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/admin/feedback" className="btn btn-primary">Feedback inbox{fb.count ? ` (${fb.count} new)` : ""}</Link>
        <Link href="/admin/review" className="btn">Content review</Link>
        <Link href="/admin/review/flags" className="btn">Open flags</Link>
        <Link href="/admin/bugs" className="btn">Old bug reports{bugs.count ? ` (${bugs.count})` : ""}</Link>
        <Link href="/staff" className="btn">Staff dashboard</Link>
        <Link href="/about" className="btn">About page</Link>
      </div>

      <section className="panel mb-8">
        <h2 className="mb-1 font-display text-lg">Courses and settings</h2>
        <ul className="mb-4 divide-y divide-panel-border">
          {courseRows.map((c) => <CourseAdmin key={c.id} course={c} />)}
        </ul>
        <CreateCourse />
      </section>

      <section className="panel mb-8">
        <h2 className="mb-3 font-display text-lg">Content health</h2>
        {health.map((h) => (
          <div key={h.id} className="mb-3 text-sm">
            <p><b>{h.code}</b>: <span className="text-text-dim">{h.live} live · {h.draft} draft · {h.retired} retired</span></p>
            {h.topics.length > 0 && (
              <p className="mt-1 text-text-dim">
                Drafts not yet reviewed:{" "}
                {h.topics.map(([tid, v], i) => (
                  <span key={tid}>{i > 0 && ", "}<Link href={`/admin/review/${tid}`}>{topicTitle.get(tid) ?? "topic"}</Link> ({v.unreviewed})</span>
                ))}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="mb-3 font-display text-lg">Users and roles ({rows.length})</h2>
        <UsersTable users={rows} />
      </section>
    </PageShell>
  );
}
