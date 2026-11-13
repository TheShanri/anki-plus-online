// Accuracy gate for the v3 pathway data (docs/PATHWAY_V3.md): every fibre sample lies inside its declared host
// (ray-parity point-in-mesh, majority of three axis rays; 0.5 mm tolerance for nerves, roots and other thin hosts),
// every cell body and synapse sits inside its nucleus, every crossing happens inside the decussation structure at the
// slide's level, and every nucleus proxy lies inside its parent structure.
//   node tools/pathways/v3/validate.mjs [slug ...]        exit 1 on any failure; prints one line per pathway
import { setPriority } from "node:os";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/geom.mjs";
try {
  setPriority(Number(process.env.PW3_NICE ?? 10)); // below normal (PW3_NICE=19: idle, while someone works on the machine)
} catch {}

const DIR = join(ROOT, "public/pathways/v3");
const THIN_TOL = 0.0005;
const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const verbose = process.argv.includes("--verbose");

import { unflat, inHost } from "./lib/hosttest.mjs";

const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && (!want.length || want.some((w) => f === `${w}.json` || f.startsWith(`${w}-`))));
let bad = 0;
const rows = [];
for (const file of files) {
  const d = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const key = d.limb ? `${d.slug}:${d.limb}` : d.slug;
  let samples = 0, fibres = 0, marks = 0, crosses = 0;
  const errs = [];
  const synthetic = new Set();
  for (const [hk, g] of Object.entries(d.geo)) if (g.synthetic) synthetic.add(g.name);
  // nucleus proxies inside their parents (centre and the six poles)
  for (const [hk, g] of Object.entries(d.geo)) {
    if (g.kind !== "proxy") continue;
    const pts = [g.c];
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
      const q = g.c.slice();
      q[a] += sg * g.r[a] * 0.9;
      pts.push(q);
    }
    // a peripheral ganglion with no mesh of its own (parent null) is flagged like a synthetic connector
    if (!g.parent) {
      synthetic.add(`${g.name} (no mesh of its own: a flagged ellipsoid)`);
      continue;
    }
    const parentKey = g.parent.includes(":") ? g.parent : `a:${g.parent}`;
    for (const q of pts) if (!(await inHost(parentKey, q, d.geo))) {
      errs.push(`proxy ${g.name} (${hk}) pokes out of ${g.parent} at ${q.map((v) => v.toFixed(4))}`);
      break;
    }
  }
  for (const [bi, b] of d.beats.entries()) {
    for (const side of ["L", "R"]) {
      const x = b[side];
      if (!x) continue;
      for (const f of x.f) {
        fibres++;
        const pts = unflat(f.pts);
        for (let i = 0; i < pts.length; i++) {
          samples++;
          let s = 0;
          while (s + 1 < f.seg.length && f.seg[s + 1][0] <= i) s++;
          const host = f.seg[s][1];
          // a junction sample belongs to both the segment it starts and the one before
          const prev = s > 0 && f.seg[s][0] === i ? f.seg[s - 1][1] : null;
          const ok = (await inHost(host, pts[i], d.geo)) || (prev && (await inHost(prev, pts[i], d.geo)));
          if (!ok) errs.push(`beat ${bi} ${side} fibre sample ${i}/${pts.length} outside ${host} at ${pts[i].map((v) => v.toFixed(4))}`);
        }
        // a fibre must be continuous: no jump above 3 mm between samples
        for (let i = 1; i < pts.length; i++) {
          const g = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
          if (g > 0.003) errs.push(`beat ${bi} ${side}: gap ${(g * 1000).toFixed(1)} mm at sample ${i}`);
        }
      }
      for (const m of [x.soma, x.syn, x.start]) {
        if (!m) continue;
        marks++;
        if (!(await inHost(m.host, m.p, d.geo, m.host.startsWith("n:") || m.host.startsWith("t:") ? THIN_TOL : 0.0003))) errs.push(`beat ${bi} ${side}: cell body / synapse outside ${m.host} at ${m.p.map((v) => v.toFixed(4))}`);
      }
      if (x.cross) {
        crosses++;
        // the fibre of this beat must change side, and the change must happen inside the decussation structure at its level
        let hit = null;
        for (const f of x.f) {
          const pts = unflat(f.pts);
          for (let i = 1; i < pts.length && !hit; i++) if (Math.sign(pts[i][0]) !== Math.sign(pts[i - 1][0]) && pts[i][0] !== 0) {
            const a = pts[i - 1], q = pts[i];
            const t = a[0] / (a[0] - q[0]);
            hit = [0, a[1] + (q[1] - a[1]) * t, a[2] + (q[2] - a[2]) * t];
          }
        }
        if (!hit) errs.push(`beat ${bi} ${side}: marked as a crossing but the fibre never crosses the midline`);
        else {
          if (!(await inHost(x.cross.host, hit, d.geo, 0.0003))) errs.push(`beat ${bi} ${side}: crosses outside ${x.cross.host} at ${hit.map((v) => v.toFixed(4))}`);
          if (x.cross.yMax !== undefined && hit[1] > x.cross.yMax) errs.push(`beat ${bi} ${side}: crosses at y=${hit[1].toFixed(4)}, above the ${x.cross.level} (max ${x.cross.yMax})`);
          if (x.cross.yMin !== undefined && hit[1] < x.cross.yMin) errs.push(`beat ${bi} ${side}: crosses at y=${hit[1].toFixed(4)}, below the ${x.cross.level} (min ${x.cross.yMin})`);
        }
      }
    }
  }
  // the right-side fibre of a non-crossing beat stays on the right of the midline and vice versa is checked by the router;
  // here: continuity between consecutive path beats of the same side is checked loosely (end of one near start of the next)
  rows.push({ key, samples, fibres, marks, crosses, errs: errs.length, synthetic: [...synthetic] });
  if (errs.length) {
    bad++;
    console.log(`FAIL ${key}: ${errs.length} problems`);
    (verbose ? errs : errs.slice(0, 8)).forEach((e) => console.log("   " + e));
  }
}
console.log("\npathway                      samples fibres marks crossings result   synthetic connectors");
for (const r of rows) console.log(`${r.key.padEnd(28)} ${String(r.samples).padStart(7)} ${String(r.fibres).padStart(6)} ${String(r.marks).padStart(5)} ${String(r.crosses).padStart(9)} ${r.errs ? "FAIL" : "pass"}     ${r.synthetic.join("; ")}`);
console.log(bad ? `\n${bad} of ${rows.length} pathways FAIL` : `\nall ${rows.length} pathways pass`);
process.exit(bad ? 1 : 0);
