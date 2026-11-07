#!/usr/bin/env node
// Deterministic faceted tagging of content/<course>/cards/*.json. Existing free-form tags are kept; generated
// tags are "facet:value" and are recomputed on every run (idempotent). Then:
//   node scripts/validate-content.mjs && node scripts/seed.mjs
//   node scripts/tag-cards.mjs [course-slug] [--dry]
// Facets: unit, kind, source, region, plane, modality, theory.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "nsci3250";
const dry = process.argv.includes("--dry");
const dir = join(root, "content", slug);
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const course = J(join(dir, "course.json"));
const structures = new Map(J(join(dir, "structures.json")).map((s) => [s.slug, s]));
const topics = new Map(course.topics.map((t) => [t.slug, t]));

const REGION = {
  skull: "skull", meninges: "meninges", cerebellum: "cerebellum", "ventricular system": "ventricles", telencephalon: "cerebrum", cerebrum: "cerebrum",
  diencephalon: "diencephalon", "visual system": "visual", brainstem: "brainstem", "cerebral cortex": "cortex", "cerebral white matter": "white-matter",
  "vertebral column": "vertebral-column", "spinal cord": "spinal-cord", "cranial nerves": "cranial-nerves", "basal ganglia": "basal-ganglia",
  "limbic system": "limbic", "blood supply": "vessels",
};
const LEGACY_REGION = { cn: "cranial-nerves", cord: "spinal-cord", brainstem: "brainstem", "basal-ganglia": "basal-ganglia", bg: "basal-ganglia", cortex: "cortex", ventricles: "ventricles", cerebellar: "cerebellum", visual: "visual" };
const TOPIC_REGION = {
  "lab-4": "spinal-cord", "lecture-4": "spinal-cord", "lab-5": "spinal-cord", "lecture-5": "spinal-cord", "lecture-6": "spinal-cord", "sections-u1": "spinal-cord",
  "lecture-7": "brainstem", "lab-7": "brainstem", "lecture-8": "brainstem", "lab-8": "brainstem", "lecture-9": "brainstem", "lab-9": "brainstem",
  "lecture-10": "brainstem", "lab-10": "brainstem", "lecture-12": "brainstem", "sections-u2": "brainstem", "brainstem-overlay": "brainstem",
  "lecture-11": "visual", "lab-11": "visual", "lecture-14": "basal-ganglia", "lecture-15": "limbic", "lecture-16": "vessels", "lab-16": "vessels",
  "lecture-18": "vessels", "lecture-13": "cortex", "lecture-3": "cortex", "lab-3": "cortex",
};
// pathway slug -> [region, ...modalities]
const PATHWAY = {
  dcml: ["spinal-cord", "sensory"], alst: ["spinal-cord", "sensory"], dsct: ["spinal-cord", "sensory"], sympathetic: ["spinal-cord", "autonomic"], parasympathetic: ["brainstem", "autonomic"],
  "umn-lmn": ["spinal-cord", "motor"], lcst: ["spinal-cord", "motor"], acst: ["spinal-cord", "motor"], "trigeminal-discriminative": ["brainstem", "sensory"], "trigeminal-pain": ["brainstem", "sensory"],
  "jaw-jerk": ["brainstem", "sensory", "motor"], corticobulbar: ["brainstem", "motor"], corticopontocerebellar: ["cerebellum", "motor"], rubrospinal: ["brainstem", "motor"], tectospinal: ["brainstem", "motor", "visual"],
  reticulospinal: ["brainstem", "motor"], vestibulospinal: ["brainstem", "motor", "vestibular"], visual: ["visual", "visual"], pupillary: ["brainstem", "visual", "autonomic"], corneal: ["brainstem", "sensory"],
  gaze: ["brainstem", "motor", "visual"], cerebellar: ["cerebellum", "motor"], "basal-ganglia": ["basal-ganglia", "motor"], olfactory: ["limbic", "olfactory"], "limbic-fornix": ["limbic", "limbic"],
  "limbic-amygdala": ["limbic", "limbic"], "limbic-septal": ["limbic", "limbic"], reward: ["limbic", "limbic"],
};
const MODALITY = [
  ["auditory", /\b(cochlea\w*|auditory|hearing|inferior colliculus|medial geniculate|brachium of the inferior|lateral lemniscus|superior olive|trapezoid)\b/i],
  ["vestibular", /\b(vestibul\w*|semicircular|utricle|saccule|flocculonodular)\b/i],
  ["visual", /\b(optic|retina\w*|lateral geniculate|visual|superior colliculus|calcarine|pupil\w*|lens|ciliary|oculomotor|trochlear|abducens|edinger)\b/i],
  ["olfactory", /\b(olfact\w*|piriform|uncus)\b/i],
  ["limbic", /\b(limbic|hippocamp\w*|amygdala|fornix|cingulate|mammillary|septal|papez|parahippocampal|dentate gyrus|entorhinal)\b/i],
  ["autonomic", /\b(sympathetic|parasympathetic|autonomic|salivatory|intermediolateral|enteric|vagus)\b/i],
  ["motor", /\b(motor|corticospinal|pyramid\w*|umn|lmn|extrapyramidal|rubro\w*|tectospinal|reticulospinal|ventral horn|anterior horn|basal ganglia|putamen|globus pallidus|substantia nigra|subthalamic|precentral|premotor|cerebell\w*|red nucleus|corticobulbar)\b/i],
  ["sensory", /\b(sensory|somatosensory|dorsal column|gracile|cuneate|fasciculus (gracilis|cuneatus)|spinothalamic|lemniscus|dorsal horn|posterior horn|ventral posterior|vpl|vpm|postcentral|trigeminal|proprioce\w*|dorsal root|spinocerebellar)\b/i],
];
const LEGACY_MODALITY = { motor: "motor", visual: "visual", olfactory: "olfactory", limbic: "limbic", sympathetic: "autonomic", parasympathetic: "autonomic", pupillary: "visual", cochlear: "auditory" };
const SOURCE_BY_TYPE = { apkg: "anki-deck", exam: "practice-exam", "pdf-labels": "lab" };
const TOPIC_PLANE = { "lab-13": ["horizontal"], "lab-14": ["coronal"], "lab-15": ["horizontal", "coronal"], "brainstem-overlay": ["horizontal"], "lab-8": ["horizontal"] };
const GEN = /^(unit|kind|source|region|plane|modality|theory):/;

function sourceOf(c) {
  const t = topics.get(c.topic);
  const st = c.source?.type;
  if (t?.slug.endsWith("-practice")) return "practice-practical";
  if (st === "practical") return "practical";
  if (SOURCE_BY_TYPE[st]) return SOURCE_BY_TYPE[st];
  if (st === "theory") return "supplementary";
  if (st === "pathways" || st === "clinical") return "lecture";
  return t?.kind === "lecture" ? "lecture" : "lab"; // slides and anything else: by the topic it belongs to
}
const struct = (c) => (c.structure ? structures.get(c.structure) : null);
const textOf = (c) => [struct(c)?.name, c.answer, c.prompt, c.caption, c.vignette, c.explain].filter((x) => typeof x === "string").join(" | ");
function uniq(a) { return [...new Set(a.filter(Boolean))]; }

function regionsOf(c) {
  const out = [REGION[struct(c)?.region]];
  for (const s of c.structures ?? []) out.push(REGION[structures.get(s)?.region]);
  if (c.kind === "pathway" && PATHWAY[c.pathway]) out.push(PATHWAY[c.pathway][0]);
  for (const t of c.tags ?? []) out.push(LEGACY_REGION[t]);
  const r = uniq(out);
  return r.length ? r : uniq([TOPIC_REGION[c.topic]]);
}
function planesOf(c) {
  const out = [];
  if (c.kind === "pin" || c.kind === "section") {
    if (c.topic === "sections-u3") out.push(/lab-14/.test(c.source?.ref ?? "") ? "coronal" : /lab-13/.test(c.source?.ref ?? "") ? "horizontal" : null);
    else if (c.topic === "sections-u1" || c.topic === "sections-u2") {
      // brainstem and spinal levels are drawn as horizontal (transverse) sections
      if ((c.tags ?? []).includes("level") || /level|section/i.test(c.prompt ?? "")) out.push("horizontal");
    } else out.push(...(TOPIC_PLANE[c.topic] ?? []));
  }
  const txt = [c.prompt, c.answer, c.caption, c.explain].filter((x) => typeof x === "string").join(" | ");
  if (/\bmid-?sagittal\b|\bmedian (section|plane)\b/i.test(txt)) out.push("midsagittal");
  else if (/\bsagittal\b/i.test(txt)) out.push("sagittal");
  if (/\bcoronal\b|\bfrontal (section|plane)\b/i.test(txt)) out.push("coronal");
  if (/\b(horizontal|transverse|axial) (section|plane|cut|slice|image)s?\b|\baxial\b|\bcross-?sections?\b/i.test(txt)) out.push("horizontal");
  return uniq(out);
}
function modalitiesOf(c, pathways) {
  if (c.kind === "pathway") {
    const p = PATHWAY[c.pathway];
    return p ? uniq(p.slice(1)) : [];
  }
  void pathways;
  const out = [];
  for (const t of c.tags ?? []) out.push(LEGACY_MODALITY[t]);
  const s = struct(c);
  if (s?.region === "visual system") out.push("visual");
  if (s?.region === "limbic system") out.push("limbic");
  const txt = textOf(c);
  for (const [m, re] of MODALITY) if (re.test(txt)) out.push(m);
  return uniq(out);
}

const cdir = join(dir, "cards");
const counts = {};
let changed = 0;
let total = 0;
for (const f of readdirSync(cdir).filter((x) => x.endsWith(".json")).sort()) {
  const raw = readFileSync(join(cdir, f), "utf8");
  const indent = (raw.match(/^\[\r?\n( +)\S/) ?? [])[1]?.length ?? 2; // keep each file's own formatting
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  const cards = JSON.parse(raw);
  for (const c of cards) {
    total++;
    const t = topics.get(c.topic);
    const add = [];
    if (t?.unit) add.push(`unit:${t.unit}`);
    add.push(`kind:${c.kind}`, `source:${sourceOf(c)}`);
    for (const r of regionsOf(c)) add.push(`region:${r}`);
    for (const p of planesOf(c)) add.push(`plane:${p}`);
    for (const m of modalitiesOf(c)) add.push(`modality:${m}`);
    if (c.kind === "theory" && c.facet && c.facet !== "written") add.push(`theory:${c.facet.replace(/_/g, "-")}`);
    if (c.kind === "clinical") add.push("theory:lesion");
    // drop previously generated facet tags (a changed rule never leaves stale ones), keep every other tag
    const kept = (c.tags ?? []).filter((x) => !GEN.test(x));
    const next = [...kept, ...new Set(add)];
    for (const x of new Set(add)) counts[x] = (counts[x] ?? 0) + 1;
    if (JSON.stringify(next) !== JSON.stringify(c.tags ?? [])) {
      c.tags = next;
      changed++;
    }
  }
  if (!dry) writeFileSync(join(cdir, f), JSON.stringify(cards, null, indent).replace(/\n/g, nl) + (/\n$/.test(raw) ? nl : ""));
}
console.log(`${dry ? "[dry] " : ""}${total} cards, ${changed} changed`);
for (const k of Object.keys(counts).sort()) console.log(" ", k.padEnd(34), counts[k]);
