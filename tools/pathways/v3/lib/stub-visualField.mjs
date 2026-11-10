// Node stub of src/components/atlas/pathways/visualField.tsx (JSX file): only the colour helpers the beat model needs.
export function shade(css, k) {
  let r = 128, g = 128, b = 128;
  const hex = /^#([0-9a-f]{6})$/i.exec(String(css).trim());
  if (hex) { const n = parseInt(hex[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  const f = (c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export function fieldPalette(left, right) {
  return { LU: shade(left, 0.28), LL: shade(left, -0.22), RU: shade(right, 0.28), RL: shade(right, -0.22) };
}
