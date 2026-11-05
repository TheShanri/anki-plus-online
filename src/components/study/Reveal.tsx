"use client";
import { useEffect, useRef, useState } from "react";
import type { StudyEngine, Current } from "@/lib/study/engine";
import type { Grade } from "@/lib/fsrs";
import { RUNGS } from "@/lib/study/ladder";
import { TypeBox } from "./TypeBox";

const GRADE_NAMES: Record<Grade, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

function Diff({ c }: { c: Current }) {
  if (!c.diff || !c.verdict) return null;
  const top = c.diff.map((d, i) =>
    d.op === "eq" ? <span key={i} className="d-eq">{d.typed}</span> : d.op === "sub" ? <span key={i} className="d-wrong">{d.typed}</span> : d.op === "del" ? <span key={i} className="d-extra">{d.typed}</span> : <span key={i} className="d-missing">{d.answer === " " ? "␣" : "_"}</span>,
  );
  const bot = c.diff.map((d, i) => (d.op === "eq" ? <span key={i} className="d-eq">{d.answer}</span> : d.op === "sub" || d.op === "ins" ? <span key={i} className="d-fix">{d.answer}</span> : null));
  return (
    <div className="diff" aria-label="What you typed against the answer">
      <div className="diff-row"><span className="diff-lbl">you</span><span>{top}</span></div>
      <div className="diff-row"><span className="diff-lbl">answer</span><span>{bot}</span></div>
    </div>
  );
}

function Info({ c, courseSlug }: { c: Current; courseSlug: string }) {
  void courseSlug;
  const s = c.structure;
  const info = s?.info;
  const facts = info?.facts ? Object.entries(info.facts).filter(([, v]) => !!v) : [];
  const ety = info?.etymology;
  if (!s && !c.card.explain) return null;
  return (
    <div className="info-panel">
      {s && (
        <h4>
          {s.name}
          {info?.latin ? ` · ${info.latin}` : ""}
        </h4>
      )}
      {c.card.explain && <p>{c.card.explain}</p>}
      {ety && (ety.roots?.length || ety.literal || ety.story) && (
        <div>
          <div className="roots">
            {ety.roots?.map((r, i) => (
              <span key={i} className="root">{r.part} <i>{r.lang ? `${r.lang}: ` : ""}{r.meaning}</i></span>
            ))}
          </div>
          {ety.literal && <p><b>Literally:</b> {ety.literal}</p>}
          {ety.story && <p>{ety.story}</p>}
        </div>
      )}
      {info?.explanation && <p>{info.explanation}</p>}
      {facts.length > 0 && (
        <dl>
          {facts.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd>{v as string}</dd>
            </div>
          ))}
        </dl>
      )}
      {s && (
        <a className="text-accent-2" href={`/atlas?s=${encodeURIComponent(s.slug)}`}>Open in 3D atlas</a>
      )}
    </div>
  );
}

function Pips({ step, next }: { step: number; next: number }) {
  const at = (s: number, i: number) => (s & 1 ? i === (s >> 1) + 1 : i === s >> 1);
  return (
    <span className="ladder-pips" aria-label="Scaffold ladder">
      {RUNGS.map((n, i) => (
        <i key={n} className={[i === step >> 1 ? "on" : "", next !== step && at(next, i) ? "half" : ""].join(" ")}>{n}</i>
      ))}
    </span>
  );
}

export function Reveal({ engine, c, courseSlug }: { engine: StudyEngine; c: Current; courseSlug: string }) {
  const [noteText, setNoteText] = useState("");
  const retypeRef = useRef<HTMLInputElement>(null);
  const r = c.retype;
  useEffect(() => {
    if (r && !r.done) retypeRef.current?.focus();
  }, [r, r?.done, r?.repsLeft]);
  const t = c.typer;
  const hint = t?.hinted ? `${t.hinted} hint letter${t.hinted === 1 ? "" : "s"}` : "";
  const typos = t?.typos && !c.isFirstLook ? `${t.typos} typo${t.typos === 1 ? "" : "s"}` : "";
  const secs = c.isFirstLook ? "" : `${(c.durationMs / 1000).toFixed(1)}s`;
  const notes = [c.why, hint, typos, secs].filter(Boolean).join(" · ");
  const wordClass = c.selfGraded ? "g3" : `g${c.rating}`;
  const canRate = engine.canAdvance;
  const saveNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    engine.setNote(body);
    await fetch("/api/study/note", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: c.card.id, body }) }).catch(() => {});
  };
  return (
    <div className="reveal" aria-live="polite">
      <div className="verdict">
        {c.surprise && <span className="v-surprise">Surprise! You were sure.</span>}
        <span className={`v-word ${wordClass}`}>{c.headline}</span>
        {notes && <span className="v-notes">{notes}</span>}
      </div>
      {c.mode !== "self" && <Diff c={c} />}
      {!c.diff && c.card.answer && <p className="answer-line" style={c.right || c.mode === "self" ? undefined : { color: "var(--good)" }}>{c.card.answer}</p>}
      {c.mode === "keywords" && c.verdict?.why && <p className="v-notes">{c.verdict.why}</p>}

      {c.trapReport.length > 0 && (
        <div className="info-panel" style={{ marginTop: 8 }}>
          <h4>Trap letters</h4>
          {c.trapReport.map((tr, i) => (
            <p key={i}>
              <b>{tr.chunk}</b> ({tr.label}): {tr.passed ? "cleared" : "missed, it will be drilled"}. Question to ask yourself: {tr.question}
            </p>
          ))}
        </div>
      )}

      {r && (
        <div className="retype-box">
          <p className="retype-label">
            {r.kind === "intro" ? "Look, then type it." : r.kind === "near" ? "Almost. Type it once more." : r.kind === "reps" ? `Lock it in: ${r.repsLeft} more time${r.repsLeft === 1 ? "" : "s"}.` : "Lock it in: type the answer once."}{" "}
            <span className="v-notes">(not graded){r.typer.mode === "covered" ? " It hides at your first key; Tab peeks." : ""}</span>
          </p>
          <TypeBox
            ref={retypeRef}
            typer={r.typer}
            label="Retype the answer"
            disabled={r.done}
            placeholder="Type it from memory…"
            onChange={(v) => engine.retypeInput(v)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                engine.peekRetype();
              }
            }}
          />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => engine.peekRetype()}>Peek</button>
            {(r.kind === "fail" || r.kind === "reps") && !r.done && <button type="button" className="btn" onClick={() => engine.skipRetype()}>Skip</button>}
          </div>
        </div>
      )}

      <Info c={c} courseSlug={courseSlug} />

      {c.note && (
        <div className="info-panel">
          <h4>Your mnemonic</h4>
          <p>{c.note}</p>
        </div>
      )}
      {c.mnemonicOffer && (
        <div className="info-panel">
          <h4>This one keeps slipping</h4>
          <p>Want to write your own memory hook for it? Something silly or personal works best.</p>
          <div className="note-form">
            <textarea rows={2} maxLength={400} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Hippo + campus: a hippo on a campus lawn" aria-label="Your mnemonic" />
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => void saveNote()}>Save mnemonic</button>
              <button type="button" className="btn" onClick={() => engine.setNote(null)}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {c.ladderNote && c.mode === "type" && (
        <p className="v-notes" style={{ marginTop: 8 }}>
          <Pips step={c.step} next={c.stepAfter} /> {c.ladderNote}
        </p>
      )}

      {!c.fixed || c.selfGraded ? (
        <div className="grade-bar">
          {([1, 2, 3, 4] as Grade[]).map((g) => {
            const max = c.selfGraded ? 4 : c.maxRating;
            return (
              <button key={g} type="button" className={`grade-btn g${g}${g === c.rating ? " suggested" : ""}`} disabled={!canRate || g > max} onClick={() => engine.accept(g)}>
                <b>{GRADE_NAMES[g]}</b>
                <small>{c.previews?.[g] ?? ""}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="next-hint">
        {!canRate ? (r && !r.done ? "Finish the retype to continue" : "One moment…") : (
          <>
            <span className="kbd">Enter</span> {c.fixed && !c.selfGraded ? "next card" : `accept ${GRADE_NAMES[c.rating]}`}
            {!c.fixed || c.selfGraded ? <> · <span className="kbd">1</span>-<span className="kbd">4</span> choose{c.selfGraded ? "" : " (lower only)"}</> : null}
          </>
        )}
      </p>
      {c.fixed && !c.selfGraded && canRate && (
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 6 }}>
          <button type="button" className="btn btn-primary" onClick={() => engine.accept()}>Next card</button>
        </div>
      )}
    </div>
  );
}
