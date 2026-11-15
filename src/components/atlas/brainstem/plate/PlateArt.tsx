"use client";
// One brainstem plate as an atlas page: an engraved-style illustration (hairline outlines; hatched white matter,
// stippled and tinted grey matter, open spaces, soft myelin tone from the section) and the course's myelin-stained
// section, split at the midline by default. The section is printed as ink through its own density (a luminance mask),
// so it follows the theme: stain on paper, or a dark-field look on a dark theme. A structure lights on both halves
// together; the photo half uses the registered (mirrored) outline. Approximate outlines are dashed.
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PlateData, PlateRegion } from "./types";

export type PlateView = "split" | "illustration" | "photo";
export interface PlateLit {
  slugs: string[];
  side?: "L" | "R" | "both";
}

export interface PlateArtProps {
  plate: PlateData;
  view: PlateView;
  /** hovered structure (lights both halves) */
  hot?: string | null;
  /** which half the pointer is on (the callout sits there) */
  hotSide?: "L" | "R" | "M" | null;
  selected?: string | null;
  /** structures lit by a caller (BrainstemRef), optionally on one side only */
  lit?: PlateLit | null;
  /** lit structures breathe with the shared pulse (driven by the --bsp-pulse custom property) */
  pulse?: boolean;
  /** print-style small-caps labels in the margins */
  labels?: boolean;
  /** show the hovered structure's name beside it */
  callout?: boolean;
  /** the callout's text when it says more than the name (approx., mastery) */
  calloutText?: string | null;
  names?: Record<string, string>;
  interactive?: boolean;
  onHover?: (slug: string | null, side?: "L" | "R" | "M") => void;
  onPick?: (slug: string) => void;
  className?: string;
  ariaLabel?: string;
}

/** Screen sizes (px) of the plate's text, whatever the plate's size on screen. */
const LABEL_PX = 10.5;
/** Margin labels wrap onto a second line past this many characters. */
const WRAP = 17;

/** A label in at most two lines, broken at the space nearest the middle. */
function wrapLabel(s: string): string[] {
  if (s.length <= WRAP) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}
const CALL_PX = 14;

/** The svg's rendered width in px (0 before the first layout). */
function useWidth(ref: React.RefObject<Element | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Big fibre masses drawn a shade deeper than the tracts, as they stain in the section. */
const PEDUNCLES = new Set(["cerebral-peduncles", "middle-cerebellar-peduncle", "superior-cerebellar-peduncle", "inferior-cerebellar-peduncle", "pyramids", "decussation-of-the-superior-cerebellar-peduncle", "longitudinal-fibers-of-the-pons", "motor-decussation"]);

/** The illustration: tissue, structures, fibres, outline. Static per plate. */
const Illustration = memo(function Illustration({ plate, ids }: { plate: PlateData; ids: { hatch: string; stip: string; shadow: string } }) {
  const regs = plate.regions;
  const white = regs.filter((r) => r.tissue === "white");
  const grey = regs.filter((r) => r.tissue === "grey");
  const space = regs.filter((r) => r.tissue === "space" && !r.open);
  const land = regs.filter((r) => r.tissue === "landmark");
  const nerves = regs.filter((r) => r.tissue === "nerve");
  return (
    <g className="bsp-ill">
      <path d={plate.outline} className="bsp-tissue" fillRule="evenodd" filter={`url(#${ids.shadow})`} />
      {/* the section's own myelin density, as two quiet tones, so the unnamed tissue keeps its form */}
      {plate.bands.map((d, i) => (
        <path key={i} d={d} className={`bsp-band bsp-band${i + 1}`} fillRule="evenodd" />
      ))}
      {white.map((r) => (
        <g key={r.id}>
          <path d={r.d} className={PEDUNCLES.has(r.slug) ? "bsp-wm bsp-wm-ped" : "bsp-wm"} fillRule="evenodd" />
          <path d={r.d} fill={`url(#${ids.hatch})`} fillRule="evenodd" className="bsp-hatch" />
        </g>
      ))}
      {grey.map((r) => (
        <g key={r.id}>
          <path d={r.d} className="bsp-gm" fillRule="evenodd" />
          <path d={r.d} fill={`url(#${ids.stip})`} fillRule="evenodd" className="bsp-stip" />
        </g>
      ))}
      {space.map((r) => (
        <g key={r.id}>
          <path d={r.d} className="bsp-space" fillRule="evenodd" />
          <path d={r.d} className="bsp-space-rim" fillRule="evenodd" />
        </g>
      ))}
      {plate.fibres.map((f) => (
        <path key={f.id} d={f.d} className={`${f.tissue === "nerve" ? "bsp-nerve" : f.fine ? "bsp-fibre bsp-fibre-fine" : "bsp-fibre"}${f.approx ? " bsp-approx" : ""}`} />
      ))}
      {nerves.map((r) => (
        <path key={r.id} d={r.d} className="bsp-wm bsp-wm-nerve" fillRule="evenodd" />
      ))}
      {(plate.detail ?? []).map((x, i) => (
        <path key={`x${i}`} d={x.d} className={`bsp-detail bsp-detail-${x.k}`} />
      ))}
      {[...white, ...grey, ...nerves].map((r) => (
        <path key={r.id} d={r.d} className={r.approx ? "bsp-line bsp-approx" : "bsp-line"} fillRule="evenodd" />
      ))}
      {land.map((r) => (
        <path key={r.id} d={r.d} className="bsp-land" fillRule="evenodd" />
      ))}
      <path d={plate.outline} className="bsp-outline" fillRule="evenodd" />
    </g>
  );
});

/** Region outline for a half: the photo-only view uses the photo's own left outline where it has one. */
function dFor(r: PlateRegion, view: PlateView): string {
  return view === "photo" && r.side === "L" && r.dPhoto ? r.dPhoto : r.d;
}

function nameOf(names: Record<string, string> | undefined, slug: string): string {
  return names?.[slug] ?? slug.replace(/-/g, " ");
}

/** A fibre path's middle point (label anchor). */
function midOf(d: string): [number, number] | undefined {
  const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (n.length < 2) return undefined;
  const k = Math.floor(n.length / 4) * 2;
  return [n[k], n[k + 1]];
}

interface LabelPos {
  slug: string;
  text: string;
  side: "L" | "R";
  y: number;
  ax: number;
  ay: number;
}

/** Margin labels: one per structure, alternating sides top to bottom, spread so they never overlap. */
function layoutLabels(plate: PlateData, names: Record<string, string> | undefined, gap: number): LabelPos[] {
  const [, , W, H] = plate.viewBox;
  const seen = new Map<string, PlateRegion[]>();
  for (const r of plate.regions) seen.set(r.slug, [...(seen.get(r.slug) ?? []), r]);
  for (const f of plate.fibres) if (!seen.has(f.slug)) seen.set(f.slug, []);
  const items: Array<{ slug: string; L?: [number, number]; R?: [number, number]; y: number }> = [];
  for (const [slug, rs] of seen) {
    const l = rs.find((r) => r.side === "L" || r.side === "M");
    const rr = rs.find((r) => r.side === "R" || r.side === "M");
    const one = plate.sym === false;
    let L = l ? (l.side === "M" && !one ? ([Math.min(l.a[0], W - l.a[0]), l.a[1]] as [number, number]) : l.a) : undefined;
    let R = rr ? (rr.side === "M" && !one ? ([Math.max(rr.a[0], W - rr.a[0]), rr.a[1]] as [number, number]) : rr.a) : undefined;
    if (!rs.length) {
      const f = plate.fibres.filter((x) => x.slug === slug);
      L = midOf(f.find((x) => x.side === "L")?.d ?? "");
      R = midOf(f.find((x) => x.side === "R")?.d ?? "");
    }
    if (!L && !R) continue;
    items.push({ slug, L, R, y: (L ?? R)![1] });
  }
  items.sort((a, b) => a.y - b.y);
  const out: LabelPos[] = [];
  items.forEach((it, i) => {
    // one-sided plates: each label goes to the nearer margin
    let side: "L" | "R" = plate.sym === false ? ((it.L ?? it.R)![0] < W / 2 ? "L" : "R") : i % 2 === 0 ? "L" : "R";
    if (side === "L" && !it.L) side = "R";
    if (side === "R" && !it.R) side = "L";
    const a = side === "L" ? it.L! : it.R!;
    out.push({ slug: it.slug, text: nameOf(names, it.slug), side, y: a[1], ax: a[0], ay: a[1] });
  });
  for (const side of ["L", "R"] as const) {
    const col = out.filter((o) => o.side === side).sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < col.length; i++) if (col[i].y - col[i - 1].y < gap) col[i].y = col[i - 1].y + gap;
      const over = col.length ? col[col.length - 1].y - (H - 10) : 0;
      if (over > 0) for (const c of col) c.y -= over;
      for (let i = col.length - 2; i >= 0; i--) if (col[i + 1].y - col[i].y < gap) col[i].y = col[i + 1].y - gap;
      if (col.length && col[0].y < 14) {
        const d = 14 - col[0].y;
        for (const c of col) c.y += d;
      }
    }
  }
  return out;
}

export function PlateArt({ plate, view: askedView, hot, hotSide, selected, lit, pulse, labels, callout, calloutText, names, interactive, onHover, onPick, className, ariaLabel }: PlateArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = useMemo(
    () => ({ hatch: `h${uid}`, stip: `s${uid}`, shadow: `d${uid}`, photo: `p${uid}`, L: `l${uid}`, R: `r${uid}`, frame: `f${uid}` }),
    [uid],
  );
  const [, , W, H] = plate.viewBox;
  const mid = plate.mid;
  // no photo half (a one-sided drawing, or a photo not published yet): the illustration alone, whole
  const view: PlateView = plate.photo?.src && plate.sym !== false ? askedView : "illustration";
  const svgRef = useRef<SVGSVGElement>(null);
  const cw = useWidth(svgRef) || 800;
  // label margin (plate units) so the longest name fits at LABEL_PX, whatever the plate's width on screen
  const longest = useMemo(() => {
    if (!labels) return 0;
    const slugs = new Set([...plate.regions.map((r) => r.slug), ...plate.fibres.map((f) => f.slug)]);
    return Math.max(0, ...[...slugs].flatMap((s) => wrapLabel(nameOf(names, s)).map((l) => l.length)));
  }, [labels, plate, names]);
  let M = 0;
  if (labels) {
    M = 200;
    for (let i = 0; i < 5; i++) M = Math.min(0.8 * W, ((W + 2 * M) / cw) * (22 + longest * LABEL_PX * 0.6));
  }
  const upx = (W + 2 * M) / cw; // plate units per screen px
  const labelFont = LABEL_PX * upx;
  const vb = labels ? `${-M} 0 ${W + 2 * M} ${H}` : `0 0 ${W} ${H}`;
  const lab = useMemo(() => (labels ? layoutLabels(plate, names, labelFont * 2.5) : []), [labels, plate, names, labelFont]);
  const showIll = view !== "photo";
  const showPhoto = view !== "illustration" && !!plate.photo?.src;
  const clipIll = view === "split" ? `url(#${ids.L})` : undefined;
  const clipPhoto = view === "split" ? `url(#${ids.R})` : undefined;

  const hiSlugs = new Set<string>([hot, selected].filter(Boolean) as string[]);
  const litSide = lit?.side ?? "both";
  const litSet = new Set(lit?.slugs ?? []);
  const isLit = (r: { slug: string; side: string }) => litSet.has(r.slug) && (litSide === "both" || r.side === "M" || r.side === litSide);

  const hotRegions = plate.regions.filter((r) => hiSlugs.has(r.slug));
  const litRegions = plate.regions.filter((r) => isLit(r) && !hiSlugs.has(r.slug));
  const hotFibres = plate.fibres.filter((f) => hiSlugs.has(f.slug) || isLit(f));
  // in the split view each instance lives on its half; in the single views every instance is on the one picture
  const kindOf = (side: string) => (view === "split" ? (side === "R" ? "photo" : side === "L" ? "ill" : "both") : view === "photo" ? "photo" : "ill");

  // callout: the name beside the hovered structure, on the half the pointer is on
  let call: { x: number; y: number; text: string } | null = null;
  if (callout && hot) {
    const rs = plate.regions.filter((r) => r.slug === hot);
    const pick = rs.find((r) => r.side === hotSide) ?? rs.find((r) => r.side === "M") ?? rs[0];
    if (pick) {
      let x = pick.a[0];
      if (pick.side === "M" && hotSide === "L" && plate.sym !== false) x = Math.min(x, W - x);
      if (pick.side === "M" && hotSide === "R" && plate.sym !== false) x = Math.max(x, W - x);
      call = { x, y: pick.a[1], text: calloutText ?? nameOf(names, hot) };
    } else {
      const f = plate.fibres.find((x) => x.slug === hot && (x.side === hotSide || !hotSide));
      const p = f ? midOf(f.d) : undefined;
      if (p) call = { x: p[0], y: p[1], text: calloutText ?? nameOf(names, hot) };
    }
  }
  // keep the callout inside the plate
  const callFont = CALL_PX * upx;
  const halfText = call ? call.text.length * callFont * 0.31 : 0;
  const callX = call ? Math.min(W - 8 - halfText, Math.max(8 + halfText, call.x)) : 0;

  return (
    <svg
      viewBox={vb}
      className={`bsp${plate.view === "surface" ? " bsp-surface" : ""}${pulse ? " bsp-pulsing" : ""}${className ? " " + className : ""}`}
      role={interactive ? "group" : "img"}
      aria-label={ariaLabel ?? "Brainstem section plate"}
      ref={svgRef}
      style={{ aspectRatio: `${labels ? W + 2 * M : W} / ${H}`, ...(H > W ? { width: `min(100%, ${Math.round((72 * (labels ? W + 2 * M : W)) / H)}vh)`, marginInline: "auto" } : null) }}
    >
      <defs>
        <clipPath id={ids.L}>
          <rect x={-M} y={-10} width={mid + M} height={H + 20} />
        </clipPath>
        <clipPath id={ids.R}>
          <rect x={mid} y={-10} width={W - mid + M} height={H + 20} />
        </clipPath>
        <clipPath id={ids.frame}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        <pattern id={ids.hatch} patternUnits="userSpaceOnUse" width="3.6" height="3.6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3.6" className="bsp-hatch-line" />
        </pattern>
        <pattern id={ids.stip} patternUnits="userSpaceOnUse" width="4.6" height="4">
          <circle cx="1.1" cy="1" r="0.62" className="bsp-dot" />
          <circle cx="3.4" cy="3" r="0.52" className="bsp-dot" />
        </pattern>
        <filter id={ids.shadow} x="-5%" y="-5%" width="110%" height="112%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" className="bsp-shadow" />
        </filter>
        {showPhoto && (
          <mask id={ids.photo} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <image href={plate.photo!.src} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          </mask>
        )}
      </defs>

      <g clipPath={plate.bleed ? `url(#${ids.frame})` : undefined}>
        {showIll && (
          <g clipPath={clipIll}>
            <Illustration plate={plate} ids={ids} />
          </g>
        )}
        {showPhoto && (
          <g clipPath={clipPhoto}>
            <rect x={0} y={0} width={W} height={H} className="bsp-photo" mask={`url(#${ids.photo})`} />
          </g>
        )}
      </g>
      {/* one crisp outline around both halves: the photo half's tissue edge is the same (registered) outline */}
      {view === "split" && <path d={plate.outline} className="bsp-outline bsp-outline-photo" fillRule="evenodd" clipPath={clipPhoto} />}
      {view === "split" && <line x1={mid} x2={mid} y1={4} y2={H - 4} className="bsp-midline" />}

      {/* lit (caller) and hot (hover/selection) structures */}
      <g className="bsp-lit" pointerEvents="none">
        {litRegions.map((r) => (
          <path key={r.id} d={dFor(r, view)} fillRule="evenodd" className={`bsp-hl bsp-hl-${kindOf(r.side)}${pulse ? " bsp-breathe" : ""}`} />
        ))}
        {hotRegions.map((r) => (
          <path key={r.id} d={dFor(r, view)} fillRule="evenodd" className={`bsp-hl bsp-hl-${kindOf(r.side)}${selected === r.slug ? " bsp-sel" : ""}`} />
        ))}
        {hotFibres.map((f) => (
          <path key={f.id} d={f.d} className={`bsp-hlf${f.fine ? " bsp-hlf-fine" : ""}${pulse && !hiSlugs.has(f.slug) ? " bsp-breathe" : ""}`} />
        ))}
      </g>

      {interactive && (
        <g className="bsp-hit">
          {plate.regions.map((r) => (
            <path
              key={r.id}
              d={dFor(r, view)}
              fillRule="evenodd"
              pointerEvents="all"
              fill="transparent"
              tabIndex={r.side === "R" || r.side === "M" ? 0 : -1}
              role="button"
              aria-label={nameOf(names, r.slug)}
              onPointerEnter={(e) => {
                if (r.side !== "M") return onHover?.(r.slug, r.side);
                const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                onHover?.(r.slug, box && e.clientX < box.left + box.width / 2 ? "L" : "R");
              }}
              onPointerLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(r.slug, r.side)}
              onBlur={() => onHover?.(null)}
              onClick={() => onPick?.(r.slug)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick?.(r.slug);
                }
              }}
            />
          ))}
          {plate.fibres.map((f) => (
            <path key={f.id} d={f.d} fill="none" stroke="transparent" strokeWidth={f.fine ? 7 : 10} pointerEvents="stroke" aria-label={nameOf(names, f.slug)} onPointerEnter={() => onHover?.(f.slug, f.side)} onPointerLeave={() => onHover?.(null)} onClick={() => onPick?.(f.slug)} />
          ))}
        </g>
      )}

      {labels && (
        <g className="bsp-labels" pointerEvents="none">
          {lab.map((l) => {
            const lx = l.side === "L" ? -10 * upx : W + 10 * upx;
            const elbow = l.side === "L" ? 4 : W - 4;
            const on = hiSlugs.has(l.slug) || litSet.has(l.slug);
            return (
              <g key={l.slug} className={on ? "bsp-lab bsp-lab-on" : "bsp-lab"}>
                <polyline points={`${lx + (l.side === "L" ? 4 : -4) * upx},${l.y} ${elbow},${l.y} ${l.ax},${l.ay}`} className="bsp-leader" />
                <circle cx={l.ax} cy={l.ay} r={1.6 * upx} className="bsp-leader-dot" />
                <text x={lx} y={l.y} textAnchor={l.side === "L" ? "end" : "start"} className="bsp-label" style={{ fontSize: labelFont }}>
                  {wrapLabel(l.text).map((t, i, all) => (
                    <tspan key={i} x={lx} dy={i === 0 ? `${0.34 - (all.length - 1) * 0.55}em` : "1.1em"}>
                      {t}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {call && (
        <g pointerEvents="none" className="bsp-callout">
          <text x={callX} y={call.y < callFont * 2 ? call.y + callFont * 1.6 : call.y - callFont * 0.9} textAnchor="middle" className="bsp-call" style={{ fontSize: callFont, strokeWidth: callFont * 0.28 }}>
            {call.text}
          </text>
        </g>
      )}
    </svg>
  );
}
