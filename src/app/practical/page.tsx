import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { PracticalSetup } from "@/components/study/PracticalRunner";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { fetchAll, resolveCourse } from "@/lib/study/server";
import { DEFAULT_STATION_SECONDS } from "@/lib/study/practical";

export const metadata = { title: "Mock practical" };
export const dynamic = "force-dynamic";

export default async function PracticalPage() {
  const sb = await createClient();
  if (!sb) return <PageShell title="Mock practical" kicker="Practical"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/practical");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Mock practical" kicker="Practical"><p className="text-text-dim">Join a course first.</p></PageShell>;
  const [unitsR, topicsR, pins, attempts] = await Promise.all([
    sb.from("units").select("id, slug, title, position").eq("course_id", course.id).order("position"),
    sb.from("topics").select("id, unit_id").eq("course_id", course.id),
    fetchAll<{ topic_id: string | null }>((a, b) => sb.from("cards").select("topic_id").eq("course_id", course.id).eq("status", "live").eq("kind", "pin").order("id").range(a, b)),
    sb.from("practical_attempts").select("id, created_at, score, max_score, finished_at").eq("user_id", user.id).not("finished_at", "is", null).order("created_at", { ascending: false }).limit(8),
  ]);
  const topicUnit = new Map((topicsR.data ?? []).map((t: { id: string; unit_id: string | null }) => [t.id, t.unit_id]));
  const perUnit = new Map<string, number>();
  for (const p of pins) {
    const u = p.topic_id ? topicUnit.get(p.topic_id) : null;
    if (u) perUnit.set(u, (perUnit.get(u) ?? 0) + 1);
  }
  const units = (unitsR.data ?? []).map((u: { id: string; slug: string; title: string }) => ({ slug: u.slug, title: u.title, pins: perUnit.get(u.id) ?? 0 })).filter((u: { pins: number }) => u.pins > 0);
  const seconds = Number(course.settings.station_seconds) > 0 ? Math.round(Number(course.settings.station_seconds)) : DEFAULT_STATION_SECONDS;
  return (
    <PageShell title="Mock lab practical" kicker={course.code}>
      <div className="prac-layout">
      <PracticalSetup units={units} defaultSeconds={seconds} />
      {(attempts.data ?? []).length > 0 && (
        <div className="prac-recent">
          <h2 className="font-display" style={{ fontSize: 16, marginBottom: 8 }}>Your recent practicals</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {(attempts.data ?? []).map((a: { id: string; created_at: string; score: number; max_score: number }) => (
              <a key={a.id} className="scope-card" href={`/practical/results/${a.id}`}>
                <h3>{new Date(a.created_at).toLocaleString()}</h3>
                <div className="scope-nums"><span>{a.score} / {a.max_score}</span><span>{a.max_score ? Math.round((a.score / a.max_score) * 100) : 0}%</span></div>
              </a>
            ))}
          </div>
        </div>
      )}
      {(attempts.data ?? []).length === 0 && (
        <aside className="panel prac-recent" aria-label="How a practical works">
          <h2 className="font-display" style={{ fontSize: 16, marginBottom: 8 }}>How a practical works</h2>
          <ol className="text-sm text-text-dim" style={{ paddingLeft: 18, display: "grid", gap: 6, listStyle: "decimal" }}>
            <li>Each station shows a pin on a lab photo. Type the structure&apos;s name.</li>
            <li>Some stations add a follow-up question about function or connections.</li>
            <li>The timer moves you on, and you cannot go back.</li>
            <li>Your score and every miss appear at the end, ready to drill.</li>
          </ol>
        </aside>
      )}
      </div>
    </PageShell>
  );
}
