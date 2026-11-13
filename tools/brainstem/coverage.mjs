// Brainstem atlas coverage: every brainstem-relevant structure on the official course lists (content/nsci3250/
// structures.json) and the plates that show it. A list group tied to a level must be on that level's plate; the general
// lists (Lab 7 wet specimens and cranial nerves, Lab 2 / 13 / 14 brainstem) need any plate. Exits 1 on a gap.
//   node tools/brainstem/coverage.mjs [--rev <git rev>]   (--rev: the plates as committed at that revision)
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rev = process.argv.includes("--rev") ? process.argv[process.argv.indexOf("--rev") + 1] : null;
const read = (rel) => (rev ? execFileSync("git", ["show", `${rev}:${rel}`], { cwd: root, maxBuffer: 64 << 20 }).toString() : readFileSync(join(root, rel), "utf8"));
const plateFiles = rev
  ? execFileSync("git", ["ls-tree", "--name-only", rev, "src/data/brainstem-plates/"], { cwd: root }).toString().split("\n").filter((f) => f.endsWith(".json"))
  : readdirSync(join(root, "src/data/brainstem-plates")).filter((f) => f.endsWith(".json")).map((f) => `src/data/brainstem-plates/${f}`);

// level -> structure slugs drawn on it (regions and fibre courses)
const plates = {};
for (const f of plateFiles) {
  const p = JSON.parse(read(f));
  plates[p.level] = new Set([...p.regions.map((r) => r.slug), ...p.fibres.map((x) => x.slug)]);
}
const structs = JSON.parse(read("content/nsci3250/structures.json"));

const ANY = Object.keys(plates);
// list group -> the plates that must show its structures (null: any plate)
const GROUPS = {
  "Cervical Spinal Cord": ["cervicomedullary"],
  "Motor Decussation": ["medulla-caudal"],
  "Caudal Medulla – Level of Cuneate & Gracile Tubercles": ["medulla-mid"],
  "Rostral Medulla – Level of Olive": ["medulla-rostral"],
  "Caudal Pons – Level of Facial Colliculus": ["pons-caudal"],
  "Level of Pons (cross-section)": ["pons-mid", "pons-caudal"],
  "Rostral Pons – Level of Trigeminal Nerve": ["pons-mid"],
  "Caudal Midbrain – Level of Inferior Colliculus": ["midbrain-ic"],
  "Level of Inferior Colliculus": ["midbrain-ic"],
  "Rostral Midbrain – Level of Superior Colliculus": ["midbrain-sc"],
  "Level of Superior Colliculus": ["midbrain-sc"],
  "In mid-sagittal / longitudinal section of brainstem": ["midsagittal"],
  "Lab 2|Brainstem": ["midsagittal"],
  "Lab 13|Brainstem Structures": null,
  "Lab 14|Brainstem Structures": null,
  "Lab 7|Cranial nerves I-VIII, IX/X, and XII on a wet specimen": ["external-anterior", "external-posterior", "external-lateral"],
  "Lab 7|Cranial nerves I-XII on an image or schematic": ["external-anterior", "external-posterior", "external-lateral"],
  "Lab 7|ID on Wet Specimens": null,
  "Lab 2|Ventricular System": null,
};
// inside the general lists, only the brainstem's own structures count (the diencephalon and forebrain have their own atlas)
const BRAINSTEM_ONLY = new Set(["Lab 7|ID on Wet Specimens", "Lab 2|Ventricular System", "Lab 7|Cranial nerves I-VIII, IX/X, and XII on a wet specimen", "Lab 7|Cranial nerves I-XII on an image or schematic"]);
const NOT_BRAINSTEM = new Set([
  "third-ventricle", "thalamus", "hypothalamus", "optic-chiasm", "mammillary-bodies", "pituitary-stalk", "anterior-nucleus-of-thalamus",
  "lateral-geniculate-nucleus", "epithalamus", "optic-tract", "optic-nerve", "olfactory-nerve", "lateral-ventricle", "anterior-horn-of-lateral-ventricle",
  "body-of-lateral-ventricle", "inferior-horn-of-lateral-ventricle", "posterior-horn-of-lateral-ventricle", "atrium-of-lateral-ventricle", "septum-pellucidum",
  "foramina-of-monro", "foramen-of-magendie", "foramina-of-luschka", "choroid-plexus", "arachnoid-granulations", "superior-sagittal-sinus",
]);
// on a brainstem list, but no brainstem plate can show them: where they are instead
const EXCEPTIONS = {
  "subthalamic-nucleus": "diencephalic (Lab 14 coronal section #8, above and lateral to the substantia nigra): note + Explore link on the rostral midbrain plate",
};

const keyOf = (l) => (Object.prototype.hasOwnProperty.call(GROUPS, l.group) ? l.group : `${l.lab}|${l.group}`);
const rows = [];
for (const s of structs)
  for (const l of s.lists ?? []) {
    const k = keyOf(l);
    if (!Object.prototype.hasOwnProperty.call(GROUPS, k)) continue;
    if (BRAINSTEM_ONLY.has(k) && NOT_BRAINSTEM.has(s.slug)) continue;
    const want = GROUPS[k] ?? ANY;
    const on = ANY.filter((lv) => plates[lv].has(s.slug));
    const ok = want.some((lv) => plates[lv]?.has(s.slug));
    rows.push({ group: k, slug: s.slug, name: s.name, want, on, ok, exc: !ok ? EXCEPTIONS[s.slug] : undefined });
  }

const seen = new Set();
let gaps = 0, exc = 0;
const byGroup = new Map();
for (const r of rows) (byGroup.get(r.group) ?? byGroup.set(r.group, []).get(r.group)).push(r);
for (const [g, rs] of byGroup) {
  const okN = rs.filter((r) => r.ok).length;
  console.log(`\n${g}  (${okN}/${rs.length}${GROUPS[g] ? ` on ${GROUPS[g].join(" | ")}` : " on any plate"})`);
  for (const r of rs) {
    const mark = r.ok ? "ok " : r.exc ? "EXC" : "GAP";
    if (!r.ok && !r.exc) gaps++;
    if (r.exc && !seen.has(r.slug)) exc++;
    seen.add(r.slug);
    console.log(`  ${mark} ${r.name.padEnd(42)} ${r.on.length ? r.on.join(", ") : "-"}${r.exc ? `  [${r.exc}]` : ""}`);
  }
}
const uniq = new Set(rows.map((r) => r.slug));
const missing = new Set(rows.filter((r) => !r.ok && !r.exc).map((r) => r.slug));
console.log(`\n${uniq.size} brainstem-relevant structures, ${rows.length} list entries, ${Object.keys(plates).length} plates; gaps: ${gaps} entries (${missing.size} structures)${missing.size ? ": " + [...missing].join(", ") : ""}; justified exceptions: ${exc}`);
process.exit(gaps ? 1 : 0);
