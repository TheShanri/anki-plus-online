// Generates content/nsci3250/cards/brainstem-plates.json: one pin card per (level, structure) pair of every plate.
// The card's image is the level's vector plate (plate: { level, region }), the target is the structure's region(s);
// the structure link makes the study engine's first look -> spell -> follow-up fact/function recall all apply.
//   node tools/brainstem/build-plate-cards.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGION = { "midbrain-sc": "midbrain", "midbrain-ic": "midbrain", "pons-rostral": "pons", "pons-mid": "pons", "pons-caudal": "pons", "medulla-rostral": "medulla", "medulla-mid": "medulla", "medulla-caudal": "medulla", cervicomedullary: "medulla" };
const ORDER = Object.keys(REGION);
const structs = new Map(JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8")).map((s) => [s.slug, s]));
const cardsDir = join(root, "content/nsci3250/cards");
const facets = new Map(); // structure slug -> theory facets that exist
for (const f of readdirSync(cardsDir).filter((f) => f.endsWith(".json") && f !== "brainstem-plates.json"))
  for (const c of JSON.parse(readFileSync(join(cardsDir, f), "utf8")))
    if (c.kind === "theory" && c.structure && c.facet && c.status !== "retired") facets.set(c.structure, [...new Set([...(facets.get(c.structure) ?? []), c.facet])]);

const out = [];
let pos = 12000;
for (const level of ORDER) {
  let plate;
  try {
    plate = JSON.parse(readFileSync(join(root, "src/data/brainstem-plates", `${level}.json`), "utf8"));
  } catch {
    continue;
  }
  const slugs = [...new Set(plate.regions.flatMap((r) => r.slugs))];
  for (const slug of slugs) {
    const st = structs.get(slug);
    if (!st) throw new Error(`plate region for unknown structure ${slug}`);
    out.push({
      slug: `bs-plate-${level}-${slug}`,
      kind: "pin",
      topic: "brainstem-overlay",
      structure: slug,
      status: "live",
      position: pos++,
      source: { type: "plate", ref: `brainstem plate ${level}` },
      answer: st.name,
      answer_kind: "structure",
      accept: [...new Set([...(st.synonyms ?? []), ...(st.abbreviations ?? [])])],
      require_side: false,
      plate: { level, region: slug },
      prompt: "Name the highlighted structure.",
      followups: (facets.get(slug) ?? []).map((f) => `${slug}:${f}`),
      followup_cards: [],
      tags: ["bs-plate", `bs-level:${level}`, `bs-region:${REGION[level]}`, "region:brainstem", "plane:horizontal", "unit:u2", "kind:pin"],
    });
  }
}
writeFileSync(join(cardsDir, "brainstem-plates.json"), JSON.stringify(out, null, 1) + "\n");
const per = {};
for (const c of out) per[c.plate.level] = (per[c.plate.level] ?? 0) + 1;
console.log(out.length, "plate cards", JSON.stringify(per));
