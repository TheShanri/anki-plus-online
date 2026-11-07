"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { atlasTargetForSlug } from "@/lib/atlas/catalog";
import type { StudyEngine, Current } from "@/lib/study/engine";
import type { Grade } from "@/lib/fsrs";
import { RUNGS } from "@/lib/study/ladder";
import { TypeBox } from "./TypeBox";
import { MnemonicPanel } from "./MnemonicPanel";

// the atlas opens in a modal over the card (loaded on first use), so the session is never left
const AtlasPeek = dynamic(() => import("@/components/atlas/AtlasPeek"), { ssr: false });

function AtlasButton({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  if (!atlasTargetForSlug(slug)) return null;
  return (
    <>
      <button type="button" className="text-accent-2 underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
        View in the atlas
      </button>
      {open && <AtlasPeek slug={slug} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

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
          {info?.latin && info.latin.trim().toLowerCase() !== s.name.trim().toLowerCase() ? ` · ${info.latin}` : ""}
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
      {s && <AtlasButton slug={s.slug} name={s.name} />}
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
  const retypeRef = useRef<HTMLInputElement>(null);
  const r = c.retype;
  useEffect(() => {
    if (!r || r.done) return;
    const el = retypeRef.current;
    el?.focus({ preventScroll: true });
    el?.closest(".retype-box")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [r, r?.done, r?.repsLeft]);
  const t = c.typer;
  const hint = t?.hinted ? `${t.hinted} hint letter${t.hinted === 1 ? "" : "s"}` : "";
  const typos = t?.typos && !c.isFirstLook ? `${t.typos} typo${t.typos === 1 ? "" : "s"}` : "";
  const secs = c.isFirstLook ? "" : `${(c.durationMs / 1000).toFixed(1)}s`;
  const notes = [c.why, hint, typos, secs].filter(Boolean).join(" · ");
  const wordClass = c.selfGraded ? "g3" : `g${c.rating}`;
  const intro = c.headline === "FIRST LOOK";
  const canRate = engine.canAdvance;
  const faceted = c.card.tags.filter((t) => /^(region|plane|modality|theory|source):/.test(t));
  return (
    <div className="reveal" aria-live="polite">
      <div className="verdict">
        {c.surprise && <span className="v-surprise">Surprise! You were sure.</span>}
        <span className={`v-word ${intro ? "intro" : wordClass}`}>{c.headline}</span>
        {intro ? <span className="v-notes">not scored{c.why ? ` · ${c.why}` : ""}</span> : notes && <span className="v-notes">{notes}</span>}
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
            <b className="text-accent-2">{r.kind === "intro" ? "Look, then type it" : r.kind === "near" ? "Almost." : r.kind === "reps" ? "Trap reps" : "Lock it in:"}</b>{" "}
            {r.kind === "near" ? "Type it once more" : r.kind === "reps" ? `${r.repsLeft} more from memory` : r.kind === "fail" ? "type the answer once" : ""}
            {r.typer.mode === "covered" ? <span className="v-notes"> — it hides at your first key</span> : null}
            {r.kind !== "intro" && <span className="v-notes"> (not graded)</span>}
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
          {!r.done && (
            <div className="help-line">
              <span><span className="kbd">Enter</span> when done</span>
              {r.typer.mode === "covered" && <span><span className="kbd">Tab</span> peek</span>}
              {(r.kind === "fail" || r.kind === "reps") && <span><span className="kbd">Esc</span> skip</span>}
            </div>
          )}
          <div className="btn-row touch-only">
            {r.typer.mode === "covered" && !r.done && <button type="button" className="btn" onClick={() => engine.peekRetype()}>Peek</button>}
            {(r.kind === "fail" || r.kind === "reps") && !r.done && <button type="button" className="btn" onClick={() => engine.skipRetype()}>Skip</button>}
          </div>
        </div>
      )}

      <Info c={c} courseSlug={courseSlug} />

      {faceted.length > 0 && (
        <p className="tag-chips" aria-label="Tags">
          {faceted.map((t) => (
            <span key={t} className={`chip tag f-${t.split(":")[0]}`} title={t.replace(":", ": ")}>{t.slice(t.indexOf(":") + 1).replace(/-/g, " ")}</span>
          ))}
        </p>
      )}


        <MnemonicPanel
          key={c.card.id}
          cardId={c.card.id}
          autoOpen={c.mnemonicOffer}
          nudge="This one keeps slipping. Want to write your own memory hook for it? Something silly or personal works best."
          onOwnChange={(body) => {
            if (engine.cur?.card.id === c.card.id) engine.setNote(body);
          }}
          onDismiss={() => {
            if (c.mnemonicOffer && engine.cur?.card.id === c.card.id) engine.setNote(null);
          }}
        />


      {c.ladderNote && c.mode === "type" && (
        <p className="v-notes" style={{ marginTop: 8 }}>
          <Pips step={c.step} next={c.stepAfter} /> {c.ladderNote}
        </p>
      )}

      {!c.fixed || c.selfGraded ? (
        <div className="grade-bar">
          {([1, 2, 3, 4] as Grade[]).map((g) => {
            return (
              <button key={g} type="button" className={`grade-btn g${g}${g === c.rating ? " suggested" : ""}`} disabled={!canRate} onClick={() => engine.accept(g)}>
                <b>{GRADE_NAMES[g]}</b>
                <small>{c.previews?.[g] ?? ""}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      {canRate ? (
        <p className="next-hint">
          <span className="kbd">Enter</span> {c.fixed && !c.selfGraded ? "next card" : `accept ${GRADE_NAMES[c.rating]}`}
          {!c.fixed || c.selfGraded ? <> · <span className="kbd">1</span>-<span className="kbd">4</span> choose</> : null}
        </p>
      ) : !r || r.done ? (
        <p className="next-hint">One moment…</p>
      ) : null}
      {c.fixed && !c.selfGraded && canRate && (
        <div className="btn-row touch-only" style={{ justifyContent: "center", marginTop: 6 }}>
          <button type="button" className="btn btn-primary" onClick={() => engine.accept()}>Next card</button>
        </div>
      )}
    </div>
  );
}
