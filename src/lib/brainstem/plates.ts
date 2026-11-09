import "server-only";
// The brainstem plates: clean vector drawings of each level, derived from the course's Lab 8 drawings.
// Course material, so they are never in public/: they are served only through the auth-gated
// /api/atlas/brainstem/plate/<level> route. Built by tools/brainstem/plates/build-plates.mjs.
import midbrainSc from "@/data/brainstem-plates/midbrain-sc.json";
import midbrainIc from "@/data/brainstem-plates/midbrain-ic.json";
import ponsMid from "@/data/brainstem-plates/pons-mid.json";
import ponsCaudal from "@/data/brainstem-plates/pons-caudal.json";
import medullaRostral from "@/data/brainstem-plates/medulla-rostral.json";
import medullaMid from "@/data/brainstem-plates/medulla-mid.json";
import medullaCaudal from "@/data/brainstem-plates/medulla-caudal.json";

export interface PlateRegion {
  id: string;
  /** structure slugs this region stands for (a region can be one of a bilateral pair) */
  slugs: string[];
  d: string;
  /** a point inside the region, for a callout */
  c: [number, number];
}
export interface Plate {
  level: string;
  viewBox: [number, number, number, number];
  ink: string;
  regions: PlateRegion[];
}

const PLATES: Record<string, Plate> = {
  "midbrain-sc": midbrainSc as unknown as Plate,
  "midbrain-ic": midbrainIc as unknown as Plate,
  "pons-mid": ponsMid as unknown as Plate,
  "pons-caudal": ponsCaudal as unknown as Plate,
  "medulla-rostral": medullaRostral as unknown as Plate,
  "medulla-mid": medullaMid as unknown as Plate,
  "medulla-caudal": medullaCaudal as unknown as Plate,
};

export function getPlate(level: string): Plate | null {
  return PLATES[level] ?? null;
}
