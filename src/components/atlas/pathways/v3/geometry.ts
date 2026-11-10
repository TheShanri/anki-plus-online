import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { loadAtlasIndex, resolveStructureIds } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { hostParts, type HostKey, type V3Data, type V3Geo } from "./types";

/* Geometry for the v3 scene: every host key becomes merged world-space BufferGeometry (atlas meshes, pathway parts, the v3
 * body, nerve tubes from the Z-Anatomy curves, nucleus proxies, synthetic connectors, carved patches of a mesh). */

let loader: GLTFLoader | null = null;
const files = new Map<string, Promise<THREE.Group | null>>();
function loadGlb(url: string): Promise<THREE.Group | null> {
  let p = files.get(url);
  if (!p) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    p = loader
      .loadAsync(url)
      .then((g) => g.scene)
      .catch(() => null);
    files.set(url, p);
  }
  return p;
}
let partsJson: Promise<Record<string, { worldOffset?: number[] }>> | null = null;
function partOffsets() {
  if (!partsJson) partsJson = fetch("/pathways/parts.json").then((r) => r.json()).then((j) => j.parts as Record<string, { worldOffset?: number[] }>).catch(() => ({}));
  return partsJson;
}

/** World-space positions + indices of every mesh under `root` whose name matches, merged into one geometry. */
function merge(root: THREE.Object3D, match: (name: string) => boolean, offset?: number[]): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const pos: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let n: THREE.Object3D | null = m;
    let ok = false;
    while (n && !ok) {
      if (match(n.name)) ok = true;
      n = n.parent;
    }
    if (!ok) return;
    const g = m.geometry;
    const p = g.getAttribute("position");
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x + (offset?.[0] ?? 0), v.y + (offset?.[1] ?? 0), v.z + (offset?.[2] ?? 0));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  });
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const unflat = (a: number[]) => {
  const o: THREE.Vector3[] = [];
  for (let i = 0; i < a.length; i += 3) o.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2]));
  return o;
};

/** A tube along a polyline with a per-point radius (nerves keep their real calibre). */
export function tubeGeometry(pts: THREE.Vector3[], radius: number | number[], radial = 10): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  let normal = new THREE.Vector3(0, 0, 1);
  const tan = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    if (i === 0) {
      normal = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    }
    bin.crossVectors(tan, normal).normalize();
    normal.crossVectors(bin, tan).normalize();
    const r = Array.isArray(radius) ? radius[i] : radius;
    for (let k = 0; k < radial; k++) {
      const t = (k / radial) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      pos.push(pts[i].x + (normal.x * c + bin.x * s) * r, pts[i].y + (normal.y * c + bin.y * s) * r, pts[i].z + (normal.z * c + bin.z * s) * r);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + ((k + 1) % radial), c = (i + 1) * radial + k, d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  // caps
  for (const [i, flip] of [[0, true], [n - 1, false]] as [number, boolean][]) {
    const ci = pos.length / 3;
    pos.push(pts[i].x, pts[i].y, pts[i].z);
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k, b = i * radial + ((k + 1) % radial);
      if (flip) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function ellipsoid(c: number[], r: number[]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 24, 16);
  g.scale(r[0], r[1], r[2]);
  g.translate(c[0], c[1], c[2]);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Only the triangles within r of p (a patch of skin, one ganglion of a chain). */
function carve(g: THREE.BufferGeometry, p: number[], r: number): THREE.BufferGeometry | null {
  const pos = g.getAttribute("position");
  const idx = g.getIndex();
  if (!idx) return null;
  const out: number[] = [];
  const keep: number[] = [];
  const r2 = r * r;
  for (let i = 0; i < idx.count; i += 3) {
    let mx = 0, my = 0, mz = 0;
    for (let k = 0; k < 3; k++) {
      const j = idx.getX(i + k);
      mx += pos.getX(j) / 3;
      my += pos.getY(j) / 3;
      mz += pos.getZ(j) / 3;
    }
    if ((mx - p[0]) ** 2 + (my - p[1]) ** 2 + (mz - p[2]) ** 2 <= r2) keep.push(i);
  }
  if (!keep.length) return null;
  for (const i of keep) for (let k = 0; k < 3; k++) {
    const j = idx.getX(i + k);
    out.push(pos.getX(j), pos.getY(j), pos.getZ(j));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

let indexP: Promise<AtlasIndex> | null = null;
const atlasIndex = () => (indexP ??= loadAtlasIndex());
export async function atlasName(id: string): Promise<string> {
  const ix = await atlasIndex();
  return ix.structures[id]?.name ?? id;
}

const GEO = new Map<string, Promise<THREE.BufferGeometry | null>>();
/** The world geometry of one host key (not a union). Side-restricted atlas keys (a:id@L) are clipped by the caller. */
export function hostGeometry(key: HostKey, geo: Record<string, V3Geo>): Promise<THREE.BufferGeometry | null> {
  const g = geo[key];
  const cacheKey = g ? `${key}#${JSON.stringify(g).length}` : key.split("@")[0];
  let p = GEO.get(cacheKey);
  if (p) return p;
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":").split("@")[0];
  if (kind === "a") {
    p = atlasIndex().then(async (ix) => {
      const ids = resolveStructureIds(ix, [id], 60);
      const parts = await Promise.all(ids.map((k) => loadGlb(`/atlas/${ix.structures[k].file}`).then((s) => (s ? merge(s, () => true) : null))));
      return mergeGeos(parts.filter((x): x is THREE.BufferGeometry => !!x));
    });
  } else if (kind === "part") {
    const [file, node] = id.split("/");
    p = Promise.all([loadGlb(`/pathways/${file}.glb`), partOffsets()]).then(([s, off]) => (s ? merge(s, (n) => n === node || n.startsWith(node + "_") || n.startsWith(node + "."), off[file]?.worldOffset) : null));
  } else if (kind === "b") {
    p = loadGlb("/pathways/v3/body.glb").then((s) => (s ? merge(s, (n) => n === id || n.startsWith(id + ".") || n.startsWith(id + "_")) : null));
  } else if (g?.kind === "nerve") {
    p = Promise.resolve(tubeGeometry(unflat(g.pts), g.r));
  } else if (g?.kind === "tube") {
    p = Promise.resolve(tubeGeometry(unflat(g.pts), g.r));
  } else if (g?.kind === "proxy") {
    p = Promise.resolve(ellipsoid(g.c, g.r));
  } else p = Promise.resolve(null);
  GEO.set(cacheKey, p);
  return p;
}
export async function carvedGeometry(mesh: HostKey, at: number[], r: number, geo: Record<string, V3Geo>) {
  const g = await hostGeometry(mesh, geo);
  return g ? carve(g, at, r) : null;
}
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of list) {
    const p = g.getAttribute("position");
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
/** A named object of a world-frame part file (spine bones, thorax organs ...), for the context layer. */
export function partObjects(file: string, match: (name: string) => boolean): Promise<THREE.BufferGeometry | null> {
  const key = `part-ctx:${file}:${match.toString()}`;
  let p = GEO.get(key);
  if (!p) {
    p = Promise.all([loadGlb(`/pathways/${file}.glb`), partOffsets()]).then(([s, off]) => (s ? merge(s, match, off[file]?.worldOffset) : null));
    GEO.set(key, p);
  }
  return p;
}
export function contextGeometry(): Promise<THREE.BufferGeometry | null> {
  const key = "ctx:brain";
  let p = GEO.get(key);
  if (!p) {
    p = atlasIndex().then((ix) => loadGlb(`/atlas/${ix.context.file}`)).then((s) => (s ? merge(s, () => true) : null));
    GEO.set(key, p);
  }
  return p;
}
export function bodyGeometry(node: string): Promise<THREE.BufferGeometry | null> {
  return hostGeometry(`b:${node}`, {});
}
export { hostParts };
export type { V3Data };
