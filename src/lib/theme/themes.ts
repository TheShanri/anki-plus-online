// The three themes: ids, two-word names, taglines. Pure data (safe on server and client).
export const THEME_IDS = ["uvm-clinical", "dark-academia", "synthwave-cortex"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "uvm-clinical";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  tagline: string;
  sounds: string;
}

export const THEMES: Record<ThemeId, ThemeInfo> = {
  "uvm-clinical": {
    id: "uvm-clinical",
    name: "UVM Clinical",
    tagline: "Calm, crisp, professional. Green and gold on clean neutrals.",
    sounds: "Soft clicks and gentle chimes",
  },
  "dark-academia": {
    id: "dark-academia",
    name: "Dark Academia",
    tagline: "A candlelit library: parchment, oxblood and brass.",
    sounds: "Quill scratch, page turns, small bells",
  },
  "synthwave-cortex": {
    id: "synthwave-cortex",
    name: "Synthwave Cortex",
    tagline: "Neon horizon with a wireframe brain. Arcade energy.",
    sounds: "Arcade blips, synth arpeggios, combo bursts",
  },
};

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}
