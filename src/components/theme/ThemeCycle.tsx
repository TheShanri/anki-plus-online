"use client";
import { Palette } from "lucide-react";
import { previewTheme } from "@/lib/sound";
import { THEME_IDS, THEMES } from "@/lib/theme/themes";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTheme } from "./ThemeProvider";

/** Small palette button in the nav: cycles through the three themes. */
export function ThemeCycle() {
  const { prefs, update } = useTheme();
  const next = THEME_IDS[(THEME_IDS.indexOf(prefs.theme) + 1) % THEME_IDS.length];
  return (
    <Tooltip label={`Theme: ${THEMES[prefs.theme].name}`}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={`Theme: ${THEMES[prefs.theme].name}. Switch to ${THEMES[next].name}`}
        onClick={() => {
          update({ theme: next });
          previewTheme(next);
        }}
      >
        <Palette aria-hidden />
      </button>
    </Tooltip>
  );
}
