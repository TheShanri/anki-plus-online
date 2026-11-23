// Curated sets the achievements are built from. Slugs are the curriculum structure slugs (src/data/atlas-links.json);
// groups.test.ts checks them against the data files so a renamed slug is caught.

export const LOBES: Record<string, { label: string; slugs: string[] }> = {
  frontal: {
    label: "Frontal",
    slugs: ["primary-motor-cortex", "premotor-cortex", "broca-s-area", "dorsolateral-prefrontal-cortex", "orbitofrontal-cortex", "ventromedial-prefrontal-cortex", "superior-frontal-gyrus", "middle-frontal-gyrus", "inferior-frontal-gyrus", "precentral-gyrus"],
  },
  parietal: {
    label: "Parietal",
    slugs: ["primary-somatosensory-cortex", "somatosensory-association-cortex", "parietal-lobe-general-association-area", "postcentral-gyrus", "superior-parietal-lobule", "inferior-parietal-lobule", "intraparietal-fissure"],
  },
  temporal: {
    label: "Temporal",
    slugs: ["primary-auditory-cortex", "auditory-association-area", "wernicke-s-area", "temporal-lobe-general-association-area", "superior-temporal-gyrus", "middle-temporal-gyrus", "inferior-temporal-gyrus", "transverse-temporal-gyrus"],
  },
  occipital: { label: "Occipital", slugs: ["primary-visual-cortex", "visual-association-cortex", "calcarine-fissure", "parieto-occipital-fissure"] },
  insular: { label: "Insular", slugs: ["insular-cortex"] },
};

/** The CSF circuit: ventricles, their openings and the choroid plexus. */
export const VENTRICLE_SLUGS = [
  "lateral-ventricle", "anterior-horn-of-lateral-ventricle", "body-of-lateral-ventricle", "inferior-horn-of-lateral-ventricle",
  "posterior-horn-of-lateral-ventricle", "atrium-of-lateral-ventricle", "foramina-of-monro", "third-ventricle", "cerebral-aqueduct",
  "fourth-ventricle", "foramen-of-magendie", "foramina-of-luschka", "choroid-plexus",
];
export const MAIN_VENTRICLES = ["lateral-ventricle", "third-ventricle", "fourth-ventricle", "cerebral-aqueduct"];

export const CRANIAL_NERVES = [
  "olfactory-nerve", "optic-nerve", "oculomotor-nerve", "trochlear-nerve", "trigeminal-nerve", "abducens-nerve",
  "facial-nerve", "vestibulocochlear-nerve", "glossopharyngeal-nerve", "vagus-nerve", "accessory-nerve", "hypoglossal-nerve",
];

export const DEEP_NUCLEI = [
  "caudate-nucleus", "putamen", "globus-pallidus", "thalamus", "subthalamic-nucleus", "amygdala", "nucleus-accumbens",
  "substantia-nigra", "red-nucleus", "hypothalamus",
];

/** Named functional cortical areas. */
export const CORTICAL_AREAS = [
  "primary-motor-cortex", "premotor-cortex", "broca-s-area", "dorsolateral-prefrontal-cortex", "orbitofrontal-cortex",
  "ventromedial-prefrontal-cortex", "anterior-cingulate-cortex", "primary-somatosensory-cortex", "somatosensory-association-cortex",
  "primary-visual-cortex", "visual-association-cortex", "primary-auditory-cortex", "auditory-association-area", "wernicke-s-area", "insular-cortex",
];

export const BRAINSTEM_PARTS = ["midbrain", "pons", "medulla"];
export const FIBER_TYPES = ["association-fibers", "commissural-fibers", "projection-fibers"];
export const PAPEZ = ["hippocampus", "fornix", "mammillary-bodies", "anterior-nucleus-of-thalamus", "cingulate-gyrus"];
export const MEDIAL_TEMPORAL = ["parahippocampal-gyrus", "uncus"];

export const PATHWAYS = [
  "dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain", "lcst", "acst", "corticobulbar", "corticopontocerebellar",
  "cerebellar", "visual", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn", "sympathetic", "parasympathetic",
  "jaw-jerk", "pupillary", "corneal", "gaze", "basal-ganglia", "olfactory", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward",
  "cochlear", "vestibular", "solitary", "stretch-reflex", "withdrawal-reflex",
];
export const ASCENDING = ["dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain"];
export const DESCENDING = ["lcst", "acst", "corticobulbar", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal"];
export const REFLEXES = ["jaw-jerk", "pupillary", "corneal", "gaze", "stretch-reflex", "withdrawal-reflex"];
export const LIMBIC = ["limbic-fornix", "limbic-amygdala", "limbic-septal", "reward"];
export const AUTONOMIC = ["sympathetic", "parasympathetic", "pupillary"];

/** Territory arteries of the supply quiz (supply-map.json minus the carotid trunk). */
export const TERRITORY_ARTERIES = ["aca", "mca", "pca", "achor", "lenti", "pcomm", "pontine", "sca", "aica", "pica", "vert", "asa", "psa"];
export const BIG_THREE = ["aca", "mca", "pca"];
export const POSTERIOR_CIRCULATION = ["vert", "pica", "aica", "sca", "pontine", "pca"];

/** Brainstem section atlas: how many levels / styles per level it offers. Raise these if the section atlas grows. */
export const BRAINSTEM_LEVEL_COUNT = 8; // the isthmus ("upper pons") was taken out of the brainstem atlas on 2026-11-22
/** The section levels (the surface views and the midline are levels too, but not "sections": 13/9 on the progress page). */
export const BRAINSTEM_SECTION_LEVELS = ["midbrain-sc", "midbrain-ic", "pons-mid", "pons-caudal", "medulla-rostral", "medulla-mid", "medulla-caudal", "cervicomedullary"];
export const BRAINSTEM_STYLE_COUNT = 3;
/** Consecutive right labels at one level that count as a perfect label quiz. */
export const BRAINSTEM_PERFECT_RUN = 6;

export const CASES = {
  brownSequard: "clinical-u1-cord-brown-sequard",
  wallenberg: "clinical-u2-brainstem-lateral-medullary",
  weber: "clinical-u2-brainstem-weber",
  dejerine: "clinical-u2-brainstem-medial-medullary",
  lockedIn: "clinical-u2-brainstem-locked-in",
  anteriorSpinal: "clinical-u1-cord-anterior-spinal",
  posteriorSpinal: "clinical-u1-cord-posterior-spinal",
  ballismus: "clinical-u3-bg-ballismus",
  parkinson: "clinical-u3-bg-parkinson",
  huntington: "clinical-u3-bg-huntington",
  chiasm: "clinical-u2-visual-optic-chiasm",
  hippocampus: "clinical-u3-limbic-hippocampus",
  amygdala: "clinical-u3-limbic-amygdala",
  calcarine: "clinical-u1-cortex-calcarine",
  cerebellar: "clinical-u2-motor-cerebellar",
  capsule: "clinical-u2-motor-internal-capsule",
} as const;
export const TOTAL_CASES = 24;
