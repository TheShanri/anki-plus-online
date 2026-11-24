import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* Data of the v3 atlas (public/atlas3, built by tools/atlas3): the label table and the patch network (shell = the brain
 * seen from outside, inner = every interface inside it). World frame: metres, X = patient's left, Y = up, Z = anterior,
 * origin at the anterior commissure (MNI 0,0,0). */

export const ATLAS3_BASE = "/atlas3";

export type Tissue = "ctx" | "gm" | "wm" | "tract" | "csf" | "plx" | "cbx" | "bs" | "nrv";
export interface Label3 {
  id: number;
  key: string;
  side: "L" | "R" | "M";
  name: string;
  tissue: Tissue;
  quality: "exact" | "derived" | "regional";
  src: string;
  course: string[];
  /** world metres */
  centroid: [number, number, number] | null;
  bbox: [[number, number, number], [number, number, number]] | null;
  /** a point on the structure's visible outside surface (for a label pin), else null */
  anchor: [number, number, number] | null;
  /** plane positions (world metres) through the largest cross-section, per axis */
  cut: { x: number; y: number; z: number } | null;
  exterior: boolean;
  /** share of the boundary area that faces the outside */
  extFrac: number;
  /** volume, mm3 */
  vol: number;
  /** boundary area, mm2 */
  area: number;
  /** visible pixels of its outside surface per standard view (1 px = 0.1526 mm2) */
  vis: Partial<Record<string, number>>;
  /** outline group: cut-face borders are drawn only between labels of different groups */
  og: number;
}
export interface Sulcus3 {
  id: number;
  key: string;
  name: string;
  course: string | null;
}
export interface Area3 {
  bit: number;
  key: string;
  name: string;
  course: string;
  side: "L" | "LR";
}
export interface Index3 {
  version: string;
  labels: Label3[];
  sulci: Sulcus3[];
  areas: Area3[];
  /** group key -> leaf ids */
  groups: Record<string, { name: string; ids: number[] }>;
  credits: string[];
}

let indexP: Promise<Index3> | null = null;
export function loadIndex3(): Promise<Index3> {
  if (!indexP) {
    indexP = fetch(`${ATLAS3_BASE}/index.json`).then((r) => {
      if (!r.ok) throw new Error(`atlas3 index: HTTP ${r.status}`);
      return r.json() as Promise<Index3>;
    });
    indexP.catch(() => (indexP = null));
  }
  return indexP;
}

let loader: GLTFLoader | null = null;
const geos = new Map<string, Promise<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>>();
export type Prog = { loaded: number; total: number };

/** The copies in the Pathway tracer's frame (Blood supply) and where the files live. */
export type PatchName = "shell" | "inner" | "hull" | "shell_f" | "inner_f" | "hull_f";
const PATCH_URL: Partial<Record<PatchName, string>> = { hull_f: "/pathways/v3/brain3-hull.glb" };
/** The outside surface's normals, welded across structures: each point's normal is the mean of the outside faces around
 * it, whatever structure they belong to. (The baked normal of a region bends at its border with a neighbour on the
 * surface, where the wall between the two pulls it inward: the pyramids and the nerve roots came out with dark,
 * jagged spikes along every border.) Positions are quantised integers: border copies of a point are equal. */
export function weldOutsideNormals(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute("position");
  const idx = g.getIndex();
  if (!pos || !idx) return;
  const n = pos.count;
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    X[i] = pos.getX(i);
    Y[i] = pos.getY(i);
    Z[i] = pos.getZ(i);
  }
  // point identity: the quantised position (to 1e-6 of the unit: exact for the stored integers)
  const slot = new Int32Array(n);
  const ids = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(X[i] * 1e6)},${Math.round(Y[i] * 1e6)},${Math.round(Z[i] * 1e6)}`;
    let s = ids.get(k);
    if (s === undefined) {
      s = ids.size;
      ids.set(k, s);
    }
    slot[i] = s;
  }
  const acc = new Float64Array(ids.size * 3);
  const ix = idx.array;
  for (let t = 0; t < idx.count; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const ux = X[b] - X[a], uy = Y[b] - Y[a], uz = Z[b] - Z[a];
    const vx = X[c] - X[a], vy = Y[c] - Y[a], vz = Z[c] - Z[a];
    // area-weighted face normal (the outside surface's faces all point out of the brain)
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      const s = slot[v] * 3;
      acc[s] += nx;
      acc[s + 1] += ny;
      acc[s + 2] += nz;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = slot[i] * 3;
    const l = Math.hypot(acc[s], acc[s + 1], acc[s + 2]) || 1;
    out[i * 3] = acc[s] / l;
    out[i * 3 + 1] = acc[s + 1] / l;
    out[i * 3 + 2] = acc[s + 2] / l;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(out, 3));
}

/** The patch geometry of one file with the node transform that de-quantises it. Cached for the page's lifetime. */
export function loadPatches(name: PatchName, onProgress?: (p: Prog) => void) {
  let p = geos.get(name);
  if (!p) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    p = loader
      .loadAsync(PATCH_URL[name] ?? `${ATLAS3_BASE}/${name}.glb`, (e) => onProgress?.({ loaded: e.loaded, total: e.lengthComputable ? e.total : e.loaded }))
      .then((gltf) => {
        let mesh: THREE.Mesh | null = null;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
        });
        if (!mesh) throw new Error(`atlas3 ${name}: no mesh`);
        const m = mesh as THREE.Mesh;
        if (name === "shell" || name === "shell_f") weldOutsideNormals(m.geometry);
        return { geometry: m.geometry, matrix: m.matrixWorld.clone() };
      });
    p.catch(() => geos.delete(name));
    geos.set(name, p);
  }
  return p;
}

export type Vessel3 = { key: string; name: string; kind: "artery" | "sinus"; box: [[number, number, number], [number, number, number]] };
export type BodyPart3 = { key: string; name: string; kind: string; group: string; side: string; box: [[number, number, number], [number, number, number]]; src: string; approx?: boolean };
let bodyP: Promise<{ meta: BodyPart3[]; meshes: Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> }> | null = null;
/** The body layer around the brain (skull, meninges, spine and cord, eye, ear, nose; one mesh per part, by key), loaded once. */
export function loadBody() {
  if (!bodyP) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const l = loader;
    bodyP = Promise.all([
      fetch(`${ATLAS3_BASE}/body.json`).then((r) => r.json() as Promise<{ parts: BodyPart3[] }>),
      l.loadAsync(`${ATLAS3_BASE}/body.glb`),
    ]).then(([meta, gltf]) => {
      gltf.scene.updateMatrixWorld(true);
      // node names come back sanitised by the loader ("parietal-bone.L" -> "parietal-bone_L")
      const keyOf = new Map(meta.parts.map((p) => [THREE.PropertyBinding.sanitizeNodeName(p.key), p.key]));
      const meshes = new Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        let n: THREE.Object3D | null = m;
        while (n && !keyOf.has(n.name)) n = n.parent;
        const key = n ? keyOf.get(n.name)! : m.name;
        if (!m.geometry.getAttribute("normal")) m.geometry.computeVertexNormals();
        meshes.set(key, { geometry: m.geometry, matrix: m.matrixWorld.clone() });
      });
      return { meta: meta.parts, meshes };
    });
    bodyP.catch(() => (bodyP = null));
  }
  return bodyP;
}
let vesselsP: Promise<{ meta: Vessel3[]; meshes: Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> }> | null = null;
/** The arteries and sinuses (one mesh per vessel, by key), loaded once. */
export function loadVessels() {
  if (!vesselsP) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const l = loader;
    vesselsP = Promise.all([
      fetch(`${ATLAS3_BASE}/vessels.json`).then((r) => r.json() as Promise<{ vessels: Vessel3[] }>),
      l.loadAsync(`${ATLAS3_BASE}/vessels.glb`),
    ]).then(([meta, gltf]) => {
      gltf.scene.updateMatrixWorld(true);
      const meshes = new Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // the node is named by the vessel key (the mesh inside may carry the same name or a suffix)
        let n: THREE.Object3D | null = m;
        while (n && !meta.vessels.some((v) => v.key === n!.name)) n = n.parent;
        const key = n?.name ?? m.name;
        if (!m.geometry.getAttribute("normal")) m.geometry.computeVertexNormals();
        meshes.set(key, { geometry: m.geometry, matrix: m.matrixWorld.clone() });
      });
      return { meta: meta.vessels, meshes };
    });
    vesselsP.catch(() => (vesselsP = null));
  }
  return vesselsP;
}

/** Per-label render state, mirrored into the shader's state texture. */
export class LabelState {
  readonly n: number;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  constructor(tex: THREE.DataTexture) {
    this.tex = tex;
    this.n = tex.image.width;
    this.data = tex.image.data as Uint8Array;
  }
  private i(id: number, row: number) {
    return (row * this.n + id) * 4;
  }
  visible(id: number) {
    return this.data[this.i(id, 0) + 3] > 127;
  }
  setVisible(id: number, v: boolean) {
    this.data[this.i(id, 0) + 3] = v ? 255 : 0;
  }
  /** colours are display (sRGB) hex strings, e.g. "#d9b3a8" */
  setSurface(id: number, hex: string) {
    this.put(this.i(id, 0), hex, -1);
  }
  setCap(id: number, hex: string) {
    this.put(this.i(id, 1), hex, 255);
  }
  setTint(id: number, hex: string | null, a = 0) {
    const k = this.i(id, 2);
    if (!hex) {
      this.data[k + 3] = 0;
      return;
    }
    this.put(k, hex, Math.round(Math.max(0, Math.min(1, a)) * 255));
  }
  private put(k: number, hex: string, alpha: number) {
    const v = parseInt(hex.replace("#", ""), 16);
    this.data[k] = (v >> 16) & 255;
    this.data[k + 1] = (v >> 8) & 255;
    this.data[k + 2] = v & 255;
    if (alpha >= 0) this.data[k + 3] = alpha;
  }
  /** the selection (row 3 red): where a cut removes it, it is drawn as a faint veil */
  setSel(id: number, on: boolean) {
    this.data[this.i(id, 3)] = on ? 255 : 0;
  }
  /** a hollow space (row 3 green): a see-through cast from outside, its lining from inside */
  setHollow(id: number, on: boolean) {
    this.data[this.i(id, 3) + 1] = on ? 255 : 0;
  }
  /** 0 none; else the ghost class (1 tissue, 2 fluid): borders between ghosted labels of one class are not drawn */
  setGhost(id: number, cls: number) {
    this.data[this.i(id, 3) + 3] = cls;
  }
  commit() {
    this.tex.needsUpdate = true;
  }
}
