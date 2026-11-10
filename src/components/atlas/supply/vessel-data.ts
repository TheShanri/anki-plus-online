// Static facts about the vessel segments in public/atlas/arteries.glb (names match its node names, "<slug>" or
// "<slug>.l" / "<slug>.r"; left = +x like the rest of the atlas) and the centreline file arteries-flow.json.

export type FlowSegment = {
  artery: string;
  side: "l" | "r" | "m";
  /** "fwd": blood runs proximal to distal along the stored line. "both": a communicating artery, direction depends on pressure. */
  flow: "fwd" | "both";
  radius: number;
  parent: string | null;
  /** Flat xyz arrays in glTF metres (same space as gross.glb), each oriented proximal to distal. */
  lines: number[][];
};
export type FlowFile = { version: number; segments: Record<string, FlowSegment> };

export const slugOf = (name: string) => name.replace(/\.[lr]$/, "");

/** Display name per segment slug. */
export const SEG_LABEL: Record<string, string> = {
  ica: "Internal carotid artery",
  vertebral: "Vertebral artery",
  basilar: "Basilar artery",
  aca: "Anterior cerebral artery (A1, A2)",
  acom: "Anterior communicating artery",
  pericallosal: "Pericallosal artery",
  callosomarginal: "Callosomarginal artery",
  "callosomarginal-frontal": "Frontal branches of the callosomarginal artery",
  orbitofrontal: "Orbitofrontal branches of the ACA",
  "mca-m1": "Middle cerebral artery (M1)",
  "mca-m2": "Insular branches of the MCA (M2)",
  "mca-m3": "Middle cerebral artery (M3)",
  "mca-temporal": "Temporal branches of the MCA",
  "mca-parietal": "Parietal branches of the MCA",
  "central-sulcus": "Artery of the central sulcus",
  "precentral-sulcus": "Artery of the precentral sulcus",
  "lenticulostriate-prox": "Lateral striate (lenticulostriate) branches, proximal",
  "lenticulostriate-dist": "Lateral striate (lenticulostriate) branches, distal",
  pcom: "Posterior communicating artery",
  pca: "Posterior cerebral artery (P1, P2)",
  "pca-branches": "Cortical branches of the PCA",
  sca: "Superior cerebellar artery",
  aica: "Anterior inferior cerebellar artery",
  pica: "Posterior inferior cerebellar artery",
  "pontine-medial": "Medial pontine branches of the basilar",
  "pontine-lateral": "Lateral pontine branches of the basilar",
  "anterior-spinal": "Anterior spinal artery",
};

/** Short labels on the Circle of Willis view. */
export const COW_LABEL: Record<string, string> = {
  ica: "ICA",
  aca: "ACA",
  acom: "AComm",
  "mca-m1": "MCA",
  pcom: "PComm",
  pca: "PCA",
  basilar: "Basilar",
  vertebral: "Vertebral",
};
/** The components of the circle (plus its feeders), in the order they are labelled. */
export const COW_SLUGS = new Set(Object.keys(COW_LABEL));

/** Not on the course slides: drawn only after the Supplementary gate is opened. */
export const SUPP_SLUGS = new Set(["orbitofrontal", "mca-temporal", "mca-parietal", "central-sulcus", "precentral-sulcus", "callosomarginal-frontal", "pca-branches"]);

/** The slides' flow statement for the two communicating arteries (Lab 16, "The Circle of Willis"). */
export const COMM_NOTE =
  "Normally, with healthy and equal pressure on both sides, there is little flow in the communicating vessels. If a main vessel is occluded, the Circle of Willis can equalise flow, so the direction in AComm and PComm depends on the pressure difference. Here they are drawn two-way.";

/** Margin labels (1-3 words) for every slug that is labelled outside the circle view. */
export const SEG_SHORT: Record<string, string> = {
  ...COW_LABEL,
  pericallosal: "Pericallosal",
  callosomarginal: "Callosomarginal",
  "mca-m2": "MCA (insular)",
  "lenticulostriate-prox": "Lenticulostriates",
  "lenticulostriate-dist": "Lenticulostriates",
  sca: "SCA",
  aica: "AICA",
  pica: "PICA",
  "pontine-medial": "Pontine",
  "pontine-lateral": "Pontine",
  "anterior-spinal": "Ant. spinal",
};
