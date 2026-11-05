export type AtlasEntry = {
  id: string;
  /** Path under /atlas/ (absent for pure groups, which only have members). */
  file?: string;
  name: string;
  latin: string | null;
  region: string;
  side: "l" | "r" | "lr" | "m";
  parent: string | null;
  bbox: [number[], number[]];
  centroid: number[];
  bytes?: number;
  /** Nearest curriculum structures (bbox gap), precomputed. */
  neighbors?: string[];
  /** Mesh placed from the MNI atlases by registration (not native Z-Anatomy geometry). */
  registered?: boolean;
  /** Member structure ids (groups, and meshes that also head a Z-Anatomy group such as the midbrain). */
  members?: string[];
};

export type AtlasIndex = {
  version: number;
  context: { file: string; bytes: number | null };
  regions: Record<string, string>;
  structures: Record<string, AtlasEntry>;
};

export type AtlasMapEntry = {
  meshIds: string[];
  fallbackParentId?: string;
  approximate: boolean;
  synonyms: string[];
  /** Curriculum structure slug (content/nsci3250/structures.json). */
  slug?: string;
  /** Quality of the MRI-slice label, null when there is none. */
  slices?: "exact" | "derived" | "regional" | null;
  /** Where the structure is shown exactly: "3d" and/or "slices". */
  exactIn?: string[];
  registered?: boolean;
};
