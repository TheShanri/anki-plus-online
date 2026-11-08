import type { Side } from "@/lib/atlas/pathways";

/* The visual field, drawn the way the course draws it: two circles (left eye, right eye), each split into the left and
 * right hemifield and the upper / lower quadrants. Colour code, used from the retina to V1:
 *   left hemifield = the "left" colour, right hemifield = the "right" colour, upper = lighter, lower = darker. */

export type Quad = "LU" | "LL" | "RU" | "RL";
export const QUADS: Quad[] = ["LU", "LL", "RU", "RL"];
export type Lost = Record<Side, Quad[]>;

/** Mix a CSS colour (#rrggbb or rgb(...)) toward white (k > 0) or black (k < 0). */
export function shade(css: string, k: number): string {
  let r = 128, g = 128, b = 128;
  const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
  const rgb = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(css);
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else if (rgb) {
    r = +rgb[1];
    g = +rgb[2];
    b = +rgb[3];
  }
  const t = k >= 0 ? 255 : 0;
  const a = Math.abs(k);
  const m = (c: number) => Math.round(c + (t - c) * a);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

export interface FieldPalette {
  LU: string;
  LL: string;
  RU: string;
  RL: string;
}
export function fieldPalette(left: string, right: string): FieldPalette {
  return { LU: shade(left, 0.28), LL: shade(left, -0.22), RU: shade(right, 0.28), RL: shade(right, -0.22) };
}

export interface FieldDefect {
  name: string;
  /** Plain-English line. */
  detail: string;
  lost: Lost;
  /** Macular sparing drawn (course: PCA stroke, calcarine cortex). */
  sparing?: boolean;
}

const all = (f: Side): Quad[] => [`${f}U`, `${f}L`] as Quad[];
const fieldName = (f: Side) => (f === "L" ? "left" : "right");
const opp = (s: Side): Side => (s === "L" ? "R" : "L");

/** The classic defect for a visual-pathway lesion site, per the course: Meyer's loop = contralateral superior
 *  quadrantanopia ("pie in the sky"), parietal route = inferior quadrantanopia, calcarine cortex = homonymous
 *  hemianopia with macular sparing possible. */
export function fieldDefect(siteId: string, side: Side): FieldDefect | null {
  const f = opp(side); // after the chiasm a lesion on one side loses the opposite field in both eyes
  switch (siteId) {
    case "vis-nerve":
      return {
        name: "Monocular blindness",
        detail: `All vision lost in the ${fieldName(side)} eye (the optic nerve carries one eye's fibres).`,
        lost: { L: side === "L" ? QUADS : [], R: side === "R" ? QUADS : [] },
      };
    case "vis-chiasm":
      return {
        name: "Bitemporal hemianopia",
        detail: "The crossing nasal fibres are cut: each eye loses its temporal field (peripheral vision, \"tunnel vision\"), e.g. a pituitary adenoma.",
        lost: { L: all("L"), R: all("R") },
      };
    case "vis-tract":
    case "vis-lgn":
    case "thal-lgn":
    case "vis-rad":
      return {
        name: `${f === "L" ? "Left" : "Right"} homonymous hemianopia`,
        detail: `The whole ${fieldName(f)} visual field is lost in both eyes (the lesion is on the ${fieldName(side)}, opposite the loss).`,
        lost: { L: all(f), R: all(f) },
      };
    case "vis-meyer":
      return {
        name: `${f === "L" ? "Left" : "Right"} superior quadrantanopia (pie in the sky)`,
        detail: `Meyer's loop (the temporal lobe) carries the upper field: the upper ${fieldName(f)} quadrant is lost in both eyes.`,
        lost: { L: [`${f}U` as Quad], R: [`${f}U` as Quad] },
      };
    case "vis-parietal":
      return {
        name: `${f === "L" ? "Left" : "Right"} inferior quadrantanopia`,
        detail: `The parietal route carries the lower field: the lower ${fieldName(f)} quadrant is lost in both eyes.`,
        lost: { L: [`${f}L` as Quad], R: [`${f}L` as Quad] },
      };
    case "vis-v1":
      return {
        name: `${f === "L" ? "Left" : "Right"} homonymous hemianopia, macular sparing possible`,
        detail: `Calcarine cortex: the whole ${fieldName(f)} field is lost in both eyes; central (macular) vision can be spared in a posterior cerebral artery stroke.`,
        lost: { L: all(f), R: all(f) },
        sparing: true,
      };
    default:
      return null;
  }
}

function wedge(cx: number, cy: number, r: number, q: Quad): string {
  const left = q[0] === "L";
  const up = q[1] === "U";
  const x = left ? cx - r : cx + r;
  const y = up ? cy - r : cy + r;
  // the arc runs from the horizontal axis to the vertical axis through the quadrant
  const sweep = left === up ? 1 : 0;
  return `M ${cx} ${cy} L ${x} ${cy} A ${r} ${r} 0 0 ${sweep} ${cx} ${y} Z`;
}

/** Two field circles (as the patient sees them: left eye on the left). `lost` quadrants are blacked out, `dim` fades a hemifield. */
export function FieldDiagram({
  palette,
  lost,
  sparing,
  dim,
  width = 260,
  labels = true,
  ink = "currentColor",
}: {
  palette: FieldPalette;
  lost?: Lost;
  sparing?: boolean;
  dim?: Partial<Record<Side, number>>;
  width?: number;
  labels?: boolean;
  ink?: string;
}) {
  const r = 44;
  const H = labels ? 124 : 100;
  const centres: Record<Side, number> = { L: 58, R: 170 };
  return (
    <svg viewBox={`0 0 228 ${H}`} width={width} role="img" aria-label="Visual field diagram: left eye and right eye, each split into left and right halves and upper and lower quadrants" style={{ color: ink, maxWidth: "100%", height: "auto" }}>
      {(["L", "R"] as Side[]).map((eye) => {
        const cx = centres[eye];
        const cy = 54;
        return (
          <g key={eye}>
            {QUADS.map((q) => {
              const isLost = lost?.[eye].includes(q);
              const f = q[0] as Side;
              return <path key={q} d={wedge(cx, cy, r, q)} fill={isLost ? "#06060a" : palette[q]} opacity={isLost ? 0.96 : (dim?.[f] ?? 1)} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.8} />;
            })}
            {sparing && lost?.[eye].length ? <circle cx={cx} cy={cy} r={r * 0.2} fill={palette[(lost[eye][0] as Quad)] ?? palette.LU} stroke="currentColor" strokeOpacity={0.5} strokeWidth={0.8} /> : null}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={1.4} />
            <circle cx={cx} cy={cy} r={2} fill="currentColor" />
            {labels && (
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="9.5" fill="currentColor" opacity={0.85} style={{ font: "600 9.5px var(--font-mono, monospace)", letterSpacing: "0.06em" }}>
                {eye === "L" ? "LEFT EYE" : "RIGHT EYE"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Medial view of the occipital pole: the calcarine fissure splits V1 into an upper bank (cuneus, lower field) and a
 *  lower bank (lingual gyrus, upper field), with the macula at the pole. `field` = the hemifield this hemisphere sees. */
export function CalcarineDiagram({ palette, field, width = 220, ink = "currentColor" }: { palette: FieldPalette; field: Side; width?: number; ink?: string }) {
  const up = palette[`${field}U` as Quad];
  const low = palette[`${field}L` as Quad];
  return (
    <svg viewBox="0 0 220 120" width={width} role="img" aria-label="Medial occipital lobe: the calcarine fissure with the cuneus above it and the lingual gyrus below it" style={{ color: ink, maxWidth: "100%", height: "auto" }}>
      <path d="M 200 60 C 200 18 150 8 100 14 C 60 18 28 30 12 56 L 12 60 Z" fill={low} opacity={0.95} />
      <path d="M 200 60 C 200 102 150 112 100 106 C 60 102 28 90 12 64 L 12 60 Z" fill={up} opacity={0.95} />
      <path d="M 200 60 L 12 60" stroke="#06060a" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 0" />
      <circle cx="190" cy="60" r="9" fill="#fff3b0" stroke="#06060a" strokeWidth="1" />
      <g style={{ font: "600 9.5px var(--font-mono, monospace)" }} fill="#06060a">
        <text x="104" y="36" textAnchor="middle">CUNEUS: LOWER FIELD</text>
        <text x="104" y="92" textAnchor="middle">LINGUAL GYRUS: UPPER FIELD</text>
      </g>
      <text x="104" y="57" textAnchor="middle" fill="#fff" style={{ font: "700 9px var(--font-mono, monospace)", letterSpacing: "0.1em" }}>
        CALCARINE FISSURE
      </text>
      <text x="205" y="86" textAnchor="end" fill="currentColor" style={{ font: "600 8.5px var(--font-mono, monospace)" }}>
        macula (occipital pole)
      </text>
    </svg>
  );
}
