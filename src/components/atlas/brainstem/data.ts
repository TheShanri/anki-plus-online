import type { Shape } from "@/lib/study/types";
import levelsData from "@/data/brainstem-levels.json";
import courseData from "@/data/brainstem-course.json";
import deckData from "@/data/brainstem-decks.json";
import openData from "@/data/brainstem-open.json";

export type StyleId = "course" | "histology" | "gross" | "cartoon" | "mri";
export type ImgStyle = "histology" | "gross" | "cartoon";
export type GroupId = "cn-nuclei" | "nerves" | "ascending" | "descending" | "nuclei" | "bundles" | "landmarks";

export interface BsLabel {
  /** structure slug (null for open-image labels found by OCR, and for structures that are not on the course lists) */
  slug: string | null;
  name: string;
  accept?: string[];
  kind?: string;
  shape: Shape;
}
export interface BsImage {
  id: string;
  source: "course" | "open";
  /** course: media key served through /api/media */
  key?: string;
  /** open: public path under /brainstem */
  src?: string;
  w: number;
  h: number;
  level: string;
  style: ImgStyle;
  title: string;
  labels: BsLabel[];
  /** open images: the credit line and licence */
  credit?: string;
  short?: string;
  license?: string;
  url?: string;
  labelsBaked?: boolean;
  labelNote?: string;
}
export interface LevelStructure {
  slug: string;
  source: "course" | "standard";
}
export interface BsLevel {
  slug: string;
  name: string;
  /** the standard atlas name when the course uses another (e.g. "Also called the mid pons") */
  aka?: string;
  hallmark: string;
  kind: "section" | "gross";
  y?: number;
  mniZ: number | null;
  mniNote: string | null;
  structures: LevelStructure[];
}
export interface BsStructure {
  name: string;
  slug: string | null;
  onList: boolean;
  group: GroupId;
  color: string;
  inAtlas: boolean;
}

export const LEVELS = (levelsData as unknown as { levels: BsLevel[] }).levels;
export const STRUCTURES = (levelsData as unknown as { structures: Record<string, BsStructure> }).structures;
export const IMAGES: BsImage[] = [...(courseData as unknown as BsImage[]), ...(deckData as unknown as BsImage[]), ...(openData as unknown as BsImage[])];

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "cn-nuclei", label: "Cranial-nerve nuclei" },
  { id: "nerves", label: "Cranial nerves" },
  { id: "ascending", label: "Ascending tracts" },
  { id: "descending", label: "Descending tracts" },
  { id: "nuclei", label: "Other nuclei" },
  { id: "bundles", label: "Peduncles and fibre bundles" },
  { id: "landmarks", label: "Landmarks and spaces" },
];

export const STYLES: { id: StyleId; label: string }[] = [
  { id: "course", label: "Course" },
  { id: "histology", label: "Histology" },
  { id: "gross", label: "Gross" },
  { id: "cartoon", label: "Cartoon" },
  { id: "mri", label: "MRI" },
];

export function imagesFor(level: string, style: StyleId): BsImage[] {
  if (style === "mri") return [];
  return IMAGES.filter((i) => i.level === level && (style === "course" ? i.source === "course" : i.style === style));
}
export function countFor(level: BsLevel, style: StyleId): number {
  return style === "mri" ? (level.mniZ !== null ? 1 : 0) : imagesFor(level.slug, style).length;
}
export function levelBySlug(slug: string): BsLevel {
  return LEVELS.find((l) => l.slug === slug) ?? LEVELS[0];
}

/** Lower-case, accent-free, punctuation-free, without a leading "the". */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bn\.\s/g, "nucleus ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/^the /, "")
    .replace(/\s+/g, " ")
    .trim();
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Typed answer vs a label: its name or an accepted synonym, one typo allowed on longer words. */
export function matches(input: string, label: BsLabel): boolean {
  const x = norm(input);
  if (!x) return false;
  return [label.name, ...(label.accept ?? [])].some((c) => {
    const y = norm(c);
    return y === x || (y.length > 7 && lev(x, y) <= 1);
  });
}

/** Plate sub-parts without course notes of their own open the notes of the structure they belong to. */
export const INFO_PARENT: Record<string, string> = {
  "substantia-nigra-pars-compacta": "substantia-nigra",
  "substantia-nigra-pars-reticulata": "substantia-nigra",
};
export const infoSlugOf = (slug: string): string => INFO_PARENT[slug] ?? slug;

export function colorOf(slug: string | null, fallback = "var(--accent)"): string {
  return (slug && STRUCTURES[slug]?.color) || fallback;
}
