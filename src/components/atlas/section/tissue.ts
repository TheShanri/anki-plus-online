import * as THREE from "three";
import { ATLAS_BASE } from "@/lib/atlas/index";
import { SECTION_VOLUME_VERSION } from "./version";

/**
 * The tissue behind every section face (tools/atlas/section_hires.py): the ICBM 2009b template's 0.5 mm T1/T2 contrast,
 * classified into CSF / grey / white matter and warped into the Z-Anatomy mesh space.
 * - field (0.5 mm, R8): s = 0.5 * p(grey) + p(white); CSF|grey is the s = 0.25 contour, grey|white the s = 0.75 contour.
 * - aux (1 mm, RGBA8, same box): R fixed-brain tone of labelled brainstem/diencephalon parts (0 grey .. 1 white), G its weight,
 *   B the midline-section mask, A the interhemispheric fissure.
 * File: gzip( 64-byte header + field (x fastest) + aux RGBA (x fastest) ). Header: "ASE2", u16 nx ny nz ax ay az, f32 corner xyz (m),
 * f32 field step, f32 aux step (m).
 */
export type TissueVolume = {
  field: THREE.Data3DTexture;
  aux: THREE.Data3DTexture;
  /** world position of the grid box corner, metres */
  origin: THREE.Vector3;
  /** world size of the box, metres */
  size: THREE.Vector3;
  /** field voxels per axis (for the tricubic filter) */
  dims: THREE.Vector3;
  /** bytes on the GPU (field + aux) and over the wire */
  gpuBytes: number;
  fileBytes: number;
};

let pending: Promise<TissueVolume> | null = null;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf; // already decoded by the server (Content-Encoding)
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

function tex(data: Uint8Array, nx: number, ny: number, nz: number, format: THREE.AnyPixelFormat) {
  const t = new THREE.Data3DTexture(data, nx, ny, nz);
  t.format = format;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function loadTissue(): Promise<TissueVolume> {
  if (pending) return pending;
  pending = (async () => {
    const t0 = performance.now();
    const res = await fetch(`${ATLAS_BASE}/section.bin.gz?v=${SECTION_VOLUME_VERSION}`);
    if (!res.ok) throw new Error(`section volume ${res.status}`);
    const gz = await res.arrayBuffer();
    const raw = await gunzip(gz);
    const dv = new DataView(raw);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "ASE2") throw new Error("section volume: bad header");
    const u16 = (o: number) => dv.getUint16(o, true);
    const f32 = (o: number) => dv.getFloat32(o, true);
    const [nx, ny, nz, ax, ay, az] = [4, 6, 8, 10, 12, 14].map(u16);
    const origin = new THREE.Vector3(f32(16), f32(20), f32(24));
    const step = f32(28);
    const nf = nx * ny * nz;
    const na = ax * ay * az * 4;
    const field = tex(new Uint8Array(raw, 64, nf), nx, ny, nz, THREE.RedFormat);
    const aux = tex(new Uint8Array(raw, 64 + nf, na), ax, ay, az, THREE.RGBAFormat);
    const vol: TissueVolume = {
      field,
      aux,
      origin,
      size: new THREE.Vector3(nx, ny, nz).multiplyScalar(step),
      dims: new THREE.Vector3(nx, ny, nz),
      gpuBytes: nf + na,
      fileBytes: gz.byteLength,
    };
    if (typeof window !== "undefined")
      (window as unknown as { __atlasSection?: unknown }).__atlasSection = { ms: Math.round(performance.now() - t0), gpuBytes: vol.gpuBytes, fileBytes: vol.fileBytes, field: [nx, ny, nz], aux: [ax, ay, az] };
    return vol;
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
