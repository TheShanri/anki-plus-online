import type { Index3, Label3 } from "./engine/data";
import { STEM, inStemOf, isDeep } from "./present";

/* What Explore shows, by group of structures: each group solid, see-through (glass) or off. The student sets these (the
 * Show menu, the toolbar toggles, the presets); a selection never turns them back. A deep selection may make what hides
 * it see-through (an "auto" layer), and only for as long as it is selected. */

export type Group = "cortex" | "deepgm" | "deepwm" | "ventricles" | "brainstem" | "cerebellum" | "nerves" | "bones";
export type Mode = "solid" | "glass" | "off";
export type Layers = Record<Group, Mode>;

export const GROUPS: { id: Group; name: string; note: string }[] = [
  { id: "cortex", name: "Cerebral cortex", note: "the hemispheres' surface and their white matter" },
  { id: "deepgm", name: "Deep grey matter", note: "basal ganglia, thalamus, hippocampus, amygdala, hypothalamus" },
  { id: "deepwm", name: "White matter tracts", note: "internal capsule, corpus callosum, fornix, commissures, optic tract" },
  { id: "ventricles", name: "Ventricles", note: "the CSF-filled cavities" },
  { id: "brainstem", name: "Brainstem", note: "midbrain, pons, medulla" },
  { id: "cerebellum", name: "Cerebellum", note: "its cortex, white matter and nuclei" },
  { id: "nerves", name: "Cranial nerves", note: "roots and course to the skull exits" },
  { id: "bones", name: "Skull and spine", note: "bones, sutures and discs" },
];

export const WHOLE: Layers = { cortex: "solid", deepgm: "solid", deepwm: "solid", ventricles: "solid", brainstem: "solid", cerebellum: "solid", nerves: "solid", bones: "off" };
/** the deep-structures view: the hemispheres and the cerebellum see-through, the nuclei, ventricles and brainstem solid */
export const DEEP: Layers = { cortex: "glass", deepgm: "solid", deepwm: "off", ventricles: "solid", brainstem: "solid", cerebellum: "glass", nerves: "solid", bones: "off" };
/** everything see-through but the selection */
export const GLASS: Layers = { cortex: "glass", deepgm: "glass", deepwm: "glass", ventricles: "glass", brainstem: "glass", cerebellum: "glass", nerves: "glass", bones: "off" };
export const PRESETS: { id: string; name: string; layers: Layers }[] = [
  { id: "whole", name: "Whole brain", layers: WHOLE },
  { id: "deep", name: "Deep structures", layers: DEEP },
  { id: "glass", name: "All see-through", layers: GLASS },
];

const CEREBELLAR = new Set(["CbW", "DN", "IPN", "FN"]);
/** the bulk of the hemispheres' white matter goes with the cortex (see-through cortex = see the deep structures) */
const CEREBRAL_WM = new Set(["FWM", "CR", "CSO"]);
/** cortex by tissue, but a deep structure to a student */
const DEEP_CTX = new Set(["HiB", "HiH", "HiT"]);

export function groupOf(l: Label3): Group {
  if (l.tissue === "nrv") return "nerves";
  if (l.tissue === "csf" || l.tissue === "plx") return "ventricles";
  if (STEM.has(l.key) || l.tissue === "bs") return "brainstem";
  if (l.tissue === "cbx" || CEREBELLAR.has(l.key)) return "cerebellum";
  if (DEEP_CTX.has(l.key)) return "deepgm";
  if (l.tissue === "ctx" || CEREBRAL_WM.has(l.key)) return "cortex";
  if (l.tissue === "wm" || l.tissue === "tract") return "deepwm";
  return "deepgm";
}

/** veil groups: the borders between see-through labels of one group are not drawn (one veil per group) */
const VEIL: Record<Group, number> = { brainstem: 1, ventricles: 2, cerebellum: 3, deepgm: 4, deepwm: 5, nerves: 6, cortex: 7, bones: 0 };

/** The canvas's sets for some layers: hidden labels, see-through ones (and their veil group), the brain's outline as a
 * veil (the see-through cortex). `keep`: always solid (the selection); `hide`: hidden whatever the layers say. */
export function layerSets(index: Index3, layers: Layers, keep: Set<number>, hide?: Set<number>): { hiddenIds: number[]; ghostIds: number[]; ghostCls: Record<number, number>; hull: boolean } {
  const hiddenIds: number[] = [];
  const ghostIds: number[] = [];
  const ghostCls: Record<number, number> = {};
  for (const l of index.labels) {
    if (keep.has(l.id)) continue;
    if (hide?.has(l.id)) {
      hiddenIds.push(l.id);
      continue;
    }
    const g = groupOf(l);
    const m = layers[g];
    if (m === "solid") continue;
    hiddenIds.push(l.id);
    // the see-through cortex is the brain's smooth outline (hull), not every gyrus wall
    if (m === "glass" && g !== "cortex") {
      ghostIds.push(l.id);
      ghostCls[l.id] = VEIL[g];
    }
  }
  return { hiddenIds, ghostIds, ghostCls, hull: layers.cortex === "glass" };
}

/** What a selection needs to be seen, beyond the student's layers: the groups that hide a deep structure, see-through.
 * Never makes anything more solid than the student set it. */
export function autoFor(ids: number[], byId: Map<number, Label3>, layers: Layers): Partial<Layers> {
  if (!ids.length || !isDeep(ids, byId)) return {};
  const out: Partial<Layers> = {};
  const want = (g: Group) => {
    if (layers[g] === "solid") out[g] = "glass";
  };
  const gs = new Set(ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l).map(groupOf));
  if (inStemOf(ids, byId)) {
    // a brainstem nucleus: inside the see-through brainstem, the cerebellum behind it see-through too
    want("brainstem");
    want("cerebellum");
    want("cortex");
    return out;
  }
  if (gs.has("cerebellum")) {
    want("cerebellum");
    want("cortex");
    return out;
  }
  // inside the hemispheres: the cortex and the tracts that wrap the nuclei see-through, and the brainstem and the
  // cerebellum too (as veils, never gone: owner 2026-11-24, "the brainstem should also become transparent and not
  // disappear")
  want("cortex");
  want("brainstem");
  want("cerebellum");
  if (gs.has("deepgm") || gs.has("ventricles")) want("deepwm");
  return out;
}

/** The layers in force: the student's, with the selection's auto layers over them. */
export function effective(layers: Layers, auto: Partial<Layers>): Layers {
  return { ...layers, ...auto };
}

/** The labels of some groups (the toolbar toggles count what they would change). */
export function labelsOf(index: Index3, g: Group): number[] {
  return index.labels.filter((l) => groupOf(l) === g).map((l) => l.id);
}
