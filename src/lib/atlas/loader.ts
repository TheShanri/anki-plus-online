import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { ATLAS_BASE } from "./index";

/**
 * Shared GLB cache (meshopt-compressed GLBs). Promises are cached by file path; callers get clones that share
 * geometry. Call retain()/release() around a viewer's lifetime: the last release disposes all cached geometry.
 */
let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<THREE.Group>>();
let refs = 0;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function retainAtlasCache() {
  refs++;
}

export function releaseAtlasCache() {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  for (const p of cache.values()) {
    p.then((g) =>
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
        }
      }),
    ).catch(() => {});
  }
  cache.clear();
}

/** Loads (once) and returns a fresh clone sharing geometry with the cached copy. */
export async function loadAtlasModel(file: string): Promise<THREE.Group> {
  let p = cache.get(file);
  if (!p) {
    p = getLoader()
      .loadAsync(`${ATLAS_BASE}/${file}`)
      .then((gltf) => gltf.scene);
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return (await p).clone(true);
}
