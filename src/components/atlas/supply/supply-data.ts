import raw from "@/data/supply-map.json";

export type Artery = { id: string; name: string; short: string; color: string; territory: string };
export type SupplyVariant = { id: string; label: string; arteries: string[] };
export type SupplyUnit = {
  slug?: string;
  name: string;
  meshes: string[];
  /** First = the artery the structure is coloured by. */
  arteries: string[];
  shell?: boolean;
  course?: string;
  note?: string;
  variants?: SupplyVariant[];
};
export type SupplyMapData = {
  arteries: Artery[];
  vessels: Record<string, string>;
  units: SupplyUnit[];
  decisions: { slug: string; title: string; text: string }[];
};

export const SUPPLY = raw as unknown as SupplyMapData;
export const ARTERIES = SUPPLY.arteries;
export const ARTERY = new Map(ARTERIES.map((a) => [a.id, a]));
/** Arteries with a territory (everything except the carotid trunk). */
export const TERRITORY_ARTERIES = ARTERIES.filter((a) => a.id !== "ica");
/** Number/letter keys in legend order. */
export const ARTERY_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "q", "w", "e", "r"];


/** The arteries of a unit under the chosen reading of the open decision (first = colour). */
export function unitArteries(u: SupplyUnit, variant: string): string[] {
  return u.variants?.find((v) => v.id === variant)?.arteries ?? u.arteries;
}

export function artShort(ids: string[]): string {
  return ids.map((i) => ARTERY.get(i)?.short ?? i).join(" + ");
}
