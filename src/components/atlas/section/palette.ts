import type { SectionPalette } from "./shader";
import type { Tissue } from "./deep";

/**
 * Section tones, read from the course's fixed-brain coronal and horizontal sections (lab 13/14): grey matter a warm
 * grey-brown a shade deeper than the outer surface, white matter a pale ivory, CSF spaces (sulci, ventricles) a dark
 * warm shadow. The "regions" look uses the same values cooled to sit with its lobe colours.
 */
export const SECTION_PALETTE: Record<"brain" | "regions", SectionPalette> = {
  brain: { gm: "#b6958b", wm: "#f2e8da", csf: "#4a3a37", line: "#5b4038" },
  regions: { gm: "#a49aa6", wm: "#efebf1", csf: "#3b3744", line: "#3e3848" },
};

export function sectionSwatch(t: Tissue, look: "brain" | "regions"): string {
  const p = SECTION_PALETTE[look];
  return t === "grey" ? p.gm : t === "white" ? p.wm : p.csf;
}
