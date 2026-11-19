import * as THREE from "three";
import { ATLAS_BASE } from "@/lib/atlas/index";
import { INTERIOR_VERSION } from "./interior-version";

/**
 * The labelled interior of the brain (tools/atlas/interior_labels.py): one 0.5 mm label volume in the Z-Anatomy mesh space,
 * built from the Allen Human Reference Atlas 3D (CC BY 4.0) plus documented derived structures. It drives the cut faces
 * (shader.ts), hover / click on a cut, the section key and the structure-only cut, so they all name the same region.
 *
 * Voxels (RG8): R = label index, G = smooth boundary value m (0 on a border, 1 deep inside; the shader rebuilds each border
 * as a smooth curve from the 8 nearest voxels). File: gzip( 64-byte header + RG voxels, x fastest ). Header "AIL1",
 * u16 nx ny nz nlab, f32 corner xyz (m), f32 step (m). Table: public/atlas/interior.json.
 */
export type LabelClass = "ctx" | "wm" | "cb" | "g" | "w" | "csf" | "plx";
export type LabelRow = {
  i: number;
  key: string;
  name: string;
  slug: string | null;
  /** atlas (index.json) ids, most specific first: [0] is what a click selects; any of them highlights the label */
  ids: string[];
  cls: LabelClass;
  /** -0.3 (darker than cortex) .. 0 grey .. 1 white */
  tone: number;
  grp: number;
  sub: number;
  vox: number;
  centroid?: [number, number, number];
  min?: [number, number, number];
  max?: [number, number, number];
  /** plane position (world, per axis x y z) through the label's largest cross-section */
  best?: [number, number, number];
};
export type Interior = {
  vol: THREE.Data3DTexture;
  pal: THREE.DataTexture;
  data: Uint8Array;
  dims: [number, number, number];
  corner: THREE.Vector3;
  step: number;
  size: THREE.Vector3;
  rows: LabelRow[];
  byI: (LabelRow | undefined)[];
  fileBytes: number;
};

const CLASS_CODE: Record<LabelClass, number> = { ctx: 1, wm: 2, cb: 3, g: 4, w: 5, csf: 6, plx: 7 };
export const isField = (r: LabelRow | undefined) => !r || r.cls === "ctx" || r.cls === "wm" || r.cls === "cb";

/**
 * Fibre direction (world: x left, y up, z anterior) and striation strength of the tracts whose course the atlas fixes, for the
 * section texture: the callosum and the commissures cross the midline, the fornix arches, the capsule, crus and pyramids
 * descend, the middle cerebellar peduncle and the pontine transverse fibres run laterally.
 */
const FIBRES: Record<string, [number, number, number, number]> = {
  CCg: [1, 0, 0, 1], CCb: [1, 0, 0, 1], CCs: [1, 0, 0, 1], ac: [1, 0, 0.15, 1], PC: [1, 0, 0, 1], OCh: [1, 0, 0.3, 0.9], ot: [0.6, 0, -0.8, 0.9],
  FXc: [0, 1, 0.35, 1], FXb: [0, 0.15, 1, 1], FXr: [0.3, 0.7, -0.6, 1], mtt: [0, 1, 0.4, 0.8], olt: [0, 0, 1, 0.8],
  ICa: [0.25, 0.7, 0.65, 1], ICg: [0.2, 1, 0.2, 1], ICp: [0.2, 1, -0.25, 1], EC: [0, 1, 0, 0.8], ExC: [0, 1, 0, 0.8],
  cpd: [0, 1, 0.35, 1], MoPy: [0, 1, 0.15, 1], scp: [0, 0.6, -0.8, 0.9], mcp: [1, 0, -0.2, 0.9], icp: [0, 0.8, -0.5, 0.9],
  ML: [0, 1, 0.1, 0.6], MLF: [0, 1, 0.1, 0.6], BSW: [0, 1, 0.1, 0.5], PnBa: [1, 0, 0, 0.55], SP: [0, 1, 0, 0.3],
};

let pending: Promise<Interior> | null = null;
let current: Interior | null = null;
export const interiorNow = () => current;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf;
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

export function loadInterior(): Promise<Interior> {
  if (pending) return pending;
  pending = (async () => {
    const [res, meta] = await Promise.all([
      fetch(`${ATLAS_BASE}/interior.bin.gz?v=${INTERIOR_VERSION}`),
      fetch(`${ATLAS_BASE}/interior.json?v=${INTERIOR_VERSION}`).then((r) => {
        if (!r.ok) throw new Error(`interior table ${r.status}`);
        return r.json() as Promise<{ labels: LabelRow[] }>;
      }),
    ]);
    if (!res.ok) throw new Error(`interior volume ${res.status}`);
    const gz = await res.arrayBuffer();
    const raw = await gunzip(gz);
    const dv = new DataView(raw);
    if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== "AIL1") throw new Error("interior volume: bad header");
    const [nx, ny, nz] = [4, 6, 8].map((o) => dv.getUint16(o, true));
    const corner = new THREE.Vector3(dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true));
    const step = dv.getFloat32(24, true);
    const data = new Uint8Array(raw, 64, nx * ny * nz * 2);
    const vol = new THREE.Data3DTexture(data, nx, ny, nz);
    vol.format = THREE.RGFormat;
    vol.type = THREE.UnsignedByteType;
    vol.minFilter = vol.magFilter = THREE.NearestFilter;
    vol.wrapS = vol.wrapT = vol.wrapR = THREE.ClampToEdgeWrapping;
    vol.unpackAlignment = 1;
    vol.generateMipmaps = false;
    vol.needsUpdate = true;
    const rows = meta.labels;
    const byI: (LabelRow | undefined)[] = [];
    for (const r of rows) byI[r.i] = r;
    const palData = new Uint8Array(256 * 3 * 4);
    for (const r of rows) {
      const o = r.i * 4;
      palData[o] = Math.round(THREE.MathUtils.clamp((r.tone + 0.3) / 1.3, 0, 1) * 255);
      palData[o + 1] = CLASS_CODE[r.cls];
      palData[o + 2] = r.grp;
      palData[o + 3] = Math.round(r.sub * 255);
      const f = FIBRES[r.key];
      if (f) {
        const v = new THREE.Vector3(f[0], f[1], f[2]).normalize();
        const q = (256 * 2 + r.i) * 4;
        palData[q] = Math.round((v.x * 0.5 + 0.5) * 255);
        palData[q + 1] = Math.round((v.y * 0.5 + 0.5) * 255);
        palData[q + 2] = Math.round((v.z * 0.5 + 0.5) * 255);
        palData[q + 3] = Math.round(f[3] * 255);
      }
    }
    const pal = new THREE.DataTexture(palData, 256, 3, THREE.RGBAFormat, THREE.UnsignedByteType);
    pal.minFilter = pal.magFilter = THREE.NearestFilter;
    pal.needsUpdate = true;
    current = { vol, pal, data, dims: [nx, ny, nz], corner, step, size: new THREE.Vector3(nx, ny, nz).multiplyScalar(step), rows, byI, fileBytes: gz.byteLength };
    if (typeof window !== "undefined")
      (window as unknown as { __atlasInterior?: unknown }).__atlasInterior = { dims: [nx, ny, nz], labels: rows.length, fileBytes: gz.byteLength, gpuBytes: data.byteLength };
    return current;
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** Label index at a world point (nearest voxel), 0 outside the box or where nothing is labelled. */
export function labelIndexAt(p: THREE.Vector3, I: Interior | null = current): number {
  if (!I) return 0;
  const [nx, ny, nz] = I.dims;
  const i = Math.floor((p.x - I.corner.x) / I.step);
  const j = Math.floor((p.y - I.corner.y) / I.step);
  const k = Math.floor((p.z - I.corner.z) / I.step);
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
  const l = I.data[((k * ny + j) * nx + i) * 2];
  return l === canalOf(I)?.cec ? canalOf(I)!.moTg : l; // the central canal reads as the medulla (labelShader.ts, labCorner)
}
/** The central canal label (an oversized block in the source atlas) and the medullary tegmentum it is drawn as. */
const canalCache = new WeakMap<Interior, { cec: number; moTg: number } | null>();
function canalOf(I: Interior) {
  if (!canalCache.has(I)) {
    const cec = I.rows.find((r) => r.key === "cec")?.i, moTg = I.rows.find((r) => r.key === "MoTg")?.i;
    canalCache.set(I, cec !== undefined && moTg !== undefined ? { cec, moTg } : null);
  }
  return canalCache.get(I);
}

/** The labelled structure at a world point. */
export function labelAt(p: THREE.Vector3): LabelRow | null {
  return current?.byI[labelIndexAt(p)] ?? null;
}
