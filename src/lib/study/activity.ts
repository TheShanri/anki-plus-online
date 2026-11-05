"use client";
// Client-side time-on-task bookkeeping shared by the ActivityTracker (layout) and the study screens.
// One study_sessions row per (kind, sitting); the id is chosen here, rows are created by the heartbeat RPC.
export type ActivityKind = "study" | "practical" | "atlas" | "browse";

const GAP_MS = 30 * 60_000; // a new sitting after 30 idle minutes
const sessions: Partial<Record<ActivityKind, { id: string; last: number }>> = {};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

/** The current session id for a kind (created on first use, renewed after a long gap). */
export function sessionIdFor(kind: ActivityKind): string {
  const now = Date.now();
  const s = sessions[kind];
  if (s && now - s.last < GAP_MS) {
    s.last = now;
    return s.id;
  }
  const fresh = { id: uuid(), last: now };
  sessions[kind] = fresh;
  return fresh.id;
}

export function kindForPath(path: string): ActivityKind {
  if (path === "/study" || path.startsWith("/study/")) return "study";
  if (path === "/practical" || path.startsWith("/practical/")) return "practical";
  if (path === "/atlas" || path.startsWith("/atlas/")) return "atlas";
  return "browse";
}

export interface ActivityLike {
  /** accumulated, unsent active milliseconds */
  pending: number;
}

/** True when this much idle time still counts as active (the tracker's 60 s rule). */
export const ACTIVE_WINDOW_MS = 60_000;

export function countsAsActive(visible: boolean, sinceInputMs: number): boolean {
  return visible && sinceInputMs <= ACTIVE_WINDOW_MS;
}
