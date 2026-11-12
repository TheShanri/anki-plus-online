// Builds the v3 pathway geometry from the specs (tools/pathways/v3/spec/*) and the real meshes, then runs the validator.
//   node --import ./tools/pathways/v3/lib/register.mjs tools/pathways/v3/build.mjs [slug ...]   (all pathways when none given)
// Inputs: _atlas/pw3_raw/beats.json (dump-beats.mjs), _atlas/pw3_raw/nerves.json + body.glb (export_v3.py), public/atlas/*.
// Output: public/pathways/v3/<slug>[-<limb>].json. The build fails (exit 1) when validate.mjs finds any fibre outside its host.
import { setPriority } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib/geom.mjs";
import { PROXIES, TUBES } from "./lib/fibre.mjs";
import { curveByKey } from "./lib/nerves.mjs";
import { loadSpecs } from "./spec/index.mjs";
try {
  setPriority(Number(process.env.PW3_NICE ?? 10)); // below normal (PW3_NICE=19: idle, while someone works on the machine)
} catch {}

const BEATS = JSON.parse(readFileSync(join(ROOT, "_atlas/pw3_raw/beats.json"), "utf8"));
const OUT = join(ROOT, "public/pathways/v3");
mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ALL = await loadSpecs(want);
for (const w of want) if (!ALL[w]) console.error(`no spec for ${w}`);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const fails = [];

for (const [slug, spec] of Object.entries(ALL)) {
  if (want.length && !want.includes(slug)) continue;
  for (const limb of spec.variants ?? [null]) {
    const key = limb ? `${slug}:${limb}` : slug;
    const ref = BEATS[key];
    if (!ref) {
      fails.push(`${key}: no beat list`);
      continue;
    }
    const t0 = Date.now();
    // a seeded random (cortexPoint and insideNear sample at random): the same spec always builds the same data
    let seed = 0x2f6b;
    for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const sides = {};
    try {
      for (const side of ["L", "R"]) sides[side] = await spec.build(side, limb);
    } catch (e) {
      fails.push(`${key}: ${e.message}`);
      console.error(`FAIL ${key}:`, e.stack);
      continue;
    }
    const hosts = new Set();
    const beats = ref.map((b, i) => {
      const o = { info: b.info, kind: b.kind, caption: b.caption };
      for (const side of ["L", "R"]) {
        const x = sides[side][i];
        if (!x) {
          fails.push(`${key}: beat ${i} (${b.caption}) missing for ${side}`);
          continue;
        }
        o[side] = x;
        x.f.forEach((f) => f.seg.forEach(([, h]) => h.replace(/^u:/, "").split("|").forEach((k) => hosts.add(k))));
        for (const m of [x.soma, x.syn, x.start, x.cross]) if (m?.host) hosts.add(m.host);
        x.stops.forEach((s) => s.carve ? hosts.add(s.carve.mesh) : hosts.add(s.key.split("@")[0]));
      }
      Object.assign(o, sides.L[i]?.meta ?? {});
      return o;
    });
    if (sides.L.length !== ref.length) fails.push(`${key}: spec has ${sides.L.length} beats, the beat model ${ref.length}`);
    // geometry the runtime draws for hosts that are not atlas / part meshes
    const geo = {};
    for (const h of hosts) {
      const [kind, ...rest] = h.split(":");
      const id = rest.join(":");
      if (kind === "n") {
        const c = curveByKey(id);
        geo[h] = { kind: "nerve", name: id.split("#")[0].replace(/\.[lr]$/, ""), pts: c.pts.flat().map(r5), r: c.r.map((v) => r5(v)) };
      } else if (kind === "t") {
        const t = TUBES.get(id);
        geo[h] = { kind: "tube", name: t.name, pts: t.pts.flat().map(r5), r: r5(t.r), synthetic: t.why, ...(t.hidden ? { hidden: true } : {}) };
      } else if (kind === "p") {
        const q = PROXIES.get(id);
        geo[h] = { kind: "proxy", name: q.name, parent: q.parent, c: q.c.map(r5), r: q.r };
      }
    }
    const file = limb ? `${slug}-${limb}.json` : `${slug}.json`;
    writeFileSync(join(OUT, file), JSON.stringify({ v: 1, slug, limb, beats, geo }));
    console.log(`built ${key}: ${beats.length} beats, ${hosts.size} hosts, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
if (fails.length) {
  console.error("\nBUILD FAILED\n" + fails.join("\n"));
  process.exit(1);
}
if (!process.argv.includes("--no-validate")) {
  const v = spawnSync(process.execPath, [join(ROOT, "tools/pathways/v3/validate.mjs"), ...want], { stdio: "inherit" });
  process.exit(v.status ?? 1);
}
