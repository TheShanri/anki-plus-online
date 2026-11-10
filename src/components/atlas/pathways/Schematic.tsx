"use client";

import { useEffect, useMemo, useRef } from "react";
import { ORDER_COLORS, GUIDE_COLORS } from "@/lib/atlas/pathwayPalette";
import type { Beat } from "./buildPathwayScene";
import { DiagramView, FIELD_LEGEND } from "./diagram/DiagramView";
import { detectSlug, diagramFor, endKinds, resolveBeats } from "./diagram/resolve";
import type { Side } from "@/lib/atlas/pathways";

/* The pathway as a textbook-style figure, drawn from the same beat list as the 3D scene (so the two cannot drift apart):
 *  - long tracts: a stack of simplified cross-sections (cortex, thalamus, midbrain, pons, medulla, cord) with the fibres
 *    passing through them and visibly crossing the midline at the right level,
 *  - the visual pathway: the classic axial diagram, eyes to the occipital cortex,
 *  - loops and circuits: boxes and arrows laid out like the brain,
 *  - the limbic and olfactory pathways on a mid-sagittal brain, and reflexes as arcs through a cord or brainstem section.
 * Colour = which neuron (1st, 2nd, 3rd order; UMN / LMN for motor), solid = left, dashed = right, the red line is the midline.
 * Everything lights in step with the 3D beats; hovering or clicking an element does the same as in 3D. */

const MOTOR = new Set(["lcst", "acst", "corticobulbar", "umn-lmn"]);
const ORD = ["1st", "2nd", "3rd", "4th"];

export function Schematic({
  beats,
  cur,
  reveal,
  hoverKey,
  onHover,
  onPick,
  reduced,
  sideAlpha,
  slug: slugProp,
}: {
  beats: Beat[];
  cur: number | null;
  reveal: number;
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  onPick: (k: string) => void;
  reduced?: boolean;
  sideAlpha: { L: number; R: number };
  /** optional: the pathway's name (otherwise it is recognised from the beat captions) */
  slug?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const slug = useMemo(() => slugProp ?? detectSlug(beats), [slugProp, beats]);
  const diagram = useMemo(() => (slug ? diagramFor(slug) : null), [slug]);
  const resolved = useMemo(() => (slug && diagram ? resolveBeats(slug, beats, diagram.els.flatMap((e) => e.keys)) : null), [slug, diagram, beats]);
  const ends = useMemo(() => (slug ? endKinds(slug) : new Map()), [slug]);

  useEffect(() => {
    if (cur === null) return;
    const el = wrap.current?.querySelector<SVGElement>(`[data-beat="${cur}"]`);
    el?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [cur, reduced]);

  const orders = useMemo(() => {
    const s = new Set<number>();
    beats.forEach((b) => s.add(Math.min(4, b.neuron + 1)));
    return [...s].sort();
  }, [beats]);
  const motor = !!slug && MOTOR.has(slug);

  const shownBeat = hoverKey ? beats.findIndex((b) => b.info === hoverKey) : cur;
  const caption = shownBeat !== null && shownBeat >= 0 ? beats[shownBeat]?.caption : null;
  const lineStyle = (side: Side) => ({ borderTop: `2px ${side === "R" ? "dashed" : "solid"} var(--text-dim)`, display: "inline-block", width: 18, verticalAlign: "middle" });

  return (
    <div ref={wrap} className="pwd-root">
      <style>{`
        .pwd-draw{transition:stroke-dashoffset 1.8s ease-in-out}
        .pwd-late{transition:opacity 300ms 1.2s}
        html[data-effects="off"] .pwd-draw, html[data-effects="off"] .pwd-late{transition:none !important}
        @media (prefers-reduced-motion: reduce){.pwd-draw,.pwd-late{transition:none !important}}
      `}</style>
      {diagram && resolved ? (
        <>
          <div className="overflow-x-auto">
            <DiagramView diagram={diagram} beats={beats} resolved={resolved} cur={cur} reveal={reveal} hoverKey={hoverKey} onHover={onHover} onPick={onPick} reduced={reduced} sideAlpha={sideAlpha} ends={ends} />
          </div>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1 p-1 text-[12px] leading-tight text-text-dim" aria-label="Legend">
            {diagram.legendField ? (
              FIELD_LEGEND.map((f) => (
                <li key={f.label} className="flex items-center gap-1">
                  <span aria-hidden style={{ borderTop: `3px ${f.dash ? "dashed" : "solid"} ${f.color}`, display: "inline-block", width: 18 }} />
                  {f.label}
                </li>
              ))
            ) : (
              <>
                {orders.map((o) => (
                  <li key={o} className="flex items-center gap-1">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ORDER_COLORS[o as 1 | 2 | 3 | 4] }} />
                    {motor ? (o === 1 ? "UMN" : o === 2 ? "LMN" : ORD[o - 1]) : o === 4 ? "4th link" : `${ORD[o - 1]}`}
                  </li>
                ))}
                {!motor && <li className="text-text-faint">order</li>}
              </>
            )}
            {diagram.mode !== "plain" && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden style={lineStyle("L")} /> left <span aria-hidden style={lineStyle("R")} /> right
              </li>
            )}
            {diagram.hasCross && (
              <li className="flex items-center gap-1">
                <span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 text-center text-[8px] leading-[9px]" style={{ borderColor: GUIDE_COLORS.crossing, color: GUIDE_COLORS.crossing }}>
                  ×
                </span>
                crosses
              </li>
            )}
            {diagram.note && <li>{diagram.note}</li>}
          </ul>
          <p aria-live="polite" className="sticky bottom-0 m-0 min-h-[2.6em] bg-bg-2 px-1 py-1 text-[12px] leading-snug text-text">
            {caption ?? <span className="text-text-faint">Hover or click a part: the same step lights in 3D.</span>}
          </p>
        </>
      ) : null}
      {/* every beat, for keyboard and screen-reader users, and for any beat the figure does not draw */}
      <ol className={diagram && resolved ? "sr-only" : "m-0 grid list-none gap-0.5 p-0"} aria-label="Pathway steps">
        {beats.map((b, i) => (
          <li key={i}>
            <button
              type="button"
              data-beat={diagram ? undefined : i}
              aria-current={i === cur ? "step" : undefined}
              onMouseEnter={() => onHover(b.info)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(b.info)}
              onBlur={() => onHover(null)}
              onClick={() => onPick(b.info)}
              className={`w-full rounded-sm px-1.5 py-1 text-left text-[12px] leading-snug ${i === cur ? "font-semibold text-text" : "text-text-dim"}`}
              style={{ opacity: i <= reveal ? 1 : 0.4 }}
            >
              {b.caption}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
