"use client";
import { useEffect, useState } from "react";
import { previewTheme } from "@/lib/sound";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/theme/themes";
import { ThemePreview } from "./ThemePreview";
import { useTheme } from "./ThemeProvider";

/** Three live-preview cards. Choosing one switches the whole app immediately and plays a few notes from its sound pack. */
export function ThemePicker({ onPick, size = "md" }: { onPick?: (id: ThemeId) => void; size?: "md" | "lg" }) {
  const { prefs, update } = useTheme();
  const [sysDark, setSysDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => setSysDark(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const resolvedDark = prefs.mode === "dark" || (prefs.mode === "auto" && sysDark);
  return (
    <div className="theme-grid" data-size={size} role="radiogroup" aria-label="Theme">
      {THEME_IDS.map((id) => {
        const on = prefs.theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className="theme-card"
            data-on={on}
            onClick={() => {
              update({ theme: id });
              previewTheme(id);
              onPick?.(id);
            }}
          >
            <ThemePreview id={id} mode={id === "uvm-clinical" && resolvedDark ? "dark" : "light"} />
            <span className="theme-card-meta">
              <b className="theme-card-name">{THEMES[id].name}</b>
              <span className="theme-card-tag">{THEMES[id].tagline}</span>
              <span className="theme-card-snd">Sounds: {THEMES[id].sounds}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
