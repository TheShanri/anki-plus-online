// The shared brainstem pulse: the 2D plates (BrainstemRef) and any 3D view that pulses the same structure breathe
// together because both read the same clock. Phase = (performance.now() / 1400) % 1.

export const PULSE_PERIOD_MS = 1400;

/** The pulse phase in [0, 1) at time t (ms on the performance.now() clock). */
export function brainstemPulsePhase(t: number = typeof performance !== "undefined" ? performance.now() : 0): number {
  return (t / PULSE_PERIOD_MS) % 1;
}

/** The pulse intensity in [0, 1] at time t (ms, performance.now()): 0.5 - 0.5 cos(2 pi phase), so 0 at phase 0 and 1
 *  at phase 0.5. Use it to modulate an emissive/opacity so 2D and 3D highlights breathe in sync. */
export function brainstemPulse(t: number = typeof performance !== "undefined" ? performance.now() : 0): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * brainstemPulsePhase(t));
}

/** True when motion should stay still (reduced motion, or the app's effects switched off). */
export function pulseDisabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.effects === "off";
}
