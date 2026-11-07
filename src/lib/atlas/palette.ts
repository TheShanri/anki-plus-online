import * as THREE from "three";
import { readCssColor } from "./theme";

/**
 * Distinct CSS colours (hex) for extra/neighbour structures. Hues are spread evenly around the wheel starting
 * well away from the theme accent (the primary selection), with lightness picked for the current background.
 * Call on the client.
 */
export function overlayPalette(): string[] {
  const acc = { h: 0, s: 0, l: 0 };
  readCssColor("--accent", "#ff2a6d").getHSL(acc);
  const bg = readCssColor("--bg", "#101010");
  const light = bg.r * 0.3 + bg.g * 0.59 + bg.b * 0.11 > 0.5;
  // Five well-separated hues (offsets in degrees from the accent, ordered so consecutive picks are far apart),
  // fully saturated, then the same hues shifted 30 degrees. Lightness alternates so neighbours also differ in shade.
  const BASE = [190, 70, 310, 130, 250];
  const L = light ? [0.4, 0.3, 0.48] : [0.58, 0.68, 0.48];
  const out: string[] = [];
  for (let k = 0; k < 8; k++) {
    const deg = BASE[k % 5] + (k >= 5 ? 30 : 0);
    out.push("#" + new THREE.Color().setHSL((acc.h + deg / 360) % 1, 0.92, L[k % 3]).getHexString());
  }
  return out;
}

export function accentHex(): string {
  return "#" + readCssColor("--accent", "#ff2a6d").getHexString();
}
