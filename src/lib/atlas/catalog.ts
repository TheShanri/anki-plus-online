import linksJson from "@/data/atlas-links.json";
import { normalizeQuery } from "./index";
import { withCranialNumeral } from "./cranial";
import type { AtlasIndex } from "./index";
import type { SliceQuality } from "./slices";
import skullData from "@/data/atlas-skull.json";

export type SkullFocus = {
  region: "skull" | "spine" | "meninges";
  kind: string;
  anchors: number[][];
  radius: number;
  labels: [number, number, number, string][];
  tubes: number[][][];
  closed: boolean;
  shells: "epidural" | "subdural" | "subarachnoid" | null;
  approx: boolean;
  tubeR: number;
  /** Named nodes of skull.glb / spine-atlas.glb to highlight (prefix match); exact meshes. */
  nodes?: string[];
  /** Set by the browser: the structure slug (for picking the focus markers). */
  slug?: string;
};
export const SKULL = skullData as unknown as Record<string, SkullFocus>;
export const SKULL_REGIONS: Record<string, string> = { skull: "Skull", spine: "Spine", meninges: "Meninges" };

export type AtlasLink = {
  name: string;
  meshIds: string[];
  approximate: boolean;
  fallbackParentId: string | null;
  slices: SliceQuality | null;
  exactIn: string[];
  registered: boolean;
  /** Shown in the skull and spine layer (src/data/atlas-skull.json), not as a gross mesh. */
  skull?: boolean;
  /** An atlas landmark that is not on the course's structure lists (arcuate fasciculus, locus coeruleus...). */
  atlasOnly?: boolean;
  /** Parts listed under this structure in the search (curriculum slugs or mesh ids); see tools/atlas/link_atlas2.py. */
  children?: string[];
};
export const LINKS = linksJson as unknown as Record<string, AtlasLink>;

export type CatalogItem = {
  /** Mesh id, or "slug:<slug>" for slice-only structures. */
  key: string;
  name: string;
  region: string;
  /** 3D ids to load (the structure itself, or its fallback parent when only approximate). */
  meshIds: string[];
  approximate: boolean;
  slug: string | null;
  slices: SliceQuality | null;
  hay: string;
  group: boolean;
  /** Keys of the items nested under this one in the search list (its parts). */
  children?: string[];
};

function slugForMesh(): Map<string, string> {
  const m = new Map<string, string>();
  const score = new Map<string, number>();
  for (const [slug, l] of Object.entries(LINKS)) {
    if (!l.slices || l.approximate) continue;
    for (const id of l.meshIds) {
      // the curriculum entry named like the mesh wins (precentral-gyrus, not primary-motor-cortex)
      const sc = slug === id ? -1 : l.meshIds.length === 1 ? 0 : l.meshIds.length;
      if (!m.has(id) || sc < (score.get(id) ?? 99)) {
        m.set(id, slug);
        score.set(id, sc);
      }
    }
  }
  return m;
}

/** Search catalogue: every Z-Anatomy / registered mesh, plus curriculum structures that only exist as MRI labels. */
export function buildCatalog(index: AtlasIndex): CatalogItem[] {
  const s4m = slugForMesh();
  const items: CatalogItem[] = [];
  const syn = new Map<string, string[]>();
  for (const [slug, l] of Object.entries(LINKS)) for (const id of l.meshIds) syn.set(id, [...(syn.get(id) ?? []), l.name, slug.replace(/-/g, " ")]);
  for (const e of Object.values(index.structures)) {
    const slug = s4m.get(e.id) ?? null;
    items.push({
      key: e.id,
      name: slug && e.id.startsWith("mni-") ? e.name : e.name,
      region: e.region,
      meshIds: [e.id],
      approximate: false,
      slug,
      slices: slug ? LINKS[slug].slices : null,
      group: !e.file,
      hay: normalizeQuery([e.name, e.latin ?? "", e.id.replace(/-/g, " "), ...(syn.get(e.id) ?? [])].join(" ")),
    });
  }
  // a structure made of several exact meshes gets one entry of its own that lights all of them (Broca's area used to be
  // findable only as its two parts, each lighting half of it); its meshes are its parts
  const byMesh = new Map(items.map((i) => [i.key, i]));
  for (const [slug, l] of Object.entries(LINKS)) {
    if (l.approximate || l.meshIds.length < 2 || l.skull) continue;
    if (byMesh.get(l.meshIds[0])?.group) continue;
    items.push({
      key: `slug:${slug}`,
      name: withCranialNumeral(l.name),
      region: index.structures[l.meshIds[0]]?.region ?? "other",
      meshIds: l.meshIds.filter((id) => index.structures[id]),
      approximate: false,
      slug,
      slices: l.slices,
      group: false,
      hay: normalizeQuery(l.name + " " + slug.replace(/-/g, " ")),
    });
  }
  // curriculum structures without an exact mesh of their own: exact in MRI slices and/or approximate in 3D
  for (const [slug, l] of Object.entries(LINKS)) {
    const hasExact3d = l.meshIds.length > 0 && !l.approximate;
    if (hasExact3d) continue;
    const meshIds = l.meshIds.length ? l.meshIds : l.fallbackParentId ? [l.fallbackParentId] : [];
    if (!l.slices && !meshIds.length && !l.skull) continue;
    items.push({
      key: `slug:${slug}`,
      name: withCranialNumeral(l.name),
      region: l.skull ? (SKULL[slug]?.region ?? "skull") : l.slices ? "slices" : (index.structures[meshIds[0]]?.region ?? "other"),
      meshIds,
      approximate: true,
      slug,
      slices: l.slices,
      group: false,
      hay: normalizeQuery(l.name + " " + slug.replace(/-/g, " ")),
    });
  }
  // nesting: the parts of a structure (the link's own children table, else the meshes it is made of)
  const itemOf = itemResolver(items);
  for (const it of items) {
    const slug = it.key.startsWith("slug:") ? it.key.slice(5) : it.slug;
    const l = slug ? LINKS[slug] : undefined;
    if (!l || (slug && it.key !== itemOf(slug)?.key)) continue;
    const raw = l.children?.length ? l.children : !l.approximate && l.meshIds.length > 1 ? l.meshIds : [];
    const kids = raw.map((c) => itemOf(c)?.key).filter((k): k is string => !!k && k !== it.key);
    if (kids.length) it.children = [...new Set(kids)];
  }
  return items;
}

/** The search item that stands for a curriculum slug or a mesh id (its own entry, else the mesh that is exactly it). */
export function itemResolver(items: CatalogItem[]): (k: string) => CatalogItem | undefined {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const bySlug = new Map<string, CatalogItem>();
  for (const i of items) if (i.slug && !i.group && !bySlug.has(i.slug)) bySlug.set(i.slug, i);
  return (k) => {
    const own = byKey.get(`slug:${k}`);
    if (own) return own;
    const l = LINKS[k];
    if (l) {
      const s = bySlug.get(k);
      if (s) return s;
      if (!l.approximate && l.meshIds.length === 1) return byKey.get(l.meshIds[0]);
      return undefined;
    }
    return byKey.get(k);
  };
}

export type SlugTarget = {
  /** 3D ids to highlight (the structure, or the mesh that contains it when approximate). */
  ids: string[];
  approximate: boolean;
  /** MRI label quality, null when the slices have no label for it. */
  slices: SliceQuality | null;
};

/** Where a curriculum structure (by slug) can be shown, or null when neither the 3D model nor the MRI atlas has it. */
export function atlasTargetForSlug(slug: string | null | undefined): SlugTarget | null {
  const l = slug ? LINKS[slug] : undefined;
  if (!l) return null;
  const ids = l.meshIds.length ? l.meshIds : l.fallbackParentId ? [l.fallbackParentId] : [];
  if (!ids.length && !l.slices && !l.skull) return null;
  return { ids, approximate: l.skull ? false : l.approximate || !ids.length, slices: l.slices };
}

/** The view that shows a structure most exactly: MRI slices when the 3D highlight is only approximate. */
export function bestAtlasTab(t: { ids: string[]; approximate: boolean; slices: SliceQuality | null }): "model" | "slices" {
  if (!t.ids.length) return "slices";
  if (t.approximate && (t.slices === "exact" || t.slices === "derived")) return "slices";
  return "model";
}

export function itemForSlug(items: CatalogItem[], slug: string): CatalogItem | null {
  return items.find((i) => i.slug === slug && (i.key.startsWith("slug:") || !i.key.startsWith("slug:"))) ?? null;
}
