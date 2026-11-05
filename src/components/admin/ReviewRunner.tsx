"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { submitReview } from "@/app/admin/actions";
import { CardPreview, type ReviewCard } from "./CardPreview";

export type Verdict = { verdict: "good" | "flag"; note: string | null } | null;
type Filter = "unreviewed" | "flagged" | "all";

export function ReviewRunner(props: { cards: ReviewCard[]; initial: Record<string, Verdict>; courseSlug: string; topicTitle: string; initialFilter: Filter }) {
  const [verdicts, setVerdicts] = useState(props.initial);
  const [filter, setFilter] = useState<Filter>(props.initialFilter);
  const [idx, setIdx] = useState(0);
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // The visible list is frozen per filter change (so a card does not vanish from under you after Good).
  const [snap, setSnap] = useState(props.initial);
  const list = useMemo(
    () => props.cards.filter((c) => (filter === "all" ? true : filter === "flagged" ? snap[c.id]?.verdict === "flag" : !snap[c.id])),
    [props.cards, filter, snap],
  );
  const changeFilter = (f: Filter) => { setFilter(f); setSnap(verdicts); setIdx(0); setFlagging(false); };

  const card = list[idx];
  const stats = useMemo(() => {
    let good = 0, flag = 0;
    for (const c of props.cards) { const v = verdicts[c.id]; if (v?.verdict === "good") good++; else if (v?.verdict === "flag") flag++; }
    return { good, flag, left: props.cards.length - good - flag };
  }, [props.cards, verdicts]);

  const move = useCallback((d: number) => { setFlagging(false); setIdx((i) => Math.max(0, Math.min(list.length - 1, i + d))); }, [list.length]);

  const save = useCallback((verdict: "good" | "flag", n: string) => {
    if (!card) return;
    setErr(null);
    start(async () => {
      const r = await submitReview(card.id, verdict, n);
      if (!r.ok) return setErr(r.message ?? "Failed");
      setVerdicts((v) => ({ ...v, [card.id]: { verdict, note: n.trim() || null } }));
      setFlagging(false);
      setNote("");
      setIdx((i) => Math.min(list.length - 1, i + 1));
    });
  }, [card, list.length]);

  useEffect(() => {
    if (flagging) noteRef.current?.focus();
  }, [flagging]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (flagging) {
        if (e.key === "Escape") { setFlagging(false); }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save("flag", note); }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "g") save("good", "");
      else if (k === "f") { e.preventDefault(); setNote(""); setFlagging(true); }
      else if (e.key === "ArrowRight" || k === "j") move(1);
      else if (e.key === "ArrowLeft" || k === "k") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flagging, note, save, move]);

  const cur = card ? verdicts[card.id] : null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-dim" aria-live="polite">
          {stats.good} reviewed · {stats.flag} flagged · {stats.left} remaining of {props.cards.length}
        </p>
        <div className="flex gap-1" role="group" aria-label="Filter">
          {(["unreviewed", "flagged", "all"] as const).map((f) => (
            <button key={f} type="button" className={`btn ${filter === f ? "btn-primary" : ""}`} onClick={() => changeFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {!card ? (
        <p className="panel text-text-dim">{filter === "unreviewed" ? "Everything in this module has been reviewed." : "No cards in this view."}</p>
      ) : (
        <div className="panel">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-text-dim">Card {idx + 1} of {list.length}</span>
            {cur && <span className={cur.verdict === "good" ? "text-good" : "text-again"}>{cur.verdict === "good" ? "Good" : `Flagged: ${cur.note ?? ""}`}</span>}
          </div>
          <CardPreview card={card} courseSlug={props.courseSlug} />
          {flagging ? (
            <div className="mt-4 space-y-2">
              <label className="label" htmlFor="flag-note">What is wrong? (Enter saves, Shift+Enter for a new line, Esc cancels)</label>
              <textarea ref={noteRef} id="flag-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn" type="button" onClick={() => move(-1)} disabled={idx === 0}>◀ Prev (K)</button>
              <button className="btn btn-primary" type="button" onClick={() => save("good", "")} disabled={pending}>Good (G)</button>
              <button className="btn" type="button" onClick={() => { setNote(""); setFlagging(true); }}>Flag (F)</button>
              <button className="btn" type="button" onClick={() => move(1)} disabled={idx >= list.length - 1}>Next (J) ▶</button>
            </div>
          )}
          {err && <p className="field-error" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
