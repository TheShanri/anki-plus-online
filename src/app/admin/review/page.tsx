import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewIndex({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  await requireAdmin("/admin/review");
  const { course: courseParam } = await searchParams;
  const db = createAdminClient()!;
  const supabase = (await createClient())!;
  const { data: courses } = await db.from("courses").select("id, code, title").order("code");
  const course = (courses ?? []).find((c) => c.id === courseParam) ?? courses?.[0];
  if (!course) return <PageShell title="Content review" kicker="Owner"><p className="text-text-dim">No courses yet.</p></PageShell>;

  const [units, topics, cards, latest] = await Promise.all([
    db.from("units").select("id, title, position").eq("course_id", course.id).order("position"),
    db.from("topics").select("id, unit_id, title, kind, position").eq("course_id", course.id).order("position"),
    db.from("cards").select("id, topic_id").eq("course_id", course.id).neq("status", "retired").limit(20000),
    supabase.rpc("review_latest"),
  ]);
  const verdict = new Map<string, string>((latest.data ?? []).map((r: { card_id: string; verdict: string }) => [r.card_id, r.verdict]));
  const prog = new Map<string, { total: number; good: number; flag: number }>();
  for (const c of cards.data ?? []) {
    if (!c.topic_id) continue;
    const p = prog.get(c.topic_id) ?? { total: 0, good: 0, flag: 0 };
    p.total++;
    const v = verdict.get(c.id);
    if (v === "good") p.good++;
    else if (v === "flag") p.flag++;
    prog.set(c.topic_id, p);
  }

  const groups = [...(units.data ?? []), { id: null as string | null, title: "No unit", position: 9999 }];
  return (
    <PageShell title="Content review" kicker={`${course.code} · module by module`}>
      <div className="mb-4 flex flex-wrap gap-2">
        {(courses ?? []).length > 1 && (courses ?? []).map((c) => (
          <Link key={c.id} href={`/admin/review?course=${c.id}`} className={`btn ${c.id === course.id ? "btn-primary" : ""}`}>{c.code}</Link>
        ))}
        <Link href="/admin/review/flags" className="btn">Open flags</Link>
        <Link href="/admin" className="btn">Admin</Link>
      </div>
      {groups.map((u) => {
        const ts = (topics.data ?? []).filter((t) => (t.unit_id ?? null) === u.id);
        if (!ts.length) return null;
        return (
          <section key={u.id ?? "none"} className="panel mb-6">
            <h2 className="mb-3 font-display text-lg">{u.title}</h2>
            <ul className="divide-y divide-panel-border text-sm">
              {ts.map((t) => {
                const p = prog.get(t.id) ?? { total: 0, good: 0, flag: 0 };
                const left = p.total - p.good - p.flag;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/admin/review/${t.id}`}>{t.title}</Link>
                    <span className="text-text-dim">
                      {p.good} reviewed · <span className={p.flag ? "text-again" : ""}>{p.flag} flagged</span> · {left} remaining
                      <span className="ml-3 inline-block h-1.5 w-24 overflow-hidden rounded bg-bg-3 align-middle" aria-hidden>
                        <span className="block h-full bg-good" style={{ width: `${p.total ? ((p.good + p.flag) / p.total) * 100 : 0}%` }} />
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!(topics.data ?? []).length && <p className="text-text-dim">No topics seeded yet. Cards appear here once the content is seeded.</p>}
    </PageShell>
  );
}
