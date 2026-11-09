"use client";
// The level's plate: clean outlines only. Hovering (or focusing) a region tints it softly and shows its name in a callout;
// clicking selects it (the page opens the structure drawer). Only course-list structures have regions.
import { useEffect, useState } from "react";
import { cachedPlate, loadPlate } from "@/components/cards/PlateImage";
import { STRUCTURES } from "./data";

export function PlateStage({
  level,
  hover,
  onHover,
  selected,
  onSelect,
  mastery,
}: {
  level: string;
  hover: string | null;
  onHover: (slug: string | null) => void;
  selected: string | null;
  onSelect: (slug: string) => void;
  mastery: Record<string, number>;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (cachedPlate(level)) return;
    let alive = true;
    loadPlate(level).then(() => alive && tick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [level]);
  const plate = cachedPlate(level);
  if (!plate) return <div className="plate-skel" aria-busy style={{ aspectRatio: "4 / 3" }} />;
  if (plate === "missing") return <div className="panel text-sm text-text-dim">The plate could not be loaded.</div>;
  const [, , vw, vh] = plate.viewBox;
  const hot = hover ?? null;
  const callout = hot ? plate.regions.filter((r) => r.slugs.includes(hot)) : [];
  // the callout sits at the region nearest the middle of the plate
  const anchor = callout.length ? callout.slice().sort((a, b) => Math.abs(a.c[0] - vw / 2) - Math.abs(b.c[0] - vw / 2))[0] : null;
  const name = hot ? STRUCTURES[hot]?.name ?? hot : "";
  const pct = hot && mastery[hot] !== undefined ? ` · ${Math.round(mastery[hot] * 100)}%` : "";
  const text = name + pct;
  const w = Math.min(vw - 20, text.length * 17 + 28);
  const cx = anchor ? Math.max(10 + w / 2, Math.min(vw - 10 - w / 2, anchor.c[0])) : 0;
  const cy = anchor ? Math.max(28, anchor.c[1] - 40) : 0;
  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className="plate-svg" role="group" aria-label="Brainstem section plate" style={{ aspectRatio: `${vw} / ${vh}` }}>
      {plate.regions.map((r) => {
        const slug = r.slugs[0];
        const on = r.slugs.includes(hot ?? "") || r.slugs.includes(selected ?? "");
        const sel = r.slugs.includes(selected ?? "");
        return (
          <path
            key={r.id}
            d={r.d}
            fillRule="evenodd"
            className="plate-region"
            fill="var(--accent)"
            fillOpacity={on ? (sel ? 0.5 : 0.34) : 0}
            stroke="var(--accent)"
            strokeWidth={sel ? 3 : 0}
            pointerEvents="all"
            tabIndex={0}
            role="button"
            aria-label={`${STRUCTURES[slug]?.name ?? slug}${r.slugs.length > 1 ? "" : ""}`}
            onPointerEnter={() => onHover(slug)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(slug)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(slug)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(slug);
              }
            }}
          />
        );
      })}
      <path d={plate.ink} fill="var(--text)" fillRule="evenodd" pointerEvents="none" />
      {anchor && text && (
        <g pointerEvents="none" className="plate-callout">
          <rect x={cx - w / 2} y={cy - 26} width={w} height={40} rx={8} fill="var(--panel-solid)" stroke="var(--accent)" strokeWidth={2} />
          <text x={cx} y={cy + 2} textAnchor="middle" fontSize={26} fontWeight={600} fill="var(--text)">
            {text}
          </text>
        </g>
      )}
    </svg>
  );
}
