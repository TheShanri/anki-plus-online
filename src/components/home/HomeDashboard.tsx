import { ArrowRight, CalendarClock, ClipboardCheck, Layers, Map as MapIcon, Play, Repeat2, Sparkles, UserPlus, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import type { ActivityDay, CourseView, Pace } from "@/lib/home/data";
import { Heatmap } from "./Heatmap";

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

function Flame() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
    </svg>
  );
}

function PaceCard({ pace }: { pace: Pace | null }) {
  if (!pace) return null;
  const hasClass = pace.classAvgReviews !== null;
  const max = Math.max(pace.myReviews, pace.classAvgReviews ?? 0, 1);
  const pct = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`;
  let note = `You averaged ${fmt(pace.myReviews)} reviews a day this week. Class pace appears once five classmates are active.`;
  if (hasClass) {
    const cls = pace.classAvgReviews as number;
    if (pace.myReviews >= cls) note = "You are keeping pace with the class or a little ahead. Nice rhythm.";
    else if (pace.myReviews >= cls * 0.6) note = "A few more cards a day would put you right at the class pace.";
    else note = "The class is moving at a steadier pace. A short session today gets you back into rhythm.";
  }
  return (
    <section className="panel" aria-labelledby="pace-h">
      <p className="label" id="pace-h">You vs class pace, last 7 days</p>
      {hasClass && (
        <>
          <div className="pace-row">
            <span>You</span>
            <div className="pace-track"><i className="you" style={{ width: pct(pace.myReviews) }} /></div>
            <b>{fmt(pace.myReviews)}/d</b>
          </div>
          <div className="pace-row">
            <span>Class</span>
            <div className="pace-track"><i style={{ width: pct(pace.classAvgReviews as number) }} /></div>
            <b>{fmt(pace.classAvgReviews as number)}/d</b>
          </div>
        </>
      )}
      <p className="mt-3 text-sm text-text-dim">{note}</p>
      <p className="mt-1 text-xs text-text-faint">Private to you. Only the class average is shown: no names, no ranks.</p>
    </section>
  );
}

export function HomeDashboard({
  name,
  view,
  days,
  today,
  streak,
  pace,
  goal,
  showStreaks,
}: {
  name: string;
  view: CourseView | null;
  days: ActivityDay[];
  today: string;
  streak: number;
  pace: Pace | null;
  goal: number;
  showStreaks: boolean;
}) {
  const first = name.trim().split(/\s+/)[0];
  const todays = days.find((d) => d.day === today)?.reviews ?? 0;
  const goalPct = Math.min(100, Math.round((todays / Math.max(1, goal)) * 100));

  if (!view) {
    return (
      <>
        <header className="page-head">
          <p className="eyebrow">Welcome</p>
          <h1 className="page-title">Hello{first ? `, ${first}` : ""}</h1>
        </header>
        <section className="panel">
          <h2 className="font-display text-xl">Join your course</h2>
          <p className="mt-1 text-text-dim">You are not in a course yet. Enter the course code your professor shared and your cards will appear here.</p>
          <Button href="/join" variant="primary" icon={UserPlus} className="mt-4">Join with course code</Button>
        </section>
      </>
    );
  }

  const o = view.overview.all;
  const newToday = Math.min(o.newCount, view.learner.study.newPerDay);
  const due = o.due + o.learning;
  const ready = due + newToday;
  const q = (s: string) => `/study/run?scope=${encodeURIComponent(s)}`;
  const solidPct = o.total ? Math.round((o.learned / o.total) * 100) : 0;
  const seenPct = o.total ? Math.round(((o.total - o.newCount) / o.total) * 100) : 0;

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{view.course.code}</p>
        <h1 className="page-title">Welcome back{first ? `, ${first}` : ""}</h1>
      </header>

      <div className="home-grid">
        <section className="panel study-now" aria-labelledby="sn-h">
          <h2 id="sn-h">Today</h2>
          <div className="due-line">
            <span className="due-num">{ready}</span>
            <span className="due-label">{ready === 1 ? "card ready" : "cards ready"}</span>
          </div>
          <div className="mini-counts">
            <span className="pill"><CalendarClock aria-hidden /><b>{due}</b> due</span>
            <span className="pill"><Sparkles aria-hidden /><b>{newToday}</b> new</span>
            {o.learning > 0 && <span className="pill"><Repeat2 aria-hidden /><b>{o.learning}</b> learning</span>}
          </div>
          <div className="study-actions">
            <Button href={q("all")} variant="primary" size="lg" icon={Play}>{ready ? "Study now" : "Study anyway"}</Button>
            <Button href={`${q("all")}&limit=10`} size="lg" icon={Zap}>10-card sprint</Button>
          </div>
          {ready === 0 && <p className="text-sm text-text-dim">You are all caught up. New cards will unlock as you go, and reviews come back when they are due.</p>}
        </section>

        <div className="side-stack">
          {showStreaks && (
            <section className="panel streak-card" aria-label="Streak">
              <span className="streak-flame"><Flame /></span>
              <div>
                <p className="streak-num">{streak}</p>
                <p className="text-sm text-text-dim">{streak === 1 ? "day streak" : "day streak"}{streak === 0 ? ": study today to start one" : ""}</p>
              </div>
            </section>
          )}
          <section className="panel streak-card" aria-label="Daily goal">
            <div className="ring" style={{ ["--p" as string]: goalPct }}><span>{goalPct}%</span></div>
            <div>
              <p className="text-lg font-semibold">{todays} <span className="text-text-dim font-normal">of {goal}</span></p>
              <p className="text-sm text-text-dim">reviews toward today&apos;s goal</p>
            </div>
          </section>
        </div>
      </div>

      <section className="panel mt-[18px]" aria-labelledby="map-h">
        <div className="map-entry">
          <div>
            <h2 id="map-h" className="font-display text-xl panel-title"><Layers aria-hidden />Course map</h2>
            <p className="text-sm text-text-dim">{o.total ? `${solidPct}% solid, ${seenPct}% seen across ${o.total} cards` : "Units and labs with your progress in each"}</p>
          </div>
          <div className="toolbar">
            <Button href="/course" icon={MapIcon} iconRight={ArrowRight}>Course map</Button>
            <Button href="/practical" variant="ghost" icon={ClipboardCheck}>Mock practical</Button>
          </div>
        </div>
        {o.total > 0 && (
          <div className="bar mt-4" aria-hidden>
            <i className="b-mastered" style={{ width: `${solidPct}%` }} />
            <i className="b-seen" style={{ width: `${Math.max(0, seenPct - solidPct)}%` }} />
          </div>
        )}
      </section>

      {showStreaks && (
        <>
          <h2 className="section-title">Your activity <small>last 12 months</small></h2>
          <section className="panel"><Heatmap days={days} today={today} /></section>
        </>
      )}

      <div className="mt-[18px]"><PaceCard pace={pace} /></div>
    </>
  );
}
