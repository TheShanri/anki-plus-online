import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Stylised, low-poly sensory endings (procedural, one merged geometry each). Unit size ~1 (height along +y, the tip of
 * the ending toward +y, the axon leaving toward -y). Only endings the course names: Meissner, Merkel, Pacinian,
 * Ruffini, free nerve endings, muscle spindle, Golgi tendon organ (course pathway cards, theory and practical cards). */

import { RECEPTORS, type ReceptorId } from "./receptorInfo";
export { RECEPTORS };
export type { ReceptorId };

const flat = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
  return n;
};
const place = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return flat(g);
};
const sph = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => place(new THREE.SphereGeometry(0.5, 10, 7), x, y, z, sx, sy, sz);
const cyl = (x: number, y: number, z: number, r: number, h: number, rx = 0, rz = 0) => place(new THREE.CylinderGeometry(r, r, h, 6), x, y, z, 1, 1, 1, rx, rz);
const tube = (pts: [number, number, number][], r: number) =>
  flat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 14, r, 5, false));

function meissner() {
  // a stack of flattened lobules inside a dermal papilla, one axon winding between them
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) parts.push(sph(0, 0.18 + i * 0.13, 0, 0.5 - Math.abs(i - 2) * 0.04, 0.11, 0.5 - Math.abs(i - 2) * 0.04));
  parts.push(tube([[0, -0.5, 0], [0.12, 0, 0.04], [-0.12, 0.3, -0.04], [0.1, 0.55, 0.02], [0, 0.78, 0]], 0.025));
  parts.push(cyl(0, -0.25, 0, 0.03, 0.5));
  return mergeGeometries(parts)!;
}
function merkel() {
  // a flat Merkel cell on the epidermis base with the expanded axon terminal disc below it
  return mergeGeometries([sph(0, 0.55, 0, 0.5, 0.26, 0.5), place(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 10), 0, 0.3, 0), cyl(0, -0.1, 0, 0.03, 0.8)])!;
}
function pacinian() {
  // onion: a lathe whose radius ripples into concentric lamellae, with the axon along the core
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const base = Math.sin(t * Math.PI);
    const ripple = 1 + 0.1 * Math.sin(t * 52);
    prof.push(new THREE.Vector2(Math.max(0.001, 0.4 * base * ripple), -0.5 + t * 1.0));
  }
  const body = flat(new THREE.LatheGeometry(prof, 12));
  return mergeGeometries([body, cyl(0, -0.62, 0, 0.03, 0.28)])!;
}
function ruffini() {
  // an elongated capsule with branching fibres ending inside it
  const parts: THREE.BufferGeometry[] = [sph(0, 0.1, 0, 0.3, 1.0, 0.3), tube([[0, -0.4, 0], [0, -0.1, 0]], 0.03)];
  for (const a of [-0.5, 0, 0.5]) parts.push(cyl(a * 0.14, 0.12 + a * 0.15, 0, 0.018, 0.55, 0, a * 0.7));
  return mergeGeometries(parts)!;
}
function free() {
  // bare branching tips with small terminal swellings
  const parts: THREE.BufferGeometry[] = [cyl(0, -0.25, 0, 0.03, 0.5)];
  const tips: [number, number][] = [[-0.3, 0.7], [-0.12, 0.85], [0.12, 0.85], [0.3, 0.7], [0, 0.95]];
  for (const [x, y] of tips) {
    parts.push(tube([[0, 0, 0], [x * 0.5, y * 0.55, 0], [x, y, 0]], 0.024));
    parts.push(sph(x, y + 0.03, 0, 0.1, 0.1, 0.1));
  }
  return mergeGeometries(parts)!;
}
function spindle() {
  // fusiform capsule lying along x with the sensory wrap coiled round its middle
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const a = t * Math.PI * 6;
    pts.push([-0.28 + t * 0.56, Math.sin(a) * 0.17, Math.cos(a) * 0.17]);
  }
  return mergeGeometries([sph(0, 0, 0, 1.0, 0.24, 0.24), tube(pts, 0.022), tube([[0, 0.12, 0], [0, 0.45, 0.05], [0.12, 0.8, 0]], 0.025)])!;
}
function gto() {
  // tendon fibres entering a small capsule, the afferent fibre weaving between the collagen strands
  const parts: THREE.BufferGeometry[] = [cyl(0, -0.45, 0, 0.1, 0.5), sph(0, 0.05, 0, 0.36, 0.6, 0.36)];
  for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) parts.push(cyl(x * 0.9, 0.0, 0, 0.022, 0.62, 0, -x * 0.5));
  parts.push(tube([[0, 0.3, 0], [0.18, 0.6, 0.04], [0.1, 0.9, 0]], 0.025));
  return mergeGeometries(parts)!;
}

const BUILD: Record<ReceptorId, () => THREE.BufferGeometry> = { meissner, merkel, pacinian, ruffini, free, spindle, gto };
const CACHE = new Map<ReceptorId, THREE.BufferGeometry>();
/** One shared merged geometry per receptor type (disposed with the page, tiny). */
export function receptorGeometry(id: ReceptorId): THREE.BufferGeometry {
  let g = CACHE.get(id);
  if (!g) {
    g = BUILD[id]();
    g.computeVertexNormals();
    CACHE.set(id, g);
  }
  return g;
}
