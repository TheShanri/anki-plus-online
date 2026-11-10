"use client";
// One brainstem plate as an atlas page: the illustration (hairline outlines, tonal fills for grey matter, white matter
// and spaces) and the course's myelin-stained section, split at the midline by default. The section is drawn as ink
// through its own density (a luminance mask), so it follows the theme: dark stain on paper, or a dark-field look on a
// dark theme. Regions light on both halves together; the photo half uses the registered (mirrored) outline.
import { memo, useId, useMemo } from "react";
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
  names?: Record<string, string>;
  interactive?: boolean;
  onHover?: (slug: string | null, side?: "L" | "R" | "M") => void;
  onPick?: (slug: string) => void;
  className?: string;
  ariaLabel?: string;
}

const MARGIN = 210; // label margin (plate units) on each side

function onHalf(r: PlateRegion, view: PlateView): boolean {
  return view !== "split" || r.side === "M" || true;
}

/** The illustration: tissue, myelin bands, structures, fibres, outline. Static per plate. */
const Illustration = memo(function Illustration({ plate, ids }: { plate: PlateData; ids: { hatch: string; stip: string } }) {
  const regs = plate.regions;
  const white = regs.filter((r) => r.tissue === "white");
  const grey = regs.filter((r) => r.tissue === "grey");
  const space = regs.filter((r) => r.tissue === "space");
  const land = regs.filter((r) => r.tissue === "landmark");
  return (
    <g className="bsp-ill">
      <path d={plate.outline} className="bsp-tissue" fillRule="evenodd" />
      {plate.bands.map((d, i) => (
        <path key={i} d={d} className={`bsp-band bsp-band${i + 1}`} fillRule="evenodd" />
      ))}
      {white.map((r) => (
        <g key={r.id}>
          <path d={r.d} className="bsp-wm" fillRule="evenodd" />
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
        <path key={r.id} d={r.d} className="bsp-space" fillRule="evenodd" />
      ))}
      {plate.fibres.map((f) => (
        <path key={f.id} d={f.d} className={f.tissue === "nerve" ? "bsp-nerve" : "bsp-fibre"} />
      ))}
      {[...white, ...grey].map((r) => (
        <path key={r.id} d={r.d} className="bsp-line" fillRule="evenodd" />
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

interface LabelPos {
  slug: string;
  text: string;
  side: "L" | "R";
  y: number;
  ax: number;
  ay: number;
}

/** Margin labels: one per structure, alternating sides top to bottom, spread so they never overlap. */
function layoutLabels(plate: PlateData, names: Record<string, string> | undefined, view: PlateView): LabelPos[] {
  const [, , W, H] = plate.viewBox;
  const seen = new Map<string, PlateRegion[]>();
  for (const r of plate.regions) seen.set(r.slug, [...(seen.get(r.slug) ?? []), r]);
  for (const f of plate.fibres) if (!seen.has(f.slug)) seen.set(f.slug, []);
  const items: Array<{ slug: string; L?: [number, number]; R?: [number, number]; y: number }> = [];
  for (const [slug, rs] of seen) {
    const l = rs.find((r) => r.side === "L" || r.side === "M");
    const rr = rs.find((r) => r.side === "R" || r.side === "M");
    let L = l ? (l.side === "M" ? ([Math.min(l.a[0], W - l.a[0]), l.a[1]] as [number, number]) : l.a) : undefined;
    let R = rr ? (rr.side === "M" ? ([Math.max(rr.a[0], W - rr.a[0]), rr.a[1]] as [number, number]) : rr.a) : undefined;
    if (!rs.length) {
      // a fibre course: anchor on its middle point
      const f = plate.fibres.filter((x) => x.slug === slug);
      const pt = (side: "L" | "R") => {
        const fx = f.find((x) => x.side === side);
        const nums = fx?.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        const k = Math.floor(nums.length / 4) * 2;
        return nums.length >= 2 ? ([nums[k], nums[k + 1]] as [number, number]) : undefined;
      };
      L = pt("L");
      R = pt("R");
    }
    if (!L && !R) continue;
    items.push({ slug, L, R, y: (L ?? R)![1] });
  }
  items.sort((a, b) => a.y - b.y);
  const out: LabelPos[] = [];
  items.forEach((it, i) => {
    // split view: the left margin names the illustration, the right margin names the photo
    let side: "L" | "R" = i % 2 === 0 ? "L" : "R";
    if (side === "L" && !it.L) side = "R";
    if (side === "R" && !it.R) side = "L";
    const a = side === "L" ? it.L! : it.R!;
    out.push({ slug: it.slug, text: nameOf(names, it.slug), side, y: a[1], ax: a[0], ay: a[1] });
  });
  for (const side of ["L", "R"] as const) {
    const col = out.filter((o) => o.side === side).sort((a, b) => a.y - b.y);
    const gap = 19;
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < col.length; i++) if (col[i].y - col[i - 1].y < gap) col[i].y = col[i - 1].y + gap;
      const over = col.length ? col[col.length - 1].y - (H - 8) : 0;
      if (over > 0) for (const c of col) c.y -= over;
      for (let i = col.length - 2; i >= 0; i--) if (col[i + 1].y - col[i].y < gap) col[i].y = col[i + 1].y - gap;
      if (col.length && col[0].y < 12) {
        const d = 12 - col[0].y;
        for (const c of col) c.y += d;
      }
    }
  }
  void view;
  return out;
}

export function PlateArt({ plate, view, hot, hotSide, selected, lit, pulse, labels, callout, names, interactive, onHover, onPick, className, ariaLabel }: PlateArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = useMemo(() => ({ hatch: `h${uid}`, stip: `s${uid}`, photo: `p${uid}`, L: `l${uid}`, R: `r${uid}`, frame: `f${uid}` }), [uid]);
  const [, , W, H] = plate.viewBox;
  const mid = plate.mid;
  const vb = labels ? `${-MARGIN} 0 ${W + 2 * MARGIN} ${H}` : `0 0 ${W} ${H}`;
  const lab = useMemo(() => (labels ? layoutLabels(plate, names, view) : []), [labels, plate, names, view]);
  const showIll = view !== "photo";
  const showPhoto = view !== "illustration" && !!plate.photo?.src;
  const clipIll = view === "split" ? `url(#${ids.L})` : undefined;
  const clipPhoto = view === "split" ? `url(#${ids.R})` : undefined;

  const hiSlugs = new Set<string>([hot, selected].filter(Boolean) as string[]);
  const litSide = lit?.side ?? "both";
  const litSet = new Set(lit?.slugs ?? []);
  const isLit = (r: { slug: string; side: string }) => litSet.has(r.slug) && (litSide === "both" || r.side === "M" || r.side === litSide);

  // in the split view each instance lives on its half; in the single views every instance is on the one picture
  const instances = plate.regions.filter((r) => onHalf(r, view));
  const hotRegions = instances.filter((r) => hiSlugs.has(r.slug));
  const litRegions = instances.filter((r) => isLit(r) && !hiSlugs.has(r.slug));
  const hotFibres = plate.fibres.filter((f) => hiSlugs.has(f.slug) || isLit(f));
  const kindOf = (side: string) => (view === "split" ? (side === "R" ? "photo" : side === "L" ? "ill" : "both") : view === "photo" ? "photo" : "ill");

  // callout: name beside the hovered structure, on the half the pointer is on
  let call: { x: number; y: number; text: string } | null = null;
  if (callout && hot) {
    const rs = instances.filter((r) => r.slug === hot);
    const pick = rs.find((r) => r.side === hotSide) ?? rs.find((r) => r.side === "M") ?? rs[0];
    if (pick) {
      let x = pick.a[0];
      if (pick.side === "M" && hotSide === "L") x = Math.min(x, W - x);
      if (pick.side === "M" && hotSide === "R") x = Math.max(x, W - x);
      call = { x, y: pick.a[1], text: nameOf(names, hot) };
    } else {
      const f = plate.fibres.find((x) => x.slug === hot && (x.side === hotSide || !hotSide));
      const n = f?.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      if (n.length >= 2) call = { x: n[0], y: n[1], text: nameOf(names, hot) };
    }
  }

  return (
    <svg
      viewBox={vb}
      className={`bsp${pulse ? " bsp-pulsing" : ""}${className ? " " + className : ""}`}
      role={interactive ? "group" : "img"}
      aria-label={ariaLabel ?? "Brainstem section plate"}
      style={{ aspectRatio: `${labels ? W + 2 * MARGIN : W} / ${H}` }}
    >
      <defs>
        <clipPath id={ids.L}>
          <rect x={-MARGIN} y={-10} width={mid + MARGIN} height={H + 20} />
        </clipPath>
        <clipPath id={ids.R}>
          <rect x={mid} y={-10} width={W - mid + MARGIN} height={H + 20} />
        </clipPath>
        <clipPath id={ids.frame}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        <pattern id={ids.hatch} patternUnits="userSpaceOnUse" width="3.4" height="3.4" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="3.4" className="bsp-hatch-line" />
        </pattern>
        <pattern id={ids.stip} patternUnits="userSpaceOnUse" width="5.2" height="4.5">
          <circle cx="1.3" cy="1.1" r="0.42" className="bsp-dot" />
          <circle cx="3.9" cy="3.35" r="0.42" className="bsp-dot" />
        </pattern>
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
      {view === "split" && <line x1={mid} x2={mid} y1={-4} y2={H + 4} className="bsp-midline" />}

      {/* lit (caller) and hot (hover/selection) structures */}
      <g className="bsp-lit" pointerEvents="none">
        {litRegions.map((r) => (
          <path key={r.id} d={dFor(r, view)} fillRule="evenodd" className={`bsp-hl bsp-hl-${kindOf(r.side)}${pulse ? " bsp-breathe" : ""}`} />
        ))}
        {hotRegions.map((r) => (
          <path key={r.id} d={dFor(r, view)} fillRule="evenodd" className={`bsp-hl bsp-hl-${kindOf(r.side)}${selected === r.slug ? " bsp-sel" : ""}`} />
        ))}
        {hotFibres.map((f) => (
          <path key={f.id} d={f.d} className={`bsp-hlf${pulse && !hiSlugs.has(f.slug) ? " bsp-breathe" : ""}`} />
        ))}
      </g>

      {interactive && (
        <g className="bsp-hit">
          {instances.map((r) => (
            <path
              key={r.id}
              d={dFor(r, view)}
              fillRule="evenodd"
              pointerEvents="all"
              fill="transparent"
              tabIndex={r.side === "R" || r.side === "M" ? 0 : -1}
              role="button"
              aria-label={nameOf(names, r.slug)}
              onPointerEnter={(e) => onHover?.(r.slug, r.side === "M" ? (e.nativeEvent.offsetX < (e.currentTarget.ownerSVGElement?.clientWidth ?? 0) / 2 ? "L" : "R") : r.side)}
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
            <path key={f.id} d={f.d} fill="none" stroke="transparent" strokeWidth={9} pointerEvents="stroke" onPointerEnter={() => onHover?.(f.slug, f.side)} onPointerLeave={() => onHover?.(null)} onClick={() => onPick?.(f.slug)} />
          ))}
        </g>
      )}

      {labels && (
        <g className="bsp-labels" pointerEvents="none">
          {lab.map((l) => {
            const lx = l.side === "L" ? -14 : W + 14;
            const elbow = l.side === "L" ? 6 : W - 6;
            const on = hiSlugs.has(l.slug);
            return (
              <g key={l.slug} className={on ? "bsp-lab bsp-lab-on" : "bsp-lab"}>
                <polyline points={`${lx + (l.side === "L" ? 4 : -4)},${l.y} ${elbow},${l.y} ${l.ax},${l.ay}`} className="bsp-leader" />
                <circle cx={l.ax} cy={l.ay} r={1.9} className="bsp-leader-dot" />
                <text x={lx} y={l.y} dy="0.34em" textAnchor={l.side === "L" ? "end" : "start"} className="bsp-label">
                  {l.text}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {call && (
        <g pointerEvents="none" className="bsp-callout">
          <text x={call.x} y={Math.max(18, call.y - 16)} textAnchor="middle" className="bsp-call">
            {call.text}
          </text>
        </g>
      )}
    </svg>
  );
}
