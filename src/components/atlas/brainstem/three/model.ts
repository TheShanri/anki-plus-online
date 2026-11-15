// The 3D brainstem's data (built by tools/brainstem/bs3d/build.py): parts of public/atlas/brainstem3d.glb, the section
// plane of every plate level, and how course structure slugs map onto parts (aliases, divisions).
import data from "@/data/brainstem-3d.json";
import { REF } from "../ref/refMap";
import { LEVELS, STRUCTURES } from "../data";

export type Vec3 = [number, number, number];
export type PartKind = "body" | "patch" | "mesh" | "nerve" | "context";
export interface Part3D {
  id: string;
  slug: string;
  name: string;
  kind: PartKind;
  side: "L" | "R" | "M";
  approx?: boolean;
  note?: string;
  anchor: Vec3;
}
export interface Level3D {
  p: Vec3;
  n: Vec3;
  why: string;
  radius: number;
  cuts: string[];
  axisMm?: number;
  coulombeMm?: number;
  coulombeScaledMm?: number;
}
interface Data3D {
  file: string;
  bytes: number;
  parts: Part3D[];
  levels: Record<string, Level3D>;
  junctions: { pmj: number; pomj: number; obex: number };
  sources: string[];
}

export const BS3D = data as unknown as Data3D;
export const PARTS: Part3D[] = BS3D.parts;
export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
/** Plate levels in the atlas order (rostral to caudal, then the midsagittal), only those with a plane. */
export const PLANE_LEVELS = LEVELS.filter((l) => BS3D.levels[l.slug]).map((l) => l.slug);
export const LEVEL_NAME = (slug: string) => LEVELS.find((l) => l.slug === slug)?.name ?? slug;

/** Course slugs that stand for a group of parts. */
const ALIAS: Record<string, string[]> = {
  "interpeduncular-cistern": ["interpeduncular-fossa"],
  "cerebellar-peduncles": ["superior-cerebellar-peduncle", "middle-cerebellar-peduncle", "inferior-cerebellar-peduncle"],
  "pontine-protuberance": ["transverse-fibers-of-the-pons"],
  "inferior-olivary-nucleus": ["olives"],
  brainstem: ["midbrain", "pons", "medulla"],
};
/** The divisions light everything cut from them (Lab 2: midbrain, pons, medulla). */
const DIVISION: Record<string, string[]> = {
  midbrain: ["midbrain", "superior-colliculus", "inferior-colliculus", "interpeduncular-fossa", "cerebral-peduncles"],
  pons: ["pons", "transverse-fibers-of-the-pons", "middle-cerebellar-peduncle", "facial-colliculus"],
  medulla: ["medulla", "olives", "pyramids", "motor-decussation", "gracile-tubercle", "cuneate-tubercle", "obex", "area-postrema"],
};

const bySlug = new Map<string, Part3D[]>();
for (const p of PARTS) (bySlug.get(p.slug) ?? bySlug.set(p.slug, []).get(p.slug)!).push(p);

/** Part ids lit for a course slug (empty when the 3D brainstem does not show it). */
export function partsFor(slug: string | null | undefined): string[] {
  if (!slug) return [];
  const slugs = DIVISION[slug] ?? (ALIAS[slug] ? ALIAS[slug].flatMap((s) => DIVISION[s] ?? [s]) : [slug]);
  return slugs.flatMap((s) => bySlug.get(s)?.map((p) => p.id) ?? []);
}
/** Whether a course slug can be picked or lit in 3D. */
export const in3D = (slug: string | null | undefined) => partsFor(slug).length > 0;
/** Every course slug the 3D brainstem can show (for the coverage report). */
export const PICKABLE_SLUGS: string[] = [...new Set([...bySlug.keys(), ...Object.keys(ALIAS), ...Object.keys(DIVISION)])].filter((s) => partsFor(s).length > 0);

/** The display name of a course slug in 3D (nerves carry their Roman numeral). */
export function name3D(slug: string): string {
  return bySlug.get(slug)?.[0]?.name ?? STRUCTURES[slug]?.name ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}
/** A surface landmark and the section structure under it (the plates draw the nucleus, the surface views the bump). */
const UNDER: Record<string, string[]> = {
  olives: ["inferior-olivary-nucleus"],
  "gracile-tubercle": ["gracile-nucleus"],
  "cuneate-tubercle": ["cuneate-nucleus"],
  "facial-colliculus": ["abducens-nucleus"],
  "transverse-fibers-of-the-pons": ["pontine-nuclei"],
};
/** The plate levels (sections first, rostral to caudal; then the surface views) that show a structure, and the best
 *  one to open: a section when one shows it (or the nucleus under it), else the surface view. */
export function platesFor(slug: string): { levels: string[]; best: string | null } {
  const slugs = [slug, ...(UNDER[slug] ?? [])];
  const surf = new Set(["external-anterior", "external-posterior", "external-lateral", "midsagittal"]);
  const levels = REF.levels.filter((l) => slugs.some((s) => REF.resolveAt(s, l).length > 0));
  const secs = levels.filter((l) => !surf.has(l));
  const best = REF.pickLevel([slug]);
  return { levels: [...secs, ...levels.filter((l) => surf.has(l))], best: best && !surf.has(best) ? best : (secs.find((l) => REF.resolveAt(slug, l).length) ?? secs[0] ?? best) };
}
