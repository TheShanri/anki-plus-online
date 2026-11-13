// Adds DRAFT plate cards (content/nsci3250/cards/brainstem-plates-draft.json) for every (plate, structure) pair that
// has no plate card yet, so each structure on the plates can join the mastery path once the owner reviews and promotes
// it (status "draft" -> "live"; promoted cards can move into brainstem-plates.json). Never touches existing cards:
// slugs already used by any card file are skipped, and the draft file keeps the cards it already has.
//   node tools/brainstem/build-plate-cards-draft.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGION = {
  "midbrain-sc": "midbrain", "midbrain-ic": "midbrain", "pons-mid": "pons", "pons-caudal": "pons", "medulla-rostral": "medulla",
  "medulla-mid": "medulla", "medulla-caudal": "medulla", cervicomedullary: "medulla",
  "external-anterior": "surface", "external-posterior": "surface", "external-lateral": "surface", midsagittal: "surface",
};
const PLANE = { "external-anterior": "surface", "external-posterior": "surface", "external-lateral": "surface", midsagittal: "sagittal" };
const cardsDir = join(root, "content/nsci3250/cards");
const OUT = join(cardsDir, "brainstem-plates-draft.json");
const structs = new Map(JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8")).map((s) => [s.slug, s]));
const used = new Set();
const facets = new Map();
for (const f of readdirSync(cardsDir).filter((f) => f.endsWith(".json") && f !== "brainstem-plates-draft.json"))
  for (const c of JSON.parse(readFileSync(join(cardsDir, f), "utf8"))) {
    used.add(c.slug);
    if (c.kind === "theory" && c.structure && c.facet && c.status !== "retired") facets.set(c.structure, [...new Set([...(facets.get(c.structure) ?? []), c.facet])]);
  }
const kept = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).filter((c) => !used.has(c.slug)) : [];
const have = new Set(kept.map((c) => c.slug));
let pos = Math.max(13000, ...kept.map((c) => c.position + 1));
const out = [...kept];
for (const level of Object.keys(REGION)) {
  const f = join(root, "src/data/brainstem-plates", `${level}.json`);
  if (!existsSync(f)) continue;
  const plate = JSON.parse(readFileSync(f, "utf8"));
  // a plate card lights a region; structures drawn only as fibre courses (nerve rootlets) stay hover-only
  const slugs = [...new Set(plate.regions.map((r) => r.slug))];
  for (const slug of slugs) {
    const card = `bs-plate-${level}-${slug}`;
    if (used.has(card) || have.has(card)) continue;
    const st = structs.get(slug);
    if (!st) throw new Error(`plate structure ${slug} is not in structures.json`);
    out.push({
      slug: card,
      kind: "pin",
      topic: "brainstem-overlay",
      structure: slug,
      status: "draft",
      position: pos++,
      source: { type: "plate", ref: `brainstem plate ${level}` },
      answer: st.name,
      answer_kind: "structure",
      accept: [...new Set([...(st.synonyms ?? []), ...(st.abbreviations ?? [])])],
      require_side: false,
      plate: { level, region: slug },
      prompt: "Name the highlighted structure.",
      followups: (facets.get(slug) ?? []).map((x) => `${slug}:${x}`),
      followup_cards: [],
      review_note: "Draft from the brainstem atlas coverage pass (2026-11-12): check the plate region, then set status live.",
      tags: ["bs-plate", `bs-level:${level}`, `bs-region:${REGION[level]}`, "region:brainstem", `plane:${PLANE[level] ?? "horizontal"}`, "unit:u2", "kind:pin"],
    });
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const per = {};
for (const c of out) per[c.plate.level] = (per[c.plate.level] ?? 0) + 1;
console.log(out.length, "draft plate cards", JSON.stringify(per));
