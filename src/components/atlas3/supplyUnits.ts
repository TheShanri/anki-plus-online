import { SUPPLY, type SupplyUnit } from "@/components/atlas/supply/supply-data";
import { loadIndex3, type Index3 } from "./engine/data";
import { loadCatalog, type CatItem } from "./catalog";

/* The course's supply map (src/data/supply-map.json) on the 3D atlas v3: each unit's structures as atlas labels. Units name
 * a course structure (slug) and/or old atlas meshes; the meshes of the units without a course slug map to v3 keys here
 * (the cortex: the same table as tools/atlas3/frameglb.py, which paints the territories). Only faithful matches: the
 * cerebellum's superior hemisphere is the anterior lobe's, the inferior vermis the nodulus; the inferior hemisphere, which
 * the atlas does not separate from the superior semilunar lobule, is left out. */

export const SUPPLY_OLDMAP: Record<string, string[]> = {
  cuneus: ["Cun"], "lingual-gyrus": ["LiG"], precuneus: ["PrCun"], "paracentral-gyrus-and-sulcus": ["PCLr", "PCLc"],
  "straight-gyrus-gyrus-rectus": ["ReG"], "lateral-occipital-gyrus-middle-occipital-gyrus": ["IOG"], "inferior-occipital-gyrus-and-sulcus": ["IOG"],
  "occipital-pole": ["OP"], "superior-occipital-gyri": ["SOG"], "lateral-occipitotemporal-gyrus": ["FuGt", "FuGo"], "temporal-pole": ["TP"],
  "temporal-plane": ["PLT", "PLP"], "septal-nuclei": ["SEP"],
  // the cerebellum
  "lingula-of-cerebellum": ["CbVa"], "central-lobule": ["CbVa"], culmen: ["CbVa"], declive: ["CbVp"], "folium-of-vermis": ["CbVp"], "tuber-of-vermis": ["CbVp"],
  "nodule-of-vermis": ["Nod"], "anterior-quadrangular-lobule": ["CbLa", "CbPVa"],
};

/** The atlas label ids of a supply unit (empty: the unit is not in the 3D atlas, e.g. the spinal cord's). */
export function unitIds(u: SupplyUnit, index: Index3, items: CatItem[]): number[] {
  const ids = new Set<number>();
  if (u.slug) for (const i of items.find((it) => it.slug === u.slug)?.ids ?? []) ids.add(i);
  const keys = new Set(u.meshes.flatMap((m) => SUPPLY_OLDMAP[m] ?? []));
  if (keys.size) for (const l of index.labels) if (keys.has(l.key)) ids.add(l.id);
  return [...ids];
}

/** A supply unit as an atlas structure to show by itself: its labels, or the course structure it names when that is a
 * sulcus, an area or a tract drawn as fibres; null when the atlas does not have it. */
export function unitItem(u: SupplyUnit, index: Index3, items: CatItem[]): CatItem | null {
  const ids = unitIds(u, index, items);
  if (ids.length) return { slug: `supply:${u.name}`, name: u.name, region: "", syn: [], ids, concept: false, parent: null };
  const it = items.find((x) => x.slug === (u.slug ?? u.meshes[0]));
  return it && (it.sulcus !== undefined || it.area !== undefined || it.fibre) ? { ...it, name: u.name } : null;
}

/** The supply units the 3D atlas has, each as the structure to show (the index and the catalog are loaded once). */
export async function supplyItems(): Promise<Map<SupplyUnit, CatItem>> {
  const [index, cat] = await Promise.all([loadIndex3(), loadCatalog()]);
  const out = new Map<SupplyUnit, CatItem>();
  for (const u of SUPPLY.units) {
    const it = unitItem(u, index, cat.items);
    if (it) out.set(u, it);
  }
  return out;
}
