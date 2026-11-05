import * as THREE from "three";

/** Reads a CSS custom property (e.g. "--accent") from :root as a THREE.Color; falls back when unset/unparsable. */
export function readCssColor(name: string, fallback: string): THREE.Color {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) {
      const c = new THREE.Color();
      c.setStyle(v);
      return c;
    }
  } catch {
    /* ignore */
  }
  return new THREE.Color(fallback);
}
