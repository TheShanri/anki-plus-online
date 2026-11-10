import type { WP } from "@/lib/atlas/pathways";
import type { AnatFile } from "./AnatomyParts";
import ANCHORS from "@/data/part-anchors.json";

/* Real anatomy at the start and the end of a pathway (public/pathways/parts.json, from Z-Anatomy).
 * Only what the slides name is drawn plainly; the nerve a receptor travels in, receptor types and similar textbook detail
 * sit in ‹ › marks, which the info popover puts behind the Supplementary gate. */

/** A waypoint on an anatomy part: "spine:drg_C7", "head-targets:masseter" ... on the side rel names (i = the body side in focus). */
export const P = (key: string, rel: "i" | "c" | "m" = "i", dx = 0, dy = 0, dz = 0): WP => ["part", rel, key, dx, dy, dz] as unknown as WP;

export interface Target {
  /** "file:anchor" */
  key: string;
  rel?: "i" | "c" | "m";
  /** Short label on the 3D mark. */
  label: string;
  /** Object of the part lit when the beat is reached (name in the glb). */
  obj?: string;
}
export interface Site {
  /** Caption of the node beat. */
  name: string;
  lines: [string, string][];
  /** Caption of the nerve beat that links the site to the pathway. */
  path: string;
  targets: Target[];
  /** Attach the end site after the branch stretch with this key (default: after the last stretch). */
  after?: string;
}
export interface Show {
  show: string[];
  ghost?: string[];
}
export interface AnatCfg {
  start?: Site;
  end?: Site;
  /** Objects drawn per file. */
  files: Partial<Record<AnatFile, Show>>;
}

const HEAD_EYE: Show = { show: ["organ_eyeball", "organ_cornea"] };

export const SITES: Record<string, AnatCfg> = {
  solitary: {
    files: {
      "head-targets": { show: ["organ_tongue", "muscle_pharyngeal", "cartilage_thyroid", "cartilage_cricoid", "cartilage_epiglottis"] },
      thorax: { show: ["vessel_aortic_arch", "vessel_aorta_ascending", "vessel_brachiocephalic", "vessel_common_carotid", "vessel_carotid_sinus"] },
      gut: { show: ["organ_stomach", "organ_esophagus"] },
    },
    start: {
      name: "Tongue, carotid sinus, aortic arch and stomach wall",
      path: "Cranial nerves VII, IX and X to the solitary tract",
      lines: [
        ["Taste", "taste buds of the tongue (anterior part ‹CN VII›, posterior part ‹CN IX›): the rostral part of the solitary nucleus"],
        ["Baroreceptors", "carotid sinus and aortic arch: the caudal part of the solitary nucleus"],
        ["Visceral stretch", "stomach wall (GI stretch): the caudal part of the solitary nucleus"],
        ["Cranial nerves", "CN VII, IX and X (peripheral ganglia outside the brainstem)"],
      ],
      targets: [
        { key: "head-targets:tongue_anterior_2_3", rel: "m", label: "Tongue: anterior (taste)", obj: "organ_tongue" },
        { key: "head-targets:tongue_posterior_1_3", rel: "m", label: "Tongue: posterior (taste)", obj: "organ_tongue" },
        { key: "thorax:carotid_sinus", label: "Carotid sinus (baroreceptors)", obj: "vessel_carotid_sinus" },
        { key: "thorax:aortic_arch", rel: "m", label: "Aortic arch (baroreceptors)", obj: "vessel_aortic_arch" },
        { key: "gut:stomach_wall", rel: "m", label: "Stomach wall (GI stretch)", obj: "organ_stomach" },
      ],
    },
    end: {
      after: "na",
      name: "Pharynx and larynx",
      path: "Nucleus ambiguus to the pharynx and larynx",
      lines: [["Nucleus ambiguus", "its motor fibres supply the muscles of the pharynx and larynx (swallowing, voice)"]],
      targets: [
        { key: "head-targets:pharynx", label: "Pharynx", obj: "muscle_pharyngeal" },
        { key: "head-targets:larynx", label: "Larynx", obj: "cartilage_thyroid" },
      ],
    },
  },
  sympathetic: {
    files: {
      thorax: { show: ["organ_heart", "organ_lung", "organ_trachea"] },
      gut: { show: ["organ_stomach", "organ_esophagus"], ghost: ["organ_small_intestine", "organ_colon"] },
      "head-targets": { show: ["gland_submandibular", "gland_parotid"] },
    },
    end: {
      name: "Heart, lungs, gut and glands",
      path: "Long postganglionic fibres to the targets",
      lines: [["Targets", "smooth muscle, cardiac muscle and glands"], ["Cardiac muscle", "the heart"], ["Smooth muscle", "the lungs and the gut"], ["Glands", "salivary glands"]],
      targets: [
        { key: "thorax:heart", rel: "m", label: "Heart (cardiac muscle)", obj: "organ_heart" },
        { key: "thorax:lung_L", label: "Lung (smooth muscle)", obj: "organ_lung" },
        { key: "gut:stomach", rel: "m", label: "Gut (smooth muscle)", obj: "organ_stomach" },
        { key: "head-targets:submandibular", label: "Salivary gland", obj: "gland_submandibular" },
      ],
    },
  },
  parasympathetic: {
    files: {
      thorax: { show: ["organ_heart", "organ_lung", "organ_trachea"] },
      gut: { show: ["organ_stomach", "organ_esophagus"], ghost: ["organ_small_intestine", "organ_colon"] },
      "head-targets": { show: ["gland_submandibular", "gland_parotid", "organ_eyeball", "organ_cornea"] },
    },
    end: {
      name: "Heart, lungs, gut, glands and pupil",
      path: "Short postganglionic fibres to the target organs",
      lines: [["Targets", "the target organ the ganglion sits on or near"], ["Brainstem outflow", "Edinger-Westphal (CN III: pupil), superior salivatory (CN VII), inferior salivatory (CN IX), dorsal motor nucleus of X (heart, lungs, gut)"], ["Sacral outflow", "S2-S4 for the lower gut and pelvic organs"]],
      targets: [
        { key: "thorax:heart", rel: "m", label: "Heart", obj: "organ_heart" },
        { key: "thorax:lung_L", label: "Lung", obj: "organ_lung" },
        { key: "gut:stomach", rel: "m", label: "Gut", obj: "organ_stomach" },
        { key: "head-targets:parotid", label: "Parotid gland (IX)", obj: "gland_parotid" },
        { key: "head-targets:submandibular", label: "Submandibular gland (VII)", obj: "gland_submandibular" },
        { key: "head-targets:eyeball_front", label: "Pupil (sphincter pupillae, III)", obj: "organ_eyeball" },
      ],
    },
  },
  cochlear: {
    files: { "head-targets": { show: ["organ_cochlea"], ghost: ["organ_vestibule", "organ_semicircular"] } },
    start: {
      name: "Cochlea",
      path: "Cochlear nerve (CN VIII) from the cochlea",
      lines: [["Place", "the cochlea of the inner ear"], ["Receptors", "‹hair cells of the organ of Corti›"]],
      targets: [{ key: "head-targets:cochlea", label: "Cochlea", obj: "organ_cochlea" }],
    },
  },
  vestibular: {
    files: { "head-targets": { show: ["organ_vestibule", "organ_semicircular"], ghost: ["organ_cochlea"] } },
    start: {
      name: "Vestibule and semicircular canals",
      path: "Vestibular nerve (CN VIII) from the labyrinth",
      lines: [["Semicircular canals", "rotation of the head"], ["Utricle and saccule (vestibule)", "gravity and linear acceleration"]],
      targets: [
        { key: "head-targets:vestibule", label: "Vestibule (utricle, saccule)", obj: "organ_vestibule" },
        { key: "head-targets:canal_anterior", label: "Anterior canal", obj: "organ_semicircular" },
        { key: "head-targets:canal_posterior", label: "Posterior canal", obj: "organ_semicircular" },
        { key: "head-targets:canal_lateral", label: "Lateral canal", obj: "organ_semicircular" },
      ],
    },
  },
  olfactory: {
    files: { "head-targets": { show: ["organ_olfactory_epithelium", "organ_olfactory_bulb"], ghost: ["organ_nasal_cavity"] } },
    start: {
      name: "Olfactory epithelium",
      path: "Receptor axons gather into the olfactory nerve (CN I)",
      lines: [["Place", "olfactory epithelium in the roof of the nasal cavity"], ["Cell", "olfactory receptor neuron (bipolar)"]],
      targets: [{ key: "head-targets:olfactory_epithelium", label: "Olfactory epithelium", obj: "organ_olfactory_epithelium" }],
    },
  },
  "jaw-jerk": {
    files: { "head-targets": { show: ["muscle_masseter", "bone_mandible"] } },
    start: {
      name: "Masseter and mandible",
      path: "Afferent fibres in CN V to the mesencephalic nucleus",
      lines: [["Stimulus", "a tap on the chin (mandible) stretches the muscles of mastication"], ["Receptor", "muscle spindles of the masseter"]],
      targets: [
        { key: "head-targets:masseter", label: "Masseter (muscle spindles)", obj: "muscle_masseter" },
        { key: "head-targets:mandible_chin", rel: "m", label: "Mandible (tap)", obj: "bone_mandible" },
      ],
    },
    end: {
      name: "Masseter contracts",
      path: "Motor root of V to the masseter",
      lines: [["Result", "the jaw closes (monosynaptic reflex)"]],
      targets: [{ key: "head-targets:masseter", label: "Masseter", obj: "muscle_masseter" }],
    },
  },
  gaze: {
    files: { "head-targets": { show: ["organ_eyeball", "muscle_lateral_rectus", "muscle_medial_rectus"] } },
    end: {
      name: "Lateral rectus and medial rectus",
      path: "Abducens to the lateral rectus, MLF to the contralateral medial rectus",
      lines: [["Abducens nucleus", "lateral rectus on its own side"], ["MLF", "to the contralateral oculomotor nucleus: the medial rectus of the other eye"]],
      targets: [
        { key: "head-targets:lateral_rectus", label: "Lateral rectus", obj: "muscle_lateral_rectus" },
        { key: "head-targets:medial_rectus", rel: "c", label: "Medial rectus (other eye)", obj: "muscle_medial_rectus" },
      ],
    },
  },
  pupillary: {
    files: { "head-targets": HEAD_EYE },
    start: {
      name: "Eye: light on the retina",
      path: "Optic nerve (CN II) from the retina",
      lines: [["Stimulus", "light in one eye"], ["Cell", "retinal ganglion cell"]],
      targets: [{ key: "head-targets:eyeball_front", label: "Eye", obj: "organ_eyeball" }],
    },
    end: {
      name: "Both pupils constrict",
      path: "CN III parasympathetics (ciliary ganglion) to the sphincter pupillae",
      lines: [["Result", "pupil constriction in both eyes (the consensual reflex)"]],
      targets: [{ key: "head-targets:eyeball_front", label: "Pupil (each eye)", obj: "organ_eyeball" }],
    },
  },
  corneal: {
    files: { "head-targets": HEAD_EYE },
    start: {
      name: "Cornea",
      path: "Ophthalmic division of CN V (V1) from the cornea",
      lines: [["Stimulus", "touch to the cornea"], ["Cell", "trigeminal ganglion (V1)"]],
      targets: [{ key: "head-targets:eyeball_front", label: "Cornea", obj: "organ_cornea" }],
    },
  },
  corticobulbar: {
    files: { "head-targets": { show: ["muscle_masseter", "bone_mandible", "organ_tongue", "muscle_pharyngeal"] } },
    end: {
      name: "Jaw, tongue and pharynx",
      path: "Cranial nerves to head and neck skeletal muscle",
      lines: [["Targets", "skeletal muscle of the face, jaw, tongue and pharynx"], ["Motor nuclei", "V (jaw), VII (face), ambiguus (pharynx), XII (tongue)"]],
      targets: [
        { key: "head-targets:masseter", label: "Masseter (V)", obj: "muscle_masseter" },
        { key: "head-targets:tongue", rel: "m", label: "Tongue (XII)", obj: "organ_tongue" },
        { key: "head-targets:pharynx", label: "Pharynx (ambiguus)", obj: "muscle_pharyngeal" },
      ],
    },
  },
};

/* ---- the spinal column ---- */
export type LimbKey = "hand" | "foot" | "leg";
export interface LevelCfg {
  /** Dorsal root ganglion shown for the body part. */
  drg: Partial<Record<LimbKey, string>>;
  /** Vertebrae lit for the body part. */
  verts: Partial<Record<LimbKey, string[]>>;
  /** Text for the ganglion popover. */
  range: Partial<Record<LimbKey, string>>;
  /** Cord level the central tracts sit at (default: the ganglion level). */
  cord?: string;
  /** Stretch key -> indices of the waypoints that move to the cord level ("all" = every one after the ganglion). */
  rewrite: Record<string, "all" | number[]>;
  /** Stretches that climb the cord. */
  rise: string[];
}
export const LEVELS: Record<string, LevelCfg> = {
  dcml: {
    drg: { hand: "C7", foot: "L5" },
    verts: { hand: ["bone_C6", "bone_C7"], foot: ["bone_L4", "bone_L5", "bone_sacrum"] },
    range: { hand: "C6 to C8 (shown at C7)", foot: "L4 to S1 (shown at L5)" },
    rewrite: { dc: [1] },
    rise: ["dc"],
  },
  alst: {
    drg: { hand: "C7", foot: "L5" },
    verts: { hand: ["bone_C6", "bone_C7"], foot: ["bone_L4", "bone_L5", "bone_sacrum"] },
    range: { hand: "C6 to C8 (shown at C7)", foot: "L4 to S1 (shown at L5)" },
    rewrite: { root: "all", awc: "all", tract: [0] },
    rise: ["tract"],
  },
  dsct: {
    drg: { foot: "L5" },
    verts: { foot: ["bone_L4", "bone_L5", "bone_sacrum"] },
    range: { foot: "L4 to S1 (shown at L5); the fibres climb to Clarke's nucleus (C8 to L3)" },
    cord: "L3",
    rewrite: { root: "all", tract: [0, 1] },
    rise: ["root", "tract"],
  },
  "stretch-reflex": {
    drg: { leg: "L4" },
    verts: { leg: ["bone_L3", "bone_L4"] },
    range: { leg: "L3 and L4 (shown at L4)" },
    rewrite: { ia: "all", lmn: "all" },
    rise: [],
  },
  "withdrawal-reflex": {
    drg: { hand: "C7" },
    verts: { hand: ["bone_C6", "bone_C7"] },
    range: { hand: "C6 to C8 (shown at C7)" },
    rewrite: { root: "all", int: "all", lmn: "all" },
    rise: [],
  },
};

/** Pathways that run in the cord without a limb entry: the column is drawn around the cord. */
export const CORD_CONTEXT = new Set(["lcst", "acst", "umn-lmn", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal"]);

/** Height (m) of a spinal level of the cord, from the anatomy part. */
export function cordY(level: string): number {
  const t = (ANCHORS as unknown as Record<string, Record<string, number[]>>).spine;
  return (t[`cord_${level}`] ?? t.cord_C7)[1];
}
export const vertLevels = (a: string, b: string, names: string[]) => names.slice(names.indexOf(a), names.indexOf(b) + 1);

/** Sympathetic lateral horn T1 to L2: the vertebrae lit. */
export const SYMP_VERTS = ["bone_T1", "bone_T2", "bone_T3", "bone_T4", "bone_T5", "bone_T6", "bone_T7", "bone_T8", "bone_T9", "bone_T10", "bone_T11", "bone_T12", "bone_L1", "bone_L2"];
