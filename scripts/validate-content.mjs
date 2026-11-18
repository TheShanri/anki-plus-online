#!/usr/bin/env node
// Validate content/<course>/ and print coverage. Exit 1 on errors.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "nsci3250";
const dir = join(root, "content", slug);
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const course = J(join(dir, "course.json"));
const structs = J(join(dir, "structures.json"));
const sSlugs = new Set(structs.map((s) => s.slug));
const topics = new Set(course.topics.map((t) => t.slug));
const topicUnit = Object.fromEntries(course.topics.map((t) => [t.slug, t.unit]));
const manifest = existsSync(join(dir, ".media-manifest.json")) ? J(join(dir, ".media-manifest.json")) : null;
const errors = [];
const plates = new Map();
function plateData(level) {
  if (!plates.has(level)) {
    const f = join(root, "src", "data", "brainstem-plates", `${level}.json`);
    plates.set(level, /^[a-z0-9-]+$/.test(level) && existsSync(f) ? J(f) : null);
  }
  return plates.get(level);
}
const cards = [];
for (const f of readdirSync(join(dir, "cards")).filter((f) => f.endsWith(".json"))) for (const c of J(join(dir, "cards", f))) cards.push(c);

const seen = new Set();
const structNames = new Set();
for (const s of structs) { if (structNames.has(s.name.toLowerCase())) errors.push(`duplicate structure name ${s.name}`); structNames.add(s.name.toLowerCase()); }
for (const s of structs) if (s.parent && !sSlugs.has(s.parent)) errors.push(`structure ${s.slug}: unknown parent ${s.parent}`);
for (const c of cards) {
  if (seen.has(c.slug)) errors.push(`duplicate card slug ${c.slug}`);
  seen.add(c.slug);
  if (!topics.has(c.topic)) errors.push(`${c.slug}: unknown topic ${c.topic}`);
  if (c.structure && !sSlugs.has(c.structure)) errors.push(`${c.slug}: unknown structure ${c.structure}`);
  if (!["live", "draft", "retired"].includes(c.status)) errors.push(`${c.slug}: bad status ${c.status}`);
  if (c.status === "live" && c.kind !== "theory" && !c.answer) errors.push(`${c.slug}: live card without answer`);
  if (c.status === "live" && c.kind === "theory" && !c.answer) errors.push(`${c.slug}: live theory card without answer`);
  if (c.kind === "pin" && c.plate) {
    // brainstem plate cards draw a vector plate (src/data/brainstem-plates/<level>.json) instead of an image
    const plate = plateData(c.plate.level);
    if (!plate) errors.push(`${c.slug}: no brainstem plate for level ${c.plate.level}`);
    else if (!plate.regions.some((r) => r.slugs.includes(c.plate.region))) errors.push(`${c.slug}: plate ${c.plate.level} has no region for ${c.plate.region}`);
  } else if (c.kind === "pin" && c.scene) {
    // directional-terms cards draw a 3D scene (src/components/cards/DirectionScene.tsx) instead of an image
    if (!["animal", "human", "brain"].includes(c.scene.subject) || !c.scene.show) errors.push(`${c.slug}: bad scene ${JSON.stringify(c.scene)}`);
  } else if (c.kind === "pin") {
    if (!c.image) errors.push(`${c.slug}: pin without image`);
    else if (manifest && !manifest[c.image]) errors.push(`${c.slug}: media not uploaded: ${c.image}`);
    if (c.pointer?.type === "mask" && !(c.masks?.length && c.target)) errors.push(`${c.slug}: mask pin without masks/target`);
  }
  for (const k of [c.image, ...(c.extra_images ?? [])].filter(Boolean)) if (manifest && !manifest[k]) errors.push(`${c.slug}: media key missing from manifest ${k}`);
  for (const fc of c.followup_cards ?? []) if (!cards.some((x) => x.slug === fc)) errors.push(`${c.slug}: unknown followup card ${fc}`);
}

// coverage: every list structure needs a pin card (any status) where a source exists
const pinned = new Map();
for (const c of cards) if (c.kind === "pin" && c.structure) { const a = pinned.get(c.structure) ?? { live: 0, draft: 0 }; a[c.status === "live" ? "live" : "draft"]++; pinned.set(c.structure, a); }
const byUnit = {};
const none = [];
for (const s of structs) {
  const u = s.unit; byUnit[u] ??= { structures: 0, withPin: 0, live: 0, concept: 0 };
  byUnit[u].structures++;
  if (s.concept) byUnit[u].concept++;
  const p = pinned.get(s.slug);
  if (p) { byUnit[u].withPin++; if (p.live) byUnit[u].live++; } else none.push(s);
}
console.log("coverage (structures with at least one pin card; live = at least one live pin):");
for (const u of Object.keys(byUnit).sort()) { const b = byUnit[u]; console.log(`  ${u}: ${b.structures} structures, ${b.withPin} with a pin card (${b.live} live), ${b.structures - b.withPin} without, ${b.concept} are concepts`); }
console.log(`\nstructures with no pin card (${none.length}):`);
for (const s of none) console.log(`  [${s.unit}] ${s.slug}${s.concept ? " (concept)" : ""}`);
const kinds = {};
for (const c of cards) { const t = topicUnit[c.topic]; kinds[t] ??= {}; const k = c.kind + (c.status === "draft" ? " (draft)" : ""); kinds[t][k] = (kinds[t][k] ?? 0) + 1; }
console.log("\ncards per unit/kind:"); for (const u of Object.keys(kinds).sort()) console.log(`  ${u}: ${JSON.stringify(kinds[u])}`);
console.log(`\n${cards.length} cards, ${structs.length} structures, ${errors.length} errors`);
for (const e of errors.slice(0, 40)) console.log("  ERROR " + e);
process.exit(errors.length ? 1 : 0);
