// Builds src/data/brainstem-levels.json: level metadata, the structures at each level (from what the course images
// label, then standard neuroanatomy for gaps), consistent colours, and each section's MNI z derived from atlas2 centroids.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const course = [...JSON.parse(readFileSync(join(root, "src/data/brainstem-course.json"), "utf8")), ...JSON.parse(readFileSync(join(root, "src/data/brainstem-decks.json"), "utf8"))];
const structs = new Map(JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8")).map((s) => [s.slug, s]));
const atlas = JSON.parse(readFileSync(join(root, "public/atlas2/atlas2.json"), "utf8")).structures;

const LEVELS = [
  { slug: "midbrain-sc", name: "Rostral midbrain", hallmark: "Level of the superior colliculus: red nucleus, oculomotor nucleus and nerve", kind: "section", y: 0.115 },
  { slug: "midbrain-ic", name: "Caudal midbrain", hallmark: "Level of the inferior colliculus: decussation of the superior cerebellar peduncles, trochlear nucleus", kind: "section", y: 0.19 },
  { slug: "pons-rostral", name: "Isthmus (upper pons)", aka: "Not one of the course's seven levels; one Lab 8 histology card calls it rostral pons", hallmark: "Locus coeruleus, superior cerebellar peduncle, lateral lemniscus", kind: "section", y: 0.265 },
  { slug: "pons-mid", name: "Rostral pons", aka: "Also called the mid pons", hallmark: "Level of the trigeminal nerve: motor and principal sensory trigeminal nuclei, middle cerebellar peduncle", kind: "section", y: 0.35 },
  { slug: "pons-caudal", name: "Caudal pons", hallmark: "Level of the facial colliculus: abducens and facial nuclei", kind: "section", y: 0.43 },
  { slug: "medulla-rostral", name: "Rostral medulla", hallmark: "Level of the olive: inferior olive, hypoglossal and vestibular nuclei (open medulla)", kind: "section", y: 0.51 },
  { slug: "medulla-mid", name: "Caudal medulla", aka: "Also called the mid medulla", hallmark: "Level of the cuneate and gracile tubercles: sensory decussation (internal arcuate fibers); closed medulla, no 4th ventricle", kind: "section", y: 0.61 },
  { slug: "medulla-caudal", name: "Brainstem/spinal cord transition", aka: "Also called the very caudal medulla or the cervicomedullary junction", hallmark: "Level of the motor (pyramidal) decussation", kind: "section", y: 0.7 },
  { slug: "cervicomedullary", name: "Spinal cord: cervical level", hallmark: "Upper cervical cord: dorsal columns, dorsal spinocerebellar and anterolateral tracts", kind: "section", y: 0.8 },
  { slug: "external-anterior", name: "Anterior surface", hallmark: "Ventral view: cranial nerve exits, pyramids, olives", kind: "gross" },
  { slug: "external-posterior", name: "Posterior surface", hallmark: "Dorsal view: colliculi, fourth-ventricle floor, tubercles", kind: "gross" },
  { slug: "external-lateral", name: "Lateral surface", hallmark: "Lateral view: peduncles, nerve roots", kind: "gross" },
  { slug: "midsagittal", name: "Midsagittal", hallmark: "Midbrain, pons and medulla in the midline", kind: "gross" },
];

// group per slug; anything not listed: *-nerve -> nerves, otherwise landmarks
const G = {
  "cn-nuclei": "accessory-nucleus spinal-trigeminal-tract oculomotor-nucleus edinger-westphal-nucleus trochlear-nucleus motor-trigeminal-nucleus principal-sensory-nucleus-of-trigeminal spinal-trigeminal-nucleus abducens-nucleus facial-nucleus vestibulocochlear-complex hypoglossal-nucleus dorsal-motor-nucleus-of-the-vagus solitary-nucleus nucleus-ambiguus",
  ascending: "medial-lemniscus anterolateral-spinothalamic-tract dorsal-spinocerebellar-tract fasciculus-gracilis fasciculus-cuneatus internal-arcuate-fibers lateral-lemniscus",
  descending: "anterior-corticospinal-tract lateral-corticospinal-tract motor-decussation longitudinal-fibers-of-the-pons pyramids cerebral-peduncles",
  nuclei: "substantia-nigra-pars-compacta substantia-nigra-pars-reticulata central-gray reticular-formation paramedian-pontine-reticular-formation intermediate-zone substantia-gelatinosa location-of-limb-lower-motor-neurons location-of-trunk-lower-motor-neurons dorsal-horn ventral-horn olives cuneate-tubercle gracile-tubercle red-nucleus substantia-nigra periaqueductal-gray pontine-nuclei inferior-olivary-nucleus gracile-nucleus cuneate-nucleus superior-colliculus inferior-colliculus locus-coeruleus medial-geniculate-nucleus lateral-geniculate-nucleus pulvinar thalamus hypothalamus cerebellum pineal-gland",
  bundles: "dorsal-columns ventral-commissure-of-spinal-cord lateral-funiculus anterior-funiculus medial-longitudinal-fasciculus superior-cerebellar-peduncle middle-cerebellar-peduncle inferior-cerebellar-peduncle cerebellar-peduncles decussation-of-the-superior-cerebellar-peduncle transverse-fibers-of-the-pons brachium-of-the-inferior-colliculus",
};
const groupOf = (slug) => {
  for (const [g, s] of Object.entries(G)) if (s.split(" ").includes(slug)) return g;
  return slug.endsWith("-nerve") ? "nerves" : "landmarks";
};
// standard-anatomy gaps (kept small and textbook-certain); name-only entries are not on the course lists
const EXTRA = {
  "midbrain-ic": ["medial-lemniscus", "lateral-lemniscus"],
  "pons-rostral": ["fourth-ventricle", "locus-coeruleus", "lateral-lemniscus", "pontine-nuclei", "longitudinal-fibers-of-the-pons", "transverse-fibers-of-the-pons"],
  "medulla-rostral": ["spinal-trigeminal-nucleus"],
  "medulla-caudal": ["motor-decussation", "lateral-corticospinal-tract", "pyramids"],
  cervicomedullary: ["lateral-corticospinal-tract", "spinal-trigeminal-nucleus", "anterolateral-spinothalamic-tract", "dorsal-spinocerebellar-tract"],
};
const EXTRA_NAMES = {
  "lateral-lemniscus": "Lateral lemniscus",
  "locus-coeruleus": "Locus coeruleus",
  // plate structures that are not separate entries on the course lists (named in the course slides, or sub-parts)
  "substantia-nigra-pars-compacta": "Substantia nigra, pars compacta",
  "substantia-nigra-pars-reticulata": "Substantia nigra, pars reticulata",
  "central-canal": "Central canal",
  "central-gray": "Central gray",
  "reticular-formation": "Reticular formation",
  "spinal-trigeminal-tract": "Spinal trigeminal tract",
  "accessory-nucleus": "Accessory nucleus",
};
// cranial nerves always carry their Roman numeral; the nuclei name the nerve they serve (course style: "CN XII")
const CN = {
  "olfactory-nerve": "I", "optic-nerve": "II", "oculomotor-nerve": "III", "trochlear-nerve": "IV", "trigeminal-nerve": "V", "abducens-nerve": "VI",
  "facial-nerve": "VII", "vestibulocochlear-nerve": "VIII", "glossopharyngeal-nerve": "IX", "vagus-nerve": "X", "accessory-nerve": "XI", "hypoglossal-nerve": "XII",
  "oculomotor-nucleus": "CN III", "edinger-westphal-nucleus": "CN III", "trochlear-nucleus": "CN IV", "motor-trigeminal-nucleus": "CN V",
  "principal-sensory-nucleus-of-trigeminal": "CN V", "spinal-trigeminal-nucleus": "CN V", "spinal-trigeminal-tract": "CN V", "mesencephalic-trigeminal-nucleus": "CN V",
  "abducens-nucleus": "CN VI", "facial-nucleus": "CN VII", "vestibulocochlear-complex": "CN VIII", "vestibular-nuclei": "CN VIII",
  "solitary-nucleus": "CN VII, IX, X", "nucleus-ambiguus": "CN IX, X", "dorsal-motor-nucleus-of-the-vagus": "CN X", "hypoglossal-nucleus": "CN XII", "accessory-nucleus": "CN XI",
};
const withCN = (slug, name) => (CN[slug] && !name.includes("(") ? `${name} (${CN[slug]})` : name);

const byLevel = Object.fromEntries(LEVELS.map((l) => [l.slug, new Map()]));
for (const im of course) for (const lb of im.labels) if (byLevel[im.level] && !byLevel[im.level].has(lb.slug)) byLevel[im.level].set(lb.slug, { slug: lb.slug, source: "course" });
for (const [lv, list] of Object.entries(EXTRA)) for (const s of list) if (!byLevel[lv].has(s)) byLevel[lv].set(s, { slug: s, source: "standard" });

// the official list groups for each plate (structures.json lists), and every structure drawn on a plate: course
const LISTS = {
  "midbrain-sc": ["Rostral Midbrain – Level of Superior Colliculus", "Level of Superior Colliculus"],
  "midbrain-ic": ["Caudal Midbrain – Level of Inferior Colliculus", "Level of Inferior Colliculus"],
  "pons-mid": ["Rostral Pons – Level of Trigeminal Nerve", "Level of Pons (cross-section)"],
  "pons-caudal": ["Caudal Pons – Level of Facial Colliculus", "Level of Pons (cross-section)"],
  "medulla-rostral": ["Rostral Medulla – Level of Olive"],
  "medulla-mid": ["Caudal Medulla – Level of Cuneate & Gracile Tubercles"],
  "medulla-caudal": ["Motor Decussation"],
  cervicomedullary: ["Cervical Spinal Cord"],
  midsagittal: ["In mid-sagittal / longitudinal section of brainstem"],
};
for (const [lv, groups] of Object.entries(LISTS))
  for (const s of structs.values()) if ((s.lists ?? []).some((l) => groups.includes(l.group)) && !byLevel[lv].has(s.slug)) byLevel[lv].set(s.slug, { slug: s.slug, source: "course" });
const plateDir = join(root, "src/data/brainstem-plates");
for (const f of readdirSync(plateDir).filter((f) => f.endsWith(".json"))) {
  const p = JSON.parse(readFileSync(join(plateDir, f), "utf8"));
  if (!byLevel[p.level]) continue;
  for (const slug of new Set([...p.regions.map((r) => r.slug), ...p.fibres.map((x) => x.slug)])) if (!byLevel[p.level].has(slug)) byLevel[p.level].set(slug, { slug, source: structs.has(slug) ? "course" : "standard" });
}

const all = new Set();
for (const m of Object.values(byLevel)) for (const k of m.keys()) all.add(k);
const keys = [...all].sort();
const hex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
// colours stay as they were; structures new to the table continue the golden-angle sequence after the old ones
const outPath = join(root, "src/data/brainstem-levels.json");
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).structures : {};
const prevKeys = Object.keys(prev).sort();
let nextIdx = prevKeys.length;
const structures = {};
keys.forEach((k) => {
  const i = prev[k] ? prevKeys.indexOf(k) : nextIdx++;
  const s = structs.get(k);
  structures[k] = {
    name: withCN(k, s?.name ?? EXTRA_NAMES[k] ?? k),
    slug: s ? k : null,
    onList: !!s,
    group: groupOf(k),
    color: prev[k]?.color ?? hex((i * 137.508) % 360, 72, 56),
    inAtlas: !!atlas[k],
  };
});

// MNI z (mm) of each section level, from atlas2 centroids / boxes
const c = (s) => atlas[s].centroid[2];
const bmin = (s) => atlas[s].bbox[0][2];
const mni = {
  "midbrain-sc": [(c("red-nucleus") + c("superior-colliculus")) / 2, "mean z of red nucleus and superior colliculus centroids"],
  "midbrain-ic": [c("inferior-colliculus"), "inferior colliculus centroid"],
  "pons-rostral": [c("locus-coeruleus"), "locus coeruleus centroid"],
  "pons-mid": [c("pons"), "pons centroid"],
  "pons-caudal": [(bmin("pons") + c("pons")) / 2, "midway between the pons centroid and its lower edge"],
  "medulla-rostral": [c("olives") + 3, "upper olive (olive centroid + 3 mm)"],
  "medulla-mid": [(c("olives") + bmin("olives")) / 2, "lower olive (closed medulla)"],
  "medulla-caudal": [bmin("pyramids") + 4, "lower pyramids (decussation zone)"],
  cervicomedullary: [bmin("pyramids"), "lower edge of the pyramids"],
};
const levels = LEVELS.map((l) => ({
  ...l,
  mniZ: mni[l.slug] ? Math.round(mni[l.slug][0] * 10) / 10 : null,
  mniNote: mni[l.slug]?.[1] ?? null,
  structures: [...byLevel[l.slug].values()],
}));
writeFileSync(join(root, "src/data/brainstem-levels.json"), JSON.stringify({ levels, structures }, null, 1));
console.log(levels.map((l) => `${l.slug} z=${l.mniZ} n=${l.structures.length}`).join("\n"));
