/**
 * The 3D atlas (glTF metres, Y-up, left = +x) and the MRI template (MNI mm, right = +x) share one head. Fitted on the
 * curriculum structures that exist in both (median offset, scale 1): the residual is about 6-8 mm per structure, which
 * is well inside the scoring tolerance.
 */
export type Plane = "coronal" | "sagittal" | "axial";

/**
 * The 3D camera looks at the cut face from the same side the MRI is drawn from (neurological convention: front at the
 * top of a transverse section, front at the right of a sagittal one, subject's left at the left of a coronal one),
 * so the cut is on the matching side: `flip` removes the low side.
 */
export const PLANES: { id: Plane; label: string; key: string; axis: "z" | "x" | "y"; view: "posterior" | "right" | "top"; flip: boolean }[] = [
  { id: "coronal", label: "Coronal", key: "c", axis: "z", view: "posterior", flip: true },
  { id: "sagittal", label: "Sagittal", key: "s", axis: "x", view: "right", flip: true },
  { id: "axial", label: "Transverse", key: "t", axis: "y", view: "top", flip: false },
];
export const PLANE = Object.fromEntries(PLANES.map((p) => [p.id, p])) as Record<Plane, (typeof PLANES)[number]>;

/** Where the cutting plane may be placed (the brain plus a margin) and where target sections are drawn from. */
// sagittal: distance from the midline (the template is symmetric and the 3D cut is viewed from the right)
export const SLIDER_RANGE: Record<Plane, [number, number]> = { coronal: [-105, 75], sagittal: [0, 70], axial: [-50, 85] };
export const TARGET_RANGE: Record<Plane, [number, number]> = { coronal: [-65, 45], sagittal: [8, 52], axial: [-28, 62] };

/** glTF position of a plane given MNI mm. */
export function mmToWorld(plane: Plane, mm: number): number {
  if (plane === "coronal") return (mm + 11.57) / 1000;
  if (plane === "sagittal") return -mm / 1000;
  return (mm + 1623.33) / 1000;
}

/** An MNI point whose coordinate along the plane normal is `mm` (the others at the centre). */
export function mmPoint(plane: Plane, mm: number): number[] {
  return plane === "coronal" ? [0, mm, 0] : plane === "sagittal" ? [mm, 0, 0] : [0, 0, mm];
}

/** 0..100 points: full marks within 2 mm, nothing from 22 mm away, and nothing for the wrong plane. */
export function pointsFor(sameplane: boolean, distMm: number): number {
  if (!sameplane) return 0;
  return Math.round(Math.max(0, Math.min(1, (22 - distMm) / 20)) * 100);
}
