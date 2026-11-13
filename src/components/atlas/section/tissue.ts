import * as THREE from "three";
import { ATLAS_BASE } from "@/lib/atlas/index";

/**
 * The tissue volume behind every section face: the ICBM 2009b T1 template warped into the Z-Anatomy mesh space
 * (tools/atlas/section_volume.py), one byte per voxel. Dark = CSF (sulci, ventricles), grey = grey matter, light = white matter.
 * File: gzip( 64-byte header + uint8 voxels, x fastest ). Header: "ASEC", u16 nx ny nz pad, f32 origin xyz (m), f32 step (m),
 * f32 csf gm wm (intensity anchors, 0..1).
 */
export type TissueVolume = {
  texture: THREE.Data3DTexture;
  /** world position of the grid corner (voxel (0,0,0) centre minus half a voxel), metres */
  origin: THREE.Vector3;
  /** world size of the whole grid (n * step), metres */
  size: THREE.Vector3;
  anchors: { csf: number; gm: number; wm: number };
};

let pending: Promise<TissueVolume> | null = null;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) return buf; // already decoded by the server (Content-Encoding)
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

export function loadTissue(): Promise<TissueVolume> {
  if (pending) return pending;
  pending = (async () => {
    const res = await fetch(`${ATLAS_BASE}/section.bin.gz`);
    if (!res.ok) throw new Error(`section volume ${res.status}`);
    const raw = await gunzip(await res.arrayBuffer());
    const dv = new DataView(raw);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "ASEC") throw new Error("section volume: bad header");
    const nx = dv.getUint16(4, true);
    const ny = dv.getUint16(6, true);
    const nz = dv.getUint16(8, true);
    const f = (o: number) => dv.getFloat32(o, true);
    const step = f(24);
    const origin = new THREE.Vector3(f(12), f(16), f(20)).subScalar(step / 2);
    const anchors = { csf: f(28), gm: f(32), wm: f(36) };
    const data = new Uint8Array(raw, 64, nx * ny * nz);
    const texture = new THREE.Data3DTexture(data, nx, ny, nz);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return { texture, origin, size: new THREE.Vector3(nx, ny, nz).multiplyScalar(step), anchors };
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
