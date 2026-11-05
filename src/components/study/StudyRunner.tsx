"use client";
// The study screen. Renders a StudyEngine (src/lib/study/engine.ts) and forwards keys; all logic lives in the engine.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StudyEngine } from "@/lib/study/engine";
import { AnswerSync } from "@/lib/study/sync";
import { sessionIdFor } from "@/lib/study/activity";
import type { StudyPayload } from "@/lib/study/types";
import { typingReminderDue } from "@/lib/study/settings";
import { setSoundsEnabled, initFallbackBeepFromStorage, emit } from "@/lib/feedback/events";
import { CardFace } from "@/components/cards/CardFace";
import { TypeBox } from "./TypeBox";
import { Reveal } from "./Reveal";
import { GearPopover } from "./Scaffolds";
import { Summary } from "./Summary";
import "./study.css";

let syncSingleton: AnswerSync | null = null;
function getSync(): AnswerSync {
  if (!syncSingleton) syncSingleton = new AnswerSync();
  return syncSingleton;
}

export function StudyRunner({ initial, scope, limit, tz }: { initial: StudyPayload; scope: string; limit?: number; tz: number }) {
  const [sync] = useState<AnswerSync | null>(() => (typeof window === "undefined" ? null : getSync()));
  const [engine] = useState<StudyEngine | null>(() => {
    if (typeof window === "undefined") return null;
    return new StudyEngine(
      initial,
      {
        now: () => Date.now(),
        send: (p) => getSync().send(p),
        uuid: () => crypto.randomUUID(),
        sessionId: sessionIdFor("study"),
        fetchMore: async (exclude) => {
          const r = await fetch(`/api/study/queue?scope=${encodeURIComponent(scope)}&tz=${tz}&course=${initial.course.id}&exclude=${exclude.join(",")}`);
          return r.ok ? ((await r.json()) as StudyPayload) : null;
        },
      },
      { limit },
    );
  });
  if (!engine || !sync) return <p className="text-text-dim">Loading…</p>;
  return <Runner engine={engine} initial={initial} scope={scope} sync={sync} />;
}

function Runner({ engine, initial, scope, sync }: { engine: StudyEngine; initial: StudyPayload; scope: string; sync: AnswerSync }) {
  useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.version,
    () => 0,
  );
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const kwRef = useRef<HTMLTextAreaElement>(null);
  const [, setTick] = useState(0);
  const [syncState, setSyncState] = useState<{ pending: number; error: string | null }>({ pending: 0, error: null });
  const [reminder, setReminder] = useState(() => typingReminderDue(initial.settings.typing));
  const started = useRef(false);

  useEffect(() => {
    setSoundsEnabled(engine.settings.scaffold.sounds);
    initFallbackBeepFromStorage();
    sync.setListener(setSyncState);
    if (!started.current) {
      started.current = true;
      engine.start();
    }
    const iv = window.setInterval(() => {
      engine.tick();
      setTick((x) => x + 1);
    }, 250);
    const onBlur = () => engine.setAway(true);
    const onFocus = () => engine.setAway(false);
    const onVis = () => engine.setAway(document.visibilityState === "hidden");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [engine, sync]);

  const c = engine.cur;
  const phase = engine.phase;

  // focus the right box whenever the card or phase changes
  useEffect(() => {
    if (phase === "prompt") {
      if (c?.mode === "keywords") kwRef.current?.focus();
      else inputRef.current?.focus();
    }
  }, [phase, c?.card.id, c?.mode]);

  // global keys
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const cc = engine.cur;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (engine.guardOpen || engine.phase === "done") return;
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && !target.classList.contains("typebox-input")));
      if (inField) return;
      engine.activity();
      if (engine.phase === "prompt" && cc) {
        if (cc.mode === "self") {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            engine.submit(false);
          }
          return;
        }
        if ((cc.mode === "choice" || cc.mode === "tf") && cc.choices) {
          const idx = cc.mode === "tf" ? (e.key.toLowerCase() === "t" ? 0 : e.key.toLowerCase() === "f" ? 1 : Number(e.key) - 1) : Number(e.key) - 1;
          if (Number.isInteger(idx) && idx >= 0 && idx < cc.choices.length) {
            e.preventDefault();
            engine.choose(idx);
          } else if (e.key === "Escape") engine.submit(true);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          engine.hint(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          engine.submit(true);
        } else if (e.key === "Enter" && cc.mode !== "keywords") {
          e.preventDefault();
          engine.submit(false);
        }
        return;
      }
      if (engine.phase === "reveal" && cc) {
        if (e.key === "Enter") {
          e.preventDefault();
          engine.accept();
        } else if (e.key === "Escape") engine.skipRetype();
        else if (/^[1-4]$/.test(e.key) && (!cc.retype || cc.retype.done)) {
          e.preventDefault();
          engine.accept(Number(e.key) as 1 | 2 | 3 | 4);
        }
      }
    },
    [engine],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // Enter / Tab / Esc typed inside the answer box itself
  const boxKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && engine.gateBlocks()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (engine.phase === "prompt") engine.submit(false);
      else if (engine.phase === "reveal") engine.accept();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (engine.phase === "prompt") engine.hint(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (engine.phase === "prompt") engine.submit(true);
    }
  };

  const counts = engine.counts();
  const toast = engine.toast && engine.deps.now() - engine.toast.at < 3500 ? engine.toast.text : null;
  const total = engine.stats.answered + engine.queue.size;
  const pct = total ? engine.stats.answered / total : 0;

  const turnTypingOn = async () => {
    setReminder(false);
    await fetch("/api/study/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: { enabled: true } }) }).catch(() => {});
    window.location.reload();
  };
  const keepTypingOff = async () => {
    setReminder(false);
    await fetch("/api/study/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: { lastReminder: new Date().toISOString() } }) }).catch(() => {});
  };

  if (phase === "done") return <Summary engine={engine} scope={scope} sync={sync} syncState={syncState} />;
  if (phase === "loading" && !c) return <div className="panel"><p className="text-text-dim">Loading your cards…</p></div>;

  const state = c ? engine.states.get(c.card.id) ?? null : null;
  const kind = c ? (c.isFirstLook || !state || state.reps === 0 ? ["new", "NEW"] : state.state === 1 || state.state === 3 ? ["learn", state.state === 3 ? "RELEARN" : "LEARNING"] : ["review", "REVIEW"]) : null;

  return (
    <div className="st-wrap">
      {reminder && (
        <div className="banner" role="status">
          <span>Typing is switched off. Typing every answer is what trains the spelling the practical needs. Want to turn it back on?</span>
          <span className="btn-row">
            <button className="btn btn-primary" type="button" onClick={() => void turnTypingOn()}>Turn typing on</button>
            <button className="btn" type="button" onClick={() => void keepTypingOff()}>Keep it off this week</button>
          </span>
        </div>
      )}
      <div className="st-top">
        <div className="st-counts" aria-label="Cards left">
          <span className="c-new">New <b>{counts.new}</b></span>
          <span className="c-learn">Learning <b>{counts.learning + (c && c.entry.source === "learning" ? 1 : 0)}</b></span>
          <span className="c-review">Review <b>{counts.review}</b></span>
        </div>
        <div className="st-bar" aria-hidden><i style={{ transform: `scaleX(${pct})` }} /></div>
        {engine.opts_limit() ? <span className="chip">{engine.stats.answered}/{engine.opts_limit()}</span> : null}
        <span className={`combo-pill${engine.stats.combo >= 3 ? " on" : ""}`} aria-label="Combo">x{engine.stats.combo}</span>
        {syncState.pending > 0 && <span className="chip" title={syncState.error ?? "Saving…"}>{syncState.error ? "offline" : "saving"} {syncState.pending}</span>}
        <GearPopover scaffold={engine.settings.scaffold} onChanged={(s) => { engine.updateSettings({ ...engine.settings, scaffold: s }); setSoundsEnabled(s.sounds); }} />
        <Link className="btn" href="/study">End</Link>
      </div>

      {c && (
        <div className={`panel st-card${c.isBoss ? " boss" : ""}`} data-phase={phase}>
          <div className="chips">
            {c.isBoss && <span className="chip boss">Boss</span>}
            {c.isFollowup && <span className="chip follow">Follow-up</span>}
            {kind && !c.isFollowup && <span className={`chip ${kind[0]}`}>{kind[1]}</span>}
            {c.isFirstLook && <span className="chip">First look</span>}
            {c.mode === "type" && c.practice && <span className="chip ladder">Ladder: {c.step & 1 ? "fading" : ["copy", "skeleton", "first letters"][c.step >> 1]}</span>}
            {c.guard?.has && <span className="chip">{c.guard.armed ? "Trap letters ahead" : "Trap letters"}</span>}
            {(state?.lapses ?? 0) >= 3 && <span className="chip">{state!.lapses} lapses</span>}
          </div>
          {c.isBoss && <div className="boss-hp" aria-hidden><i style={{ transform: `scaleX(${c.typer && c.typer.state === "bad" ? 0.6 : 1})` }} /></div>}
          <CardFace
            card={c.card}
            courseSlug={initial.course.slug}
            revealed={phase === "reveal"}
            contextImage={c.parent?.image}
            heading={c.isFollowup && c.structure ? `${c.structure.name}${c.card.facet ? " · " + c.card.facet.replace(/_/g, " ") : ""}` : undefined}
          />

          {phase === "prompt" && (
            <div className="typezone">
              {c.guard && c.guard.armed && (
                <div className={`trap-banner l${c.guard.armedLevel}`} role="status">
                  {c.guard.armedLevel >= 2 ? "A trap you keep falling into: picture it, then type." : "Trap letters ahead: no hints here."}
                </div>
              )}
              {c.mode === "type" && c.typer && (
                <TypeBox
                  ref={inputRef}
                  typer={c.typer}
                  label="Type the answer"
                  blind={c.guard?.blindView() ?? null}
                  trapLevel={c.guard?.armedLevel ?? 0}
                  gated={c.guard?.gateActive(engine.deps.now()) ?? false}
                  drifting={engine.drift > 0}
                  placeholder={c.isFirstLook ? "Know it? Type it. Otherwise press Enter." : "Type the answer…"}
                  onChange={(v) => engine.input(v)}
                  onBeforeInput={(e) => {
                    if (engine.gateBlocks()) e.preventDefault();
                  }}
                  onKeyDown={boxKeys}
                />
              )}
              {c.mode === "keywords" && (
                <textarea
                  ref={kwRef}
                  className="kw-input"
                  aria-label="Your answer"
                  value={c.typed}
                  placeholder="Answer in your own words…"
                  onChange={(e) => engine.input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      engine.submit(false);
                    } else if (e.key === "Escape") engine.submit(true);
                  }}
                />
              )}
              {c.choices && (
                <div className="choice-grid" role="group" aria-label="Choices">
                  {c.choices.map((ch, i) => (
                    <button key={ch} type="button" className="choice-btn" onClick={() => engine.choose(i)}>
                      <span className="kbd">{c.mode === "tf" ? ch[0] : i + 1}</span> {ch}
                    </button>
                  ))}
                </div>
              )}
              {c.mode === "self" && (
                <p className="text-text-dim">Typing is off. Recall the answer, then reveal it and rate how well you knew it.</p>
              )}
              <div className="help-line">
                {engine.helpLine() && <span>{engine.helpLine()}</span>}
                {c.mode === "type" && (
                  <>
                    <span><span className="kbd">Tab</span> {c.isFirstLook ? "show it" : "ghost hint"}</span>
                    <span><span className="kbd">Enter</span> submit</span>
                    <span><span className="kbd">Esc</span> show answer</span>
                  </>
                )}
                {(c.mode === "keywords" || c.mode === "self") && <span><span className="kbd">Enter</span> {c.mode === "self" ? "show answer" : "submit"}</span>}
              </div>
              <div className="btn-row">
                {c.mode === "type" && engine.settings.scaffold.hints && !c.isFirstLook && <button className="btn" type="button" onClick={() => engine.hint(true)}>Hint</button>}
                {c.mode === "type" && <button className="btn" type="button" onClick={() => engine.submit(c.isFirstLook ? true : false)}>{c.isFirstLook ? "Show me" : "Submit"}</button>}
                {c.mode !== "self" && c.mode !== "choice" && c.mode !== "tf" && !c.isFirstLook && <button className="btn" type="button" onClick={() => engine.submit(true)}>Show answer</button>}
                {c.mode === "keywords" && <button className="btn btn-primary" type="button" onClick={() => engine.submit(false)}>Submit</button>}
                {c.mode === "self" && <button className="btn btn-primary" type="button" onClick={() => engine.submit(false)}>Show answer</button>}
              </div>
              {c.mode === "type" && c.typer && c.typer.hinted + c.typer.typos >= 0 && !c.isFirstLook && (
                <div className="meter" aria-label="Predicted rating">
                  rating:
                  {([1, 2, 3, 4] as const).map((g) => (
                    <span key={g} className={`g${g}${engine.predicted() === g ? " on" : ""}`}>{["Again", "Hard", "Good", "Easy"][g - 1]}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {phase === "reveal" && <Reveal engine={engine} c={c} courseSlug={initial.course.slug} />}
        </div>
      )}

      {engine.drift > 0 && <div className="drift-glow" aria-hidden />}
      {engine.driftBackMs > 8000 && phase === "prompt" && <p className="v-notes" style={{ textAlign: "center" }}>Welcome back. The clock waited for you ({Math.round(engine.driftBackMs / 1000)} s).</p>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {engine.guardOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Take a break">
          <div className="modal">
            <h2>Locked in for a while</h2>
            <p>Hyperfocus is great and your body is still here. Stand up, roll your shoulders, drink some water, look at something 20 feet away for 20 seconds.</p>
            <div className="btn-row">
              <button className="btn btn-primary" type="button" onClick={() => { emit("ui", { name: "break" }); router.push("/study"); }}>Take a break</button>
              <button className="btn" type="button" onClick={() => engine.resumeAfterGuard(true)}>One more round</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
