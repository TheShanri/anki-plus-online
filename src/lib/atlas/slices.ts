export const ATLAS2_BASE = "/atlas2";

export type SliceQuality = "exact" | "derived" | "regional";

export type SliceStructure = {
  name: string;
  quality: SliceQuality;
  source: string;
  /** Label ids in labels.nii.gz (regions, 0.5 mm). */
  labels: number[];
  /** Label ids in tracts.nii.gz. */
  tracts: number[];
  /** MNI mm (ICBM 2009b); right hemisphere for paired structures. */
  centroid: number[] | null;
  bbox: number[][] | null;
  volume_mm3: number | null;
  paired: boolean | null;
  group: boolean;
  neighbors: string[];
};

export type Atlas2 = {
  version: number;
  space: string;
  leaf1: { id: number; key: string; name: string }[];
  leaf2: { id: number; key: string; name: string }[];
  structures: Record<string, SliceStructure>;
};

let p: Promise<Atlas2> | null = null;
/** Fetches /atlas2/atlas2.json once (small; the volumes themselves load only when the slices tab opens). */
export function loadAtlas2(): Promise<Atlas2> {
  if (!p) {
    p = fetch(`${ATLAS2_BASE}/atlas2.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`atlas2: HTTP ${r.status}`);
        return r.json() as Promise<Atlas2>;
      })
      .catch((e) => {
        p = null;
        throw e;
      });
  }
  return p;
}

/** The most specific (fewest labels, non-group first) structures that contain a voxel label. */
export function structuresAtLabel(a: Atlas2, labelId: number, tractId: number): string[] {
  const hits: [string, number][] = [];
  for (const [slug, s] of Object.entries(a.structures)) {
    const inL = labelId > 0 && s.labels.includes(labelId);
    const inT = tractId > 0 && s.tracts.includes(tractId);
    if (inL || inT) hits.push([slug, (s.group ? 1000 : 0) + s.labels.length + s.tracts.length]);
  }
  return hits.sort((x, y) => x[1] - y[1]).map((h) => h[0]);
}
