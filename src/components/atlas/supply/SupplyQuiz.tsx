"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trackAtlas } from "@/lib/atlas/progress";
import { LazyAtlasViewer } from "./lazy";
import { ARTERY_KEYS, SUPPLY, TERRITORY_ARTERIES, artShort, type SupplyUnit } from "./supply-data";

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/* ---------- quiz: which artery supplies this? ---------- */
type Q = { unit: SupplyUnit; picked: string | null };

export function SupplyQuiz({ onExit }: { onExit: () => void }) {
  const pool = useMemo(() => SUPPLY.units.filter((u) => !u.variants && u.arteries[0] !== "ica" && !u.shell), []);
  const [order, setOrder] = useState(() => shuffle(pool));
  const [i, setI] = useState(0);
  const [q, setQ] = useState<Q>({ unit: order[0], picked: null });
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(0);

  const answer = useCallback(
    (id: string) => {
      if (q.picked) return;
      setQ({ ...q, picked: id });
      setDone((d) => d + 1);
      if (q.unit.arteries.includes(id)) setRight((r) => r + 1);
      trackAtlas({ type: "supply_answer", slug: q.unit.slug ?? "", correct: q.unit.arteries.includes(id), artery: id });
    },
    [q],
  );
  const next = useCallback(() => {
    let o = order;
    let n = i + 1;
    if (n >= o.length) {
      o = shuffle(pool);
      setOrder(o);
      n = 0;
    }
    setI(n);
    setQ({ unit: o[n], picked: null });
  }, [order, i, pool]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (q.picked) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          next();
        }
        return;
      }
      const k = ARTERY_KEYS.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < TERRITORY_ARTERIES.length) answer(TERRITORY_ARTERIES[k].id);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [q.picked, answer, next, onExit]);

  const u = q.unit;
  const correct = q.picked ? u.arteries.includes(q.picked) : null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
        <span>question {done + (q.picked ? 0 : 1)}</span>
        <span className="text-good">
          {right} / {done} correct
        </span>
        <button type="button" className="btn ml-auto" onClick={onExit}>
          Back to the map
        </button>
      </div>
      <LazyAtlasViewer key={u.name} structureIds={u.meshes} mode="focus" label={q.picked ? u.name : ""} quiz={!q.picked} height={480} />
      <div className="panel grid gap-3">
        <p className="text-sm text-text-dim">Which artery supplies the highlighted structure?</p>
        <div className="choice-grid">
          {TERRITORY_ARTERIES.map((a, k) => {
            const isRight = !!q.picked && u.arteries.includes(a.id);
            const isPicked = q.picked === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={!!q.picked}
                onClick={() => answer(a.id)}
                className={`choice-btn flex items-center gap-2 ${isPicked ? "picked" : ""} ${isRight ? "border-good" : isPicked ? "border-again" : ""}`}
              >
                <span className="kbd flex-none">{ARTERY_KEYS[k]}</span>
                <span>{a.name}</span>
              </button>
            );
          })}
        </div>
        {q.picked && (
          <div className="grid gap-1.5" aria-live="polite">
            <p className={correct ? "text-good" : "text-again"}>
              {correct ? (u.arteries[0] === q.picked ? "Correct." : "Correct (a secondary supply).") : "Not quite."} {u.name}: {artShort(u.arteries)}.
            </p>
            {u.course && <p className="text-sm text-text-dim">Course note: {u.course}</p>}
            {u.note && <p className="text-sm text-text-dim">{u.note}</p>}
            <div>
              <button type="button" className="btn btn-primary" onClick={next}>
                Next <span className="kbd">Enter</span>
              </button>
            </div>
          </div>
        )}
        <p className="help-line">
          <span>
            <span className="kbd">1</span>-<span className="kbd">e</span> answer
          </span>
          <span>
            <span className="kbd">Enter</span> next
          </span>
          <span>
            <span className="kbd">Esc</span> back
          </span>
        </p>
      </div>
    </div>
  );
}
