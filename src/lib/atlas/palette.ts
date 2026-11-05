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
  const out: string[] = [];
  for (let k = 0; k < 8; k++) {
    const h = (acc.h + 0.1 + (k * 0.8) / 8) % 1;
    out.push("#" + new THREE.Color().setHSL(h, 0.7, light ? 0.4 : 0.62).getHexString());
  }
  return out;
}

export function accentHex(): string {
  return "#" + readCssColor("--accent", "#ff2a6d").getHexString();
}
