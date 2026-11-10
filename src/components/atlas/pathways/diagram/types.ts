import type { ReactNode } from "react";
import type { P } from "./geom";

export type Side = "L" | "R";
export type EndKind = "cup" | "arrow" | "bar" | "none";

/** One drawn thing. `keys` name the beats it belongs to (resolved against the live beat list). */
export interface DEl {
  id: string;
  keys: string[];
  kind: "path" | "region" | "icon" | "cross" | "box" | "badge";
  /** instance diagrams: which side's instance (L solid by default, R its mirror); field diagrams: the visual field; M: always drawn */
  side: Side | "M";
  /** neuron order override (1..4); by default the order of the beat the element belongs to */
  order?: number;
  color?: string;
  d?: string;
  end?: { x: number; y: number; a: number };
  endKind?: EndKind;
  dash?: boolean;
  /** line width override (the retina halves are drawn thick) */
  width?: number;
  x?: number;
  y?: number;
  rx?: number;
  ry?: number;
  rot?: number;
  /** a cell body (small filled circle in the neuron's colour) sits inside the region */
  soma?: boolean;
  icon?: string;
  w?: number;
  h?: number;
  text?: string[];
  badge?: string;
}

/** A short name (1 to 3 words, never the long beat text). */
export interface DLabel {
  keys: string[];
  text: string;
  /** stacks: the label sits in the gutter and leads to the target of the main instance */
  lead?: Record<Side, P>;
  /** fixed labels */
  x?: number;
  y?: number;
  anchor?: "start" | "middle" | "end";
  small?: boolean;
  /** fixed labels: a leader line to this point */
  to?: [number, number];
  /** drawn on a cream region: dark ink, no halo */
  ink?: boolean;
}

export interface Diagram {
  w: number;
  h: number;
  mode: "instance" | "field" | "plain";
  midline?: { x: number; y0: number; y1: number };
  deco: ReactNode;
  els: DEl[];
  labels: DLabel[];
  /** stacks: the level names, drawn in the gutter opposite the labels */
  levelNames?: { text: [string, string?]; y: number }[];
  hasCross?: boolean;
  /** circuits: how to read the arrows */
  note?: string;
  /** visual: the legend shows the field colours instead of the neuron orders */
  legendField?: boolean;
}
