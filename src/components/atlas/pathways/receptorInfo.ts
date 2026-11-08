/* Receptor facts and the skin-patch layout, free of three.js so the tracer UI can use them without loading it. */

export type ReceptorId = "meissner" | "merkel" | "pacinian" | "ruffini" | "free" | "spindle" | "gto";

export interface ReceptorInfo {
  id: ReceptorId;
  name: string;
  /** What the course says it senses, or null when the slides only list the name. */
  senses: string | null;
  color: string;
  /** Where the receptor sits in the skin patch (depth 0 = surface, 1 = deepest). */
  depth: number;
}

/** Modalities are the course's: Merkel / Ruffini / Pacinian / free endings from the Unit 1 written exam receptor
 *  matching question, spindle and Golgi tendon organ from lab 5. The slides name Meissner without a modality. */
export const RECEPTORS: Record<ReceptorId, ReceptorInfo> = {
  meissner: { id: "meissner", name: "Meissner corpuscle", senses: null, color: "#f2a65a", depth: 0.28 },
  merkel: { id: "merkel", name: "Merkel cell", senses: "sustained touch, texture", color: "#e9d36a", depth: 0.12 },
  pacinian: { id: "pacinian", name: "Pacinian corpuscle", senses: "vibration, rapid pressure changes", color: "#c58bf2", depth: 0.82 },
  ruffini: { id: "ruffini", name: "Ruffini ending", senses: "skin stretch, movement across the skin", color: "#6fd3b3", depth: 0.55 },
  free: { id: "free", name: "Free nerve endings", senses: "pain, temperature, itch", color: "#ff7a8a", depth: 0.08 },
  spindle: { id: "spindle", name: "Muscle spindle", senses: "muscle length", color: "#7ab8ff", depth: 0 },
  gto: { id: "gto", name: "Golgi tendon organ", senses: "muscle tension", color: "#ffb86b", depth: 0 },
};


export const PATCH_W = 0.15;
export const PATCH_H = 0.105;
/** Offset of receptor i of n from the patch centre: dx along the lateral direction (away from the midline), dy up. */
export function patchLocal(i: number, n: number, id: ReceptorId) {
  return { dx: ((i + 0.5) / n - 0.5) * (PATCH_W * 0.86), dy: PATCH_H / 2 - RECEPTORS[id].depth * PATCH_H * 0.92 - 0.008 };
}

/** Where a muscle ending sits in the muscle inset, relative to the inset centre (dx lateral, dy up). */
export function muscleSpot(id: ReceptorId, i: number) {
  return id === "gto" ? { dx: 0.058, dy: 0.014 } : { dx: -0.012 + i * 0.002, dy: 0.04 };
}
