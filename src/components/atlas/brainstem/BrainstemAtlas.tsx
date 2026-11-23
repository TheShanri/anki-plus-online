"use client";
// /atlas/brainstem: each level as one clean plate (outlines only; hover names a region, click opens it), a side-view
// navigator with a mastery ring per level, and the mastery path (learn level by level, then region, then the whole
// brainstem; practice what is mastered). Compare shows the same level in the other sources, and only there.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Box, ChevronDown, ChevronUp, Columns2, Images, Layers, X } from "lucide-react";
import type { BrainstemMastery } from "@/lib/brainstem/mastery-server";
import { trackAtlas } from "@/lib/atlas/progress";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import "./brainstem.css";
import "./three/bs3d.css";
import { IconBtn } from "./ui";
import { Navigator } from "./Navigator";
import { PlateStage } from "./PlateStage";
import { MasteryPanel } from "./MasteryPanel";
import { ComparePane } from "./ComparePane";
import Link from "next/link";
import { atlasHrefForCourseName } from "@/lib/atlas/map";
import { LEVELS, STRUCTURES, infoSlugOf, levelBySlug } from "./data";
import { OFF_PLATE } from "./offplate";
import { in3D, name3D, platesFor, LEVEL_NAME } from "./three/model";

// the 3D brainstem loads only when it is shown (three.js and the model stay out of the plate page's first load)
const Brainstem3D = dynamic(() => import("./three/Brainstem3D"), { ssr: false, loading: () => <div className="plate-skel" style={{ height: 240 }} aria-busy /> });
// "split" (the default): the 3D brainstem and the level's plate side by side, the 3D one leading (owner 2026-11-22: make
// the 3D brainstem a central part of the experience, not a side piece). "plates" keeps the plate alone (with Compare and
// the small 3D locator); "3d" the model alone.
type Mode = "split" | "plates" | "3d";
const mqWide = "(min-width: 768px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(mqWide);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(mqWide).matches,
    () => true,
  );
}

export function BrainstemAtlas({ courseSlug, mastery, plateLevels, initialLevel, initialView }: { courseSlug: string; mastery: BrainstemMastery; plateLevels: string[]; initialLevel?: string; initialView?: string }) {
  const [levelSlug, setLevel] = useState(
    initialLevel && LEVELS.some((l) => l.slug === initialLevel) ? initialLevel : mastery.next && plateLevels.includes(mastery.next) ? mastery.next : (plateLevels[0] ?? LEVELS[0].slug),
  );
  const [compare, setCompare] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialView === "3d" ? "3d" : initialView === "plates" ? "plates" : "split");
  const wide = useWide();
  const level = levelBySlug(levelSlug);
  const hasPlate = plateLevels.includes(levelSlug);
  const lm = mastery.levels[levelSlug];

  useEffect(() => {
    trackAtlas({ type: "brainstem_level_viewed", level: levelSlug, style: hasPlate ? "plate" : "sources" });
  }, [levelSlug, hasPlate]);

  const goLevel = useCallback((slug: string) => {
    setLevel(slug);
    setSelected(null);
    setHover(null);
  }, []);
  const step = useCallback(
    (d: number) => {
      const i = LEVELS.findIndex((l) => l.slug === levelSlug);
      goLevel(LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + d))].slug);
    },
    [levelSlug, goLevel],
  );
  const select = useCallback((slug: string) => {
    setSelected(slug);
    trackAtlas({ type: "structure_viewed", slug, via: "brainstem" });
  }, []);
  /** A landmark picked in 3D: selected, and the plane moves to the plate that shows it best. */
  const select3D = useCallback(
    (slug: string) => {
      const best = platesFor(slug).best;
      if (best) setLevel(best);
      select(slug);
    },
    [select],
  );
  /** A plane picked in 3D: open that level's plate beside the model (the selection stays lit when the plate shows it). */
  const openPlate = useCallback((slug: string) => {
    setLevel(slug);
    setHover(null);
    setMode((m) => (m === "plates" ? "plates" : "split"));
  }, []);
  // the URL keeps the level and the view, so a reload or a shared link opens the same thing
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("level", levelSlug);
      if (mode !== "split") p.set("view", mode);
      else p.delete("view");
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    } catch {}
  }, [levelSlug, mode]);
  const inset =
    mode === "plates" ? (
      <div className="bs3d-inset">
        <Brainstem3D compact view="oblique" level={levelSlug} selected={selected && in3D(selected) ? selected : null} hover={hover && in3D(hover) ? hover : null} onLevel={goLevel} onSelect={select3D} planes="all" ariaLabel="Where this level is cut, on the 3D brainstem" />
        <button type="button" className="bs3d-open" onClick={() => setMode("3d")}>
          <Box size={13} aria-hidden /> Open the 3D brainstem
        </button>
      </div>
    ) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") step(1);
      else if (k === "arrowup" || k === "k") step(-1);
      else if (k === "x") {
        // Compare sits beside the plate, so it opens the plate view
        setMode("plates");
        setCompare((c) => !c);
      } else if (k === "v") setMode((m) => (m === "split" ? "plates" : m === "plates" ? "3d" : "split"));
      else if (k === "escape") setSelected(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[272px_minmax(0,1fr)]">
      <div className="min-w-0 md:row-span-2">
        <Navigator level={levelSlug} onPick={goLevel} mastery={mastery} />
        <p className="mt-3 hidden text-xs text-text-dim md:block">Up/Down or J/K: change level. V: 3D + plate / plate / 3D. X: compare. Esc: close.</p>
        {wide && inset}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg">{level.name}</h2>
            <p className="truncate text-xs text-text-dim" title={level.aka ?? undefined}>
              {level.hallmark}
              {level.aka ? <span className="text-text-faint"> · {level.aka}</span> : null}
            </p>
          </div>
          <div className="bs-seg" role="radiogroup" aria-label="View">
            <button type="button" role="radio" aria-checked={mode === "split"} onClick={() => setMode("split")} title="The 3D brainstem with the level's plate beside it (V)">
              <Columns2 size={14} aria-hidden />
              <span className="bs-seg-t">3D + plate</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === "plates"} onClick={() => setMode("plates")} title="The level's plate (V)">
              <Layers size={14} aria-hidden />
              <span className="bs-seg-t">Plates</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === "3d"} onClick={() => setMode("3d")} title="The 3D brainstem with its landmarks and the section planes (V)">
              <Box size={14} aria-hidden />
              <span className="bs-seg-t">3D</span>
            </button>
          </div>
          {mode === "plates" && <IconBtn icon={Images} label="Compare with other sources" keys="X" pressed={compare} onClick={() => setCompare((c) => !c)} />}
          <IconBtn icon={ChevronUp} label="Previous level" keys="Up / K" onClick={() => step(-1)} disabled={levelSlug === LEVELS[0].slug} />
          <IconBtn icon={ChevronDown} label="Next level" keys="Down / J" onClick={() => step(1)} disabled={levelSlug === LEVELS[LEVELS.length - 1].slug} />
        </div>

        {mode === "split" ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Brainstem3D
                level={levelSlug}
                selected={selected && in3D(selected) ? selected : null}
                hover={hover && in3D(hover) ? hover : null}
                onSelect={select3D}
                onLevel={goLevel}
                levelList={false}
                view="oblique"
                ariaLabel="3D brainstem: landmarks and section planes; the accent plane is this level"
              />
              <p className="mt-1.5 text-xs text-text-dim">
                The accent plane is this level ({LEVEL_NAME(levelSlug)}); its plate is beside it. Click a plane or use Up/Down to change level; hover a landmark to name it, click to open it. Drag to rotate, scroll to zoom.
              </p>
            </div>
            <div key={levelSlug} className="bs-fade-in min-w-0">
              {hasPlate ? (
                <div className="plate-wrap">
                  <PlateStage level={levelSlug} hover={hover} onHover={setHover} selected={selected} onSelect={select} mastery={lm?.structures ?? {}} />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="panel text-sm text-text-dim">{level.kind === "section" ? "No plate for this level yet; here it is in the other sources." : "Surface views have no plate. These are the course images and the open atlases for this view."}</p>
                  <ComparePane level={level} courseSlug={courseSlug} />
                </div>
              )}
            </div>
          </div>
        ) : mode === "3d" ? (
          <div>
            <Brainstem3D level={levelSlug} selected={selected && in3D(selected) ? selected : null} onSelect={select3D} onLevel={openPlate} levelList={false} ariaLabel="3D brainstem: landmarks and section planes" />
            <p className="mt-1.5 text-xs text-text-dim">
              Hover a landmark to name it, click to open it; the accent plane is the current level ({LEVEL_NAME(levelSlug)}). Hover a plane to preview its level, click it to open the plate. Up/Down moves the plane. Drag to rotate, scroll to zoom toward the pointer.
            </p>
          </div>
        ) : (
        <div key={levelSlug} className="bs-fade-in">
          {hasPlate ? (
            <div className={compare ? "grid gap-3 lg:grid-cols-2" : ""}>
              <div className="plate-wrap">
                <PlateStage level={levelSlug} hover={hover} onHover={setHover} selected={selected} onSelect={select} mastery={lm?.structures ?? {}} />
                {!compare && (
                  <p className="mt-1.5 text-xs text-text-dim">
                    {level.kind === "gross"
                      ? levelSlug === "midsagittal"
                        ? "Hover a structure to name it, click to open it. Anterior is to the left; the brainstem cut in the midline (pyramid, olive and longitudinal fibres just off it, as in the course's longitudinal section)."
                        : levelSlug === "external-lateral"
                          ? "Hover a structure to name it, click to open it. Anterior is to the left, the cerebellum removed (its cut peduncles show)."
                          : "Hover a structure to name it, click to open it. Rostral is up; the illustration mirrors the specimen's right half."
                      : "Hover a structure to light it on both halves, click to open it. Dorsal is up; the illustration mirrors the section's right half."}
                  </p>
                )}
                {OFF_PLATE.filter((o) => o.near === levelSlug).map((o) => {
                  const href = atlasHrefForCourseName(o.name);
                  return (
                    <p key={o.slug} className="mt-1.5 text-xs text-text-dim">
                      <span className="font-semibold text-text">{o.name}: not on this plate.</span> {o.note}{" "}
                      {href && (
                        <Link href={href} className="text-accent-2 underline underline-offset-2">
                          Open in Explore
                        </Link>
                      )}
                    </p>
                  );
                })}
              </div>
              {compare && <ComparePane level={level} courseSlug={courseSlug} />}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="panel text-sm text-text-dim">
                {level.kind === "section" ? "The plate for this level is coming soon (the course has no clean drawing with a key for it yet). Meanwhile, here is the level in the other sources." : "Surface views have no plate. These are the course images and the open atlases for this view."}
              </p>
              <ComparePane level={level} courseSlug={courseSlug} />
            </div>
          )}
          {!wide && <div className="mt-3">{inset}</div>}
        </div>
        )}

        <div className="mt-4">
          <MasteryPanel level={levelSlug} mastery={mastery} onPick={goLevel} hover={hover} onHover={setHover} onSelect={select} />
        </div>
      </div>

      <aside className={`bs-drawer${selected ? " bs-open" : ""}`} aria-hidden={!selected} aria-label="Structure">
        {selected && (
          <>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base">{STRUCTURES[selected]?.name ?? name3D(selected)}</h3>
              <IconBtn icon={X} label="Close" keys="Esc" onClick={() => setSelected(null)} />
            </div>
            {lm?.structures[selected] !== undefined && (
              <p className="mb-1 text-xs text-text-dim">
                {Math.round(lm.structures[selected] * 100)}% mastered on this plate
              </p>
            )}
            <OnThePlates slug={selected} current={mode !== "3d" ? levelSlug : null} onOpen={openPlate} />
            <StructureInfo key={selected} slug={infoSlugOf(selected)} name={STRUCTURES[selected]?.name ?? name3D(selected)} />
          </>
        )}
      </aside>
    </div>
  );
}

/** The plates that show a structure (the best one starred): one click opens that level. */
function OnThePlates({ slug, current, onOpen }: { slug: string; current: string | null; onOpen: (level: string) => void }) {
  const { levels, best } = platesFor(slug);
  if (!levels.length) return null;
  return (
    <div className="bs3d-onplates">
      <div className="text-xs text-text-dim">On the plates{in3D(slug) ? " (and lit in 3D)" : ""}:</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {levels.map((l) => (
          <button key={l} type="button" className="bs3d-chip" aria-current={l === current ? "true" : undefined} onClick={() => onOpen(l)} title={l === best ? "Shown best here" : undefined}>
            {LEVEL_NAME(l)}
            {l === best ? " \u2605" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
