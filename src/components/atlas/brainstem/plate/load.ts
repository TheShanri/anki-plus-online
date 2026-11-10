"use client";
// Client cache of the brainstem plates (fetched from the auth-gated plate route once per session).
import type { PlateData } from "./types";

const cache = new Map<string, PlateData | "missing">();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function loadPlate(level: string): Promise<void> {
  if (cache.has(level)) return Promise.resolve();
  let p = inflight.get(level);
  if (!p) {
    p = fetch(`/api/atlas/brainstem/plate/${encodeURIComponent(level)}`)
      .then(async (r) => {
        cache.set(level, r.ok ? ((await r.json()) as PlateData) : "missing");
      })
      .catch(() => {
        cache.set(level, "missing");
      })
      .finally(() => {
        inflight.delete(level);
        for (const l of listeners) l();
      });
    inflight.set(level, p);
  }
  return p;
}

export function cachedPlate(level: string): PlateData | "missing" | null {
  return cache.get(level) ?? null;
}

/** Subscribe to plate loads (for useSyncExternalStore). */
export function subscribePlates(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
