import Link from "next/link";
import { redirect } from "next/navigation";
import { Brain, ClipboardCheck, Play, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { PageShell } from "@/components/PageShell";
import { ActivityGrid } from "@/components/study/ActivityGrid";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { TagPicker, type TagCount } from "@/components/study/TagPicker";
import { computeOverview, loadIndex, loadSettings, resolveCourse } from "@/lib/study/server";
import { loadActivity, streakOf, todayStr } from "@/lib/home/data";
import "@/components/study/study.css";

export const metadata = { title: "Study" };
export const dynamic = "force-dynamic";

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  if (!sb) return <PageShell title="Study" kicker="Study"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/study");
  const settingsP = loadSettings(sb, user.id);
  // the same days as the home screen (course time zone): the UTC days here were a day off in the evening
  const actP = loadActivity(sb, 150);
  settingsP.catch(() => {});
  const course = await resolveCourse(sb, user.id, sp.course);
  if (!course) return <PageShell title="Study" kicker="Study"><p className="text-text-dim">Join a course first.</p></PageShell>;
  const [idx, { learner }, act, tagsR] = await Promise.all([
    loadIndex(sb, user.id, course.id),
    settingsP,
    actP,
    sb.rpc("course_tag_counts", { p_course: course.id }),
  ]);
  const tags = ((tagsR.data ?? []) as Array<{ tag: string; n: number }>).map((t): TagCount => ({ tag: t.tag, n: t.n }));
  const ov = computeOverview(idx, new Date());
  const days = act;
  const today = todayStr();
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {stats.map(([label, n, color]) => (
          <div key={label} className="panel">
            <p className="label">{label}</p>
            <p className={`font-display text-4xl stat-num${n === 0 ? " num-zero" : ""}`} style={{ color }}>{n}</p>
            {label === "Due" && <Spark days={days} color={color} today={today} />}
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ margin: "18px 0" }}>
        <Button href={q("all")} variant="primary" size="lg" icon={Play}>{ready ? `Study now (${ready})` : "Study now"}</Button>
        <Button href={`${q("all")}&limit=10`} size="lg" icon={Zap}>10-card sprint</Button>
        <span className="toolbar-sep" aria-hidden />
        <Button href={q("weak")} variant="subtle" icon={Target}>Weak spots</Button>
        <Button href="/practical" variant="subtle" icon={ClipboardCheck}>Mock practical</Button>
        <Button href="/atlas/quiz" variant="subtle" icon={Brain}>Atlas quiz</Button>
      </div>
      {!learner.typing.enabled && <p className="notice" style={{ marginBottom: 16 }}>Typing is switched off (Settings, Advanced). Cards are recalled and self-graded.</p>}

      <TagPicker tags={tags} course={sp.course} />

      <div className="scope-legend">
        <h2 className="font-display" style={{ fontSize: 16 }}>Pick a unit or topic</h2>
        <p className="text-xs text-text-dim"><span className="c-new">new</span> · <span className="c-learn">learning</span> · <span className="c-review">due</span></p>
      </div>
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
                <span className="scope-bar" aria-hidden><i style={{ transform: `scaleX(${o.total ? o.learned / o.total : 0})` }} /></span>
                <div className="scope-nums"><span className="c-new">{o.newCount} new</span><span className="c-learn">{o.learning} learning</span><span className="c-review">{o.due} due</span><span>{o.learned}/{o.total} mastered</span></div>
              </Link>
              <div className="scope-grid">
                {topics.map((t) => {
                  const to = ov.topics[t.id];
                  if (!to) return null;
                  return (
                    <Link key={t.id} href={q(`topic:${t.slug}`)} className="scope-card">
                      <h3>{t.title}</h3>
                      <span className="scope-bar" aria-label={`${to.learned} of ${to.total} mastered`}><i style={{ transform: `scaleX(${to.total ? to.learned / to.total : 0})` }} /></span>
                      <div className="scope-nums"><span className="c-new" title="new" data-z={to.newCount === 0 ? "" : undefined}>{to.newCount}</span><span className="c-learn" title="learning" data-z={to.learning === 0 ? "" : undefined}>{to.learning}</span><span className="c-review" title="due" data-z={to.due === 0 ? "" : undefined}>{to.due}</span><span>{to.total} cards</span></div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {learner.scaffold.streaks && <div style={{ marginTop: 22 }}><ActivityGrid days={days} streak={streakOf(days, today)} today={today} /></div>}
    </PageShell>
  );
}

/** Reviews over the last 7 days, a small line under the Due count. */
function Spark({ days, color, today }: { days: Array<{ day: string; reviews: number }>; color: string; today: string }) {
  const by = new Map(days.map((d) => [d.day, d.reviews]));
  const pts: number[] = [];
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  for (let i = 0; i < 7; i++, d.setUTCDate(d.getUTCDate() + 1)) pts.push(by.get(d.toISOString().slice(0, 10)) ?? 0);
  const max = Math.max(1, ...pts);
  const path = pts.map((v, i) => `${i ? "L" : "M"}${(i * 100) / 6},${28 - (v / max) * 24}`).join(" ");
  const total = pts.reduce((a, b) => a + b, 0);
  return (
    <div className="stat-spark" title={`${total} reviews in the last 7 days`}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
        <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span>{total} reviews · 7 days</span>
    </div>
  );
}
