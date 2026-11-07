"use client";

import "@/components/study/study.css"; // help-line, kbd, chip, choice styles
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AtlasOverlay } from "../AtlasViewer";
import { LazyAtlasViewer } from "./lazy";
import { ARTERIES, ARTERY, ARTERY_KEYS, MESH_UNIT, SUPPLY, TERRITORY_ARTERIES, artShort, unitArteries, type SupplyUnit } from "./supply-data";

type Selected = { kind: "unit"; unit: SupplyUnit } | { kind: "artery"; id: string } | null;

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

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-3 w-3 flex-none rounded-sm border border-panel-border" style={{ background: color }} />;
}

export function SupplyMap() {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(ARTERIES.map((a) => a.id)));
  const [focus, setFocus] = useState<string | null>(null);
  const [vessels, setVessels] = useState(true);
  const [variant, setVariant] = useState("lab16");
  const [selected, setSelected] = useState<Selected>(null);
  const [quizOn, setQuizOn] = useState(false);

  const overlays = useMemo<AtlasOverlay[]>(() => {
    const groups = new Map<string, string[]>();
    const add = (key: string, ids: string[]) => groups.set(key, [...(groups.get(key) ?? []), ...ids]);
    for (const u of SUPPLY.units) {
      const a = unitArteries(u, variant)[0];
      if (enabled.has(a)) add(u.shell ? `${a}~s` : a, u.meshes);
    }
    if (vessels) for (const [mesh, a] of Object.entries(SUPPLY.vessels)) if (enabled.has(a)) add(`${a}~v`, [mesh]);
    return [...groups].map(([key, ids]) => {
      const [a, kind] = key.split("~");
      const dim = focus !== null && focus !== a;
      const opacity = kind === "s" ? (dim ? 0.06 : 0.38) : kind === "v" ? (dim ? 0.2 : 1) : dim ? 0.1 : 0.95;
      return { key, ids, color: ARTERY.get(a)?.color ?? "#999999", opacity };
    });
  }, [enabled, focus, vessels, variant]);

  const tipText = useCallback((id: string, name: string) => {
    const a = SUPPLY.vessels[id];
    if (a) return `${name} (artery: ${ARTERY.get(a)?.short})`;
    const u = MESH_UNIT.get(id);
    return u ? `${name}: ${artShort(unitArteries(u, variant))}` : name;
  }, [variant]);

  const onPick = useCallback((id: string) => {
    const a = SUPPLY.vessels[id];
    if (a) return setSelected({ kind: "artery", id: a });
    const u = MESH_UNIT.get(id);
    if (u) setSelected({ kind: "unit", unit: u });
  }, []);

  const toggle = (id: string) =>
    setEnabled((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const focusArtery = useCallback((id: string) => {
    setFocus((f) => (f === id ? null : id));
    setSelected((s) => (s?.kind === "artery" && s.id === id ? null : { kind: "artery", id }));
    setEnabled((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, []);

  useEffect(() => {
    if (quizOn) return;
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = ARTERY_KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && i < ARTERIES.length) focusArtery(ARTERIES[i].id);
      else if (e.key === "Escape") {
        setFocus(null);
        setSelected(null);
      } else if (e.key.toLowerCase() === "v") setVessels((v) => !v);
      else if (e.key.toLowerCase() === "m") setQuizOn(true);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [quizOn, focusArtery]);

  if (quizOn) return <SupplyQuiz onExit={() => setQuizOn(false)} />;

  const plic = SUPPLY.units.find((u) => u.variants);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-2">
        <LazyAtlasViewer
          structureIds={[]}
          mode="context"
          label=""
          height={560}
          overlays={overlays}
          hideLabels
          pickMode="mesh"
          tipText={tipText}
          onPickMesh={onPick}
        />
        <p className="help-line">
          <span>
            <span className="kbd">click</span> a structure or artery for details
          </span>
          <span>
            <span className="kbd">1</span>-<span className="kbd">r</span> solo an artery
          </span>
          <span>
            <span className="kbd">v</span> artery meshes
          </span>
          <span>
            <span className="kbd">m</span> quiz
          </span>
          <span>
            <span className="kbd">Esc</span> clear
          </span>
        </p>
        <p className="text-xs text-text-faint">Deep structures sit inside the see-through cortex; use the cut buttons on the viewer to open the brain. Pons, midbrain, medulla and thalamus are drawn as a faint shell around their nuclei.</p>
      </div>

      <div className="grid content-start gap-3">
        <div className="panel grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Arterial territories</h2>
            <button type="button" className="btn ml-auto" onClick={() => setQuizOn(true)}>
              Quiz: which artery?
            </button>
          </div>
          <ul className="grid gap-1" aria-label="Arteries">
            {ARTERIES.map((a, i) => {
              const on = enabled.has(a.id);
              return (
                <li key={a.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} aria-label={`Show ${a.name}`} className="accent-accent" />
                  <button
                    type="button"
                    aria-pressed={focus === a.id}
                    onClick={() => focusArtery(a.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm border px-2 py-1 text-left text-sm ${focus === a.id ? "border-accent text-text" : "border-transparent text-text-dim hover:border-panel-border-hi"} ${on ? "" : "opacity-50"}`}
                  >
                    <Swatch color={a.color} />
                    <span className="truncate">{a.name}</span>
                    <span className="kbd ml-auto flex-none">{ARTERY_KEYS[i]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setEnabled(new Set(ARTERIES.map((a) => a.id)))}>
              All on
            </button>
            <button type="button" className="btn" onClick={() => setEnabled(new Set())}>
              All off
            </button>
            <label className="flex items-center gap-1.5 text-sm text-text-dim">
              <input type="checkbox" checked={vessels} onChange={(e) => setVessels(e.target.checked)} className="accent-accent" />
              Artery meshes
            </label>
          </div>
          <p className="text-xs text-text-faint">The atlas has no mesh for the lenticulostriate, anterior choroidal or spinal arteries; their territories are still coloured.</p>
        </div>

        {plic && (
          <div className="panel grid gap-2">
            <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Open question: {SUPPLY.decisions[0]?.title}</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Reading of the posterior limb of the internal capsule">
              {plic.variants!.map((v) => (
                <button key={v.id} type="button" aria-pressed={variant === v.id} onClick={() => setVariant(v.id)} className={`btn ${variant === v.id ? "btn-primary" : ""}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-dim">{SUPPLY.decisions[0]?.text}</p>
          </div>
        )}

        <InfoPanel selected={selected} variant={variant} onUnit={(u) => setSelected({ kind: "unit", unit: u })} />
      </div>
    </div>
  );
}

function InfoPanel({ selected, variant, onUnit }: { selected: Selected; variant: string; onUnit: (u: SupplyUnit) => void }) {
  if (!selected) {
    return (
      <div className="panel text-sm text-text-dim" aria-live="polite">
        Click a coloured structure or an artery in the 3D view, or an artery in the legend.
      </div>
    );
  }
  if (selected.kind === "artery") {
    const a = ARTERY.get(selected.id);
    if (!a) return null;
    const primary = SUPPLY.units.filter((u) => unitArteries(u, variant)[0] === a.id);
    const also = SUPPLY.units.filter((u) => unitArteries(u, variant).slice(1).includes(a.id));
    return (
      <div className="panel grid gap-2" aria-live="polite">
        <h2 className="flex items-center gap-2 font-display text-base text-accent">
          <Swatch color={a.color} />
          {a.name}
        </h2>
        <p className="text-sm">{a.territory}</p>
        {primary.length > 0 && (
          <div>
            <p className="eyebrow">Main supply of</p>
            <p className="flex flex-wrap gap-1.5 pt-1">
              {primary.map((u) => (
                <button key={u.name} type="button" className="chip hover:border-panel-border-hi" onClick={() => onUnit(u)}>
                  {u.name}
                </button>
              ))}
            </p>
          </div>
        )}
        {also.length > 0 && (
          <div>
            <p className="eyebrow">Also contributes to</p>
            <p className="flex flex-wrap gap-1.5 pt-1">
              {also.map((u) => (
                <button key={u.name} type="button" className="chip hover:border-panel-border-hi" onClick={() => onUnit(u)}>
                  {u.name}
                </button>
              ))}
            </p>
          </div>
        )}
      </div>
    );
  }
  const u = selected.unit;
  const arts = unitArteries(u, variant);
  return (
    <div className="panel grid gap-2" aria-live="polite">
      <h2 className="font-display text-base text-accent">{u.name}</h2>
      <p className="flex flex-wrap gap-1.5">
        {arts.map((id, i) => {
          const a = ARTERY.get(id)!;
          return (
            <span key={id} className="chip flex items-center gap-1.5" style={{ color: "var(--text)" }}>
              <Swatch color={a.color} />
              {a.name}
              {i === 0 && arts.length > 1 ? " (main)" : ""}
            </span>
          );
        })}
      </p>
      {u.course && (
        <p className="text-sm">
          <span className="eyebrow">Course note </span>
          {u.course}
        </p>
      )}
      {u.note && <p className="text-sm text-text-dim">{u.note}</p>}
      {u.variants && (
        <ul className="grid gap-1 text-sm">
          {u.variants.map((v) => (
            <li key={v.id} className={v.id === variant ? "text-text" : "text-text-dim"}>
              <strong>{v.label}</strong>: {artShort(v.arteries)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- quiz: which artery supplies this? ---------- */
type Q = { unit: SupplyUnit; picked: string | null };

function SupplyQuiz({ onExit }: { onExit: () => void }) {
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
