// Re-applies spec/mirror.mjs to already built JSON (fast; no rebuild): node tools/pathways/v3/mirror.mjs [slug ...]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/geom.mjs";
import { applyMirror } from "./lib/mirror.mjs";
const DIR = join(ROOT, "public/pathways/v3"), want = process.argv.slice(2);
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json") && (!want.length || want.some((w) => f === `${w}.json` || f.startsWith(`${w}-`))))) {
  const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const n = await applyMirror(d, d.limb ? `${d.slug}:${d.limb}` : d.slug);
  if (n) { console.log(n); writeFileSync(join(DIR, f), JSON.stringify(d)); }
}
