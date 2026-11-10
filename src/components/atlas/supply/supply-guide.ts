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

/** Drainage (lecture 16 slides 27-30). Sinus meshes exist in the atlas; the great cerebral vein, bridging veins and the jugular are schematic. */
export type VeinStep = { title: string; text: string; ids: string[]; src: string };
export const VEIN_STEPS: VeinStep[] = [
  {
    title: "Superficial veins to the superior sagittal sinus",
    text: "Veins on the surface of the brain (subarachnoid space) reach the dural sinuses through bridging veins, which pass through the inner (meningeal) layer of the dura.",
    ids: ["bridging", "sss"],
    src: "Lecture 16, slide 29",
  },
  {
    title: "Deep veins to the straight sinus",
    text: "Deep cerebral veins do not use bridging veins. They converge into the great cerebral vein, which drains directly into the straight sinus.",
    ids: ["gcv", "straight"],
    src: "Lecture 16, slide 30",
  },
  {
    title: "The confluence of sinuses",
    text: "Most dural sinuses drain toward the confluence of sinuses, at the junction of the falx cerebri and the tentorium cerebelli.",
    ids: ["confluence"],
    src: "Lecture 16, slide 28",
  },
  {
    title: "Sigmoid sinus to the jugular vein",
    text: "From the confluence the sigmoid sinus wraps around the posterior cranial fossa and drains into the internal jugular vein, then to the heart.",
    ids: ["transverse", "sigmoid", "ijv"],
    src: "Lecture 16, slide 28",
  },
];

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
