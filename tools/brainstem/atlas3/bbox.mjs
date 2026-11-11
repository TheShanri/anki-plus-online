// Bounding boxes and anchors of a plate's right-half regions (plate units), for authoring extras next to them.
//   node tools/brainstem/atlas3/bbox.mjs <level>
import { readFileSync } from "node:fs";
const lv = process.argv[2];
const p = JSON.parse(readFileSync(new URL(`../../../src/data/brainstem-plates/${lv}.json`, import.meta.url)));
const bb = (d) => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round);
};
console.log(lv, "viewBox", p.viewBox.join(" "), "outline", bb(p.outline).join(","));
for (const r of p.regions.filter((r) => r.side !== "L")) console.log(`  ${r.side} ${r.slug.padEnd(48)} bbox ${bb(r.d).join(",").padEnd(20)} a ${r.a.join(",")}${r.approx ? " approx" : ""}`);
for (const f of p.fibres.filter((r) => r.side === "R")) console.log(`  F ${f.slug.padEnd(48)} bbox ${bb(f.d).join(",")}`);
