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

/** While a docked BrainstemRef is lighting a structure, a 3D view breathes its highlight with brainstemPulse() so the
 *  2D plate and the 3D mesh pulse together. A counter, so overlapping docks do not switch it off early. */
export const brainstemBreath = { active: 0 };
const wakers = new Set<() => void>();

/** A 3D view with an on-demand frame loop registers its invalidate() here, so breathing starts without waiting for
 *  the next interaction. Returns the unsubscribe. */
export function onBrainstemBreath(wake: () => void): () => void {
  wakers.add(wake);
  return () => {
    wakers.delete(wake);
  };
}

/** Start (+1) or stop (-1) breathing on behalf of one docked reference. */
export function setBrainstemBreath(delta: 1 | -1): void {
  brainstemBreath.active = Math.max(0, brainstemBreath.active + delta);
  for (const w of wakers) w();
}

/** Drives a 3D highlight material from the shared pulse while a docked reference breathes (brainstemBreath), and puts
 *  it back to `rest` afterwards. step() returns true while the view needs another frame. */
export class BrainstemBreathDriver {
  private on = false;
  constructor(private rest = 0.55) {}
  step(mat: { emissiveIntensity: number }, allowed: boolean): boolean {
    if (allowed && brainstemBreath.active > 0 && !pulseDisabled()) {
      mat.emissiveIntensity = this.rest - 0.25 + 0.6 * brainstemPulse();
      this.on = true;
      return true;
    }
    if (!this.on) return false;
    this.on = false;
    mat.emissiveIntensity = this.rest;
    return true;
  }
}
