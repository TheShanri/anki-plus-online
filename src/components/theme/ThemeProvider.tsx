"use client";
// Client runtime for themes: holds the prefs, applies them to <html> (data-theme / data-mode / data-effects),
// mirrors them to localStorage + user_settings, configures the sound engine, and mounts the effects layer
// and the one-time "pick your vibe" dialog.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyThemeFavicon } from "@/lib/theme/favicon";
import { UI_DEFAULTS, VIBE_KEY, loadLocalPrefs, saveLocalPrefs, uiForServer, type UiPrefs } from "@/lib/theme/prefs";
import { attachSound, configure as configureSound } from "@/lib/sound";
import { emit, setSoundsEnabled } from "@/lib/feedback/events";
import { FxLayer } from "./FxLayer";
import { VibePicker } from "./VibePicker";

interface Ctx {
  prefs: UiPrefs;
  signedIn: boolean;
  update: (patch: Partial<UiPrefs>) => void;
  saving: "idle" | "saving" | "saved" | "error";
}
const ThemeCtx = createContext<Ctx>({ prefs: UI_DEFAULTS, signedIn: false, update: () => {}, saving: "idle" });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ initial, signedIn, children }: { initial: UiPrefs; signedIn: boolean; children?: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(initial);
  const [saving, setSaving] = useState<Ctx["saving"]>("idle");
  const [vibeSeen, setVibeSeen] = useState(true);
  const [ready, setReady] = useState(signedIn);
  const dirty = useRef<{ ui: boolean; sounds: boolean }>({ ui: false, sounds: false });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(prefs);
  useEffect(() => {
    latest.current = prefs;
  }, [prefs]);

  // visitors: adopt what is in localStorage (the head script already painted it); everyone: remember the vibe dialog
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!signedIn) {
        const l = loadLocalPrefs();
        if (l) setPrefs(l);
      }
      setReady(true);
      try {
        setVibeSeen(window.localStorage.getItem(VIBE_KEY) === "1");
      } catch {
        setVibeSeen(false);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [signedIn]);

  // apply to the document + sound engine
  useEffect(() => {
    if (!ready) return;
    const h = document.documentElement;
    h.setAttribute("data-theme", prefs.theme);
    h.setAttribute("data-effects", prefs.effects);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const applyMode = () => {
      h.setAttribute("data-mode", prefs.mode === "auto" ? (mq.matches ? "dark" : "light") : prefs.mode);
      applyThemeFavicon(prefs.theme);
    };
    applyMode();
    if (prefs.mode === "auto") mq.addEventListener("change", applyMode);
    saveLocalPrefs(prefs);
    setSoundsEnabled(prefs.sounds);
    configureSound({ theme: prefs.theme, volume: prefs.volume, enabled: prefs.sounds, ambient: prefs.ambient });
    return () => mq.removeEventListener("change", applyMode);
  }, [prefs, ready]);

  // feedback bus -> sounds
  useEffect(() => attachSound(), []);

  // generic button click sound (not inside the study runner, which emits its own feedback)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, a.btn, summary, [role=tab]") as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.closest(".st-wrap, [data-no-click-sound]")) return;
      emit("ui", { name: "click" });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const flush = useCallback(async () => {
    const p = latest.current;
    const jobs: Promise<Response>[] = [];
    if (dirty.current.ui)
      jobs.push(fetch("/api/theme", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: p.theme, ui: uiForServer(p) }) }));
    if (dirty.current.sounds)
      jobs.push(fetch("/api/study/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scaffold: { sounds: p.sounds } }) }));
    dirty.current = { ui: false, sounds: false };
    if (!jobs.length) return;
    try {
      const res = await Promise.all(jobs);
      setSaving(res.every((r) => r.ok) ? "saved" : "error");
    } catch {
      setSaving("error");
    }
  }, []);

  const update = useCallback(
    (patch: Partial<UiPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        latest.current = next;
        return next;
      });
      if (!signedIn) return;
      const keys = Object.keys(patch);
      if (keys.some((k) => k !== "sounds")) dirty.current.ui = true;
      if (keys.includes("sounds")) dirty.current.sounds = true;
      setSaving("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500);
    },
    [signedIn, flush],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ prefs, signedIn, update, saving }), [prefs, signedIn, update, saving]);
  const showVibe = signedIn && !prefs.vibeChosen && !vibeSeen;
  return (
    <ThemeCtx.Provider value={value}>
      {children}
      <FxLayer />
      {showVibe && (
        <VibePicker
          onDone={() => {
            try {
              window.localStorage.setItem(VIBE_KEY, "1");
            } catch {
              /* ignore */
            }
            setVibeSeen(true);
            update({ vibeChosen: true });
          }}
        />
      )}
    </ThemeCtx.Provider>
  );
}
