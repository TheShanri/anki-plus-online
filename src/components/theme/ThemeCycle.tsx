"use client";
import { previewTheme } from "@/lib/sound";
import { THEME_IDS, THEMES } from "@/lib/theme/themes";
import { useTheme } from "./ThemeProvider";

/** Small palette button in the nav: cycles through the three themes. */
export function ThemeCycle() {
  const { prefs, update } = useTheme();
  const next = THEME_IDS[(THEME_IDS.indexOf(prefs.theme) + 1) % THEME_IDS.length];
  return (
    <button
      type="button"
      className="icon-btn"
      title={`Theme: ${THEMES[prefs.theme].name}. Switch to ${THEMES[next].name}`}
      aria-label={`Theme: ${THEMES[prefs.theme].name}. Switch to ${THEMES[next].name}`}
      onClick={() => {
        update({ theme: next });
        previewTheme(next);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
        <circle cx="7.5" cy="11" r="1" fill="currentColor" />
        <circle cx="10.5" cy="7" r="1" fill="currentColor" />
        <circle cx="15" cy="7.5" r="1" fill="currentColor" />
      </svg>
    </button>
  );
}
