"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, FastForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import type { StudyEngine } from "@/lib/study/engine";
import type { AnswerSync } from "@/lib/study/sync";
import { studyMoreUrl } from "@/lib/study/scope";

export function Summary({ engine, scope, sync, syncState }: { engine: StudyEngine; scope: string; sync: AnswerSync; syncState: { pending: number; error: string | null } }) {
  const s = engine.stats;
  const mins = Math.max(1, Math.round((engine.deps.now() - s.startedAt) / 60000));
  const acc = s.graded ? Math.round((s.correct / s.graded) * 100) : null;
  const sprint = engine.opts_limit() > 0 && engine.queue.size > 0;
  const seen = new Set<string>();
  const missed = s.missed.filter((m) => (seen.has(m.cardId) ? false : (seen.add(m.cardId), true)));
  const router = useRouter();
  // when to come back: read once this session's answers have landed (the schedule includes them)
  const [forecast, setForecast] = useState<{ next: string | null; within24h: number } | null>(null);
  const landed = syncState.pending === 0;
  useEffect(() => {
    if (!landed || forecast) return;
    let alive = true;
    fetch("/api/study/forecast")
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => alive && f && setForecast(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [landed, forecast]);
  const [parked, setParked] = useState<Array<{ text: string; at: number }>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("anki.parked.v1") ?? "[]") as Array<{ text: string; at: number }>;
    } catch {
      return [];
    }
  });
  const clearParked = () => {
    try {
      window.localStorage.removeItem("anki.parked.v1");
    } catch {
      /* ignore */
    }
    setParked([]);
  };
  // "Study more" past today's limits: 10 more new cards on top of whatever extra this session already had. The
  // button and Enter both use it (the button used to reload the same URL, i.e. the same empty queue).
  // The new batch is built from the stored answers, so let the last ones land first (a few seconds at most).
  const studyMore = () => void sync.drain(3000).then(() => router.push(studyMoreUrl(window.location.search, scope)));
  const more = () => (sprint ? engine.moreRound() : studyMore());
  // ANKI+ done screen keys: Enter keeps going, Esc goes back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") {
        e.preventDefault();
        more();
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push("/study");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="st-wrap">
      <div className="panel">
        <p className="card-kind">Session complete</p>
        <h2 className="font-display text-2xl" style={{ margin: "6px 0 14px" }}>{s.answered === 0 ? "Nothing due right now" : `${s.answered} card${s.answered === 1 ? "" : "s"} in about ${mins} min`}</h2>
        {s.answered > 0 && (
          <div className="stat-grid">
            <div className="stat"><b>{acc === null ? "-" : `${acc}%`}</b><span>typed correctly</span></div>
            <div className="stat"><b>{s.newCards}</b><span>new cards</span></div>
            <div className="stat"><b>{s.bestCombo}</b><span>best combo</span></div>
            <div className="stat"><b>{s.hints}</b><span>hint letters</span></div>
            {s.bossFought > 0 && <div className="stat"><b>{s.bossWon}/{s.bossFought}</b><span>bosses beaten</span></div>}
            {s.trapsMet > 0 && <div className="stat"><b>{s.trapsCleared}/{s.trapsMet}</b><span>trap spots cleared</span></div>}
            {s.followups > 0 && <div className="stat"><b>{s.followups}</b><span>theory follow-ups</span></div>}
          </div>
        )}
        {s.answered > 0 && (
          <p className="v-notes" style={{ marginTop: 12 }}>
            Again {s.ratings[1]} · Hard {s.ratings[2]} · Good {s.ratings[3]} · Easy {s.ratings[4]}
          </p>
        )}
        {forecast && <p className="v-notes" style={{ marginTop: 8 }}>{comeBack(forecast)}</p>}
        {missed.length > 0 && (
          <div className="info-panel" style={{ marginTop: 12 }}>
            <h4>Worth another look</h4>
            <p>{missed.map((m) => m.name).join(" · ")}</p>
          </div>
        )}
        {parked.length > 0 && (
          <div className="info-panel" style={{ marginTop: 12 }}>
            <h4>Parked thoughts</h4>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {parked.map((p) => (
                <li key={p.at}>{p.text}</li>
              ))}
            </ul>
            <Button size="sm" icon={CheckCheck} style={{ justifySelf: "start" }} onClick={clearParked}>
              Done with these
            </Button>
          </div>
        )}
        {syncState.pending > 0 && <p className="v-notes" style={{ marginTop: 8 }}>Saving {syncState.pending} answer{syncState.pending === 1 ? "" : "s"}…{syncState.error ? ` ${syncState.error}` : ""}</p>}
        <div className="btn-row" style={{ marginTop: 16 }}>
          {sprint && <Button variant="primary" icon={RotateCcw} onClick={() => engine.moreRound()}>One more round</Button>}
          <Button variant="primary" icon={FastForward} onClick={studyMore}>Study more</Button>
          <Link className="btn btn-ghost" href="/study"><ArrowLeft aria-hidden />Back to study</Link>
        </div>
        <p className="help-line" style={{ marginTop: 10 }}>
          <span><span className="kbd">Enter</span> {sprint ? "one more round" : "study more"}</span>
          <span><span className="kbd">Esc</span> back</span>
          {engine.canUndo && <span><span className="kbd">Ctrl Z</span> undo the last card</span>}
        </p>
      </div>
    </div>
  );
}

/** "Next card due in 3 h · 24 cards due in the next 24 hours". */
function comeBack(f: { next: string | null; within24h: number }): string {
  if (!f.next) return "No reviews scheduled yet.";
  const ms = new Date(f.next).getTime() - Date.now();
  const mins = Math.max(1, Math.round(ms / 60000));
  const when = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
  const soon = f.within24h > 0 ? ` · ${f.within24h} card${f.within24h === 1 ? "" : "s"} due in the next 24 hours` : "";
  return `Next card due in ${when}${soon}.`;
}
