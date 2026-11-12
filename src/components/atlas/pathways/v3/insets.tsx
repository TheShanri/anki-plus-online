"use client";

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
