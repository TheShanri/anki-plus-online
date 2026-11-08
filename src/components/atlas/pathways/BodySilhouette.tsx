import type { Side } from "@/lib/atlas/pathways";

/* A body silhouette seen from the front (patient's left on the viewer's right, like the 3D "Front" view) with the
 * regions of each side shaded: face, arm, trunk, leg. */

export type Region = "face" | "arm" | "trunk" | "leg";
export const REGIONS: Region[] = ["face", "arm", "trunk", "leg"];

/** Which body regions a region phrase from the map names ("the leg and lower trunk below the lesion; the arm is spared"). */
export function regionsFromText(text: string): Region[] {
  const kept = text
    .split(/[;]/)
    .filter((c) => !/spared|not affected|unaffected/i.test(c))
    .join(" ")
    .toLowerCase();
  const out = new Set<Region>();
  if (/\bface|facial|jaw|\bhead|eye|tongue/.test(kept)) out.add("face");
  if (/\barm|\bhand|upper limb|forearm/.test(kept)) out.add("arm");
  if (/\bleg|\bfoot|feet|lower limb|\bthigh/.test(kept)) out.add("leg");
  if (/trunk|torso|chest|abdom|\bback\b/.test(kept)) out.add("trunk");
  if (/limb|half of the body|whole half|body below|the body|body part|dermatome|myotome/.test(kept)) {
    out.add("arm");
    out.add("leg");
    out.add("trunk");
  }
  if (!out.size) {
    out.add("arm");
    out.add("leg");
    out.add("trunk");
  }
  return REGIONS.filter((r) => out.has(r));
}

/** Polygons for the patient's RIGHT half (viewer's left); the left half is the mirror image about x = 50. */
const SHAPES: Record<Region, string> = {
  face: "M 50 6 C 41 6 38 13 38 19 C 38 27 43 31 50 32 Z",
  trunk: "M 50 36 L 35 36 Q 31 36 31 41 L 32 98 L 50 100 Z",
  arm: "M 29 37 Q 22 37 21 44 L 17 94 Q 17 98 21 98 L 25 98 Q 28 98 28 94 L 31 52 Z",
  leg: "M 49 104 L 33 103 L 34 170 L 33 196 Q 33 200 37 200 L 45 200 Q 48 200 48 196 L 49 170 Z",
};
const mirrorPath = (d: string) =>
  d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(100 - Number(x)).toFixed(1)} ${y}`);

export function BodySilhouette({
  shade,
  colors,
  size = 120,
  letters = true,
  ink = "currentColor",
}: {
  shade: Partial<Record<Side, Region[]>>;
  colors: { L: string; R: string };
  /** Pixel height. */
  size?: number;
  letters?: boolean;
  ink?: string;
}) {
  const w = (size * 100) / 206;
  return (
    <svg viewBox="0 0 100 206" width={w} height={size} role="img" aria-label={`Shaded body regions: ${(["R", "L"] as Side[]).map((s) => `${s === "L" ? "left" : "right"} ${shade[s]?.join(", ") || "none"}`).join("; ")}`} style={{ color: ink, flex: "none" }}>
      {(["R", "L"] as Side[]).map((side) =>
        REGIONS.map((reg) => {
          const on = shade[side]?.includes(reg);
          const d = side === "R" ? SHAPES[reg] : mirrorPath(SHAPES[reg]);
          return (
            <path
              key={`${side}${reg}`}
              d={d}
              fill={on ? colors[side] : "currentColor"}
              fillOpacity={on ? 0.9 : 0.07}
              stroke="currentColor"
              strokeOpacity={on ? 0.9 : 0.4}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeDasharray={on && side === "R" ? "5 3" : undefined}
            />
          );
        }),
      )}
      <line x1="50" y1="2" x2="50" y2="204" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.2} strokeDasharray="2 3" />
      {letters && (
        <g style={{ font: "700 15px var(--font-mono, monospace)" }} fill="currentColor" opacity={0.75}>
          <text x="3" y="14">R</text>
          <text x="97" y="14" textAnchor="end">L</text>
        </g>
      )}
    </svg>
  );
}
