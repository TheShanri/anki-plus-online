import { ATLAS3_BASE } from "./engine/data";

/* The structure list of the v3 atlas (public/atlas3/catalog.json, built by tools/atlas3/export.py): every course
 * structure with the leaves it lights up, plus atlas extras (leaves that are not course structures of their own). */

export interface CatItem {
  slug: string;
  name: string;
  region: string;
  syn: string[];
  ids: number[];
  concept: boolean;
  extra?: boolean;
  /** the smallest item whose leaves strictly contain this one's (its "part of") */
  parent: string | null;
  /** a sulcus (its id; -1 all named sulci) or a functional area (bit) on the outside surface */
  sulcus?: number;
  area?: number;
}
export const hasGeometry = (it: CatItem) => it.ids.length > 0 || it.sulcus !== undefined || it.area !== undefined;
export interface Catalog {
  version: string;
  items: CatItem[];
}

let catP: Promise<Catalog> | null = null;
export function loadCatalog(): Promise<Catalog> {
  if (!catP) {
    catP = fetch(`${ATLAS3_BASE}/catalog.json`).then((r) => {
      if (!r.ok) throw new Error(`atlas3 catalog: HTTP ${r.status}`);
      return r.json() as Promise<Catalog>;
    });
    catP.catch(() => (catP = null));
  }
  return catP;
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Sections of the list, in teaching order; items go to the first section whose test matches their course region. */
export const SECTIONS: { id: string; title: string; test: (region: string) => boolean }[] = [
  { id: "cortex", title: "Cerebral cortex", test: (r) => /cortex|cerebrum|frontal|parietal|temporal|occipital|lobe/.test(r) },
  { id: "white", title: "White matter", test: (r) => /white matter/.test(r) },
  { id: "deep", title: "Basal ganglia and limbic system", test: (r) => /basal ganglia|limbic|telencephalon|deep grey|forebrain/.test(r) },
  { id: "dien", title: "Diencephalon", test: (r) => /diencephalon|thalamus|visual/.test(r) },
  { id: "vent", title: "Ventricles", test: (r) => /ventric/.test(r) },
  { id: "stem", title: "Brainstem", test: (r) => /brainstem|midbrain|pons|medulla/.test(r) },
  { id: "cb", title: "Cerebellum", test: (r) => /cerebell/.test(r) },
  { id: "other", title: "Other", test: () => true },
];

export function sectionOf(it: CatItem): string {
  return (SECTIONS.find((s) => s.test(it.region.toLowerCase())) ?? SECTIONS[SECTIONS.length - 1]).id;
}

/** Items that have 3D geometry, matched against a query (name, synonyms), best first. */
export function search(items: CatItem[], q: string): CatItem[] {
  const nq = norm(q);
  const withGeo = items.filter(hasGeometry);
  if (!nq) return withGeo;
  const words = nq.split(" ");
  const scored: [number, CatItem][] = [];
  for (const it of withGeo) {
    const hay = [it.name, ...it.syn].map(norm);
    let best = -1;
    for (const h of hay) {
      if (h === nq) best = Math.max(best, 100);
      else if (h.startsWith(nq)) best = Math.max(best, 80);
      else if (words.every((w) => h.split(" ").some((x) => x.startsWith(w)))) best = Math.max(best, 60);
      else if (h.includes(nq)) best = Math.max(best, 40);
    }
    if (best >= 0) scored.push([best - (it.extra ? 10 : 0), it]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name)).map(([, it]) => it);
}
