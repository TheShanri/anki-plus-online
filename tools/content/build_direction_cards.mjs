// Builds content/nsci3250/cards/directions-3d.json: the Lab 1 directional-terms and planes cards drawn on a 3D model
// (src/components/cards/DirectionScene.tsx) instead of the old slide images, and retires the old Lab 1 image cards they
// replace (status "retired": the seed keeps their rows and the students' history). Owner request 2026-11-18.
//   node tools/content/build_direction_cards.mjs
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "content/nsci3250/cards";
const ref = { type: "generated", ref: "Lab 1: directional terms, planes and the neuraxis (3D)" };
const tags = (k) => ["unit:u1", "kind:pin", "lab:1", "directions-3d", `scene:${k}`];
const D = "Name the direction the highlighted arrow points.";

// [slug suffix, subject, show, answer, accept, structure, answer_kind, prompt]
const CARDS = [
  // a four-legged animal: the neuraxis is straight, rostral = toward the nose, dorsal = toward the back
  ["animal-rostral", "animal", "dir:rostral", "Rostral", ["anterior", "cranial", "rostral or anterior"], "rostral", "direction", D],
  ["animal-caudal", "animal", "dir:caudal", "Caudal", ["posterior", "caudal or posterior"], "caudal", "direction", D],
  ["animal-dorsal", "animal", "dir:dorsal", "Dorsal", ["superior"], "dorsal", "direction", D],
  ["animal-ventral", "animal", "dir:ventral", "Ventral", ["inferior"], "ventral", "direction", D],
  ["animal-neuraxis", "animal", "axis", "Neuraxis", ["neural axis", "longitudinal axis of the nervous system"], "neuraxis", "term", "Name the highlighted line through the central nervous system."],
  // the human body in anatomical position
  ["human-superior", "human", "dir:superior", "Superior", ["cranial", "cephalic"], "superior", "direction", D],
  ["human-inferior", "human", "dir:inferior", "Inferior", ["caudal"], "inferior", "direction", D],
  ["human-anterior", "human", "dir:anterior", "Anterior", ["ventral"], "anterior", "direction", D],
  ["human-posterior", "human", "dir:posterior", "Posterior", ["dorsal"], "posterior", "direction", D],
  ["human-medial", "human", "dir:medial", "Medial", [], "medial", "direction", D],
  ["human-lateral", "human", "dir:lateral", "Lateral", [], "lateral", "direction", D],
  ["human-median", "human", "median", "Median", ["median plane", "midline"], "median", "term", "Name the term for the highlighted plane that divides the body into equal left and right halves."],
  ["human-proximal", "human", "dir:proximal", "Proximal", [], "proximal", "direction", "On the limb, name the direction the highlighted arrow points (toward the trunk)."],
  ["human-distal", "human", "dir:distal", "Distal", [], "distal", "direction", "On the limb, name the direction the highlighted arrow points (away from the trunk)."],
  ["human-superficial", "human", "dir:superficial", "Superficial", [], "superficial", "direction", "Name the direction the highlighted arrow points (relative to the body surface)."],
  ["human-deep", "human", "dir:deep", "Deep", [], "deep", "direction", "Name the direction the highlighted arrow points (relative to the body surface)."],
  ["human-ipsilateral", "human", "pair:ipsilateral", "Ipsilateral", ["same side"], "ipsilateral", "term", "The two marked points lie on the same side of the body. Name the term."],
  ["human-contralateral", "human", "pair:contralateral", "Contralateral", ["opposite side"], null, "term", "The two marked points lie on opposite sides of the body. Name the term."],
  ["human-sagittal", "human", "plane:sagittal", "Sagittal plane", ["sagittal", "midsagittal", "midsagittal plane", "median plane"], "sagittal-plane", "plane", "Name the plane shown."],
  ["human-coronal", "human", "plane:coronal", "Coronal plane", ["coronal", "frontal", "frontal plane"], "coronal-plane", "plane", "Name the plane shown."],
  ["human-horizontal", "human", "plane:horizontal", "Horizontal plane", ["horizontal", "transverse", "transverse plane", "axial", "axial plane"], "horizontal-plane", "plane", "Name the plane shown."],
  // the human brain: in the cerebrum rostral = anterior, dorsal = superior ...
  ["brain-rostral", "brain", "dir:rostral", "Rostral", ["anterior", "rostral or anterior"], "rostral", "direction", "In the cerebrum, name the direction the highlighted arrow points."],
  ["brain-caudal", "brain", "dir:caudal", "Caudal", ["posterior", "caudal or posterior"], "caudal", "direction", "In the cerebrum, name the direction the highlighted arrow points."],
  ["brain-dorsal", "brain", "dir:dorsal", "Dorsal", ["superior", "dorsal or superior"], "dorsal", "direction", "In the cerebrum, name the direction the highlighted arrow points."],
  ["brain-ventral", "brain", "dir:ventral", "Ventral", ["inferior", "ventral or inferior"], "ventral", "direction", "In the cerebrum, name the direction the highlighted arrow points."],
  // ... below the midbrain the neuraxis bends: rostral = superior, dorsal = posterior
  ["stem-rostral", "brain", "dir:stem-rostral", "Rostral", ["superior", "rostral or superior"], "rostral", "direction", "In the brainstem, name the direction the highlighted arrow points."],
  ["stem-caudal", "brain", "dir:stem-caudal", "Caudal", ["inferior", "caudal or inferior"], "caudal", "direction", "In the brainstem, name the direction the highlighted arrow points."],
  ["stem-dorsal", "brain", "dir:stem-dorsal", "Dorsal", ["posterior", "dorsal or posterior"], "dorsal", "direction", "In the brainstem, name the direction the highlighted arrow points."],
  ["stem-ventral", "brain", "dir:stem-ventral", "Ventral", ["anterior", "ventral or anterior"], "ventral", "direction", "In the brainstem, name the direction the highlighted arrow points."],
  ["brain-neuraxis", "brain", "axis", "Neuraxis", ["neural axis", "longitudinal axis of the nervous system"], "neuraxis", "term", "Name the highlighted line through the central nervous system."],
  ["brain-flexure", "brain", "flexure", "Mesencephalic flexure", ["cephalic flexure", "midbrain flexure"], "mesencephalic-flexure", "structure", "Name the highlighted bend in the neuraxis."],
  ["brain-midsagittal", "brain", "plane:sagittal", "Midsagittal plane", ["midsagittal", "median plane", "sagittal"], "sagittal-plane", "plane", "Name the plane shown."],
  ["brain-parasagittal", "brain", "plane:parasagittal", "Parasagittal plane", ["parasagittal", "sagittal"], "sagittal-plane", "plane", "Name the plane shown (it is off the midline)."],
  ["brain-coronal", "brain", "plane:coronal", "Coronal plane", ["coronal", "frontal", "frontal plane"], "coronal-plane", "plane", "Name the plane shown."],
  ["brain-horizontal", "brain", "plane:horizontal", "Horizontal plane", ["horizontal", "transverse", "axial"], "horizontal-plane", "plane", "Name the plane shown."],
];

const cards = CARDS.map(([id, subject, show, answer, accept, structure, kind, prompt], i) => ({
  slug: `directions-3d-${id}`,
  kind: "pin",
  topic: "lab-1",
  structure,
  status: "live",
  position: 40 + i,
  source: ref,
  answer,
  answer_kind: kind,
  accept,
  require_side: false,
  scene: { subject, show },
  prompt,
  followups: [],
  tags: tags(subject),
}));
writeFileSync(`${DIR}/directions-3d.json`, JSON.stringify(cards, null, 1) + "\n");

// retire the old Lab 1 slide-image cards these replace (directions, planes, neuraxis, flexure on the Lab 1 images)
const lab1 = JSON.parse(readFileSync(`${DIR}/lab-1.json`, "utf8"));
const REPLACED = new Set(["direction", "plane"]);
const TERMS = /^(neuraxis|mesencephalic flexure|median|superficial structures|deep structures|cephalic)$/i;
let n = 0;
for (const c of lab1) {
  if (c.kind !== "pin" || c.status === "retired") continue;
  if (REPLACED.has(c.answer_kind) || TERMS.test(String(c.answer).trim())) {
    c.status = "retired";
    c.retired_by = "directions-3d";
    n++;
  }
}
writeFileSync(`${DIR}/lab-1.json`, JSON.stringify(lab1, null, 1) + "\n");
console.log(`${cards.length} 3D cards written, ${n} Lab 1 image cards retired`);
