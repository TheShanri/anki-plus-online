// The brainstem plate data (atlas v3), shared by the server route, the atlas, the study cards and BrainstemRef.
// Plate units: the viewBox is 1000 wide, the midline is x = 500, dorsal is up. The illustration is symmetric (the
// photo's right half, mirrored), so one region list serves both halves of the split view.

export type Side = "L" | "R" | "M";
/** zone: a division (midbrain, pons, medulla) drawn only when lit, so its parts stay readable */
export type Tissue = "grey" | "white" | "space" | "landmark" | "nerve" | "fibres" | "zone";

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
  /** a sub-part (substantia nigra pars compacta): the structure it belongs to, whose course notes it opens */
  parent?: string;
  /** a quiet sub-zone inside another region (the motor pools in the ventral horn): a deeper tone, no outline of its own */
  sub?: boolean;
}

export interface PlateFibre {
  id: string;
  slug: string;
  side: "L" | "R";
  tissue: "nerve" | "fibres";
  d: string;
  approx?: boolean;
  /** one fibre of a fine bundle (internal arcuate fibres, transverse pontine fibres, a decussation), drawn as a hairline */
  fine?: boolean;
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
  photo?: { key: string; w: number; h: number; kind: "histology" | "gross"; src?: string };
  /** false: a one-sided drawing (midsagittal, lateral view); every region is drawn once ("M") where it lies */
  sym?: boolean;
  /** drawing detail without a structure of its own (sulci, striations, folia, the arbor vitae): never hoverable */
  detail?: { d: string; k: "line" | "fine" | "core" | "edge" }[];
  /** "cord": the spinal-cord look (strong grey-matter H with an ink contour, light white funiculi) */
  look?: "cord";
  /** a schematic redrawn from an open atlas because the course has no image of this view */
  schematic?: string;
  /** "surface": a surface view or a midsagittal cut instead of a transverse section */
  view?: "section" | "surface";
  sources?: Record<string, unknown>;
}
