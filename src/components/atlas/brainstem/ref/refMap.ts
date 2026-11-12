// The brainstem reference map bound to its data (see src/lib/brainstem/ref-map.ts).
import refData from "@/data/brainstem-ref.json";
import { makeRefMap, type RefData } from "@/lib/brainstem/ref-map";

export const REF = makeRefMap(refData as unknown as RefData);
export const REF_LEVELS = REF.levels;
