import { ATLAS3_BASE } from "./engine/data";
import type { View3 } from "./engine/Atlas3Canvas";

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
  /** a tract drawn as fibres (public/atlas3/fibres/<slug>.json): from HCP-842 tractography or the Pathway tracer */
  fibre?: "hcp" | "pathway";
  /** arteries or sinuses (public/atlas3/vessels.glb node keys) */
  vessels?: string[];
  /** a part of the body layer (skull, meninges, spine and cord, eye, ear, nose: public/atlas3/body.glb), how it is shown */
  body?: BodySpec;
}
/** How a body-layer structure is shown (tools/atlas3/bodyspec.py). */
export interface BodySpec {
  /** the parts lit, and the parts shown around them */
  keys: string[];
  ctx: string[];
  /** named points, as pins */
  marks?: { text: string; p: [number, number, number] }[];
  /** the brain: hidden, a see-through outline, shown, or the deep view of `near` */
  brain: "hide" | "veil" | "show" | "deep";
  /** labels: the deep view's selection (brain "deep"), or labels hidden (brain "show") */
  near?: number[];
  view: View3;
  cut?: { axis: "x" | "y" | "z"; pos: number; flip: boolean };
  frame?: [[number, number, number], [number, number, number]];
  /** the meninges: metres between the cut faces of the layers */
  stagger?: number;
  /** a tint over the brain's outside surface (the pia) */
  skin?: string;
  /** arteries or sinuses shown with it */
  vessels?: string[];
  /** one hemisphere hidden */
  sides?: "L" | "R";
  approx: boolean;
  src?: string;
}
export const hasGeometry = (it: CatItem) =>
  it.ids.length > 0 || it.sulcus !== undefined || it.area !== undefined || !!it.fibre || !!it.vessels?.length || !!it.body;

export type Fibres = { src: "hcp" | "pathway"; credit: string; lines: number[][] };
const fibreP = new Map<string, Promise<Fibres>>();
/** A tract's fibres (world metres, polylines), loaded once. */
export function loadFibres(slug: string): Promise<Fibres> {
  let p = fibreP.get(slug);
  if (!p) {
    p = fetch(`${ATLAS3_BASE}/fibres/${encodeURIComponent(slug)}.json`).then((r) => {
      if (!r.ok) throw new Error(`atlas3 fibres ${slug}: HTTP ${r.status}`);
      return r.json() as Promise<Fibres>;
    });
    p.catch(() => fibreP.delete(slug));
    fibreP.set(slug, p);
  }
  return p;
}
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
  { id: "cn", title: "Cranial nerves", test: (r) => /cranial nerve/.test(r) },
  { id: "vessels", title: "Blood vessels", test: (r) => /blood supply|vessel/.test(r) },
  { id: "skull", title: "Skull and meninges", test: (r) => /skull|menin/.test(r) },
  { id: "spine", title: "Spine and spinal cord", test: (r) => /spinal|vertebra/.test(r) },
  { id: "senses", title: "Eye, ear and nose", test: (r) => /^eye$|inner ear|cochlea|labyrinth|nasal/.test(r) },
  { id: "other", title: "Other", test: () => true },
];

export function sectionOf(it: CatItem): string {
  // the eye's parts share the region "visual system" with the visual pathway's brain structures
  if (it.body && !it.ids.length && /visual/.test(it.region.toLowerCase())) return "senses";
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
