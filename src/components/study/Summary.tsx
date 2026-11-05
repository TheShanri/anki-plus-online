"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StudyEngine } from "@/lib/study/engine";
import type { AnswerSync } from "@/lib/study/sync";

export function Summary({ engine, scope, sync, syncState }: { engine: StudyEngine; scope: string; sync: AnswerSync; syncState: { pending: number; error: string | null } }) {
  void sync;
  const s = engine.stats;
  const mins = Math.max(1, Math.round((engine.deps.now() - s.startedAt) / 60000));
  const acc = s.graded ? Math.round((s.correct / s.graded) * 100) : null;
  const sprint = engine.opts_limit() > 0 && engine.queue.size > 0;
  const seen = new Set<string>();
  const missed = s.missed.filter((m) => (seen.has(m.cardId) ? false : (seen.add(m.cardId), true)));
  const router = useRouter();
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
  const more = () => (sprint ? engine.moreRound() : window.location.assign(`/study/run?scope=${encodeURIComponent(scope)}`));
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
            <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={clearParked}>
              Done with these
            </button>
          </div>
        )}
        {syncState.pending > 0 && <p className="v-notes" style={{ marginTop: 8 }}>Saving {syncState.pending} answer{syncState.pending === 1 ? "" : "s"}…{syncState.error ? ` ${syncState.error}` : ""}</p>}
        <div className="btn-row" style={{ marginTop: 16 }}>
          {sprint && <button className="btn btn-primary" type="button" onClick={() => engine.moreRound()}>One more round</button>}
          <Link className="btn btn-primary" href={`/study/run?scope=${encodeURIComponent(scope)}`} onClick={() => setTimeout(() => window.location.reload(), 0)}>Study more</Link>
          <Link className="btn" href="/study">Back to study</Link>
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
