/* The v3 pathway data (public/pathways/v3/<slug>[-<limb>].json), built and validated offline by tools/pathways/v3/build.mjs.
 * Coordinates are metres in the atlas world frame (Y up, +Z anterior, patient's left = +X). */

export type Side = "L" | "R";

/** A host key names the structure a fibre runs in:
 *  a:<atlas id>[@L|R]  atlas mesh (public/atlas), optionally one hemisphere
 *  n:<nerve>.<l|r>#<spline>  a Z-Anatomy nerve curve (geometry in `geo`)
 *  p:<id>  a nucleus proxy (an ellipsoid where the atlas has no mesh; geometry in `geo`)
 *  t:<id>  a synthetic connector tube (flagged; geometry in `geo`)
 *  part:<file>/<node>  a node of a pathway part (public/pathways/<file>.glb)
 *  b:<node>  a node of the v3 body (public/pathways/v3/body.glb)
 *  u:<key>|<key>  a union of hosts (a route through several structures) */
export type HostKey = string;

export interface V3Fibre {
  order: number;
  tag?: string;
  /** flat xyz */
  pts: number[];
  /** [first sample index, host] */
  seg: [number, HostKey][];
}
export interface V3Mark {
  p: [number, number, number];
  host: HostKey;
  order: number;
}
export interface V3Cross {
  p: [number, number, number];
  host: HostKey;
  level: string;
  name: string;
  yMax?: number;
  yMin?: number;
}
export interface V3Stop {
  key: string;
  name: string;
  slug?: string;
  carve?: { mesh: HostKey; p: [number, number, number]; r: number };
}
export interface V3SideBeat {
  f: V3Fibre[];
  stops: V3Stop[];
  soma?: V3Mark;
  syn?: V3Mark;
  start?: V3Mark;
  cross?: V3Cross;
}
export interface V3Beat {
  info: string;
  kind: "node" | "path";
  caption: string;
  /** the spec's canonical camera for this beat (a VIEW_DEFS name), when the automatic choice would be wrong */
  view?: "anterior" | "posterior" | "left" | "right" | "superior" | "inferior" | "oblique" | "oblique-front";
  /** the spec's section cut for this beat (axis through the beat's centre, or none) */
  cut?: "x" | "y" | "z" | "off";
  L?: V3SideBeat;
  R?: V3SideBeat;
}
export type V3Geo =
  | { kind: "nerve"; name: string; pts: number[]; r: number[] }
  | { kind: "tube"; name: string; pts: number[]; r: number; synthetic: string; hidden?: boolean }
  | { kind: "proxy"; name: string; parent: string; c: [number, number, number]; r: [number, number, number] };

export interface V3Data {
  v: number;
  slug: string;
  limb: string | null;
  beats: V3Beat[];
  geo: Record<HostKey, V3Geo>;
}

const CACHE = new Map<string, Promise<V3Data>>();
/** Fetches (once) the v3 data of a pathway and body part. */
export function loadV3(slug: string, limb: string | null): Promise<V3Data> {
  const file = limb ? `${slug}-${limb}` : slug;
  let p = CACHE.get(file);
  if (!p) {
    p = fetch(`/pathways/v3/${file}.json`).then((r) => {
      if (!r.ok) throw new Error(`pathway data ${file}: HTTP ${r.status}`);
      return r.json() as Promise<V3Data>;
    });
    p.catch(() => CACHE.delete(file));
    CACHE.set(file, p);
  }
  return p;
}
export function hostParts(key: HostKey): HostKey[] {
  return key.startsWith("u:") ? key.slice(2).split("|") : [key];
}
