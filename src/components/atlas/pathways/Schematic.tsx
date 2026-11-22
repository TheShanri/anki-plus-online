"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { ORDER_COLORS, GUIDE_COLORS } from "@/lib/atlas/pathwayPalette";
import type { Side } from "@/lib/atlas/pathways";
import type { Beat } from "./buildPathwayScene";
import { DiagramView, FIELD_LEGEND } from "./diagram/DiagramView";
import { detectSlug, diagramFor, endKinds, resolveBeats } from "./diagram/resolve";

/* The pathway as a textbook-style figure, drawn from the same beat list as the 3D scene (so the two cannot drift apart):
 *  - long tracts: a stack of simplified cross-sections (forebrain, midbrain, pons, medulla, cord) with the fibres passing
 *    through them and visibly crossing the midline at the right level,
 *  - the visual pathway: the classic axial diagram, eyes to the occipital cortex,
 *  - loops and circuits: boxes and arrows laid out like the brain,
 *  - the limbic and olfactory pathways on a mid-sagittal brain, and reflexes as arcs through a cord or brainstem section.
 * Colour = which neuron (1st, 2nd, 3rd order; UMN / LMN for motor), solid = left, dashed = right, the red line is the midline.
 * The whole figure always fits the box (viewBox, no inner scrolling); the legend and the caption stay outside it, and the
 * expand button opens the same figure large. Everything lights in step with the 3D beats; hovering or clicking an element
 * does the same as in 3D. */

const MOTOR = new Set(["lcst", "acst", "corticobulbar", "umn-lmn"]);
const ORD = ["1st", "2nd", "3rd", "4th"];

interface Props {
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
  /** per beat, the neuron order the 3D scene draws (one order) — the figure's colours follow it, so 2D and 3D agree */
  drawn?: (number | undefined)[];
  /** every neuron order the 3D scene draws (for the legend) */
  drawnAll?: number[];
}

export function Schematic(props: Props) {
  const { beats, cur, reveal, hoverKey, onHover, onPick, reduced, sideAlpha, slug: slugProp, drawn, drawnAll } = props;
  const [big, setBig] = useState(false);
  const slug = useMemo(() => slugProp ?? detectSlug(beats), [slugProp, beats]);
  const diagram = useMemo(() => (slug ? diagramFor(slug) : null), [slug]);
  const resolved = useMemo(() => (slug && diagram ? resolveBeats(slug, beats, diagram.els.flatMap((e) => e.keys)) : null), [slug, diagram, beats]);
  const ends = useMemo(() => (slug ? endKinds(slug) : new Map()), [slug]);

  const orders = useMemo(() => {
    const s = new Set<number>();
    beats.forEach((b, k) => s.add(Math.min(4, drawn?.[k] ?? b.neuron + 1)));
    for (const o of drawnAll ?? []) s.add(Math.min(4, o));
    return [...s].sort();
  }, [beats, drawn, drawnAll]);
  const motor = !!slug && MOTOR.has(slug);

  const shownBeat = hoverKey ? beats.findIndex((b) => b.info === hoverKey) : cur;
  const caption = shownBeat !== null && shownBeat >= 0 ? beats[shownBeat]?.caption : null;
  const lineStyle = (side: Side) => ({ borderTop: `2px ${side === "R" ? "dashed" : "solid"} var(--text-dim)`, display: "inline-block", width: 18, verticalAlign: "middle" });

  useEffect(() => {
    if (!big) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [big]);

  const view = (
    <DiagramView diagram={diagram!} beats={beats} resolved={resolved!} cur={cur} reveal={reveal} hoverKey={hoverKey} onHover={onHover} onPick={onPick} reduced={reduced} sideAlpha={sideAlpha} ends={ends} drawn={drawn} />
  );
  const legend = diagram && (
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
              {motor ? (o === 1 ? "UMN" : o === 2 ? "LMN" : ORD[o - 1]) : o === 4 ? "4th link" : ORD[o - 1]}
            </li>
          ))}
          {!motor && <li className="text-text-dim">order</li>}
        </>
      )}
      {diagram.mode !== "plain" && !diagram.legendField && (
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
  );
  const captionEl = (
    <p aria-live="polite" className="m-0 min-h-[2.6em] px-1 py-1 text-[12px] leading-snug text-text">
      {caption ?? <span className="text-text-dim">Hover or click a part: the same step lights in 3D.</span>}
    </p>
  );

  return (
    <div className="pwd-root flex min-h-0 flex-col lg:h-[calc(100%-26px)]">
      <style>{`
        .pwd-draw{transition:stroke-dashoffset 1.8s ease-in-out}
        .pwd-late{transition:opacity 300ms 1.2s}
        html[data-effects="off"] .pwd-draw, html[data-effects="off"] .pwd-late{transition:none !important}
        @media (prefers-reduced-motion: reduce){.pwd-draw,.pwd-late{transition:none !important}}
        @media (max-width:1023px){.pwd-fitbox{height:calc(34dvh - 7rem)}}
      `}</style>
      {diagram && resolved ? (
        <>
          <div className="pwd-fitbox relative min-h-[150px] flex-1">
            {view}
            <button type="button" onClick={() => setBig(true)} aria-label="Open the diagram large" title="Open the diagram large" className="absolute right-0 top-0 rounded-sm border border-panel-border bg-bg-2 p-1 text-text-dim hover:text-text">
              <Maximize2 size={14} aria-hidden />
            </button>
          </div>
          {legend}
          {captionEl}
        </>
      ) : null}
      {big &&
        diagram &&
        resolved &&
        typeof document !== "undefined" &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Pathway diagram, large" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3" onClick={() => setBig(false)}>
            <div className="flex max-h-full w-full max-w-[760px] flex-col rounded-card border border-panel-border bg-bg-2 p-2" style={{ height: "min(94dvh, 1100px)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-end">
                <button type="button" autoFocus onClick={() => setBig(false)} aria-label="Close" className="rounded-sm border border-panel-border p-1 text-text-dim hover:text-text">
                  <X size={16} aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1">{view}</div>
              {legend}
              {captionEl}
            </div>
          </div>,
          document.body,
        )}
      {/* every beat, for keyboard and screen-reader users, and for any beat the figure does not draw */}
      <ol className={diagram && resolved ? "sr-only" : "m-0 grid list-none gap-0.5 p-0"} aria-label="Pathway steps">
        {beats.map((b, i) => (
          <li key={i}>
            <button
              type="button"
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
