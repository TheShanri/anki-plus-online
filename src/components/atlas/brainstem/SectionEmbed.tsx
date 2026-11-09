"use client";
// A small read-only wrapper over the brainstem atlas pieces, for the Explore "Sections" view: the course cross-section at a level with the
// chosen structure highlighted, plus a level ladder. It changes nothing in the brainstem atlas itself.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LEVELS, imagesFor, levelBySlug } from "./data";
import type { BsImage, BsLevel } from "./data";
import { SectionViewer } from "./SectionViewer";

const NO_RESULTS = {};
const noop = () => undefined;

/** Section levels (not the gross views) that show a structure; `course` ones first. */
export function levelsShowing(slug: string | null): BsLevel[] {
  if (!slug) return [];
  return LEVELS.filter((l) => l.kind === "section" && l.structures.some((s) => s.slug === slug));
}
/** True when a structure appears on any course section. */
export function inSections(slug: string | null): "course" | "standard" | null {
  if (!slug) return null;
  let best: "course" | "standard" | null = null;
  for (const l of LEVELS) {
    if (l.kind !== "section") continue;
    for (const s of l.structures) if (s.slug === slug) best = s.source === "course" || best === "course" ? "course" : "standard";
  }
  return best;
}
/** The section level whose MNI z is nearest (optionally limited to levels that show the structure). */
export function nearestLevel(mniZ: number, slug?: string | null): string | null {
  const pool = (slug ? levelsShowing(slug) : []).concat(slug ? [] : LEVELS.filter((l) => l.kind === "section"));
  let best: BsLevel | null = null;
  for (const l of pool) if (l.mniZ !== null && (!best || Math.abs(l.mniZ - mniZ) < Math.abs((best.mniZ as number) - mniZ))) best = l;
  return best?.slug ?? null;
}

export function SectionEmbed({
  courseSlug,
  slug,
  level,
  onLevel,
}: {
  courseSlug: string;
  /** the structure to highlight (a brainstem structure slug) */
  slug: string | null;
  level: string | null;
  onLevel: (l: string) => void;
}) {
  const showing = useMemo(() => levelsShowing(slug), [slug]);
  const cur = level ? levelBySlug(level) : (showing[0] ?? LEVELS.find((l) => l.kind === "section") ?? LEVELS[0]);
  const imgs: BsImage[] = useMemo(() => [...imagesFor(cur.slug, "course"), ...imagesFor(cur.slug, "histology"), ...imagesFor(cur.slug, "cartoon")], [cur.slug]);
  const [idx, setIdx] = useState(0);
  const image = imgs[Math.min(idx, imgs.length - 1)];
  const [hover, setHover] = useState<string | null>(null);
  const here = !!slug && cur.structures.some((s) => s.slug === slug);
  return (
    <div className="absolute inset-0 flex min-h-0">
      <div className="flex w-[148px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-panel-border bg-panel p-1.5" role="radiogroup" aria-label="Section level">
        {LEVELS.filter((l) => l.kind === "section").map((l) => {
          const has = !!slug && l.structures.some((s) => s.slug === slug);
          return (
            <button
              key={l.slug}
              type="button"
              role="radio"
              aria-checked={cur.slug === l.slug}
              onClick={() => {
                setIdx(0);
                onLevel(l.slug);
              }}
              title={l.hallmark}
              className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs ${cur.slug === l.slug ? "bg-panel-2 text-accent" : "text-text-dim hover:bg-panel-2 hover:text-text"}`}
            >
              <span className={`atl-dot flex-none ${has ? "" : "opacity-20"}`} style={{ background: "var(--accent-2)" }} aria-hidden="true" />
              <span className="min-w-0 truncate">{l.name}</span>
            </button>
          );
        })}
      </div>
      <div className="relative min-w-0 flex-1 bg-bg-2">
        {image ? (
          <SectionViewer image={image} courseSlug={courseSlug} mode="labels" hoverSlug={hover ?? slug} onHover={setHover} results={NO_RESULTS} active={null} onActivate={noop} />
        ) : (
          <p className="p-4 text-sm text-text-dim">No course section image for this level.</p>
        )}
        <div className="atl-chip pointer-events-none absolute left-2 top-2 z-[6] max-w-[80%] flex-col items-start gap-0 text-text-dim">
          <span className="font-display text-text">{cur.name}</span>
          <span className="text-[11px]">{here ? "The highlighted label is on this section." : slug ? "This structure is not labelled at this level." : cur.hallmark}</span>
        </div>
        {imgs.length > 1 && (
          <div className="atl-bar pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 items-center">
            <button type="button" className="atl-btn" aria-label="Previous image" onClick={() => setIdx((i) => (i - 1 + imgs.length) % imgs.length)}>
              <ChevronLeft />
            </button>
            <span className="px-2 font-mono text-[11px] text-text-dim">
              {Math.min(idx, imgs.length - 1) + 1} / {imgs.length}
            </span>
            <button type="button" className="atl-btn" aria-label="Next image" onClick={() => setIdx((i) => (i + 1) % imgs.length)}>
              <ChevronRight />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
