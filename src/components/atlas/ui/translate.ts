import type { SliceView } from "../SliceViewer";
import type { ViewName } from "../AtlasViewer";

/** What the 3D viewer reports so the MRI tab can show the matching slice. */
export type CamState = {
  view: ViewName;
  multi: boolean;
  /** Active cut: axis in glTF metres ("x" left-right, "y" up, "z" anterior) and its position. */
  cut: { axis: "x" | "y" | "z"; position: number } | null;
};

/** 3D camera/cut -> MRI view. Multi-view <-> multiplanar; a cut wins over the camera; anterior/posterior = coronal,
 *  lateral/midsagittal = sagittal, superior/inferior = transverse. */
export function sliceViewFor(s: CamState): SliceView {
  if (s.multi) return "multi";
  if (s.cut) return s.cut.axis === "z" ? "coronal" : s.cut.axis === "x" ? "sagittal" : "axial";
  if (s.view === "anterior" || s.view === "posterior") return "coronal";
  if (s.view === "left" || s.view === "right" || s.view === "midsagittal") return "sagittal";
  return "axial";
}

/** MRI view -> 3D camera view. */
export function view3dFor(v: SliceView): ViewName {
  return v === "coronal" ? "anterior" : v === "sagittal" ? "left" : v === "axial" ? "top" : "left";
}

/** glTF metres along an axis -> MNI mm (the inverse of the Slice match mapping). */
export function mmFromWorld(axis: "x" | "y" | "z", pos: number): number {
  if (axis === "z") return pos * 1000 - 11.57; // coronal: y in MNI
  if (axis === "x") return -pos * 1000; // sagittal: x in MNI
  return pos * 1000 - 1623.33; // transverse: z in MNI
}

/** MNI crosshair position for a cut: the cut's coordinate on its axis, the other two from `base` (e.g. the structure centroid). */
export function mniFromCut(cut: NonNullable<CamState["cut"]>, base: number[]): number[] {
  const out = [...base];
  const mm = mmFromWorld(cut.axis, cut.position);
  if (cut.axis === "z") out[1] = mm;
  else if (cut.axis === "x") out[0] = mm;
  else out[2] = mm;
  return out;
}
