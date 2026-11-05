import linksJson from "@/data/atlas-links.json";
import { normalizeQuery } from "./index";
import type { AtlasIndex } from "./index";
import type { SliceQuality } from "./slices";

export type AtlasLink = {
  name: string;
  meshIds: string[];
  approximate: boolean;
  fallbackParentId: string | null;
  slices: SliceQuality | null;
  exactIn: string[];
  registered: boolean;
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
};

function slugForMesh(): Map<string, string> {
  const m = new Map<string, string>();
  const score = new Map<string, number>();
  for (const [slug, l] of Object.entries(LINKS)) {
    if (!l.slices || l.approximate) continue;
    for (const id of l.meshIds) {
      const sc = l.meshIds.length === 1 ? 0 : l.meshIds.length;
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
  for (const [slug, l] of Object.entries(LINKS)) {
    if (!l.slices) continue;
    const hasExact3d = l.meshIds.length > 0 && !l.approximate;
    if (hasExact3d) continue;
    items.push({
      key: `slug:${slug}`,
      name: l.name,
      region: "slices",
      meshIds: l.meshIds.length ? l.meshIds : l.fallbackParentId ? [l.fallbackParentId] : [],
      approximate: true,
      slug,
      slices: l.slices,
      group: false,
      hay: normalizeQuery(l.name + " " + slug.replace(/-/g, " ")),
    });
  }
  return items;
}

export function itemForSlug(items: CatalogItem[], slug: string): CatalogItem | null {
  return items.find((i) => i.slug === slug && (i.key.startsWith("slug:") || !i.key.startsWith("slug:"))) ?? null;
}
