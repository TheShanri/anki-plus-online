"use client";
import { useEffect, useRef } from "react";
import { ThemePicker } from "./ThemePicker";
import { useTheme } from "./ThemeProvider";
import { THEMES } from "@/lib/theme/themes";

/** The one-time "pick your vibe" moment on first sign-in. Changeable any time in Settings. */
export function VibePicker({ onDone }: { onDone: () => void }) {
  const { prefs } = useTheme();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="vibe-backdrop" role="dialog" aria-modal="true" aria-labelledby="vibe-title" data-no-click-sound>
      <div className="vibe-card">
        <p className="eyebrow">Welcome</p>
        <h2 id="vibe-title" className="vibe-title">Pick your vibe</h2>
        <p className="vibe-sub">Each look has its own colours, type and sounds. You will be here a lot, so choose what feels good. You can change it any time in Settings.</p>
        <ThemePicker size="lg" />
        <div className="vibe-foot">
          <span className="text-text-dim text-sm">Selected: <b className="text-text">{THEMES[prefs.theme].name}</b></span>
          <button ref={btn} type="button" className="btn btn-primary btn-lg" onClick={onDone}>
            Start with {THEMES[prefs.theme].name}
          </button>
        </div>
      </div>
    </div>
  );
}
