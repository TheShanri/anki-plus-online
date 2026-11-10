// One colour language for every pathway view (3D tracer v3 and the 2D diagrams).
//   colour     = which NEURON in the chain (1st, 2nd, 3rd order; UMN/LMN for motor)
//   line style = which SIDE: LEFT solid, RIGHT dashed (owner, 2026-11-09), always, in every view;
//                plus position across the drawn midline. No side colours.
// Okabe-Ito hues: distinguishable with the common colour-vision deficiencies, readable on dark and light themes.

export const ORDER_COLORS = {
  1: "#56B4E9", // 1st-order neuron (sensory) / upper motor neuron
  2: "#E69F00", // 2nd-order neuron / lower motor neuron
  3: "#CC79A7", // 3rd-order neuron
  4: "#009E73", // 4th link in loops and circuits (cerebellar, basal ganglia)
} as const;

export type NeuronOrder = keyof typeof ORDER_COLORS;

/** The motor chain uses the same first two colours: UMN = order 1, LMN = order 2. */
export const MOTOR_COLORS = { umn: ORDER_COLORS[1], lmn: ORDER_COLORS[2] } as const;

/** Visual pathway only: colour by visual FIELD (the textbook convention), upper field lighter, lower darker. */
export const FIELD_COLORS = {
  leftUpper: "#8FD0F2",
  leftLower: "#2F8FC4",
  rightUpper: "#F3C266",
  rightLower: "#B87800",
} as const;

/** Regions (the stops: nuclei, ganglia, cortex areas) are never in a neuron colour: a neutral fill with a dark outline. */
export const REGION_COLORS = {
  fill: "#EDE6D6",
  current: "#FFF4C2",
  outline: "#1C1A17",
} as const;

/** Midline, crossing marks and section planes. */
export const GUIDE_COLORS = { midline: "#E5484D", crossing: "#E5484D" } as const;

export const ORDER_LABEL: Record<NeuronOrder, string> = { 1: "1st-order neuron", 2: "2nd-order neuron", 3: "3rd-order neuron", 4: "4th link" };
