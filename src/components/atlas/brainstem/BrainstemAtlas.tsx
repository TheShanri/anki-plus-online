"use client";
// /atlas/brainstem: each level as one clean plate (outlines only; hover names a region, click opens it), a side-view
// navigator with a mastery ring per level, and the mastery path (learn level by level, then region, then the whole
// brainstem; practice what is mastered). Compare shows the same level in the other sources, and only there.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Columns2, X } from "lucide-react";
import type { BrainstemMastery } from "@/lib/brainstem/mastery-server";
import { trackAtlas } from "@/lib/atlas/progress";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import "./brainstem.css";
import { IconBtn } from "./ui";
import { Navigator } from "./Navigator";
import { PlateStage } from "./PlateStage";
import { MasteryPanel } from "./MasteryPanel";
import { ComparePane } from "./ComparePane";
import Link from "next/link";
import { atlasHrefForCourseName } from "@/lib/atlas/map";
import { LEVELS, STRUCTURES, infoSlugOf, levelBySlug } from "./data";
import { OFF_PLATE } from "./offplate";

export function BrainstemAtlas({ courseSlug, mastery, plateLevels, initialLevel }: { courseSlug: string; mastery: BrainstemMastery; plateLevels: string[]; initialLevel?: string }) {
  const [levelSlug, setLevel] = useState(
    initialLevel && LEVELS.some((l) => l.slug === initialLevel) ? initialLevel : mastery.next && plateLevels.includes(mastery.next) ? mastery.next : (plateLevels[0] ?? LEVELS[0].slug),
  );
  const [compare, setCompare] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") step(1);
      else if (k === "arrowup" || k === "k") step(-1);
      else if (k === "x") setCompare((c) => !c);
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
        <p className="mt-3 hidden text-xs text-text-dim md:block">Up/Down or J/K: change level. X: compare. Esc: close.</p>
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
          <IconBtn icon={Columns2} label="Compare with other sources" keys="X" pressed={compare} onClick={() => setCompare((c) => !c)} />
          <IconBtn icon={ChevronUp} label="Previous level" keys="Up / K" onClick={() => step(-1)} disabled={levelSlug === LEVELS[0].slug} />
          <IconBtn icon={ChevronDown} label="Next level" keys="Down / J" onClick={() => step(1)} disabled={levelSlug === LEVELS[LEVELS.length - 1].slug} />
        </div>

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
        </div>

        <div className="mt-4">
          <MasteryPanel level={levelSlug} mastery={mastery} onPick={goLevel} hover={hover} onHover={setHover} onSelect={select} />
        </div>
      </div>

      <aside className={`bs-drawer${selected ? " bs-open" : ""}`} aria-hidden={!selected} aria-label="Structure">
        {selected && (
          <>
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base">{STRUCTURES[selected]?.name ?? selected}</h3>
              <IconBtn icon={X} label="Close" keys="Esc" onClick={() => setSelected(null)} />
            </div>
            {lm?.structures[selected] !== undefined && (
              <p className="mb-1 text-xs text-text-dim">
                {Math.round(lm.structures[selected] * 100)}% mastered on this plate
              </p>
            )}
            <StructureInfo key={selected} slug={infoSlugOf(selected)} name={STRUCTURES[selected]?.name} />
          </>
        )}
      </aside>
    </div>
  );
}
