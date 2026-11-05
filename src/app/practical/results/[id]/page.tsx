import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { CardFace } from "@/components/cards/CardFace";
import { createClient } from "@/lib/supabase/server";
import { fetchRowsByIds, resolveCourse } from "@/lib/study/server";
import { toStudyCard, type CardRow } from "@/lib/study/types";
import { diffOps } from "@/lib/study/text";
import "@/components/study/study.css";

export const dynamic = "force-dynamic";

interface StoredStation {
  cardId: string;
  followups: string[];
  typed: string;
  followupTyped?: string[];
  points: number;
  max: number;
  timedOut?: boolean;
  verdict?: string;
  followupPoints?: number[];
}

function Diff({ typed, answer }: { typed: string; answer: string }) {
  const ops = diffOps(typed, answer);
  if (ops.every((o) => o.op === "eq")) return <span className="d-eq">{typed}</span>;
  return (
    <span className="diff" style={{ fontSize: 16, margin: 0 }}>
      <span className="diff-row"><span className="diff-lbl">you</span><span>{ops.map((d, i) => (d.op === "eq" ? <span key={i} className="d-eq">{d.typed}</span> : d.op === "sub" ? <span key={i} className="d-wrong">{d.typed}</span> : d.op === "del" ? <span key={i} className="d-extra">{d.typed}</span> : <span key={i} className="d-missing">_</span>))}</span></span>
      <span className="diff-row"><span className="diff-lbl">answer</span><span>{ops.map((d, i) => (d.op === "eq" ? <span key={i} className="d-eq">{d.answer}</span> : d.op === "sub" || d.op === "ins" ? <span key={i} className="d-fix">{d.answer}</span> : null))}</span></span>
    </span>
  );
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  if (!sb) notFound();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect(`/login?next=/practical/results/${id}`);
  const { data: attempt } = await sb.from("practical_attempts").select("*").eq("id", id).eq("user_id", u.user.id).maybeSingle();
  if (!attempt || !attempt.finished_at) notFound();
  const course = await resolveCourse(sb, u.user.id, attempt.course_id);
  const stations = attempt.stations as StoredStation[];
  const ids = [...new Set(stations.flatMap((s) => [s.cardId, ...s.followups]))];
  const rows = await fetchRowsByIds<CardRow>(sb, "cards", "id, slug, kind, topic_id, structure_id, position, content", ids);
  const cards = new Map(rows.map((r) => [r.id, toStudyCard(r)]));
  const pct = attempt.max_score ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
  return (
    <PageShell title="Practical results" kicker={new Date(attempt.created_at).toLocaleString()}>
      <div className="panel" style={{ maxWidth: 760, marginBottom: 18 }}>
        <p className="font-display text-4xl">{attempt.score} / {attempt.max_score} <span className="text-text-dim" style={{ fontSize: 20 }}>({pct}%)</span></p>
        <p className="text-text-dim" style={{ marginTop: 6 }}>Spelling was {attempt.spelling} for this practical. Mock practicals do not change your study schedule.</p>
        <div className="btn-row" style={{ marginTop: 12 }}><Link className="btn btn-primary" href="/practical">Another practical</Link><Link className="btn" href="/study">Back to study</Link></div>
      </div>
      <div style={{ display: "grid", gap: 14, maxWidth: 760 }}>
        {stations.map((s, i) => {
          const pin = cards.get(s.cardId);
          if (!pin || !course) return null;
          const cls = s.points >= s.max ? "full" : s.points > 0 ? "half" : "none";
          return (
            <div key={i} className="panel station-review">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="chip">Station {i + 1}</span>
                <span className={`pts ${cls}`}>{s.points} / {s.max}</span>
              </div>
              <CardFace card={pin} courseSlug={course.slug} revealed />
              <p>
                <span className="label">You typed</span>
                {s.typed ? <Diff typed={s.typed} answer={pin.answer} /> : <span className="text-text-faint">{s.timedOut ? "(no answer: time ran out)" : "(blank)"}</span>}
              </p>
              <p><span className="label">Answer</span><span className="answer-line" style={{ fontSize: 18 }}>{pin.answer}</span></p>
              {s.followups.map((fid, k) => {
                const f = cards.get(fid);
                if (!f) return null;
                const typed = s.followupTyped?.[k] ?? "";
                return (
                  <div key={fid} className="info-panel">
                    <h4>{f.prompt}</h4>
                    <p><span className="label">You typed</span>{typed || <span className="text-text-faint">(blank)</span>}</p>
                    <p><span className="label">Answer</span>{f.answer} <span className={`pts ${(s.followupPoints?.[k] ?? 0) >= 1 ? "full" : (s.followupPoints?.[k] ?? 0) > 0 ? "half" : "none"}`}>{s.followupPoints?.[k] ?? 0} / 1</span></p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
