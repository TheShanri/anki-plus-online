// Builds src/data/brainstem-levels.json: level metadata, the structures at each level (from what the course images
// label, then standard neuroanatomy for gaps), consistent colours, and each section's MNI z derived from atlas2 centroids.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const course = JSON.parse(readFileSync(join(root, "src/data/brainstem-course.json"), "utf8"));
const structs = new Map(JSON.parse(readFileSync(join(root, "content/nsci3250/structures.json"), "utf8")).map((s) => [s.slug, s]));
const atlas = JSON.parse(readFileSync(join(root, "public/atlas2/atlas2.json"), "utf8")).structures;

const LEVELS = [
  { slug: "midbrain-sc", name: "Rostral midbrain", hallmark: "Superior colliculus, red nucleus, oculomotor nucleus and nerve", kind: "section", y: 0.115 },
  { slug: "midbrain-ic", name: "Caudal midbrain", hallmark: "Inferior colliculus, decussation of the superior cerebellar peduncles, trochlear nucleus", kind: "section", y: 0.19 },
  { slug: "pons-rostral", name: "Rostral pons (isthmus)", hallmark: "Locus coeruleus, superior cerebellar peduncle, lateral lemniscus", kind: "section", y: 0.265 },
  { slug: "pons-mid", name: "Mid pons", hallmark: "Motor and principal sensory trigeminal nuclei, middle cerebellar peduncle", kind: "section", y: 0.35 },
  { slug: "pons-caudal", name: "Caudal pons", hallmark: "Facial colliculus, abducens and facial nuclei", kind: "section", y: 0.43 },
  { slug: "medulla-rostral", name: "Rostral medulla", hallmark: "Open medulla: inferior olive, hypoglossal and vestibular nuclei", kind: "section", y: 0.51 },
  { slug: "medulla-mid", name: "Mid medulla (obex)", hallmark: "Obex, sensory decussation (internal arcuate fibers)", kind: "section", y: 0.61 },
  { slug: "medulla-caudal", name: "Caudal medulla", hallmark: "Closed medulla: pyramidal (motor) decussation", kind: "section", y: 0.7 },
  { slug: "cervicomedullary", name: "Cervicomedullary junction", hallmark: "Transition to the cervical spinal cord", kind: "section", y: 0.8 },
  { slug: "external-anterior", name: "Anterior surface", hallmark: "Ventral view: cranial nerve exits, pyramids, olives", kind: "gross" },
  { slug: "external-posterior", name: "Posterior surface", hallmark: "Dorsal view: colliculi, fourth-ventricle floor, tubercles", kind: "gross" },
  { slug: "external-lateral", name: "Lateral surface", hallmark: "Lateral view: peduncles, nerve roots", kind: "gross" },
  { slug: "midsagittal", name: "Midsagittal", hallmark: "Midbrain, pons and medulla in the midline", kind: "gross" },
];

// group per slug; anything not listed: *-nerve -> nerves, otherwise landmarks
const G = {
  "cn-nuclei": "oculomotor-nucleus edinger-westphal-nucleus trochlear-nucleus motor-trigeminal-nucleus principal-sensory-nucleus-of-trigeminal spinal-trigeminal-nucleus abducens-nucleus facial-nucleus vestibulocochlear-complex hypoglossal-nucleus dorsal-motor-nucleus-of-the-vagus solitary-nucleus nucleus-ambiguus",
  ascending: "medial-lemniscus anterolateral-spinothalamic-tract dorsal-spinocerebellar-tract fasciculus-gracilis fasciculus-cuneatus internal-arcuate-fibers lateral-lemniscus",
  descending: "lateral-corticospinal-tract motor-decussation longitudinal-fibers-of-the-pons pyramids cerebral-peduncles",
  nuclei: "red-nucleus substantia-nigra periaqueductal-gray pontine-nuclei inferior-olivary-nucleus gracile-nucleus cuneate-nucleus superior-colliculus inferior-colliculus locus-coeruleus medial-geniculate-nucleus lateral-geniculate-nucleus pulvinar thalamus hypothalamus cerebellum pineal-gland",
  bundles: "medial-longitudinal-fasciculus superior-cerebellar-peduncle middle-cerebellar-peduncle inferior-cerebellar-peduncle cerebellar-peduncles decussation-of-the-superior-cerebellar-peduncle transverse-fibers-of-the-pons brachium-of-the-inferior-colliculus",
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
const EXTRA_NAMES = { "lateral-lemniscus": "Lateral lemniscus", "locus-coeruleus": "Locus coeruleus" };

const byLevel = Object.fromEntries(LEVELS.map((l) => [l.slug, new Map()]));
for (const im of course) for (const lb of im.labels) if (byLevel[im.level] && !byLevel[im.level].has(lb.slug)) byLevel[im.level].set(lb.slug, { slug: lb.slug, source: "course" });
for (const [lv, list] of Object.entries(EXTRA)) for (const s of list) if (!byLevel[lv].has(s)) byLevel[lv].set(s, { slug: s, source: "standard" });

const all = new Set();
for (const m of Object.values(byLevel)) for (const k of m.keys()) all.add(k);
const keys = [...all].sort();
const hex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const structures = {};
keys.forEach((k, i) => {
  const s = structs.get(k);
  structures[k] = {
    name: s?.name ?? EXTRA_NAMES[k] ?? k,
    slug: s ? k : null,
    onList: !!s,
    group: groupOf(k),
    color: hex((i * 137.508) % 360, 72, 56),
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
  "medulla-mid": [(c("olives") + bmin("olives")) / 2, "lower olive, near the obex"],
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
