"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { buildKnownNames, gradeTyped } from "@/lib/study/grade";
import { emit } from "@/lib/feedback/events";
import { trackAtlas } from "@/lib/atlas/progress";
import "@/components/study/study.css"; // help-line, kbd, choice and verdict styles

// The 3D viewer, with names hidden: label="" (no title) and quiz (no hover names or labels).
const AtlasViewer = dynamic(() => import("./AtlasViewer"), {
  ssr: false,
  loading: () => <div className="flex h-[480px] items-center justify-center rounded-card border border-panel-border text-sm text-text-dim">Loading 3D model…</div>,
}) as unknown as ComponentType<Record<string, unknown>>;

export type QuizItem = { slug: string; name: string; synonyms: string[]; meshIds: string[]; unit: string | null; region: string | null; studied: boolean };
type Pool = "all" | "units" | "studied";
type AnswerMode = "type" | "choice";
type Outcome = { item: QuizItem; result: "right" | "close" | "wrong" | "skip"; typed: string };

const BEST_KEY = "anki.atlasQuiz.best.v1";

function shuffle<T>(a: T[]): T[] {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function readBest(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function QuizGame({ items, names, units }: { items: QuizItem[]; names: Array<{ slug: string; canonical_name: string; synonyms: string[] }>; units: Array<{ slug: string; title: string }> }) {
  const known = useMemo(() => buildKnownNames(names), [names]);
  const [phase, setPhase] = useState<"setup" | "play" | "done">("setup");
  const [pool, setPool] = useState<Pool>("all");
  const [pickedUnits, setPickedUnits] = useState<string[]>(() => units.map((u) => u.slug));
  const [mode, setMode] = useState<AnswerMode>("type");
  const [length, setLength] = useState(10);
  const [round, setRound] = useState<QuizItem[]>([]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [choices, setChoices] = useState<QuizItem[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [best, setBest] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const studiedCount = items.filter((x) => x.studied).length;
  const poolItems = useMemo(
    () => items.filter((x) => (pool === "all" ? true : pool === "studied" ? x.studied : !!x.unit && pickedUnits.includes(x.unit))),
    [items, pool, pickedUnits],
  );
  const cur = phase === "play" ? round[i] : undefined;
  const answered = phase === "play" && outcomes.length > i;
  const last = answered ? outcomes[i] : undefined;
  const key = `${pool}:${pool === "units" ? pickedUnits.join("+") : ""}:${mode}:${length}`;

  useEffect(() => {
    const t = window.setTimeout(() => setBest(readBest()), 0);
    return () => window.clearTimeout(t);
  }, []);

  const makeChoices = useCallback(
    (item: QuizItem, from: QuizItem[]) => {
      const others = from.filter((x) => x.slug !== item.slug && x.name !== item.name);
      const near = shuffle(others.filter((x) => x.region && x.region === item.region));
      const rest = shuffle(others.filter((x) => !near.includes(x)));
      return shuffle([item, ...[...near, ...rest].slice(0, 3)]);
    },
    [],
  );

  const start = () => {
    const r = shuffle(poolItems).slice(0, Math.min(length, poolItems.length));
    if (!r.length) return;
    setRound(r);
    setI(0);
    setTyped("");
    setOutcomes([]);
    setStreak(0);
    setBestStreak(0);
    setChoices(makeChoices(r[0], items));
    setPhase("play");
  };

  const record = (result: Outcome["result"], text: string) => {
    if (!cur || answered) return;
    setOutcomes((o) => [...o, { item: cur, result, typed: text }]);
    if (result === "right" || result === "close") {
      const s = streak + 1;
      setStreak(s);
      setBestStreak((b) => Math.max(b, s));
      emit(result === "right" ? "correct" : "near_miss", { combo: s });
      trackAtlas({ type: "quiz_answer", slug: cur.slug, correct: true, streak: s, pool: pool === "units" ? `units:${pickedUnits.join("+")}` : pool, mode });
    } else {
      setStreak(0);
      emit("wrong", {});
      trackAtlas({ type: "quiz_answer", slug: cur.slug, correct: false, streak: 0, pool: pool === "units" ? `units:${pickedUnits.join("+")}` : pool, mode });
    }
  };

  const submitTyped = () => {
    if (!cur || answered) return;
    if (!typed.trim()) return record("skip", "");
    const v = gradeTyped(typed, { answer: cur.name, accept: cur.synonyms }, { knownNames: known, ownSlug: cur.slug });
    record(v.result === "correct" ? "right" : v.result === "near_miss" ? "close" : "wrong", typed);
  };

  const next = () => {
    if (!answered) return;
    if (i + 1 >= round.length) {
      const score = outcomes.filter((o) => o.result === "right" || o.result === "close").length;
      const b = { ...readBest() };
      if (!(key in b) || score > b[key]) {
        b[key] = score;
        try {
          window.localStorage.setItem(BEST_KEY, JSON.stringify(b));
        } catch {
          /* ignore */
        }
      }
      setBest(b);
      setPhase("done");
      emit("session_done", { cards: round.length });
      trackAtlas({ type: "quiz_finished", correct: score, total: round.length, pool: pool === "units" ? `units:${pickedUnits.join("+")}` : pool });
      return;
    }
    const n = i + 1;
    setI(n);
    setTyped("");
    setChoices(makeChoices(round[n], items));
  };

  // keys: Enter answer / next, Esc "don't know", 1-4 pick
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (phase === "setup" && e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        e.preventDefault();
        start();
      } else if (phase === "done" && e.key === "Enter") {
        e.preventDefault();
        start();
      } else if (phase === "play") {
        if (answered && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          next();
        } else if (!answered && e.key === "Escape") {
          e.preventDefault();
          record("skip", "");
        } else if (!answered && mode === "choice" && /^[1-4]$/.test(e.key)) {
          const c = choices[Number(e.key) - 1];
          if (c) record(c.slug === cur?.slug ? "right" : "wrong", c.name);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (phase === "play" && !answered && mode === "type") inputRef.current?.focus();
  }, [phase, i, answered, mode]);

  if (!items.length) return <p className="panel text-text-dim">No structures with an exact 3D model yet.</p>;

  if (phase === "setup") {
    const toggleUnit = (slug: string) => setPickedUnits((u) => (u.includes(slug) ? u.filter((x) => x !== slug) : [...u, slug]));
    const opt = (on: boolean) => `rounded-sm border px-3 py-2 text-left text-sm ${on ? "border-accent text-accent" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`;
    return (
      <div className="panel grid max-w-3xl gap-5">
        <p className="text-text-dim">A structure lights up in the 3D brain. Name it. Rotate, zoom and cut the brain as much as you like.</p>
        <div className="grid gap-2">
          <p className="label">Which structures</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" className={opt(pool === "all")} onClick={() => setPool("all")}>
              <b>Free for all</b>
              <br />
              every structure in the 3D model ({items.length})
            </button>
            <button type="button" className={opt(pool === "units")} onClick={() => setPool("units")}>
              <b>By unit</b>
              <br />
              pick the units below
            </button>
            <button type="button" className={opt(pool === "studied")} onClick={() => setPool("studied")} disabled={!studiedCount}>
              <b>Ones I&apos;ve studied</b>
              <br />
              {studiedCount ? `${studiedCount} structures from your cards` : "study some cards first"}
            </button>
          </div>
          {pool === "units" && (
            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <label key={u.slug} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={pickedUnits.includes(u.slug)} onChange={() => toggleUnit(u.slug)} />
                  {u.title}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <p className="label">Answer by</p>
            <div className="flex gap-2">
              <button type="button" className={opt(mode === "type")} onClick={() => setMode("type")}>Typing the name</button>
              <button type="button" className={opt(mode === "choice")} onClick={() => setMode("choice")}>Picking from 4</button>
            </div>
          </div>
          <div className="grid gap-2">
            <p className="label">Round</p>
            <div className="flex gap-2">
              {[10, 20, 40].map((n) => (
                <button key={n} type="button" className={opt(length === n)} onClick={() => setLength(n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={start} disabled={!poolItems.length}>
            Start ({Math.min(length, poolItems.length)} structures)
          </button>
          <span className="help-line"><span className="kbd">Enter</span> start</span>
          {best[key] !== undefined && <span className="text-sm text-text-dim">Best with these settings: {best[key]}/{Math.min(length, poolItems.length)}</span>}
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const score = outcomes.filter((o) => o.result === "right" || o.result === "close").length;
    const missed = outcomes.filter((o) => o.result === "wrong" || o.result === "skip");
    return (
      <div className="panel grid max-w-3xl gap-4">
        <p className="card-kind">Round complete</p>
        <h2 className="font-display text-3xl">
          {score} / {outcomes.length}
        </h2>
        <p className="text-text-dim">Best streak {bestStreak}{best[key] !== undefined ? ` · best round with these settings ${best[key]}` : ""}</p>
        {missed.length > 0 && (
          <div className="info-panel">
            <h4>Worth another look</h4>
            <ul className="grid gap-1">
              {missed.map((o) => (
                <li key={o.item.slug}>
                  <Link className="text-accent-2" href={`/atlas?s=${encodeURIComponent(o.item.slug)}`} target="_blank">{o.item.name}</Link>
                  {o.typed && <span className="text-text-dim"> (you said {o.typed})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={start}>Play again</button>
          <button type="button" className="btn" onClick={() => setPhase("setup")}>Change settings</button>
          <Link className="btn" href="/atlas">Back to the atlas</Link>
        </div>
        <p className="help-line"><span className="kbd">Enter</span> play again</p>
      </div>
    );
  }

  if (!cur) return null;
  const score = outcomes.filter((o) => o.result === "right" || o.result === "close").length;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
        <span>
          {i + 1} / {round.length}
        </span>
        <span className="text-good">score {score}</span>
        <span className={`combo-pill${streak >= 3 ? " on" : ""}`}>streak {streak}</span>
        <button type="button" className="btn ml-auto" onClick={() => setPhase("setup")}>Quit</button>
      </div>
      <AtlasViewer key={cur.slug} structureIds={cur.meshIds} mode="focus" label="" quiz height={480} />
      <div className="panel grid gap-3">
        {!answered ? (
          mode === "type" ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
            >
              <input
                ref={inputRef}
                className="input min-w-0 flex-1"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Name the highlighted structure…"
                aria-label="Name the highlighted structure"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button type="submit" className="btn btn-primary">Answer</button>
              <button type="button" className="btn" onClick={() => record("skip", "")}>Don&apos;t know</button>
            </form>
          ) : (
            <div className="choice-grid">
              {choices.map((c, k) => (
                <button key={c.slug} type="button" className="choice-btn" onClick={() => record(c.slug === cur.slug ? "right" : "wrong", c.name)}>
                  <span className="kbd">{k + 1}</span> {c.name}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="grid gap-2">
            <p className="flex flex-wrap items-baseline gap-3">
              <span className={`v-word ${last?.result === "right" ? "g4" : last?.result === "close" ? "g2" : "g1"}`}>
                {last?.result === "right" ? "YES" : last?.result === "close" ? "CLOSE" : last?.result === "skip" ? "HERE IT IS" : "NOT QUITE"}
              </span>
              <b className="text-lg">{cur.name}</b>
              {last?.result === "close" && <span className="v-notes">watch the spelling: you typed {last.typed}</span>}
              {last?.result === "wrong" && last.typed && <span className="v-notes">you said {last.typed}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={next}>{i + 1 >= round.length ? "See results" : "Next"}</button>
              <Link className="text-sm text-accent-2" href={`/atlas?s=${encodeURIComponent(cur.slug)}`} target="_blank">Open it in the atlas</Link>
              <span className="help-line"><span className="kbd">Enter</span> next</span>
            </div>
          </div>
        )}
        {!answered && (
          <p className="help-line">
            {mode === "type" ? <span><span className="kbd">Enter</span> answer</span> : <span><span className="kbd">1</span>-<span className="kbd">4</span> pick</span>}
            <span><span className="kbd">Esc</span> don&apos;t know</span>
            <span>drag to rotate, scroll to zoom, cuts at the top right</span>
          </p>
        )}
      </div>
    </div>
  );
}
