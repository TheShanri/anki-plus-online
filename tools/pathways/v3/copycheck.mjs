// Checks the beat copy (src/components/atlas/pathways/v3/copy/*.json) against the beat list (_atlas/pw3_raw/beats.json):
// one row per beat, titles of 5 words or fewer, one sentence each, a short "where", no "Branch 1/2" wording.
//   node tools/pathways/v3/copycheck.mjs [slug ...]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const BEATS = JSON.parse(readFileSync(join(ROOT, "_atlas/pw3_raw/beats.json"), "utf8"));
const DIR = join(ROOT, "src/components/atlas/pathways/v3/copy");
const COPY = {};
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) Object.assign(COPY, JSON.parse(readFileSync(join(DIR, f), "utf8")));
const want = process.argv.slice(2);
let bad = 0;
const words = (s) => s.replace(/‹[^›]*›/g, "").trim().split(/\s+/).filter(Boolean).length;
for (const [key, beats] of Object.entries(BEATS)) {
  const [slug, limb] = key.split(":");
  if (want.length && !want.includes(slug)) continue;
  const rows = COPY[slug]?.[limb ?? "*"] ?? COPY[slug]?.["*"];
  const errs = [];
  if (!rows) errs.push("no copy");
  else {
    if (rows.length !== beats.length) errs.push(`${rows.length} rows for ${beats.length} beats`);
    rows.forEach(([t, s, w], i) => {
      if (!t || words(t) > 5) errs.push(`beat ${i}: title "${t}" (${words(t ?? "")} words)`);
      if (!s || !/[.!?]›?$/.test(s.trim())) errs.push(`beat ${i}: sentence must end with a full stop`);
      if (s && (s.replace(/‹[^›]*›/g, "").match(/[.!?](\s|$)/g) ?? []).length > 1) errs.push(`beat ${i}: more than one sentence`);
      if (w && words(w) > 4) errs.push(`beat ${i}: where "${w}" too long`);
      if (/branch \d/i.test(`${t} ${s}`)) errs.push(`beat ${i}: "Branch n" wording`);
    });
  }
  if (errs.length) {
    bad++;
    console.log(`FAIL ${key}`);
    errs.slice(0, 12).forEach((e) => console.log("   " + e));
  } else console.log(`ok   ${key} (${beats.length} beats)`);
}
process.exit(bad ? 1 : 0);
