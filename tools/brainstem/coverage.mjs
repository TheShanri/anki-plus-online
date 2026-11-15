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

// level -> structure slugs drawn on it (regions and fibre courses); the plates themselves for the per-level detail
const plates = {};
const plateData = {};
for (const f of plateFiles) {
  const p = JSON.parse(read(f));
  plateData[p.level] = p;
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
// per-level detail: what each plate draws beyond the list, how it is drawn (traced / approximate / fine fibre bundle)
const LEVEL_GROUPS = {};
// only the lists tied to this one plate (a list shared by several plates is checked above, on any of them)
for (const [g, lv] of Object.entries(GROUPS)) if (lv?.length === 1) (LEVEL_GROUPS[lv[0]] ??= []).push(g);
const listed = (lv) => new Set(rows.filter((r) => (LEVEL_GROUPS[lv] ?? []).includes(r.group)).map((r) => r.slug));
console.log("\nPer level (listed = on a course list tied to this plate alone's course list; + = drawn beyond it; * = approximate; ~ = fine fibre bundle)");
for (const [lv, p] of Object.entries(plateData)) {
  const L = listed(lv);
  const slugs = [...plates[lv]];
  const approx = new Set(p.regions.filter((r) => r.approx).map((r) => r.slug));
  for (const f of p.fibres) if (f.approx) approx.add(f.slug);
  const fine = new Set(p.fibres.filter((f) => f.fine).map((f) => f.slug));
  const missing = [...L].filter((x) => !plates[lv].has(x) && !EXCEPTIONS[x]);
  const mark = (x) => `${x}${approx.has(x) ? "*" : ""}${fine.has(x) ? "~" : ""}`;
  const on = slugs.filter((x) => L.has(x)).map(mark), extra = slugs.filter((x) => !L.has(x)).map(mark);
  console.log(`  ${lv.padEnd(20)} ${slugs.length} structures (${on.length}/${L.size} listed${missing.length ? `, MISSING ${missing.join(", ")}` : ""}), ${p.regions.length} regions, ${p.fibres.filter((f) => f.fine).length} fine fibres`);
  if (extra.length) console.log(`  ${"".padEnd(20)} + ${extra.join(", ")}`);
}
const uniq = new Set(rows.map((r) => r.slug));
const missing = new Set(rows.filter((r) => !r.ok && !r.exc).map((r) => r.slug));
console.log(`\n${uniq.size} brainstem-relevant structures, ${rows.length} list entries, ${Object.keys(plates).length} plates; gaps: ${gaps} entries (${missing.size} structures)${missing.size ? ": " + [...missing].join(", ") : ""}; justified exceptions: ${exc}`);
// ---- 3D brainstem (src/data/brainstem-3d.json): which external landmarks and nerves on the lists can be picked in 3D.
// The alias and division tables mirror src/components/atlas/brainstem/three/model.ts (keep them in step).
const bs3d = JSON.parse(read("src/data/brainstem-3d.json"));
const ALIAS3D = {
  "interpeduncular-cistern": ["interpeduncular-fossa"],
  "cerebellar-peduncles": ["superior-cerebellar-peduncle", "middle-cerebellar-peduncle", "inferior-cerebellar-peduncle"],
  "pontine-protuberance": ["transverse-fibers-of-the-pons"],
  "inferior-olivary-nucleus": ["olives"],
  brainstem: ["midbrain", "pons", "medulla"],
};
const parts3d = new Set(bs3d.parts.map((p) => p.slug));
const pick3d = (slug) => parts3d.has(slug) || (ALIAS3D[slug] ?? []).some((s) => parts3d.has(s));
// external landmarks and nerves: the Lab 7 wet-specimen and cranial nerve lists, Lab 2 divisions, the surface plates' structures
const EXT_GROUPS = ["Lab 7|ID on Wet Specimens", "Lab 7|Cranial nerves I-VIII, IX/X, and XII on a wet specimen", "Lab 7|Cranial nerves I-XII on an image or schematic", "Lab 2|Brainstem"];
// internal (not on the surface): the 3D model does not draw them; they are on the plates
const INTERNAL = new Set(["third-ventricle", "cerebral-aqueduct", "anterior-nucleus-of-thalamus", "epithalamus", "pituitary-stalk", "mesencephalic-flexure", "hypothalamus"]);
const ext = new Map();
for (const s of structs) for (const l of s.lists ?? []) {
  const k = `${l.lab}|${l.group}`;
  if (EXT_GROUPS.includes(k)) (ext.get(s.slug) ?? ext.set(s.slug, { name: s.name, groups: [] }).get(s.slug)).groups.push(k);
}
for (const lv of ["external-anterior", "external-posterior", "external-lateral"]) for (const sl of plates[lv] ?? []) if (!ext.has(sl)) ext.set(sl, { name: sl, groups: [`plate ${lv}`] });
let ok3 = 0, gap3 = [], skip3 = [];
console.log("\n3D brainstem: external landmarks and nerves pickable in public/atlas/brainstem3d.glb");
for (const [slug, e] of [...ext].sort((a, b) => a[0].localeCompare(b[0]))) {
  const on = pick3d(slug);
  const internal = INTERNAL.has(slug);
  if (on) ok3++;
  else if (internal) skip3.push(slug);
  else gap3.push(slug);
  console.log(`  ${on ? "ok " : internal ? "int" : "GAP"} ${e.name.padEnd(42)} ${e.groups.join("; ")}`);
}
const planes = Object.keys(bs3d.levels);
console.log(`3D: ${ok3} pickable, ${gap3.length} gaps${gap3.length ? ": " + gap3.join(", ") : ""}; not on the surface (plates only): ${skip3.join(", ") || "-"}; section planes: ${planes.length} (${planes.join(", ")}); every plate level has a plane: ${Object.keys(plates).filter((l) => !l.startsWith("external-")).every((l) => planes.includes(l)) ? "yes" : "no"}`);
process.exit(gaps ? 1 : 0);
