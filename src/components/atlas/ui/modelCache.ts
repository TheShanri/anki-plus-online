import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { ATLAS_BASE, loadAtlasIndex } from "@/lib/atlas";

/**
 * Persistent model cache for the 3D atlas. Unlike src/lib/atlas/loader.ts it is never disposed when a viewer unmounts, so
 * switching between atlas modes (each mounts its own Canvas) re-uses the parsed meshes and their GPU buffers instead of
 * fetching and parsing gross.glb again. Callers get clones that share geometry.
 */
let loader: GLTFLoader | null = null;
const models = new Map<string, Promise<THREE.Group>>();
export type Prog = { loaded: number; total: number };
const progress = new Map<string, Prog>();
const done = new Set<string>();
const listeners = new Map<string, Set<(p: Prog) => void>>();

/** Compressed sizes of the big files (bytes), used when the server does not send a Content-Length. */
const KNOWN: Record<string, number> = { "gross.glb": 1338468, "context.glb": 540752 };

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function loadAtlasModel(file: string, onProgress?: (p: Prog) => void): Promise<THREE.Group> {
  if (onProgress) {
    let set = listeners.get(file);
    if (!set) listeners.set(file, (set = new Set()));
    set.add(onProgress);
    const cur = progress.get(file);
    if (cur) onProgress(cur);
  }
  let p = models.get(file);
  if (!p) {
    p = getLoader()
      .loadAsync(`${ATLAS_BASE}/${file}`, (e) => {
        const total = e.lengthComputable && e.total > 0 ? e.total : (KNOWN[file] ?? 0);
        const pr = { loaded: e.loaded, total: Math.max(total, e.loaded) };
        progress.set(file, pr);
        listeners.get(file)?.forEach((f) => f(pr));
      })
      .then((gltf) => {
        done.add(file);
        const t = progress.get(file)?.total ?? KNOWN[file] ?? 1;
        const pr = { loaded: t, total: t };
        progress.set(file, pr);
        listeners.get(file)?.forEach((f) => f(pr));
        return gltf.scene;
      });
    p.catch(() => {
      models.delete(file);
      done.delete(file);
    });
    models.set(file, p);
  }
  return p.then((g) => g.clone(true));
}

/** Warm the index and the two big models while the page is idle (called as soon as any atlas route is visited). */
export function preloadAtlas() {
  if (typeof window === "undefined") return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const go = () => {
    loadAtlasIndex().catch(() => undefined);
    loadAtlasModel("gross.glb").catch(() => undefined);
    loadAtlasModel("context.glb").catch(() => undefined);
  };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1500 });
  else window.setTimeout(go, 300);
}

export const isModelCached = (file: string) => done.has(file);

const warmedUrls = new Set<string>();
/** Streams files once (so the browser cache holds them) and reports combined bytes; later loads of the same URLs are instant. */
export async function prefetchWithProgress(urls: string[], onProgress: (p: Prog) => void): Promise<void> {
  const state = urls.map(() => ({ loaded: 0, total: 0 }));
  const emit = () => onProgress({ loaded: state.reduce((a, s) => a + s.loaded, 0), total: Math.max(1, state.reduce((a, s) => a + Math.max(s.total, s.loaded), 0)) });
  await Promise.all(
    urls.map(async (u, i) => {
      if (warmedUrls.has(u)) {
        state[i] = { loaded: 1, total: 1 };
        return;
      }
      const r = await fetch(u);
      state[i].total = Number(r.headers.get("content-length")) || 0;
      if (!r.body) {
        await r.arrayBuffer();
      } else {
        const rd = r.body.getReader();
        for (;;) {
          const { done: d, value } = await rd.read();
          if (d) break;
          state[i].loaded += value.length;
          emit();
        }
      }
      state[i].total = state[i].loaded;
      warmedUrls.add(u);
      emit();
    }),
  );
  emit();
}
