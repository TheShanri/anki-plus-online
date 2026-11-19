"use client";
// Client cache of the brainstem plates (fetched from the auth-gated plate route once per session).
import type { PlateData } from "./types";

const cache = new Map<string, PlateData | "missing">();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Levels whose last load failed for a passing reason (network, server, an expired session): retried on the next visit. */
const transient = new Set<string>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPlate(level: string): Promise<PlateData | "missing"> {
  // a passing failure (network, 5xx, 401 while the session refreshes) is retried twice before the stage says so
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`/api/atlas/brainstem/plate/${encodeURIComponent(level)}`, { cache: attempt ? "no-store" : "default" });
      if (r.ok) {
        transient.delete(level);
        return (await r.json()) as PlateData;
      }
      if (r.status === 404 || r.status === 403 || attempt >= 2) {
        if (r.status !== 404) transient.add(level);
        return "missing";
      }
    } catch {
      if (attempt >= 2) {
        transient.add(level);
        return "missing";
      }
    }
    await wait(500 * (attempt + 1));
  }
}

export function loadPlate(level: string): Promise<void> {
  if (cache.has(level) && !transient.has(level)) return Promise.resolve();
  let p = inflight.get(level);
  if (!p) {
    p = fetchPlate(level)
      .then((v) => {
        cache.set(level, v);
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
