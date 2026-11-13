// Builds src/data/brainstem-ref.json: which plate levels hold each structure and on which halves, from the plate
// region ids (<slug>-L / -R / -M) and fibre ids. It names structures and levels only, no geometry, so it can ship to the
// client (the plates themselves stay behind the auth-gated route). Re-run after the plates change:
//   node tools/brainstem/atlas3/build-ref-map.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const all = JSON.parse(readFileSync(new URL("src/data/brainstem-levels.json", root), "utf8")).levels;
const dir = new URL("src/data/brainstem-plates/", root);
const have = new Set(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
// the transverse sections first (rostral to caudal), then the surface views and the midsagittal cut
const sections = all.filter((l) => l.kind === "section" && have.has(l.slug)).map((l) => l.slug);
const surfaces = all.filter((l) => l.kind === "gross" && have.has(l.slug)).map((l) => l.slug);
const order = [...sections, ...surfaces];

const structures = {};
for (const lv of order) {
  const p = JSON.parse(readFileSync(new URL(`${lv}.json`, dir), "utf8"));
  const add = (slug, side, approx, area) => {
    const s = (structures[slug] ??= { levels: {} });
    const e = (s.levels[lv] ??= { sides: [], approx: false, area: 0 });
    if (!e.sides.includes(side)) e.sides.push(side);
    e.approx ||= !!approx;
    e.area += area;
  };
  for (const r of p.regions) {
    const n = r.d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    add(r.slug, r.side, r.approx, Math.round((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))));
  }
  for (const f of p.fibres) add(f.slug, f.side, f.approx, 0);
}
for (const s of Object.values(structures)) for (const e of Object.values(s.levels)) e.sides.sort();
writeFileSync(new URL("src/data/brainstem-ref.json", root), JSON.stringify({ levels: order, surfaces, structures }, null, 1) + "\n");
console.log(order.length, "levels,", Object.keys(structures).length, "structures");
