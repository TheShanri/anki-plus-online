import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* Data of the v3 atlas (public/atlas3, built by tools/atlas3): the label table and the patch network (shell = the brain
 * seen from outside, inner = every interface inside it). World frame: metres, X = patient's left, Y = up, Z = anterior,
 * origin at the anterior commissure (MNI 0,0,0). */

export const ATLAS3_BASE = "/atlas3";

export type Tissue = "ctx" | "gm" | "wm" | "tract" | "csf" | "plx" | "cbx" | "bs";
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

/** The patch geometry of one file with the node transform that de-quantises it. Cached for the page's lifetime. */
export function loadPatches(name: "shell" | "inner" | "hull", onProgress?: (p: Prog) => void) {
  let p = geos.get(name);
  if (!p) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    p = loader
      .loadAsync(`${ATLAS3_BASE}/${name}.glb`, (e) => onProgress?.({ loaded: e.loaded, total: e.lengthComputable ? e.total : e.loaded }))
      .then((gltf) => {
        let mesh: THREE.Mesh | null = null;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
        });
        if (!mesh) throw new Error(`atlas3 ${name}: no mesh`);
        const m = mesh as THREE.Mesh;
        return { geometry: m.geometry, matrix: m.matrixWorld.clone() };
      });
    p.catch(() => geos.delete(name));
    geos.set(name, p);
  }
  return p;
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
  /** 0 none; else the ghost class (1 tissue, 2 fluid): borders between ghosted labels of one class are not drawn */
  setGhost(id: number, cls: number) {
    this.data[this.i(id, 3) + 3] = cls;
  }
  commit() {
    this.tex.needsUpdate = true;
  }
}
