"use client";

import { Atlas3Canvas, type Cut3, type Guide3, type View3 } from "./engine/Atlas3Canvas";
import "./atlas3.css";

/** MNI millimetres along a plane's normal -> the v3 world position (metres; X = patient's left, Y = up, Z = anterior).
 * The v3 atlas is the MNI template itself, so this is exact (the old atlas needed a fitted offset). */
export function mmToWorld3(plane: "coronal" | "sagittal" | "axial", mm: number): number {
  if (plane === "coronal") return mm / 1000;
  if (plane === "sagittal") return -mm / 1000;
  return mm / 1000;
}

/** The solid brain cut at one plane, seen square on from the side the MRI is drawn from (Slice match), with optional
 * translucent sheets at other planes. No names anywhere. */
export default function CutView3({ cut, view, guides, height = 520 }: { cut: Cut3; view: View3; guides?: Guide3[]; height?: number }) {
  return (
    <div className="atl3-one" style={{ height }}>
      <Atlas3Canvas view={view} cut={cut} guides={guides} quiz zoom={view === "superior" ? 0.8 : 0.72} />
    </div>
  );
}
