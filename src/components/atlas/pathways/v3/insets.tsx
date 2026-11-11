"use client";

import { useEffect, useState } from "react";

/* Section insets for cord and brainstem beats: the level's cross-section with the tract lit and the signal dot on its side.
 * Orientation everywhere: dorsal at the top, the patient's left on the viewer's left (as in the 2D diagrams). */

export type InsetSide = "L" | "R" | "both";

/* ---------- spinal cord: our own schematic section (grey H, dorsal columns, lateral and anterior funiculi) ---------- */
// tract -> [x (0 = midline, 1 = lateral edge), y (0 = dorsal edge, 1 = ventral edge)] on the left half
const CORD_TRACTS: Record<string, { at: [number, number]; name: string }> = {
  "fasciculus-gracilis": { at: [0.14, 0.12], name: "Fasciculus gracilis" },
  "fasciculus-cuneatus": { at: [0.36, 0.14], name: "Fasciculus cuneatus" },
  "lateral-corticospinal-tract": { at: [0.66, 0.42], name: "Lateral corticospinal tract" },
  "dorsal-spinocerebellar-tract": { at: [0.88, 0.36], name: "Dorsal spinocerebellar tract" },
  "rubrospinal-tract": { at: [0.7, 0.56], name: "Rubrospinal tract" },
  "anterolateral-spinothalamic-tract": { at: [0.8, 0.7], name: "Anterolateral tract" },
  "anterior-corticospinal-tract": { at: [0.12, 0.9], name: "Anterior corticospinal tract" },
  "vestibulospinal-tract": { at: [0.42, 0.9], name: "Vestibulospinal tract" },
  "tectospinal-tract": { at: [0.2, 0.84], name: "Tectospinal tract" },
  "reticulospinal-tract": { at: [0.56, 0.84], name: "Reticulospinal tract" },
  "dorsal-horn": { at: [0.33, 0.33], name: "Dorsal horn" },
  "ventral-horn": { at: [0.36, 0.68], name: "Ventral horn" },
  "ventral-horn-lateral": { at: [0.44, 0.68], name: "Ventral horn (lateral)" },
  "ventral-horn-medial": { at: [0.22, 0.7], name: "Ventral horn (medial)" },
  "lateral-horn": { at: [0.5, 0.5], name: "Lateral horn" },
  "clarke-nucleus": { at: [0.16, 0.42], name: "Clarke's nucleus" },
  "anterior-white-commissure": { at: [0, 0.62], name: "Anterior white commissure" },
  "dorsal-root": { at: [0.55, -0.08], name: "Dorsal root" },
  "ventral-root": { at: [0.42, 1.08], name: "Ventral root" },
};

export function CordInset({ level, structures, side, pulseKey, compact }: { level: string; structures: string[]; side: InsetSide; pulseKey?: number; compact?: boolean }) {
  const W = 220, H = 170;
  const cx = W / 2, cy = 84, rx = 92, ry = 62;
  // the patient's left on the viewer's left: the left half is drawn at x < cx
  const pt = (t: string, s: "L" | "R") => {
    const a = CORD_TRACTS[t]?.at ?? [0.5, 0.5];
    const sx = s === "L" ? -1 : 1;
    return [cx + sx * a[0] * rx * 0.96, cy - ry + a[1] * ry * 2] as const;
  };
  const sides: ("L" | "R")[] = side === "both" ? ["L", "R"] : [side];
  const thoracic = /^T|^L1|^L2/.test(level);
  const butterfly = (sx: number) =>
    `M ${cx} ${cy - 6} C ${cx + sx * 14} ${cy - 10} ${cx + sx * 22} ${cy - 38} ${cx + sx * 30} ${cy - 54} L ${cx + sx * 38} ${cy - 50} C ${cx + sx * 32} ${cy - 30} ${cx + sx * 30} ${cy - 14} ${cx + sx * (thoracic ? 44 : 40)} ${cy} C ${cx + sx * 54} ${cy + 12} ${cx + sx * 50} ${cy + 36} ${cx + sx * 38} ${cy + 42} C ${cx + sx * 24} ${cy + 44} ${cx + sx * 14} ${cy + 20} ${cx} ${cy + 12} Z`;
  return (
    <figure className="m-0" aria-label={`Spinal cord section at ${level}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width={compact ? 170 : 220} className="block" role="img">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--panel-solid, #222)" stroke="var(--text-dim)" strokeWidth="1.4" />
        <path d={butterfly(-1)} fill="color-mix(in srgb, var(--text-dim) 30%, transparent)" stroke="var(--text-dim)" strokeWidth="0.8" />
        <path d={butterfly(1)} fill="color-mix(in srgb, var(--text-dim) 30%, transparent)" stroke="var(--text-dim)" strokeWidth="0.8" />
        <line x1={cx} y1={cy - ry - 6} x2={cx} y2={cy + ry + 6} stroke="#E5484D" strokeWidth="1" strokeDasharray="3 3" />
        {structures.map((t) =>
          sides.map((s) => {
            const [x, y] = pt(t, s);
            return <circle key={t + s} cx={x} cy={y} r={t.includes("horn") || t.includes("nucleus") ? 7 : 9} fill="color-mix(in srgb, var(--accent) 45%, transparent)" stroke="var(--accent)" strokeWidth="1.4" />;
          }),
        )}
        {structures.slice(0, 1).map((t) =>
          sides.map((s) => {
            const [x, y] = pt(t, s);
            return (
              <circle key={`dot${t}${s}${pulseKey ?? 0}`} cx={x} cy={y} r="3.6" fill="var(--text)" className="pw3-dot">
                <animate attributeName="r" values="3;5;3" dur="1.2s" repeatCount="indefinite" />
              </circle>
            );
          }),
        )}
        <text x="6" y={H - 6} fontSize="11" fill="var(--text-dim)" fontFamily="var(--font-mono, monospace)">L</text>
        <text x={W - 14} y={H - 6} fontSize="11" fill="var(--text-dim)" fontFamily="var(--font-mono, monospace)">R</text>
        <text x={cx} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--text-dim)">dorsal up · {level}</text>
      </svg>
      <figcaption className="text-[11px] leading-tight text-text-dim">{structures.map((t) => CORD_TRACTS[t]?.name ?? t).join(", ")}</figcaption>
    </figure>
  );
}

/* ---------- brainstem: thin adapter over the course plates until BrainstemRef ships (same props as its interface) ---------- */
interface Plate {
  level: string;
  viewBox: [number, number, number, number];
  /** older plates: one filled ink path; newer plates: an outline path and side-tagged regions */
  ink?: string;
  outline?: string;
  mid?: number;
  regions: { id: string; slugs: string[]; d: string; c: [number, number]; side?: "L" | "R" | "M" }[];
  /** fibre bundles drawn as strokes (internal arcuate fibres, nerve rootlets, transverse pontine fibres) */
  fibres?: { id: string; slug: string; side: "L" | "R"; d: string }[];
}
const plates = new Map<string, Promise<Plate | null>>();
/** Fetches a level's plate ahead of its beat (behind the loader), so the inset never shows an empty section. */
export const preloadPlate = (level: string) => void loadPlate(level);
function loadPlate(level: string) {
  let p = plates.get(level);
  if (!p) {
    p = fetch(`/api/atlas/brainstem/plate/${level}`)
      .then((r) => (r.ok ? (r.json() as Promise<Plate>) : null))
      .catch(() => null);
    plates.set(level, p);
  }
  return p;
}
// where a tract sits on a standard section when the plate has no region for it: [x 0..1 of the left half from the midline, y 0..1 dorsal to ventral]
const BS_FALLBACK: Record<string, [number, number]> = {
  "medial-lemniscus": [0.12, 0.62],
  "internal-arcuate-fibers": [0.25, 0.5],
  "anterolateral-spinothalamic-tract": [0.62, 0.55],
  "lateral-corticospinal-tract": [0.5, 0.45],
  "motor-decussation": [0.05, 0.72],
  "pyramids": [0.18, 0.88],
  "cerebral-peduncles": [0.55, 0.82],
  "longitudinal-fibers-of-the-pons": [0.3, 0.75],
  "transverse-fibers-of-the-pons": [0.2, 0.85],
  "medial-longitudinal-fasciculus": [0.08, 0.25],
  "spinal-trigeminal-nucleus": [0.72, 0.38],
  "inferior-cerebellar-peduncle": [0.8, 0.25],
  "middle-cerebellar-peduncle": [0.85, 0.5],
  "superior-cerebellar-peduncle": [0.55, 0.25],
  "decussation-of-the-superior-cerebellar-peduncle": [0.03, 0.55],
  "dorsal-spinocerebellar-tract": [0.82, 0.42],
  "trigeminal-lemniscus": [0.3, 0.55],
  "pontine-nuclei": [0.35, 0.8],
};

export interface BrainstemRefProps {
  level?: string;
  structures?: string[];
  side?: "L" | "R" | "both";
  pulseKey?: number;
  compact?: boolean;
  onPick?: (slug: string) => void;
}
export function BrainstemInset({ level, structures = [], side = "both", pulseKey, compact, onPick }: BrainstemRefProps) {
  const [plate, setPlate] = useState<{ level: string; p: Plate | null } | null>(null);
  useEffect(() => {
    if (!level) return;
    let alive = true;
    loadPlate(level).then((p) => alive && setPlate({ level, p }));
    return () => {
      alive = false;
    };
  }, [level]);
  const p = plate && plate.level === level ? plate.p : null;
  if (!level) return null;
  const vb = p?.viewBox ?? [0, 0, 1000, 800];
  const W = vb[2], H = vb[3];
  const sides: ("L" | "R")[] = side === "both" ? ["L", "R"] : [side];
  // the dot: the plate region of the first structure on that side (patient's left on the viewer's left), else the standard spot
  const dot = (slug: string, s: "L" | "R") => {
    const rs = p?.regions.filter((r) => r.slugs.includes(slug)) ?? [];
    const mid = p?.mid ?? W / 2;
    const want = rs.filter((r) => (r.side && r.side !== "M" ? r.side === s : s === "L" ? r.c[0] < mid : r.c[0] >= mid));
    const r = want[0] ?? rs[0];
    if (r) return r.c;
    const f = BS_FALLBACK[slug] ?? [0.3, 0.5];
    return [W / 2 + (s === "L" ? -1 : 1) * f[0] * W * 0.42, H * 0.1 + f[1] * H * 0.8] as [number, number];
  };
  return (
    <figure className="m-0" aria-label={`Brainstem section: ${level}`}>
      <svg viewBox={vb.join(" ")} width={compact ? 170 : 220} className="block" role="img">
        <rect x={vb[0]} y={vb[1]} width={W} height={H} fill="var(--panel-solid, #222)" rx="18" />
        {p?.outline ? (
          <path d={p.outline} fill="color-mix(in srgb, var(--text-dim) 12%, transparent)" stroke="var(--text-dim)" strokeWidth="5" />
        ) : p?.ink ? (
          <path d={p.ink} fill="var(--text-dim)" opacity="0.75" />
        ) : (
          <ellipse cx={W / 2} cy={H / 2} rx={W * 0.4} ry={H * 0.38} fill="none" stroke="var(--text-dim)" strokeWidth="6" />
        )}
        {p?.outline && p.regions.filter((r) => !r.slugs.some((s) => structures.includes(s))).map((r) => <path key={`o${r.id}`} d={r.d} fill="none" stroke="var(--text-dim)" strokeWidth="2.5" opacity="0.55" />)}
        {p?.regions
          .filter((r) => r.slugs.some((s) => structures.includes(s)))
          .map((r) => (
            <path key={r.id} d={r.d} fill="color-mix(in srgb, var(--accent) 50%, transparent)" stroke="var(--accent)" strokeWidth="4" onClick={() => onPick?.(r.slugs[0])} style={{ cursor: onPick ? "pointer" : undefined }} />
          ))}
        {p?.fibres?.filter((fb) => structures.includes(fb.slug)).map((fb) => (
          <path key={fb.id} d={fb.d} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
        ))}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#E5484D" strokeWidth="4" strokeDasharray="14 12" />
        {structures.slice(0, 1).map((st) =>
          sides.map((s) => {
            const [x, y] = dot(st, s);
            return (
              <circle key={`${st}${s}${pulseKey ?? 0}`} cx={x} cy={y} r={W * 0.018} fill="var(--text)" stroke="var(--accent)" strokeWidth={W * 0.006}>
                <animate attributeName="r" values={`${W * 0.014};${W * 0.024};${W * 0.014}`} dur="1.2s" repeatCount="indefinite" />
              </circle>
            );
          }),
        )}
        <text x={W * 0.03} y={H * 0.96} fontSize={W * 0.05} fill="var(--text-dim)" fontFamily="var(--font-mono, monospace)">L</text>
        <text x={W * 0.93} y={H * 0.96} fontSize={W * 0.05} fill="var(--text-dim)" fontFamily="var(--font-mono, monospace)">R</text>
      </svg>
      <figcaption className="text-[11px] leading-tight text-text-dim">{structures.map((s) => s.replace(/-/g, " ")).join(", ")}</figcaption>
    </figure>
  );
}
