import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Bar, TrendChart, type TrendPoint } from "@/components/staff/Charts";
import type { RosterRow } from "@/components/staff/Dashboard";
import { requireStaff } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

type Detail = {
  units: { title: string; position: number; cards: number; solid_pct: number; seen_pct: number }[];
  practicals: { at: string; score: number | null; max: number | null }[];
  daily: { d: string; min: number }[];
};

export default async function StudentSummary({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ course?: string }> }) {
  const { id } = await params;
  const { course: courseParam } = await searchParams;
  const { courses } = await requireStaff(`/staff/student/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const course = courses.find((c) => c.id === courseParam) ?? courses[0];
  const supabase = (await createClient())!;
  const [roster, detail] = await Promise.all([
    supabase.rpc("staff_roster", { cid: course.id }),
    supabase.rpc("staff_student_detail", { cid: course.id, uid: id }),
  ]);
  const r = ((roster.data ?? []) as RosterRow[]).find((x) => x.user_id === id);
  if (!r || detail.error) notFound();
  const d = detail.data as Detail;
  const trend: TrendPoint[] = d.daily.map((x) => ({ d: x.d, active_students: 0, reviews: 0, minutes: Number(x.min) }));
  const ago = r.last_seen ? new Date(r.last_seen).toLocaleDateString() : "never";
  const stats: [string, string | number][] = [
    ["Minutes this week", Math.round(r.weeks_min[0] ?? 0)],
    ["Sessions", r.sessions],
    ["Cards reviewed", r.cards_reviewed],
    ["Accuracy", r.accuracy == null ? "-" : `${r.accuracy}%`],
    ["Streak (days)", r.streak],
    ["Last seen", ago],
  ];
  return (
    <PageShell title={r.display_name} kicker={`${course.code} · ${r.lab_section ?? "no lab section"}${r.pronouns ? ` · ${r.pronouns}` : ""}`}>
      <p className="mb-4 text-sm"><Link href={`/staff?course=${course.id}`}>Back to the dashboard</Link> · {r.email}</p>
      <p className="mb-4 text-sm text-text-dim">A summary only: individual answers are never shown to staff.</p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([k, v]) => (
          <div key={k} className="panel"><p className="label">{k}</p><p className="font-display text-2xl">{v}</p></div>
        ))}
      </div>
      <section className="panel mb-6">
        <h2 className="mb-2 font-display text-lg">Active minutes, last 30 days</h2>
        <TrendChart points={trend} field="minutes" label="Active minutes" unit="min" />
      </section>
      <section className="panel mb-6">
        <h2 className="mb-3 font-display text-lg">Progress by unit</h2>
        <ul className="space-y-2 text-sm">
          {d.units.map((u) => (
            <li key={u.title} className="grid items-center gap-2 sm:grid-cols-[16rem_1fr]">
              <span>{u.title} <span className="text-text-faint">({u.cards} cards)</span></span>
              <Bar pct={Number(u.solid_pct)} secondary={Number(u.seen_pct)} />
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="mb-3 font-display text-lg">Mock practicals</h2>
        {d.practicals.length === 0 ? (
          <p className="text-sm text-text-dim">None finished yet.</p>
        ) : (
          <ul className="divide-y divide-panel-border text-sm">
            {d.practicals.map((p) => (
              <li key={p.at} className="flex justify-between py-2">
                <span>{new Date(p.at).toLocaleDateString()}</span>
                <span>{p.score ?? 0} / {p.max ?? 0}{p.max ? ` (${Math.round(((p.score ?? 0) / p.max) * 100)}%)` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
