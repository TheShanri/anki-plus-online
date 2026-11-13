// Left/right symmetry check of the built pathways: each L fibre against the mirrored (x -> -x) R fibre, by arc length.
//   node tools/pathways/v3/symmetry.mjs [slug ...] [--all] [--max=3] [--len=10]
// Reports per beat the worst max distance (mm), mean distance (mm) and arc-length ratio. Flags > 3 mm max, or > 10 % length difference together with > 1 mm max (tiny fibres have noisy ratios).
// Fibres are paired by best match (each L fibre with the R fibre whose mirror is nearest); a crossing fibre's mirror is the other side's crossing fibre.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const DIR = join(ROOT, "public/pathways/v3");
const args = process.argv.slice(2);
const opt = (n, d) => Number((args.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=")[1] ?? d);
const MAXMM = opt("max", 3), LENPC = opt("len", 10), N = 200;
const want = args.filter((a) => !a.startsWith("--"));
const showAll = args.includes("--all");

function resample(flat, n) {
  const P = [];
  for (let i = 0; i + 2 < flat.length; i += 3) P.push([flat[i], flat[i + 1], flat[i + 2]]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(...P[i].map((v, k) => v - P[i - 1][k])));
  const len = cum[cum.length - 1], out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = (len * i) / (n - 1);
    while (j < P.length - 2 && cum[j + 1] < t) j++;
    const d = cum[j + 1] - cum[j] || 1, u = Math.min(1, Math.max(0, (t - cum[j]) / d));
    out.push(P[j].map((v, k) => v + (P[j + 1][k] - v) * u));
  }
  return { pts: out, len };
}
export function compare(L, R) {
  const a = resample(L, N), b = resample(R, N);
  b.pts = b.pts.map((q) => [-q[0], q[1], q[2]]);
  let mx = 0, sum = 0;
  for (let i = 0; i < N; i++) { const d = Math.hypot(...a.pts[i].map((v, k) => v - b.pts[i][k])); mx = Math.max(mx, d); sum += d; }
  return { max: mx * 1000, mean: (sum / N) * 1000, ratio: a.len / b.len };
}
// units: the atlas is in metres (x 0.001 = 1 mm)
export function checkFile(file) {
  const j = JSON.parse(readFileSync(join(DIR, file), "utf8")), rows = [];
  j.beats.forEach((b, i) => {
    if (!b.L || !b.R) return;
    const n = Math.min(b.L.f.length, b.R.f.length);
    let worst = { max: 0, mean: 0, ratio: 1 }, lenBad = 0;
    if (b.L.f.length !== b.R.f.length) rows.push({ file, beat: i, caption: b.caption, note: `fibre count ${b.L.f.length} vs ${b.R.f.length}`, flag: true });
    // pair each L fibre with the R fibre whose mirror is closest (fibre order may differ between the sides)
    const used = new Set();
    for (let k = 0; k < b.L.f.length; k++) {
      let best = null, bi = -1;
      b.R.f.forEach((r, m) => {
        if (used.has(m)) return;
        const c = compare(b.L.f[k].pts, r.pts);
        if (!best || c.mean < best.mean) { best = c; bi = m; }
      });
      if (bi < 0) break;
      used.add(bi);
      const c = best;
      if (c.max > worst.max) worst = { ...worst, max: c.max, mean: c.mean, fibre: k };
      if (Math.abs(Math.log(c.ratio)) > Math.abs(Math.log(worst.ratio))) worst.ratio = c.ratio;
    }
    if (n) rows.push({ file, beat: i, caption: b.caption, ...worst, flag: worst.max > MAXMM || (Math.abs(worst.ratio - 1) > LENPC / 100 && worst.max > 1) });
  });
  return rows;
}
if (process.argv[1]?.endsWith("symmetry.mjs")) {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && (!want.length || want.some((w) => f.startsWith(w))));
  let bad = 0;
  for (const f of files) {
    const rows = checkFile(f), fl = rows.filter((r) => r.flag);
    bad += fl.length;
    for (const r of showAll ? rows : fl)
      console.log(`${r.flag ? "ASYM" : " ok "} ${f.replace(".json", "").padEnd(26)} beat ${String(r.beat).padStart(2)} ${r.note ?? `max ${r.max.toFixed(1)} mm  mean ${r.mean.toFixed(1)} mm  len L/R ${r.ratio.toFixed(2)}  fibre ${r.fibre}`}  (${(r.caption ?? "").slice(0, 40)})`);
  }
  console.log(`\n${files.length} files, ${bad} flagged beats`);
  process.exit(0);
}
