import mapJson from "@/data/atlas-map.json";
import { normalizeQuery } from "./index";
import type { AtlasMapEntry } from "./types";

const MAP = mapJson as Record<string, AtlasMapEntry>;
const BY_NORM = new Map<string, AtlasMapEntry>(Object.entries(MAP).map(([k, v]) => [normalizeQuery(k), v]));

export type AtlasTarget = { ids: string[]; approximate: boolean; fallbackId?: string };

/** Course structure name (as printed in the official structure lists) to atlas ids, or null if it has no 3D model. */
export function atlasTargetForCourseName(name: string): AtlasTarget | null {
  const e = BY_NORM.get(normalizeQuery(name));
  if (!e) return null;
  const ids = e.meshIds.length ? e.meshIds : e.fallbackParentId ? [e.fallbackParentId] : [];
  if (!ids.length) return null;
  return { ids, approximate: e.approximate, fallbackId: e.fallbackParentId };
}

/** href for an "Open in 3D atlas" button, or null when the structure has no model. */
export function atlasHrefForCourseName(name: string): string | null {
  return atlasTargetForCourseName(name) ? `/atlas?n=${encodeURIComponent(name)}` : null;
}

/** atlas id to course names that map to it (used as search synonyms). */
export function courseNamesByAtlasId(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [name, v] of Object.entries(MAP)) {
    for (const id of v.meshIds) {
      const a = m.get(id) ?? [];
      if (!a.includes(name)) a.push(name);
      m.set(id, a);
    }
  }
  return m;
}
