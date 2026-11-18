// Slide-level content for the guided tour, occlusion mode and drainage layer of the blood supply atlas.
// Sources: lecture 16 (Blood Supply to the CNS), lab 16, lecture 18 (Strokes and brain bleeds). Nothing here goes beyond them.

/** Structure slug (course content) per artery id: the "Study these cards" scope. */
export const ARTERY_STRUCTURE: Record<string, string> = {
  ica: "internal-carotid-artery",
  aca: "anterior-cerebral-artery",
  mca: "middle-cerebral-artery",
  pca: "posterior-cerebral-artery",
  pcomm: "posterior-communicating-artery",
  lenti: "lenticulostriate-arteries",
  vert: "vertebral-artery",
  pontine: "pontine-arteries",
  sca: "superior-cerebellar-artery",
  pica: "posterior-inferior-cerebellar-artery",
  asa: "anterior-spinal-artery",
  psa: "posterior-spinal-arteries",
};

export type TourStep = {
  title: string;
  text: string;
  /** Segment slugs revealed by this step (cumulative over the tour). */
  slugs: string[];
  /** Territories the step turns on (artery ids), if any. */
  territory?: string[];
  /** The view the step reads best from (offered as a button; the camera never moves by itself). */
  view?: "inferior" | "lateral" | "medial";
  /** Source slide. */
  src: string;
};

export const TOUR: TourStep[] = [
  {
    title: "Two feeders",
    text: "Blood reaches the brain through two pairs of arteries: the internal carotids (anterior circulation) and the vertebrals (posterior circulation).",
    slugs: ["ica", "vertebral"],
    view: "inferior",
    src: "Lecture 16, slide 8",
  },
  {
    title: "Vertebrals make the basilar",
    text: "The two vertebral arteries join at the ponto-medullary junction to form the basilar artery, which gives off the pontine branches.",
    slugs: ["basilar", "pontine-medial", "pontine-lateral"],
    src: "Lecture 16, slides 9-11",
  },
  {
    title: "The basilar splits into the PCAs",
    text: "The basilar artery ends by dividing into the two posterior cerebral arteries, with the superior cerebellar arteries just below the division.",
    slugs: ["pca", "sca"],
    src: "Lab 16, slide 4",
  },
  {
    title: "The carotid splits into MCA and ACA",
    text: "Each internal carotid divides into a large middle cerebral artery and a smaller anterior cerebral artery, and about 80 % of its flow goes to the MCA.",
    slugs: ["mca-m1", "aca"],
    src: "Lab 16, slides 7-8; lecture 18, slide 23",
  },
  {
    title: "Two bridges close the circle",
    text: "The anterior communicating artery joins the two ACAs and each posterior communicating artery joins the carotid to the PCA, closing the Circle of Willis.",
    slugs: ["acom", "pcom"],
    src: "Lecture 16, slides 13-14",
  },
  {
    title: "Territories of the three cerebral arteries",
    text: "The ACA supplies the medial frontal and parietal lobes, the MCA most of the lateral surface, and the PCA the inferior temporal and occipital lobes.",
    slugs: [],
    territory: ["aca", "mca", "pca"],
    view: "lateral",
    src: "Lecture 16, slides 15-19",
  },
  {
    title: "Branches of the ACA and MCA",
    text: "The ACA gives the pericallosal and callosomarginal arteries, and the MCA gives the lenticulostriate arteries to the basal ganglia and the anterior limb of the internal capsule.",
    slugs: ["pericallosal", "callosomarginal", "mca-m2", "lenticulostriate-prox", "lenticulostriate-dist"],
    view: "medial",
    src: "Lecture 16, slides 12, 17, 25",
  },
  {
    title: "Cerebellar and spinal branches",
    text: "Three pairs of cerebellar arteries (superior, AICA, PICA) and the anterior spinal artery, which forms from a branch of each vertebral, complete the posterior circulation.",
    slugs: ["aica", "pica", "anterior-spinal"],
    view: "inferior",
    src: "Lecture 16, slides 10-11; lab 16, slides 5, 18",
  },
];

/** Direction a communicating artery carries blood when a main vessel is blocked: +1 as drawn (see arteries-flow.json), -1 reverse. */
export type Reroute = { slug: string; side: "l" | "r" | "m"; dir: 1 | -1 };

export type Occlusion = {
  /** Territory arteries dimmed (the blocked vessel's own territory). */
  territory: string[];
  deficit: string;
  /** Collateral flow through the circle the slides support (communicating vessels only). */
  reroute?: (side: "l" | "r" | "m") => Reroute[];
  collateral: string;
};

const CIRCLE_NOTE = "The circle can equalise flow if the communicating vessels are present and large enough, but it is not 100 % protective.";

/**
 * Slide-level consequences of blocking an artery. Direction conventions (arteries-flow.json): acom runs left to right
 * (+x to -x); pcom runs from the internal carotid to the PCA.
 */
export const OCCLUSION: Record<string, Occlusion> = {
  ica: {
    territory: ["mca", "aca", "lenti"],
    deficit: "Often shows up as an MCA-territory stroke, because 80 % of internal carotid flow goes to the MCA (face and arm weakness, speech disturbance).",
    reroute: (side) => [
      { slug: "acom", side: "m", dir: side === "l" ? -1 : 1 },
      { slug: "pcom", side, dir: -1 },
    ],
    collateral: `The anterior communicating artery can carry blood from the opposite ACA, and the posterior communicating artery from the PCA, towards the blocked side. ${CIRCLE_NOTE}`,
  },
  aca: {
    territory: ["aca"],
    deficit: "Contralateral leg weakness and sensory loss (lower extremity) and behavioural change (medial frontal lobe, cingulate gyrus, basal forebrain).",
    reroute: (side) => [{ slug: "acom", side: "m", dir: side === "l" ? -1 : 1 }],
    collateral: `The anterior communicating artery can carry blood across from the other ACA. ${CIRCLE_NOTE}`,
  },
  mca: {
    territory: ["mca", "lenti"],
    deficit: "Contralateral face and arm weakness and sensory loss, speech disturbance (Broca's area) and auditory disturbance. The most common ischemic stroke: 80 % of internal carotid flow goes to the MCA.",
    collateral: "No communicating artery reaches the MCA beyond the block, so the circle does not bypass it.",
  },
  pca: {
    territory: ["pca"],
    deficit: "Vision loss (occipital lobe), thalamus and posterior limb of the internal capsule deficits, and the inferior temporal 'what' pathway: inability to recognise faces (prosopagnosia), difficulty reading; the slides also list ataxia, vertigo and unsteadiness.",
    reroute: (side) => [{ slug: "pcom", side, dir: 1 }],
    collateral: `The posterior communicating artery can carry blood from the internal carotid to the PCA. ${CIRCLE_NOTE}`,
  },
  vert: {
    territory: ["pica", "asa"],
    deficit: "Damage to the brainstem and cerebellum, which the posterior circulation supplies; each vertebral also gives a branch to the anterior spinal artery.",
    collateral: "The other vertebral artery still feeds the basilar artery.",
  },
  basilar: {
    territory: ["pontine", "sca", "aica", "pca"],
    deficit: "Strokes or damage to the basilar artery are often fatal, because the brainstem is essential for basic body functioning.",
    reroute: () => [{ slug: "pcom", side: "l", dir: 1 }, { slug: "pcom", side: "r", dir: 1 }],
    collateral: `Each posterior communicating artery can bring carotid blood back to the PCA. ${CIRCLE_NOTE}`,
  },
  pontine: {
    territory: ["pontine"],
    deficit: "Small penetrating branches: a block can affect cranial nerve nuclei, the reticular formation or cortical efferents in that part of the pons. About 10 % of ischemic strokes are in the brainstem.",
    collateral: "Penetrating branches: the slides show no rerouting.",
  },
  lenti: {
    territory: ["lenti"],
    deficit: "A lacunar infarct: motor, sensory and cognitive deficits from damage to the basal ganglia and the anterior limb of the internal capsule. These small arteries branch at about 90 degrees from the MCA and are prone to both blockage and haemorrhage.",
    collateral: "Small penetrating arteries: the slides show no rerouting.",
  },
  sca: {
    territory: ["sca"],
    deficit: "Infarct of the cerebellum in the superior cerebellar territory; the slides list ataxia, vertigo and unsteadiness among posterior-circulation signs.",
    collateral: "Cerebellar arteries are not bypassed by the circle.",
  },
  aica: {
    territory: ["aica"],
    deficit: "Infarct of the cerebellum in the anterior inferior cerebellar territory; the slides list ataxia, vertigo and unsteadiness among posterior-circulation signs.",
    collateral: "Cerebellar arteries are not bypassed by the circle.",
  },
  pica: {
    territory: ["pica"],
    deficit: "Infarct of the cerebellum in the posterior inferior cerebellar territory; the slides list ataxia, vertigo and unsteadiness among posterior-circulation signs.",
    collateral: "Cerebellar arteries are not bypassed by the circle.",
  },
  asa: {
    territory: ["asa"],
    deficit: "A cord lesion of the ventral half on both sides: both ventral horns, intermediate grey, most sensory tracts (not the dorsal columns) and all the motor tracts bilaterally.",
    collateral: "Other arteries feed the anterior spinal artery at cervical, thoracic, lumbar and sacral levels; if one fails a portion of the anterior cord can become ischemic.",
  },
};

/** Segment slug to the artery id used for blocking (the circle's own communicating vessels are not blockable). */
export const BLOCKABLE: Record<string, string> = {
  ica: "ica",
  aca: "aca",
  "mca-m1": "mca",
  "mca-m2": "mca",
  "mca-m3": "mca",
  pca: "pca",
  vertebral: "vert",
  basilar: "basilar",
  "pontine-medial": "pontine",
  "pontine-lateral": "pontine",
  "lenticulostriate-prox": "lenti",
  "lenticulostriate-dist": "lenti",
  sca: "sca",
  aica: "aica",
  pica: "pica",
  "anterior-spinal": "asa",
};

/**
 * Drainage: a guided trace of the venous return (lecture 16 slides 27-30; lab 2 slide 10; lecture 2 slides 13-14; lecture 18
 * slides 14-17). Slide numbers are the deck's page numbers. Vessel ids are those of public/atlas/veins.json
 * (tools/atlas/veins/build.py). `cam` is where the camera glides on entering the step: a viewing direction (from the target
 * toward the camera; +x is the patient's left) and the vessels to frame.
 */
export type VeinNote = { title: string; text: string; src: string };
export type VeinStep = {
  title: string;
  text: string;
  /** vessels drawn (and flowing) in this step */
  ids: string[];
  src: string;
  cam: { dir: [number, number, number]; frame: string[]; fill?: number };
  clinical?: VeinNote;
  /** beyond the slides: shown behind the Supplementary gate */
  supp?: string;
};
export const VEIN_STEPS: VeinStep[] = [
  {
    title: "Superficial cerebral veins",
    text: "Veins on the surface of the brain lie in the subarachnoid space, like the arteries. They collect deoxygenated blood from the cortex and run up over the convexity toward the superior sagittal sinus.",
    ids: ["scv"],
    src: "Lecture 16, slides 3, 27 and 29",
    cam: { dir: [0.8, 0.45, 0.4], frame: ["scv", "sss"], fill: 0.86 },
  },
  {
    title: "Bridging veins",
    text: "Near the midline each superficial vein becomes a bridging vein: it leaves the subarachnoid space, crosses the subdural space and passes through the meningeal (inner) layer of dura to open into the superior sagittal sinus.",
    ids: ["bridging"],
    src: "Lecture 16, slide 29; lecture 18, slide 14",
    cam: { dir: [0.42, 0.86, 0.3], frame: ["bridging", "sss"], fill: 0.8 },
    clinical: {
      title: "Subdural hematoma",
      text: "Shearing forces (shaken baby syndrome, falls in the elderly) tear bridging veins. Blood collects between the dura and the arachnoid: a low-pressure, banana-shaped bleed that spreads over one hemisphere and stops at the falx. Not a stroke.",
      src: "Lecture 18, slides 14-16",
    },
  },
  {
    title: "Superior sagittal sinus",
    text: "The sinus runs back along the upper edge of the falx cerebri, between the periosteal and meningeal layers of dura, to the confluence of sinuses. Arachnoid granulations bulge into it and return CSF, so CSF and venous blood mix in the dural sinuses.",
    ids: ["sss", "granulations"],
    src: "Lecture 16, slides 27-28; lab 2, slide 10; lecture 2, slides 13-14",
    cam: { dir: [1, 0.32, -0.08], frame: ["sss"], fill: 0.9 },
  },
  {
    title: "Deep cerebral veins",
    text: "Deep veins do not use bridging veins. The internal cerebral veins run back in the roof of the third ventricle, the basal veins wind around the cerebral peduncles, and they converge into the great cerebral vein (of Galen) beneath the splenium.",
    ids: ["icv", "basal", "gcv"],
    src: "Lecture 16, slide 30",
    cam: { dir: [1, 0.22, 0.12], frame: ["icv", "basal", "gcv", "straight"], fill: 0.62 },
  },
  {
    title: "Straight sinus",
    text: "The great cerebral vein drains directly into the straight sinus, which also receives the inferior sagittal sinus from the lower free edge of the falx. The straight sinus runs back along the junction of the falx cerebri and the tentorium cerebelli.",
    ids: ["iss", "straight"],
    src: "Lecture 16, slides 28 and 30",
    cam: { dir: [0.95, 0.28, -0.3], frame: ["iss", "straight", "gcv"], fill: 0.8 },
  },
  {
    title: "Confluence of sinuses",
    text: "Most dural sinuses drain toward the confluence of sinuses, at the junction of the falx cerebri and the tentorium cerebelli: the superior sagittal and straight sinuses meet here, and the small occipital sinus joins it from below.",
    ids: ["confluence", "occipital"],
    src: "Lecture 16, slides 27-28",
    cam: { dir: [0.3, 0.3, -1], frame: ["confluence", "occipital", "straight", "transverse"], fill: 0.7 },
  },
  {
    title: "Transverse and sigmoid sinuses to the jugular vein",
    text: "From the confluence each transverse sinus runs laterally in the attached edge of the tentorium. The sigmoid sinus then wraps around the posterior cranial fossa in an S-curve to the jugular foramen and drains into the internal jugular vein, which returns the blood to the heart.",
    ids: ["transverse", "sigmoid", "ijv"],
    src: "Lecture 16, slides 27-28",
    cam: { dir: [0.75, -0.1, -0.75], frame: ["transverse", "sigmoid", "ijv", "confluence"], fill: 0.86 },
    clinical: {
      title: "A clot in a sinus",
      text: "A clot in a dural venous sinus backs blood up into the cerebral veins: intracranial pressure rises and the veins can leak or rupture, a venous cause of subarachnoid hemorrhage.",
      src: "Lecture 18, slide 17",
    },
  },
  {
    title: "Cavernous and petrosal sinuses",
    text: "The cavernous sinuses lie on each side of the sella, joined by the intercavernous sinuses. They receive the superficial middle cerebral vein and drain back through the superior petrosal sinus to the transverse and sigmoid sinuses and through the inferior petrosal sinus to the internal jugular vein. The inferior anastomotic vein (of Labbé) links the superficial middle cerebral vein to the transverse sinus.",
    ids: ["cavernous", "intercavernous", "sps", "ips", "smcv", "labbe"],
    src: "Lecture 16, slides 27 and 30 (figure labels)",
    cam: { dir: [0.55, -0.72, 0.42], frame: ["cavernous", "sps", "ips", "smcv"], fill: 0.86 },
    supp: "The internal carotid artery (faint red) and the abducens nerve (VI) run through the cavernous sinus; the oculomotor (III), trochlear (IV), ophthalmic (V1) and maxillary (V2) nerves run in its lateral wall. Infections of the face can reach it through the ophthalmic veins (cavernous sinus thrombosis).",
  },
  {
    title: "The whole path",
    text: "Deep and superficial cerebral veins drain into the dural sinuses, the sinuses into the internal jugular vein, and the jugular vein to the heart.",
    ids: ["scv", "bridging", "sss", "granulations", "icv", "basal", "gcv", "iss", "straight", "confluence", "occipital", "transverse", "sigmoid", "ijv", "cavernous", "intercavernous", "sps", "ips", "smcv", "labbe"],
    src: "Lecture 16, slide 27",
    cam: { dir: [0.85, 0.3, -0.42], frame: ["sss", "ijv", "transverse", "cavernous"], fill: 0.9 },
  },
];
/** Names of the drainage vessels (veins.json ids). */
export const VEIN_NAME: Record<string, string> = {
  scv: "Superior cerebral veins",
  bridging: "Bridging veins",
  sss: "Superior sagittal sinus",
  granulations: "Arachnoid granulations",
  iss: "Inferior sagittal sinus",
  icv: "Internal cerebral veins",
  basal: "Basal veins",
  gcv: "Great cerebral vein",
  straight: "Straight sinus",
  confluence: "Confluence of sinuses",
  occipital: "Occipital sinus",
  transverse: "Transverse sinus",
  sigmoid: "Sigmoid sinus",
  ijv: "Internal jugular vein",
  cavernous: "Cavernous sinus",
  intercavernous: "Intercavernous sinuses",
  sps: "Superior petrosal sinus",
  ips: "Inferior petrosal sinus",
  smcv: "Superficial middle cerebral vein",
  labbe: "Inferior anastomotic vein (of Labbé)",
  ica: "Internal carotid artery",
};
/** The first step that draws a vessel (clicking it in the schematic or in 3D goes there). */
export function veinStepOf(id: string): number {
  const i = VEIN_STEPS.findIndex((s) => s.ids.includes(id));
  return i < 0 ? VEIN_STEPS.length - 1 : i;
}

/** The three bleeds outside the brain and the intracerebral/subarachnoid pair (lecture 18, slides 9-19). */
export const BLEEDS: { name: string; vessel: string; where: string; shape: string; note: string; stroke: boolean }[] = [
  { name: "Epidural", vessel: "Middle meningeal (dural) artery", where: "Between the skull and the dura (pterion)", shape: "Lemon-shaped, high pressure", note: "Skull fracture; more likely to cause herniation. Not a stroke.", stroke: false },
  { name: "Subdural", vessel: "Bridging vein", where: "Between the dura and the arachnoid; stops at the falx", shape: "Banana-shaped, low pressure", note: "Shearing: shaken baby, falls in the elderly. Not a stroke.", stroke: false },
  { name: "Subarachnoid", vessel: "Cerebral artery, often a ruptured aneurysm of the circle of Willis", where: "Subarachnoid space, mixing with CSF", shape: "Fills the fissures and basal cisterns", note: "'Worst headache of your life'. A stroke.", stroke: true },
  { name: "Intracerebral", vessel: "Penetrating artery, e.g. a lenticulostriate", where: "Inside the brain tissue", shape: "Bright pool within the parenchyma", note: "Symptoms resemble an ischemic stroke. A stroke.", stroke: true },
];

/** The vessels the Block panel offers as buttons (the 3D vessels can also be clicked): segment base name, label, whether it has a left and a right. */
export const BLOCK_LIST: { seg: string; label: string; sided: boolean }[] = [
  { seg: "ica", label: "Internal carotid", sided: true },
  { seg: "aca", label: "ACA", sided: true },
  { seg: "mca-m1", label: "MCA", sided: true },
  { seg: "lenticulostriate-prox", label: "Lenticulostriates", sided: true },
  { seg: "pca", label: "PCA", sided: true },
  { seg: "vertebral", label: "Vertebral", sided: true },
  { seg: "basilar", label: "Basilar", sided: false },
  { seg: "pontine-medial", label: "Pontine branches", sided: true },
  { seg: "sca", label: "SCA", sided: true },
  { seg: "aica", label: "AICA", sided: true },
  { seg: "pica", label: "PICA", sided: true },
];

export const OCCLUSION_NAME: Record<string, string> = { basilar: "Basilar artery" };
