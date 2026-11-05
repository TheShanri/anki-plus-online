// UI preferences: theme, mode (clinical light/dark), effects, sound volume, ambient, daily goal.
// Stored in localStorage (instant, works signed out) and mirrored to user_settings.settings
// (`theme` + `ui`, sounds live in the engine's `scaffold.sounds`) when signed in.
import { DEFAULT_THEME, isThemeId, type ThemeId } from "./themes";

export const STORAGE_KEY = "ankiplus.ui";
export const VIBE_KEY = "ankiplus.vibe";

export type Effects = "full" | "subtle" | "off";
export type ModePref = "auto" | "light" | "dark";

export interface UiPrefs {
  theme: ThemeId;
  mode: ModePref;
  effects: Effects;
  /** 0..1 master volume */
  volume: number;
  sounds: boolean;
  /** generative ambient loop (off by default) */
  ambient: boolean;
  /** reviews per day the home ring aims for */
  dailyGoal: number;
  /** the one-time "pick your vibe" moment has happened */
  vibeChosen: boolean;
}

export const UI_DEFAULTS: UiPrefs = {
  theme: DEFAULT_THEME,
  mode: "auto",
  effects: "full",
  volume: 0.6,
  sounds: true,
  ambient: false,
  dailyGoal: 30,
  vibeChosen: false,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

/** Normalise any object (localStorage JSON, or user_settings.settings) into complete prefs. */
export function readUiPrefs(raw: unknown): UiPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ui = (r.ui && typeof r.ui === "object" ? r.ui : r) as Record<string, unknown>;
  const scaffold = (r.scaffold && typeof r.scaffold === "object" ? r.scaffold : {}) as Record<string, unknown>;
  const theme = isThemeId(r.theme) ? r.theme : UI_DEFAULTS.theme;
  const mode = ui.mode === "light" || ui.mode === "dark" || ui.mode === "auto" ? ui.mode : UI_DEFAULTS.mode;
  const effects = ui.effects === "full" || ui.effects === "subtle" || ui.effects === "off" ? ui.effects : UI_DEFAULTS.effects;
  const sounds = typeof scaffold.sounds === "boolean" ? scaffold.sounds : typeof ui.sounds === "boolean" ? ui.sounds : UI_DEFAULTS.sounds;
  return {
    theme,
    mode,
    effects,
    volume: typeof ui.volume === "number" ? clamp(ui.volume, 0, 1) : UI_DEFAULTS.volume,
    sounds,
    ambient: typeof ui.ambient === "boolean" ? ui.ambient : UI_DEFAULTS.ambient,
    dailyGoal: typeof ui.dailyGoal === "number" ? Math.round(clamp(ui.dailyGoal, 5, 500)) : UI_DEFAULTS.dailyGoal,
    vibeChosen: typeof ui.vibeChosen === "boolean" ? ui.vibeChosen : UI_DEFAULTS.vibeChosen,
  };
}

/** The part stored under settings.ui (theme is stored top-level, sounds under scaffold). */
export function uiForServer(p: UiPrefs) {
  return { mode: p.mode, effects: p.effects, volume: p.volume, ambient: p.ambient, dailyGoal: p.dailyGoal, vibeChosen: p.vibeChosen };
}

export function loadLocalPrefs(): UiPrefs | null {
  try {
    const s = window.localStorage.getItem(STORAGE_KEY);
    return s ? readUiPrefs(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function saveLocalPrefs(p: UiPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: p.theme, ui: uiForServer(p), sounds: p.sounds }));
  } catch {
    /* private mode: ignore */
  }
}

/** Runs in <head> before first paint so the right theme shows with no flash. Signed-in pages already carry the
 * server's values (data-server="1"); this only reads localStorage for visitors, and resolves mode "auto". */
export const THEME_INIT_SCRIPT = `(function(){try{var h=document.documentElement,K="${STORAGE_KEY}";
if(h.getAttribute("data-server")!=="1"){var s=JSON.parse(localStorage.getItem(K)||"null");
if(s){var u=s.ui||{};if(["uvm-clinical","dark-academia","synthwave-cortex"].indexOf(s.theme)>=0)h.setAttribute("data-theme",s.theme);
if(["full","subtle","off"].indexOf(u.effects)>=0)h.setAttribute("data-effects",u.effects);
if(["auto","light","dark"].indexOf(u.mode)>=0)h.setAttribute("data-mode",u.mode);}}
var m=h.getAttribute("data-mode");if(m!=="light"&&m!=="dark"){h.setAttribute("data-mode",window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");}
}catch(e){}})();`;
