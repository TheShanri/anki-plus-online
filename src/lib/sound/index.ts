// Sound entry point: registers the three packs and ambient loops, and wires the feedback bus to the engine.
import { onAnyFeedback, soundsEnabled, type FeedbackName } from "../feedback/events";
import { play, registerPack, configure, installUnlock, previewTheme, isUnlocked, debugState, type Payload } from "./engine";
import { clinical } from "./packs/clinical";
import { academia } from "./packs/academia";
import { synthwave } from "./packs/synthwave";
import "./ambient";
import type { ThemeId } from "../theme/themes";

registerPack("uvm-clinical", clinical);
registerPack("dark-academia", academia);
registerPack("synthwave-cortex", synthwave);

export { configure, previewTheme, isUnlocked, play };

// Dev-only: every feedback event the sound mapper saw (headless tests read it; the harness is muted).
const devLog: Array<{ name: string; on: boolean; t: number }> | null =
  process.env.NODE_ENV !== "production" && typeof window !== "undefined" ? ((window as unknown as { __soundLog?: Array<{ name: string; on: boolean; t: number }> }).__soundLog = []) : null;

/** Subscribe the engine to every feedback event. Returns the cleanup (also removes the gesture listeners). */
export function attachSound(): () => void {
  const off = installUnlock();
  const unsub = onAnyFeedback((name: FeedbackName, payload) => {
    if (devLog) devLog.push({ name, on: soundsEnabled(), t: Math.round(performance.now()) }) > 400 && devLog.shift();
    if (!soundsEnabled()) return;
    play(name, payload as Payload);
  });
  return () => {
    unsub();
    off();
  };
}

// Dev-only hook for headless tests: window.__sound.play(name, payload, theme). Removed from production builds.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __sound?: unknown }).__sound = { play: (n: string, p: Payload, theme?: ThemeId) => play(n, p, { force: true, theme }), state: debugState };
}
