"use client";
// BrainstemRef: the brainstem atlas as a reference anywhere (Explore, the pathway tracer). Give it structure slugs and
// it picks the plate that shows them best, lights them (on one half when `side` says so) and breathes them on the
// shared clock, so a 3D view pulsing the same structure with brainstemPulse(t) stays in step.
//   <BrainstemRef structures={["medial-longitudinal-fasciculus"]} side="L" compact onPick={...} />
// Sides: "L" is the plate's left half (the viewer's left; dorsal is up). Tracts the plates draw under the bundle that
// carries them are lit there (corticospinal fibres: cerebral peduncle, longitudinal fibres of the pons, pyramid).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { usePlate } from "./plate/usePlate";
import { PlateArt } from "./plate/PlateArt";
import { brainstemPulse, pulseDisabled } from "./plate/pulse";
import { REF } from "./ref/refMap";
import { LEVELS, STRUCTURES } from "./data";
import "./brainstem.css";

export { brainstemPulse, brainstemPulsePhase, PULSE_PERIOD_MS } from "./plate/pulse";

export interface BrainstemRefProps {
  /** the plate level; omitted: the most representative level for the structures */
  level?: string;
  /** structure slugs to light (plate structures, or tracts the plates carry under another name) */
  structures?: string[];
  /** light only that half */
  side?: "L" | "R" | "both";
  /** the shared pulse clock: a change re-triggers a short emphasis; the breathing phase is always performance.now() */
  pulseKey?: number;
  /** a docked inset of about 260-340 px */
  compact?: boolean;
  onPick?: (slug: string) => void;
}

const nameOf = (slug: string) => STRUCTURES[slug]?.name ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const levelName = (slug: string) => LEVELS.find((l) => l.slug === slug)?.name ?? slug;
const NAMES: Record<string, string> = Object.fromEntries(Object.entries(STRUCTURES).map(([k, s]) => [k, s.name]));

/** Whether BrainstemRef can show anything for these structures. */
export function brainstemRefCovers(structures: string[]): boolean {
  return structures.some((s) => REF.onPlates(s));
}

export function BrainstemRef({ level, structures = [], side = "both", pulseKey, compact, onPick }: BrainstemRefProps) {
  const key = structures.join("|");
  const auto = REF.pickLevel(structures);
  const stops = REF.levelsFor(structures);
  // the reader may step to the structure's other levels; a new structure or level from the caller resets that
  const [stepped, setStepped] = useState<{ from: string; level: string } | null>(null);
  const origin = `${level ?? ""}|${key}`;
  const base = level ?? auto;
  const lv = stepped && stepped.from === origin ? stepped.level : base;
  const plate = usePlate(lv);
  const ready = plate && plate !== "missing" ? plate : null;
  const lit = lv ? [...new Set(structures.flatMap((s) => REF.resolveAt(s, lv)))] : [];
  const approx = lv ? structures.some((s) => REF.isApproxAt(s, lv)) : false;
  const [hot, setHot] = useState<string | null>(null);
  const [hotSide, setHotSide] = useState<"L" | "R" | "M" | null>(null);

  // breathe the lit structures on the shared clock (a CSS custom property, so no React render per frame)
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || !lit.length) return;
    if (pulseDisabled()) {
      el.style.setProperty("--bsp-pulse", "0.75");
      return;
    }
    let raf = 0;
    const tick = () => {
      el.style.setProperty("--bsp-pulse", brainstemPulse(performance.now()).toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lit.length]);

  // a new pulseKey: a short emphasis on the lit structures
  const [flash, setFlash] = useState(false);
  const [lastKey, setLastKey] = useState(pulseKey);
  if (pulseKey !== lastKey) {
    setLastKey(pulseKey);
    if (pulseKey !== undefined) setFlash(true);
  }
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, [flash]);

  if (!lv) {
    return (
      <figure className={`bsr${compact ? " bsr-compact" : ""}`} aria-label="Brainstem reference">
        <p className="bsr-empty">{structures.length ? `${structures.map(nameOf).join(", ")}: not drawn on the brainstem plates.` : "No brainstem structure selected."}</p>
      </figure>
    );
  }
  const i = stops.indexOf(lv);
  const go = (d: number) => {
    const next = stops[i + d];
    if (next) setStepped({ from: origin, level: next });
  };
  const sideText = side === "L" ? " · left half" : side === "R" ? " · right half" : "";
  return (
    <figure className={`bsr${compact ? " bsr-compact" : ""}`} aria-label={`Brainstem reference: ${levelName(lv)}`}>
      <div className="bsr-head">
        <div className="min-w-0 flex-1">
          <div className="bsr-level">{levelName(lv)}</div>
          {!compact && <div className="bsr-sub">Brainstem atlas{sideText}</div>}
        </div>
        {stops.length > 1 && (
          <div className="bsr-steps">
            <button type="button" className="bs-ib bsr-ib" onClick={() => go(-1)} disabled={i <= 0} aria-label="Level above" title="Level above">
              <ChevronUp size={14} aria-hidden />
            </button>
            <button type="button" className="bs-ib bsr-ib" onClick={() => go(1)} disabled={i < 0 || i >= stops.length - 1} aria-label="Level below" title="Level below">
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
        )}
        <Link href={`/atlas/brainstem?level=${encodeURIComponent(lv)}`} className="bs-ib bsr-ib no-underline" aria-label="Open in the brainstem atlas" title="Open in the brainstem atlas">
          <ExternalLink size={14} aria-hidden />
        </Link>
      </div>
      <div ref={wrap} className={`bsr-plate${flash ? " bsr-flash" : ""}`}>
        {ready ? (
          <PlateArt
            plate={ready}
            view="split"
            lit={{ slugs: lit, side }}
            pulse
            hot={hot}
            hotSide={hotSide}
            callout
            names={NAMES}
            interactive
            onHover={(s, sd) => {
              setHot(s);
              setHotSide(sd ?? null);
            }}
            onPick={onPick}
            ariaLabel={`Brainstem plate, ${levelName(lv)}`}
          />
        ) : plate === "missing" ? (
          <p className="bsr-empty">The plate could not be loaded.</p>
        ) : (
          <div className="plate-skel" style={{ aspectRatio: "4 / 3" }} aria-busy />
        )}
      </div>
      <figcaption className="bsr-cap">
        {lit.length ? lit.map(nameOf).join(", ") : structures.length ? `${structures.map(nameOf).join(", ")}: not drawn at this level` : ""}
        {approx ? <span className="bsr-approx"> · approximate outline</span> : null}
      </figcaption>
    </figure>
  );
}

export default BrainstemRef;
