import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ActivityGrid } from "@/components/study/ActivityGrid";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { computeOverview, loadIndex, loadSettings, resolveCourse } from "@/lib/study/server";
import "@/components/study/study.css";

export const metadata = { title: "Study" };
export const dynamic = "force-dynamic";

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function streakOf(days: Array<{ day: string; reviews: number }>): number {
  const set = new Set(days.filter((d) => d.reviews > 0).map((d) => d.day));
  const d = new Date();
  if (!set.has(fmt(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(fmt(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  if (!sb) return <PageShell title="Study" kicker="Study"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/study");
  const settingsP = loadSettings(sb, user.id);
  const actP = sb.rpc("engine_activity", { p_days: 150, p_tz_min: 0 });
  settingsP.catch(() => {});
  const course = await resolveCourse(sb, user.id, sp.course);
  if (!course) return <PageShell title="Study" kicker="Study"><p className="text-text-dim">Join a course first.</p></PageShell>;
  const [idx, { learner }, act] = await Promise.all([
    loadIndex(sb, user.id, course.id),
    settingsP,
    actP,
  ]);
  const ov = computeOverview(idx, new Date());
  const days = ((act.data ?? []) as Array<{ day: string; reviews: number }>).map((d) => ({ day: String(d.day), reviews: d.reviews }));
  const q = (s: string) => `/study/run?scope=${encodeURIComponent(s)}${sp.course ? `&course=${sp.course}` : ""}`;
  const ready = ov.all.due + ov.all.learning + Math.min(ov.all.newCount, learner.study.newPerDay);
  const unitsSorted = idx.units.slice().sort((a, b) => a.position - b.position);
  const stats: Array<[string, number, string]> = [
    ["New", Math.min(ov.all.newCount, learner.study.newPerDay), "var(--new-c)"],
    ["Learning", ov.all.learning, "var(--learn-c)"],
    ["Due", ov.all.due, "var(--review-c)"],
  ];

  return (
    <PageShell title="Study now" kicker={course.code}>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(([label, n, color]) => (
          <div key={label} className="panel">
            <p className="label">{label}</p>
            <p className="font-display text-4xl" style={{ color }}>{n}</p>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ margin: "18px 0" }}>
        <Link className="btn btn-primary" href={q("all")}>{ready ? `Study now (${ready})` : "Study now"}</Link>
        <Link className="btn" href={`${q("all")}&limit=10`}>Quick sprint (10 cards)</Link>
        <Link className="btn" href={q("weak")}>Weak spots</Link>
        <Link className="btn" href="/practical">Mock practical</Link>
        <Link className="btn" href="/atlas/quiz">Atlas quiz</Link>
      </div>
      {!learner.typing.enabled && <p className="notice" style={{ marginBottom: 16 }}>Typing is switched off (Settings, Advanced). Cards are recalled and self-graded.</p>}

      <h2 className="font-display" style={{ fontSize: 16, margin: "8px 0 10px" }}>Pick a unit or topic</h2>
      {unitsSorted.length === 0 && <p className="text-text-dim">No content in this course yet.</p>}
      <div style={{ display: "grid", gap: 18 }}>
        {unitsSorted.map((un) => {
          const o = ov.units[un.id];
          const topics = idx.topics.filter((t) => t.unit_id === un.id).sort((a, b) => a.position - b.position);
          if (!o) return null;
          return (
            <section key={un.id}>
              <Link href={q(`unit:${un.slug}`)} className="scope-card" style={{ marginBottom: 8 }}>
                <h3>{un.title}</h3>
                <div className="scope-nums"><span className="c-new">{o.newCount} new</span><span className="c-learn">{o.learning} learning</span><span className="c-review">{o.due} due</span><span>{o.learned}/{o.total} solid</span></div>
              </Link>
              <div className="scope-grid">
                {topics.map((t) => {
                  const to = ov.topics[t.id];
                  if (!to) return null;
                  return (
                    <Link key={t.id} href={q(`topic:${t.slug}`)} className="scope-card">
                      <h3>{t.title}</h3>
                      <div className="scope-nums"><span className="c-new">{to.newCount}</span><span className="c-learn">{to.learning}</span><span className="c-review">{to.due}</span><span>{to.total} cards</span></div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {learner.scaffold.streaks && <div style={{ marginTop: 22 }}><ActivityGrid days={days} streak={streakOf(days)} /></div>}
    </PageShell>
  );
}
