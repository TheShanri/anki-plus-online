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
};
