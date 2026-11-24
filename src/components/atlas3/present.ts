import type { View3 } from "./engine/Atlas3Canvas";
import type { Index3, Label3 } from "./engine/data";
import type { CatItem } from "./catalog";

/* How a structure is shown: the view that shows it best, or the deep view (what is hidden, what is a see-through veil),
 * shared by Explore and every other mode that shows one structure (Name that structure ...). */

/** tissues hidden in the deep-structures view without a selection (cortex, white matter, cerebellar cortex) */
export const DEEP_HIDE = new Set(["ctx", "wm", "cbx"]);
/** below this share of its surface visible from the best standard view, a structure opens in the deep view */
export const DEEP_SHARE = 0.07;
/** the brainstem: its divisions, and the nuclei and tracts placed from the course plates, and the nerve roots leaving it.
 * In the deep view it is a see-through veil around the selection (and its fluid spaces a veil of their own). */
export const STEM = new Set([
  ...["MTg", "mRt", "PnBa", "PnTg", "PnO", "MoTg", "BSW", "CPd", "Py", "IO", "SC", "ICo", "SCP", "MCP", "ICP", "PAG", "RN", "SN", "VTA", "PTg", "LC", "DR", "MnR", "LDTg", "PBC", "ML", "MLF", "PTR"],
  ...["III", "EW", "IV", "BIC", "xSCP", "IPF", "Vmo", "Vps", "VI", "VII", "FCol", "PPRF", "LFP", "VCx", "Sp5", "Sol", "DMX", "XII", "Amb", "Gr", "Cu", "IAF", "PyX", "ALS", "DSCT"],
  ...["Obex", "AP", "GrT", "CuT"],
  ...["CN3", "CN4", "CN5", "CN6", "CN7", "CN8", "CN9", "CN10", "CN12"],
]);
export const STEM_FLUID = new Set(["Aq", "V4", "CeC"]);
/** solid context in the deep view of a selection: the ventricles (the brainstem is drawn as a veil) */
export const VENTRICLES = new Set(["aLV", "bLV", "xLV", "pLV", "iLV", "IVF", "V3", "Aq", "V4", "CeC"]);

/** The view that shows a sulcus (by id) or a functional area (by key) best. */
export const SULCUS_VIEW: Record<number, View3> = { 1: "superior", 2: "left", 3: "medial-left", 4: "medial-left", 5: "superior", 6: "left", 7: "left", 8: "left", 9: "left", 10: "superior", 11: "left", 12: "medial-left", 13: "inferior", 14: "superior", [-1]: "left" };
export const AREA_VIEW: Record<string, View3> = { ofc: "inferior", vmpfc: "medial-left", acc: "medial-left", v1: "medial-left", va: "posterior", vvs: "inferior", pga: "left", s2a: "superior", m1: "left", s1: "left" };
const PX_MM2 = 0.1526;

/** The standard view that shows a structure best (pixels counted off screen by tools/atlas3/views.py), and how much of
 * its surface that view shows. One side is enough: the left copy (or the midline structure) is measured. */
export function bestView(ids: number[], byId: Map<number, Label3>): { view: View3; share: number } {
  const ls = ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l);
  const half = ls.some((l) => l.side === "L") ? ls.filter((l) => l.side !== "R") : ls;
  const area = half.reduce((s, l) => s + l.area, 0);
  let best: View3 = "left",
    px = -1;
  for (const v of ["left", "right", "anterior", "posterior", "superior", "inferior", "medial-left", "medial-right"] as View3[]) {
    const n = half.reduce((s, l) => s + (l.vis[v] ?? 0), 0);
    if (n > px) {
      px = n;
      best = v;
    }
  }
  return { view: best, share: area > 0 ? (px * PX_MM2) / area : 0 };
}
/** Deep: no standard view shows a fair part of it (thalamus, putamen, insula behind the opercula, hippocampus). */
export function isDeep(ids: number[], byId: Map<number, Label3>): boolean {
  return ids.length > 0 && bestView(ids, byId).share < DEEP_SHARE;
}
/** Every leaf is a brainstem part (its divisions, nuclei, tracts or nerve roots). */
export function inStemOf(ids: number[], byId: Map<number, Label3>): boolean {
  return ids.length > 0 && ids.every((id) => STEM.has(byId.get(id)?.key ?? ""));
}

export type Presentation = {
  view: View3;
  sides: "both" | "L" | "R";
  deep: boolean;
  /** inside the brainstem (the see-through brainstem view) */
  stem: boolean;
  /** the camera frames these (the whole brainstem around a brainstem nucleus) */
  focusIds: number[];
};
/** How to show one structure by itself: a sulcus or area from the view that shows it; a deep structure in the deep view
 * (a brainstem one inside the see-through brainstem, from behind); a cranial nerve from below; anything else from the
 * standard view that shows most of it (the medial views hide the other hemisphere). */
export function presentItem(it: CatItem, index: Index3, byId: Map<number, Label3>): Presentation {
  if (!it.ids.length) {
    const ak = it.area !== undefined ? index.areas.find((a) => a.bit === it.area)?.key : undefined;
    const v: View3 = it.sulcus !== undefined ? (SULCUS_VIEW[it.sulcus] ?? "left") : ((ak ? AREA_VIEW[ak] : undefined) ?? "left");
    return { view: v, sides: v === "medial-left" ? "L" : v === "medial-right" ? "R" : "both", deep: false, stem: false, focusIds: [] };
  }
  if (isDeep(it.ids, byId)) {
    const stem = inStemOf(it.ids, byId);
    const focusIds = stem ? [...new Set([...it.ids, ...index.labels.filter((l) => STEM.has(l.key)).map((l) => l.id)])] : it.ids;
    return { view: stem ? "posterior" : "left", sides: "both", deep: true, stem, focusIds };
  }
  const nerves = it.ids.every((id) => byId.get(id)?.tissue === "nrv");
  const v = nerves ? "inferior" : bestView(it.ids, byId).view;
  return { view: v, sides: v === "medial-left" ? "L" : v === "medial-right" ? "R" : "both", deep: false, stem: false, focusIds: it.ids };
}

/** What the deep view hides and what it draws as a veil, for a selection (or none: every deep structure). */
export function deepSets(index: Index3, selIds: number[], byId: Map<number, Label3>): { hiddenIds: number[]; ghostIds: number[]; hull: boolean } {
  const keep = new Set(selIds);
  if (!keep.size) return { hiddenIds: index.labels.filter((l) => DEEP_HIDE.has(l.tissue)).map((l) => l.id), ghostIds: [], hull: true };
  const stem = inStemOf(selIds, byId);
  // inside the brainstem: everything else hidden, the brainstem and its ventricles veils; elsewhere the ventricles stay
  // solid context, the brainstem a veil, the brain's outline (hull) a veil around all
  const hiddenIds = index.labels.filter((l) => !keep.has(l.id) && (stem || !VENTRICLES.has(l.key))).map((l) => l.id);
  const ghostIds = index.labels.filter((l) => !keep.has(l.id) && (STEM.has(l.key) || (stem && STEM_FLUID.has(l.key)))).map((l) => l.id);
  return { hiddenIds, ghostIds, hull: !stem };
}
