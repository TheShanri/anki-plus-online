import "server-only";
// The brainstem plates (atlas v3): per level, a symmetric vector illustration and the course's myelin-stained section,
// registered at the midline. The geometry comes from the course's own overlay slides (Brainstem Overlay.pptx) and the
// section photo, so it is course material: never in public/, served only through the auth-gated
// /api/atlas/brainstem/plate/<level> route; the photo itself goes through /api/media. Built by tools/brainstem/atlas3/.
import type { PlateData } from "@/components/atlas/brainstem/plate/types";
import midbrainSc from "@/data/brainstem-plates/midbrain-sc.json";
import midbrainIc from "@/data/brainstem-plates/midbrain-ic.json";
import ponsMid from "@/data/brainstem-plates/pons-mid.json";
import ponsCaudal from "@/data/brainstem-plates/pons-caudal.json";
import medullaRostral from "@/data/brainstem-plates/medulla-rostral.json";
import medullaMid from "@/data/brainstem-plates/medulla-mid.json";
import medullaCaudal from "@/data/brainstem-plates/medulla-caudal.json";
import cervicomedullary from "@/data/brainstem-plates/cervicomedullary.json";

export type Plate = PlateData;

const PLATES: Record<string, Plate> = {
  "midbrain-sc": midbrainSc as unknown as Plate,
  "midbrain-ic": midbrainIc as unknown as Plate,
  "pons-mid": ponsMid as unknown as Plate,
  "pons-caudal": ponsCaudal as unknown as Plate,
  "medulla-rostral": medullaRostral as unknown as Plate,
  "medulla-mid": medullaMid as unknown as Plate,
  "medulla-caudal": medullaCaudal as unknown as Plate,
  cervicomedullary: cervicomedullary as unknown as Plate,
};

export function getPlate(level: string): Plate | null {
  return PLATES[level] ?? null;
}
export function plateLevels(): string[] {
  return Object.keys(PLATES);
}
