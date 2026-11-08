"use client";

import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Check } from "lucide-react";
import { ATLAS_FACTS } from "./atlasFacts";
import "./atlas-ui.css";

export type LoaderStage = {
  id: string;
  label: string;
  /** Live detail for the stage, e.g. "0.8 / 1.3 MB" or "42 meshes". */
  detail?: string;
  state: "todo" | "active" | "done";
};

/** "x.x / y.y MB" for a byte progress. */
export const mbText = (loaded: number, total: number) => `${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`;

/**
 * Builds the stage list from booleans: the first unfinished stage is the active one.
 * Usage: stagesFrom([["model", "Fetching the brain model", modelDone, "0.8 / 1.3 MB"], ...])
 */
export function stagesFrom(items: [id: string, label: string, done: boolean, detail?: string][]): LoaderStage[] {
  let activeSet = false;
  return items.map(([id, label, done, detail]) => {
    const state: LoaderStage["state"] = done ? "done" : activeSet ? "todo" : "active";
    if (state === "active") activeSet = true;
    return { id, label, detail: state === "todo" ? undefined : detail, state };
  });
}

/** Progress of everything drei's loaders are fetching right now (textures, GLBs through useGLTF...), for other 3D pages. */
export function useDreiLoadProgress() {
  const { progress, loaded, total, item, active } = useProgress();
  return { progress: progress / 100, loaded, total, item, active };
}

function Motif() {
  // a small neuron network; nodes pulse out of phase (opacity only)
  const nodes: [number, number][] = [[18, 62], [44, 30], [76, 52], [104, 22], [128, 58], [96, 84], [52, 88]];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 0], [1, 6], [2, 4]];
  return (
    <svg viewBox="0 0 146 110" className="atl-motif" aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 5 : 3.6} fill="currentColor" className="atl-node" style={{ animationDelay: `${i * 0.23}s` }} />
      ))}
    </svg>
  );
}

/**
 * Loading screen with real progress: a tick per stage, the current stage highlighted, an overall bar, rotating facts and a light
 * neuron motif (CSS only; still under prefers-reduced-motion and html[data-effects="off"]).
 * Props are stable: stages (see stagesFrom), progress 0..1 (omit to derive from the stages), label.
 */
export function AtlasLoader({ stages, progress, label = "Loading the atlas", className = "" }: { stages: LoaderStage[]; progress?: number; label?: string; className?: string }) {
  const [fact, setFact] = useState(0);
  useEffect(() => {
    const t0 = window.setTimeout(() => setFact(Math.floor(Math.random() * ATLAS_FACTS.length)), 0);
    const t = window.setInterval(() => setFact((f) => (f + 1) % ATLAS_FACTS.length), 5200);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(t);
    };
  }, []);
  const doneN = stages.filter((s) => s.state === "done").length;
  const p = Math.max(0.03, Math.min(1, progress ?? (stages.length ? (doneN + 0.5) / stages.length : 0)));
  return (
    <div className={`atl-loader ${className}`} role="status" aria-live="polite" aria-label={label}>
      <div className="atl-loader-card">
        <div className="flex items-center gap-4">
          <Motif />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base tracking-wide text-text">{label}</p>
            <div className="atl-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
              <div className="atl-bar-fill" style={{ transform: `scaleX(${p})` }} />
            </div>
            <p className="mt-1 font-mono text-[11px] text-text-faint">{Math.round(p * 100)}%</p>
          </div>
        </div>
        <ol className="mt-3 grid gap-1 text-sm">
          {stages.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 ${s.state === "active" ? "text-text" : s.state === "done" ? "text-text-dim" : "text-text-faint"}`}>
              <span className={`atl-tick ${s.state}`} aria-hidden="true">{s.state === "done" ? <Check size={11} /> : null}</span>
              <span>{s.label}</span>
              {s.detail && <span className="ml-auto font-mono text-[11px] text-text-dim">{s.detail}</span>}
            </li>
          ))}
        </ol>
        <p key={fact} className="atl-fact mt-3 border-t border-panel-border pt-2 text-xs leading-relaxed text-text-dim">
          <span className="font-mono uppercase tracking-wider text-accent-2">Did you know </span>
          {ATLAS_FACTS[fact]}
        </p>
      </div>
    </div>
  );
}
