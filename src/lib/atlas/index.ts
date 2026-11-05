import type { AtlasEntry, AtlasIndex } from "./types";

export type { AtlasEntry, AtlasIndex, AtlasMapEntry } from "./types";

export const ATLAS_BASE = "/atlas";

let indexPromise: Promise<AtlasIndex> | null = null;

/** Fetches /atlas/index.json once per page load. */
export function loadAtlasIndex(): Promise<AtlasIndex> {
  if (!indexPromise) {
    indexPromise = fetch(`${ATLAS_BASE}/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`atlas index: HTTP ${r.status}`);
        return r.json() as Promise<AtlasIndex>;
      })
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

/** Expands group ids to the loadable structure ids (entries with a file), de-duplicated. */
export function resolveStructureIds(index: AtlasIndex, ids: string[], limit = 80): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const e = index.structures[id];
    if (!e) return;
    if (e.file) {
      if (!out.includes(id)) out.push(id);
    } else if (e.members) {
      for (const m of e.members) add(m);
    }
  };
  for (const id of ids) add(id);
  return out.slice(0, limit);
}

export function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Union bounding box (glTF Y-up metres) of the given entries. */
export function unionBox(entries: AtlasEntry[]): { min: number[]; max: number[] } | null {
  if (!entries.length) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const e of entries) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], e.bbox[0][i]);
      max[i] = Math.max(max[i], e.bbox[1][i]);
    }
  }
  return { min, max };
}
