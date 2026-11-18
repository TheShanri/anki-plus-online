/*
 * "Show its cut" (owner, 2026-11-15: "I click on the fornix: it highlights the whole thing. Option to click to show only the
 * sliced view of it in coronal.")
 *
 * Thin adapter between the viewer's UI/state and the section renderer. Today it works on the current section code: the cut
 * position comes from the structure's mesh bounds, and "only the sliced view" is the accent cut face of the selection with the
 * rest of the section washed out (`quietPalette`, applied by AtlasViewer). The labelled-atlas section rebuild (section/*) can
 * take over without touching the viewer: call `provideSectionOnly({ bounds, apply })` from its module and
 *   - `bounds(ids)` replaces the mesh bounds (structure extent in glTF metres),
 *   - `apply(ids, plane)` renders the structure-only section itself (called with nulls to turn it off). The viewer keeps
 *     the quiet palette on either way (it only touches the template tissue around the structure).
 */

import * as THREE from "three";
import type { SectionPalette } from "../section/shader";

export type CutPlaneName = "coronal" | "sagittal" | "horizontal";
export const PLANE_AXIS: Record<CutPlaneName, "x" | "y" | "z"> = { coronal: "z", sagittal: "x", horizontal: "y" };
export const PLANE_LABEL: Record<CutPlaneName, string> = { coronal: "Coronal", sagittal: "Sagittal", horizontal: "Horizontal" };

type Bounds = { min: [number, number, number]; max: [number, number, number] };
export type SectionOnlyImpl = {
  bounds?: (ids: string[]) => Bounds | null;
  apply?: (ids: string[] | null, plane: CutPlaneName | null) => void;
};
let impl: SectionOnlyImpl = {};
/** For the section module: register the labelled-atlas implementation (bounds and/or the structure-only render). */
export function provideSectionOnly(i: SectionOnlyImpl) {
  impl = i;
}
export function sectionOnlyNative(): boolean {
  return !!impl.apply;
}
export function applySectionOnly(ids: string[] | null, plane: CutPlaneName | null) {
  impl.apply?.(ids, plane);
}

export type StructureCut = { axis: "x" | "y" | "z"; pos: number; lo: number; hi: number };

/**
 * Where to cut: through the structure's centre, with a slider range over its extent. A paired structure (both hemispheres in
 * one selection) is cut sagittally through its left half, so the plane does not fall into the gap between the two sides.
 */
export function planStructureCut(plane: CutPlaneName, ids: string[], meshBox: THREE.Box3): StructureCut {
  const ax = PLANE_AXIS[plane];
  const b = impl.bounds?.(ids);
  const box = b ? new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)) : meshBox;
  let lo = box.min[ax];
  let hi = box.max[ax];
  if (ax === "x" && lo < -0.004 && hi > 0.004) lo = Math.max(lo, 0.0015); // left hemisphere is +x
  const pad = Math.min(0.0008, (hi - lo) * 0.04); // keep the ends inside the structure (a plane on the very tip shows nothing)
  lo += pad;
  hi -= pad;
  if (hi < lo) hi = lo = (lo + hi) / 2;
  return { axis: ax, pos: (lo + hi) / 2, lo, hi };
}

const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
/** The section around the structure, quietened: grey and CSF drawn toward the white-matter tone, the lines lighter. */
export function quietPalette(p: SectionPalette): SectionPalette {
  return { ...p, gm: mix(p.gm, p.wm, 0.62), csf: mix(p.csf, p.wm, 0.55), line: mix(p.line, p.wm, 0.5) };
}
