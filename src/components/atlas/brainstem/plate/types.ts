// The brainstem plate data (atlas v3), shared by the server route, the atlas, the study cards and BrainstemRef.
// Plate units: the viewBox is 1000 wide, the midline is x = 500, dorsal is up. The illustration is symmetric (the
// photo's right half, mirrored), so one region list serves both halves of the split view.

export type Side = "L" | "R" | "M";
export type Tissue = "grey" | "white" | "space" | "landmark" | "nerve" | "fibres";

export interface PlateRegion {
  /** `<slug>-L`, `<slug>-R` or `<slug>-M` */
  id: string;
  slug: string;
  /** structure slugs this region stands for (kept for the plate study cards: plate: {level, region: slug}) */
  slugs: string[];
  /** the viewer's left/right half; M = a midline structure drawn once */
  side: Side;
  tissue: Tissue;
  /** the outline (evenodd) */
  d: string;
  /** centroid */
  c: [number, number];
  /** label anchor: the point deepest inside the region */
  a: [number, number];
  /** the photo's own left-half outline when it differs from the mirrored illustration (photo-only view) */
  dPhoto?: string;
  /** a space outside the section (the opened fourth ventricle, the interpeduncular fossa): no fill or rim drawn */
  open?: boolean;
  /** drawn from fewer than two agreeing sources: shown as approximate */
  approx?: boolean;
  note?: string;
  src: string[];
}

export interface PlateFibre {
  id: string;
  slug: string;
  side: "L" | "R";
  tissue: "nerve" | "fibres";
  d: string;
  approx?: boolean;
  note?: string;
  src?: string[];
}

export interface PlateData {
  level: string;
  viewBox: [number, number, number, number];
  mid: number;
  /** the photo's frame cuts the section at the plate edge (e.g. the middle cerebellar peduncles) */
  bleed: boolean;
  /** the symmetric section outline (illustration) */
  outline: string;
  /** myelin-density bands from the section, light then dense (illustration texture) */
  bands: string[];
  regions: PlateRegion[];
  fibres: PlateFibre[];
  /** the section photo: `key` in the private course-media bucket; `src` (the auth-gated media URL) is added by the route */
  photo?: { key: string; w: number; h: number; kind: "histology"; src?: string };
  sources?: Record<string, unknown>;
}
