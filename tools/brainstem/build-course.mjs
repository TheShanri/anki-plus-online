// Builds src/data/brainstem-course.json from the pin cards: groups cards by image, takes the occlusion
// boxes (card targets) as label boxes. Level/style per image comes from course-assign.json (keys = index in
// the candidate list below, i.e. media keys listed in course-images.json).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const here = dirname(fileURLToPath(import.meta.url));
const assign = JSON.parse(readFileSync(join(here, "course-assign.json"), "utf8"));
const keys = JSON.parse(readFileSync(join(here, "course-images.json"), "utf8"));
const structs = new Map(JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8")).map((s) => [s.slug, s]));
const cardsDir = join(root, "content/nsci3250/cards");
const byImage = new Map();
for (const f of readdirSync(cardsDir).filter((f) => f.endsWith(".json")))
  for (const c of JSON.parse(readFileSync(join(cardsDir, f), "utf8")))
    if (c.kind === "pin" && c.image && c.status === "live") (byImage.get(c.image) ?? byImage.set(c.image, []).get(c.image)).push(c);
const out = [];
for (const [i, [level, style, title]] of Object.entries(assign)) {
  const key = keys[+i];
  const cards = byImage.get(key) ?? [];
  const labels = [];
  const seen = new Set();
  for (const c of cards) {
    if (!c.target || !c.structure || !structs.has(c.structure) || !["structure", "space", "region"].includes(c.answer_kind)) continue;
    const sig = c.structure + JSON.stringify(c.target);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const st = structs.get(c.structure);
    labels.push({ slug: c.structure, name: st.name, accept: [...new Set([...(st.synonyms ?? []), ...(st.abbreviations ?? []), ...(c.accept ?? [])])].slice(0, 8), kind: c.answer_kind, shape: c.target });
  }
  out.push({ id: `course-${i}`, source: "course", key, w: cards[0]?.w ?? 0, h: cards[0]?.h ?? 0, level, style, title, labels });
}
writeFileSync(join(root, "src/data/brainstem-course.json"), JSON.stringify(out));
const perLevel = {};
for (const im of out) for (const l of im.labels) (perLevel[im.level] ??= new Set()).add(l.slug);
for (const [k, v] of Object.entries(perLevel)) console.log(k, [...v].join(", "));
console.log(out.length, "images", out.reduce((a, b) => a + b.labels.length, 0), "labels");
