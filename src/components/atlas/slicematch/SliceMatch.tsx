"use client";

import "@/components/study/study.css"; // help-line, kbd styles
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SliceViewer, { type SliceOverlay } from "../SliceViewer";
import { LazyAtlasViewer } from "../supply/lazy";
import { loadAtlas2, type Atlas2 } from "@/lib/atlas/slices";
import { trackAtlas } from "@/lib/atlas/progress";
import { overlayPalette } from "@/lib/atlas/palette";
import { readCssColor } from "@/lib/atlas/theme";
import { PLANE, PLANES, SLIDER_RANGE, TARGET_RANGE, mmPoint, mmToWorld, pointsFor, type Plane } from "./coords";

const ROUNDS = 5;
const BEST_KEY = "anki-plus.slice-match.best";

type Target = { plane: Plane; mm: number };
type Result = { target: Target; plane: Plane; mm: number; points: number; dist: number | null };

function randomTarget(prev: Target | null): Target {
  for (;;) {
    const plane = PLANES[Math.floor(Math.random() * 3)].id;
    const [lo, hi] = TARGET_RANGE[plane];
    let mm = lo + Math.round(Math.random() * (hi - lo));
    if (plane === "sagittal" && Math.random() < 0.5) mm = -mm;
    if (!prev || prev.plane !== plane || Math.abs(prev.mm - mm) > 15) return { plane, mm };
  }
}

/** Curriculum structures that the plane passes through, most central first. */
function keyStructures(atlas: Atlas2, t: Target): { slug: string; name: string }[] {
  const k = t.plane === "sagittal" ? 0 : t.plane === "coronal" ? 1 : 2;
  const rows: { slug: string; name: string; d: number }[] = [];
  for (const [slug, s] of Object.entries(atlas.structures)) {
    if (s.group || !s.bbox || !s.centroid || (s.quality !== "exact" && s.quality !== "derived")) continue;
    if ((s.volume_mm3 ?? 0) > 120_000) continue; // whole lobes tell nothing about the level
    const lo = s.bbox[0][k];
    const hi = s.bbox[1][k];
    if (t.mm < lo || t.mm > hi) continue;
    const c = s.centroid[k];
    const d = t.plane === "sagittal" && s.paired ? Math.min(Math.abs(c - t.mm), Math.abs(-c - t.mm)) : Math.abs(c - t.mm);
    rows.push({ slug, name: s.name, d: d / Math.max(2, (hi - lo) / 2) });
  }
  return rows.sort((a, b) => a.d - b.d).slice(0, 8);
}

function readBest(): string {
  try {
    return localStorage.getItem(BEST_KEY) ?? "";
  } catch {
    return "";
  }
}
function useBest(): [number | null, (v: number) => void] {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("slice-match-best", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("slice-match-best", cb);
      };
    },
    readBest,
    () => "",
  );
  const set = useCallback((v: number) => {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch {
      /* private mode: the best score just is not kept */
    }
    window.dispatchEvent(new Event("slice-match-best"));
  }, []);
  return [raw === "" ? null : Number(raw), set];
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

export function SliceMatch() {
  const [atlas, setAtlas] = useState<Atlas2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>(() => randomTarget(null));
  const [plane, setPlane] = useState<Plane>("coronal");
  const [mm, setMm] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [best, saveBest] = useBest();
  const [cols] = useState(() =>
    typeof document === "undefined"
      ? null
      : { accent: "#" + readCssColor("--accent", "#ff2a6d").getHexString(), mine: "#" + readCssColor("--accent-2", "#22d3ee").getHexString(), palette: overlayPalette() },
  );

  useEffect(() => {
    let alive = true;
    loadAtlas2()
      .then((a) => alive && setAtlas(a))
      .catch((e) => alive && setLoadError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const finished = results.length >= ROUNDS && revealed;
  const total = results.reduce((s, r) => s + r.points, 0);
  const [lo, hi] = SLIDER_RANGE[plane];

  const check = useCallback(() => {
    if (revealed) return;
    const same = plane === target.plane;
    // the MRI template is left-right symmetric, so a sagittal section is scored by its distance from the midline (the
    // mirror-image side looks the same and used to score 0)
    const dist = !same ? null : plane === "sagittal" ? Math.abs(Math.abs(mm) - Math.abs(target.mm)) : Math.abs(mm - target.mm);
    const points = pointsFor(same, dist ?? 0);
    if (dist !== null) trackAtlas({ type: "slice_match_round", errorMm: dist });
    setResults((r) => [...r, { target, plane, mm, points, dist }]);
    setRevealed(true);
  }, [revealed, plane, mm, target]);

  const next = useCallback(() => {
    if (results.length >= ROUNDS) {
      const sum = results.reduce((s, r) => s + r.points, 0);
      if (best === null || sum > best) saveBest(sum);
      setResults([]);
      setRound(0);
    } else setRound((n) => n + 1);
    setTarget((t) => randomTarget(t));
    setRevealed(false);
  }, [results, best, saveBest]);

  // the best score is stored when the last round is revealed
  useEffect(() => {
    if (finished && (best === null || total > best)) saveBest(total);
  }, [finished, total, best, saveBest]);

  const pickPlane = useCallback((p: Plane) => {
    setPlane(p);
    setMm((v) => {
      const [a, b] = SLIDER_RANGE[p];
      return Math.min(b, Math.max(a, p === "sagittal" ? Math.abs(v) : v));
    });
  }, []);
  const step = useCallback(
    (d: number) => setMm((v) => Math.min(SLIDER_RANGE[plane][1], Math.max(SLIDER_RANGE[plane][0], v + d))),
    [plane],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter" || (e.key === " " && revealed)) {
        e.preventDefault();
        if (revealed) next();
        else check();
        return;
      }
      if (revealed) return;
      const p = PLANES.find((x) => x.key === e.key.toLowerCase());
      if (p) return pickPlane(p.id);
      const big = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "]") {
        e.preventDefault();
        step(big);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "[") {
        e.preventDefault();
        step(-big);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [revealed, check, next, pickPlane, step]);

  const keys = useMemo(() => (atlas && revealed ? keyStructures(atlas, target) : []), [atlas, revealed, target]);
  const sliceOverlays = useMemo<SliceOverlay[]>(() => keys.map((k, i) => ({ slug: k.slug, color: cols?.palette[i % (cols?.palette.length || 1)] ?? "#ff2a6d" })), [keys, cols]);

  if (loadError) {
    return (
      <div className="panel text-sm text-text-dim" role="alert">
        The MRI atlas could not be loaded ({loadError}).
      </div>
    );
  }

  const shownPlane = revealed ? target.plane : plane;
  // (a sagittal target is shown on the right hemisphere, where your plane is: the two sides are mirror images)
  const cutPlane = revealed ? { plane: target.plane, mm: target.plane === "sagittal" ? Math.abs(target.mm) : target.mm } : { plane, mm };
  const last = results[results.length - 1];
  // the brain is cut solid at the plane shown, so that plane needs no sheet over its face (it washed the section out); after
  // the reveal the cut is the target and your plane is the one translucent sheet
  const guides = cols
    ? revealed
      ? [{ axis: PLANE[plane].axis, position: mmToWorld(plane, mm), color: cols.mine }]
      : []
    : [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
        <span>
          Round {Math.min(round + 1, ROUNDS)} / {ROUNDS}
        </span>
        <span className="text-good">score {total}</span>
        <span className="text-text-dim">best {best === null ? "none yet" : `${best} / ${ROUNDS * 100}`}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="grid gap-1.5">
          <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">
            {revealed ? `Target: ${PLANE[target.plane].label.toLowerCase()} section, ${target.plane === "sagittal" ? `${Math.abs(target.mm)} mm from the midline` : `${target.mm} mm`}` : "Target section (MRI, labels hidden)"}
          </h2>
          {atlas ? (
            <SliceViewer
              atlas={atlas}
              primary={null}
              primaryColor="#ffffff"
              overlays={sliceOverlays}
              view={target.plane === "axial" ? "axial" : target.plane}
              jumpTo={null}
              atMm={mmPoint(target.plane, target.mm)}
              blind={!revealed}
              height={520}
            />
          ) : (
            <div className="flex h-[520px] items-center justify-center rounded-card border border-panel-border text-sm text-text-dim" role="status">
              Loading MRI atlas...
            </div>
          )}
        </div>
        <div className="grid gap-1.5">
          <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">{revealed ? "Target plane on the brain (your plane in the second colour)" : "Your cutting plane"}</h2>
          <LazyAtlasViewer
            structureIds={[]}
            mode="context"
            label=""
            height={520}
            hideLabels
            // a transverse section is seen from above, where the brain is longest front to back: frame it a little wider
            zoom={shownPlane === "axial" ? 0.92 : 0.86}
            // a solid brain cut like Explore's: the section face itself (grey ribbon, white matter, ventricles, nuclei) is what
            // the student compares with the MRI; the see-through brain with coloured landmark blobs read as noise and loaded slowly
            solidCuts
            cut={{ axis: PLANE[cutPlane.plane].axis, position: mmToWorld(cutPlane.plane, cutPlane.mm), flip: PLANE[cutPlane.plane].flip }}
            view={PLANE[shownPlane].view}
            guides={guides}
          />
        </div>
      </div>

      <div className="panel grid gap-3">
        {!revealed ? (
          <>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Plane">
              {PLANES.map((p) => (
                <button key={p.id} type="button" aria-pressed={plane === p.id} onClick={() => pickPlane(p.id)} className={`btn ${plane === p.id ? "btn-primary" : ""}`}>
                  {p.label} <span className="kbd">{p.key}</span>
                </button>
              ))}
              <span className="ml-auto font-mono text-sm text-text-dim">{plane === "sagittal" ? `${Math.abs(mm)} mm from the midline` : `${mm} mm`}</span>
            </div>
            <input
              type="range"
              min={lo}
              max={hi}
              value={mm}
              onChange={(e) => setMm(Number(e.target.value))}
              aria-label={`${PLANE[plane].label} plane position in millimetres`}
              className="w-full accent-accent"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" onClick={check}>
                Check <span className="kbd">Enter</span>
              </button>
              <p className="help-line">
                <span>
                  <span className="kbd">c</span> <span className="kbd">s</span> <span className="kbd">t</span> plane
                </span>
                <span>
                  <span className="kbd">&larr;</span> <span className="kbd">&rarr;</span> move 1 mm (Shift: 5 mm)
                </span>
                <span>Match the MRI section; drag the 3D brain to look around.</span>
              </p>
            </div>
          </>
        ) : (
          <div className="grid gap-2" aria-live="polite">
            {last && (
              <p className={last.points >= 60 ? "text-good" : last.points > 0 ? "text-hard" : "text-again"}>
                {last.dist === null
                  ? `Wrong plane: the target was a ${PLANE[last.target.plane].label.toLowerCase()} section. 0 points.`
                  : `${last.dist} mm off (${PLANE[last.target.plane].label.toLowerCase()}). ${last.points} points.`}
              </p>
            )}
            {keys.length > 0 && (
              <div>
                <p className="eyebrow">At this level (coloured on the MRI)</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
                  {keys.map((k, i) => (
                    <li key={k.slug} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border border-panel-border" style={{ background: sliceOverlays[i]?.color }} />
                      {k.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {finished && (
              <p className="font-display text-lg text-accent">
                Final score {total} / {ROUNDS * 100}
                {best !== null && total >= best ? " (new best)" : ""}
              </p>
            )}
            <div>
              <button type="button" className="btn btn-primary" onClick={next}>
                {finished ? "Play again" : "Next section"} <span className="kbd">Enter</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
