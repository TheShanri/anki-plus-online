import { useEffect, useState } from "react";
import type { SectionPalette } from "./shader";
import type { Tissue } from "./deep";

/**
 * Section tones per theme, in the language of a fixed-brain atlas plate: grey matter a restrained warm grey (mid-tone, never
 * near black, so the grey/white contrast reads on light and dark backgrounds alike), white matter a pale ivory, CSF spaces
 * (sulci, ventricles) a deep shadow close to the theme's background. The "regions" look cools the same values so they sit
 * with its lobe colours.
 */
export type SectionTheme = "clinical" | "clinical-dark" | "academia" | "synthwave";
type Look = "brain" | "regions";

const PALETTES: Record<SectionTheme, Record<Look, SectionPalette>> = {
  // UVM Clinical (light page): a printed plate
  clinical: {
    brain: { gm: "#a68e7f", wm: "#f4ece0", csf: "#463a36", line: "#4f403a" },
    regions: { gm: "#9a94a5", wm: "#eeebf2", csf: "#3a3644", line: "#3e3848" },
  },
  // UVM Clinical, dark mode: the same plate a step lighter in grey so it holds against the dark page
  "clinical-dark": {
    brain: { gm: "#a08979", wm: "#ece3d5", csf: "#1e1a18", line: "#14110f" },
    regions: { gm: "#958fa1", wm: "#e7e3ec", csf: "#1b1a22", line: "#121118" },
  },
  // Dark Academia: sepia grey matter on parchment white matter
  academia: {
    brain: { gm: "#a08b74", wm: "#ece0c6", csf: "#22180f", line: "#170f09" },
    regions: { gm: "#978d95", wm: "#e8e1d6", csf: "#1e1715", line: "#140f0d" },
  },
  // Synthwave Cortex: lavender-grey grey matter, cool white matter, indigo-black CSF
  synthwave: {
    brain: { gm: "#93889f", wm: "#ece6f2", csf: "#1a0d2c", line: "#12061f" },
    regions: { gm: "#8a86a8", wm: "#e7e5f4", csf: "#160c2e", line: "#0e0620" },
  },
};

export function sectionTheme(): SectionTheme {
  if (typeof document === "undefined") return "clinical";
  const h = document.documentElement;
  const t = h.getAttribute("data-theme") ?? "";
  if (t === "dark-academia") return "academia";
  if (t === "synthwave-cortex") return "synthwave";
  return h.getAttribute("data-mode") === "dark" ? "clinical-dark" : "clinical";
}

/** The current theme's section key, updated when data-theme / data-mode change. */
export function useSectionTheme(): SectionTheme {
  const [t, setT] = useState<SectionTheme>(() => sectionTheme());
  useEffect(() => {
    const mo = new MutationObserver(() => setT(sectionTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

export function sectionPalette(look: Look, theme: SectionTheme = sectionTheme()): SectionPalette {
  return PALETTES[theme][look];
}

export function sectionSwatch(t: Tissue, look: Look, theme: SectionTheme = sectionTheme()): string {
  const p = sectionPalette(look, theme);
  return t === "grey" ? p.gm : t === "white" ? p.wm : p.csf;
}
