import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { loadCourseView, type Overview } from "@/lib/home/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Progress({ o }: { o: Overview }) {
  const seen = o.total - o.newCount;
  const solid = o.learned;
  const pct = (v: number) => `${o.total ? Math.round((v / o.total) * 100) : 0}%`;
  return (
    <div
      className="bar"
      role="img"
      aria-label={`${solid} mastered, ${seen} seen of ${o.total} cards`}
    >
      <i className="b-mastered" style={{ width: pct(solid) }} />
      <i className="b-seen" style={{ width: pct(Math.max(0, seen - solid)) }} />
    </div>
  );
}

function Chevron() {
  return (
    <svg className="unit-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default async function CoursePage() {
  const sb = await createClient();
  if (!sb) return <PageShell title="Course map" kicker="Course"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/login?next=/course");
  const view = await loadCourseView(sb, u.user.id);
  if (!view) {
    return (
      <PageShell title="Course map" kicker="Course">
        <div className="panel">
          <p className="text-text-dim">You are not in a course yet.</p>
          <Link href="/join" className="btn btn-primary mt-3">Join with course code</Link>
        </div>
      </PageShell>
    );
  }
  const { idx, overview: ov, course } = view;
  const run = (s: string) => `/study/run?scope=${encodeURIComponent(s)}`;
  const units = idx.units.slice().sort((a, b) => a.position - b.position);
  const topicsOf = (unitId: string | null) => idx.topics.filter((t) => t.unit_id === unitId).sort((a, b) => a.position - b.position);
  const orphans = topicsOf(null);
  const groups = [...units.map((un) => ({ key: un.id, title: un.title, slug: un.slug as string | null, ov: ov.units[un.id], topics: topicsOf(un.id) })), ...(orphans.length ? [{ key: "other", title: "More topics", slug: null, ov: undefined, topics: orphans }] : [])];
  const firstOpen = Math.max(0, groups.findIndex((g) => (g.ov?.due ?? 0) + (g.ov?.learning ?? 0) > 0));

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{course.code}</p>
        <h1 className="page-title">Course map</h1>
        <p className="page-sub">{course.title}. Pick a topic to study it on its own, or study everything that is due from the home screen.</p>
      </header>

      <div className="cta-row">
        <div className="panel">
          <h3>Study everything due</h3>
          <p>Reviews first, then new cards, mixed across units.</p>
          <Link href={run("all")} className="btn btn-primary">Study now</Link>
        </div>
        <div className="panel">
          <h3>Weak spots</h3>
          <p>Cards you miss most, with extra support.</p>
          <Link href={run("weak")} className="btn">Drill weak spots</Link>
        </div>
        <div className="panel">
          <h3>Mock practical</h3>
          <p>Timed lab stations, no going back, scored at the end.</p>
          <Link href="/practical" className="btn">Start a mock practical</Link>
        </div>
      </div>

      <p className="legend-row" aria-hidden>
        <span><i style={{ background: "var(--good)" }} />Mastered</span>
        <span><i style={{ background: "color-mix(in srgb, var(--good) 45%, transparent)" }} />Seen</span>
        <span><i style={{ background: "color-mix(in srgb, var(--text) 13%, transparent)" }} />Not started</span>
      </p>

      {groups.length === 0 && <div className="panel text-text-dim">No content in this course yet.</div>}
      {groups.map((g, i) => (
        <details key={g.key} className="panel unit" open={i === firstOpen}>
          <summary>
            <Chevron />
            <div className="unit-title">
              <h2>{g.title}</h2>
              <p>
                {g.ov ? `${g.ov.learned} of ${g.ov.total} mastered` : `${g.topics.length} topics`}
                {g.ov && g.ov.due + g.ov.learning > 0 ? ` · ${g.ov.due + g.ov.learning} due` : ""}
              </p>
            </div>
            {g.slug && <Link href={run(`unit:${g.slug}`)} className="btn">Study unit</Link>}
          </summary>
          <div className="unit-body">
            {g.topics.length === 0 && <p className="px-5 py-4 text-sm text-text-dim">Topics will appear here.</p>}
            {g.topics.map((t) => {
              const o = ov.topics[t.id];
              const due = o ? o.due + o.learning : 0;
              return (
                <div className="topic" key={t.id}>
                  <div className="topic-name">
                    <b><span className="kind-tag" data-kind={t.kind}>{t.kind === "lab" ? "Lab" : "Lecture"}</span>{t.title}</b>
                    <span className="topic-meta">
                      {o ? `${o.total - o.newCount} seen · ${o.learned} mastered · ${o.total} cards` : "No cards yet"}
                    </span>
                  </div>
                  {o && o.total > 0 ? <Progress o={o} /> : <span />}
                  <div className="flex items-center gap-2">
                    {due > 0 && <span className="due-badge" title="Due now">{due} due</span>}
                    {o && o.total > 0 && <Link href={run(`topic:${t.slug}`)} className="btn">Study</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </>
  );
}
