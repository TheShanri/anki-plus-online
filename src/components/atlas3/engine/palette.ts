import type { Label3, Tissue } from "./data";

/* Colours of the v3 atlas. Surfaces: a natural fixed-brain look (cortex warm grey-pink, cerebellum a little darker,
 * brainstem and white matter cream, nuclei grey-brown, ventricles slate). Cut faces: the tones of a stained section
 * (grey matter grey, white matter ivory, fluid deep slate, choroid plexus rose). Display (sRGB) hex. */

export const SURFACE: Record<Tissue, string> = {
  ctx: "#d6b4a6",
  cbx: "#c9a596",
  bs: "#dcc6ab",
  wm: "#e9dcc4",
  tract: "#e4d3b8",
  gm: "#b99a8e",
  csf: "#6f8aa3",
  plx: "#c27b7b",
};

export const CAP: Record<Tissue, string> = {
  ctx: "#9c8a86",
  cbx: "#958380",
  bs: "#c4b49e",
  wm: "#efe6d3",
  tract: "#f6efe0",
  gm: "#a29089",
  csf: "#33465a",
  plx: "#b46d72",
};

/** Deep nuclei get their own cap tone so neighbours read apart even before the outlines (globus pallidus paler, the
 * substantia nigra dark, as in a myelin-stained section). */
const CAP_KEY: Record<string, string> = {
  GPe: "#bcb2a6",
  GPi: "#c6bdb2",
  SN: "#6e605e",
  RN: "#a98d86",
  IO: "#8f7c77",
  DN: "#8f7c77",
  IPN: "#8f7c77",
  FN: "#8f7c77",
  CP: "#b46d72",
  SP: "#e2d8c6",
  ML: "#f3ead8",
  MLF: "#f3ead8",
  PAG: "#9b8a86",
  AMY: "#a6948d",
  HiH: "#a1908a",
  HiB: "#a1908a",
  HiT: "#a1908a",
};

/** "Regions" look: one hue per lobe / system, lighter for the right hemisphere's copy. */
const REGION_KEY: Record<string, string> = {};
const LOBES: [string, string[]][] = [
  ["#d98c6b", ["SFG", "PaCG", "MFG", "IFGop", "IFGtr", "FrO", "PrCG", "PCLr", "ReG", "MOrG", "AOrG", "POrG", "LOrG", "LOG", "FP", "FMG", "RoG"]],
  ["#7fae6e", ["PoCG", "PCLc", "SPL", "SMG", "AnG", "PrCun", "PaO"]],
  ["#6f97c9", ["STG", "PLT", "PLP", "TTG", "MTG", "ITG", "TP", "FuGt", "PRG"]],
  ["#b484c4", ["Cun", "LiG", "SOG", "IOG", "OP", "FuGo"]],
  ["#d6b35c", ["SIG", "LIG", "LI", "FI", "TI"]],
  ["#d97a8f", ["CgGr", "CgGc", "IsCPH", "SCG", "APH", "PPH", "AG", "HiH", "HiB", "HiT", "Pir", "OB", "AON"]],
];
for (const [c, keys] of LOBES) for (const k of keys) REGION_KEY[k] = c;

export function surfaceColor(l: Label3): string {
  return SURFACE[l.tissue] ?? "#cccccc";
}
export function capColor(l: Label3): string {
  return CAP_KEY[l.key] ?? CAP[l.tissue] ?? "#999999";
}
export function regionColor(l: Label3): string | null {
  return REGION_KEY[l.key] ?? null;
}

/** Hover and selection tints. */
export const HOVER = "#ffe08a";
export const SELECT = "#ffc14d";
