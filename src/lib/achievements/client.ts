// Browser side of atlas progress: listens for trackAtlas() events, keeps them in a localStorage queue, and sends them to
// /api/atlas/progress in batches (debounced, with sendBeacon when the page hides). Every event carries a unique id, so a
// batch that is sent twice (beacon, then retry) is applied once by the server.
import { ATLAS_PROGRESS_EVENT, type AtlasEventDetail } from "../atlas/progress.ts";
import type { Summary } from "./engine.ts";
import type { PostResult } from "./payload.ts";

type QItem = AtlasEventDetail & { id: string };

const QUEUE_KEY = "anki.atlasQueue.v1";
const MAX_QUEUE = 500;
const BATCH = 100;
const DEBOUNCE_MS = 2000;
const RETRY_MS = 20_000;

// ------------------------------------------------------------------------------------------------ queue
let memQueue: QItem[] = [];

function readQueue(): QItem[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (raw) {
      const q = JSON.parse(raw);
      if (Array.isArray(q)) return q as QItem[];
    }
  } catch {
    /* storage blocked: fall back to memory */
  }
  return memQueue;
}
function writeQueue(q: QItem[]): void {
  memQueue = q;
  try {
    if (q.length) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

// ------------------------------------------------------------------------------------------------ shared state
type Listener = () => void;
let summary: Summary | null = null;
const summaryListeners = new Set<Listener>();
const resultListeners = new Set<(r: PostResult) => void>();

export function getSummary(): Summary | null {
  return summary;
}
export function setSummary(s: Summary): void {
  summary = s;
  summaryListeners.forEach((l) => l());
}
export function subscribeSummary(l: Listener): () => void {
  summaryListeners.add(l);
  return () => summaryListeners.delete(l);
}
export function onPostResult(cb: (r: PostResult) => void): () => void {
  resultListeners.add(cb);
  return () => resultListeners.delete(cb);
}

let refreshing = false;
/** Fetch the XP / rank / streak summary for the chip (lite: no collection). */
export async function refreshSummary(): Promise<void> {
  if (refreshing || authFailed) return;
  refreshing = true;
  try {
    const r = await fetch(`/api/atlas/progress?lite=1&tz=${new Date().getTimezoneOffset()}`, { cache: "no-store" });
    if (r.status === 401 || r.status === 403) authFailed = true;
    else if (r.ok) setSummary(((await r.json()) as { summary: Summary }).summary);
  } catch {
    /* offline */
  } finally {
    refreshing = false;
  }
}

// ------------------------------------------------------------------------------------------------ sending
let authFailed = false;
let inflight = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
}

export async function flush(): Promise<void> {
  if (inflight || authFailed) return;
  const q = readQueue();
  if (!q.length) return;
  const batch = q.slice(0, BATCH);
  inflight = true;
  try {
    const res = await fetch("/api/atlas/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch, tz: new Date().getTimezoneOffset() }),
      keepalive: true,
    });
    if (res.status === 401 || res.status === 403) {
      authFailed = true; // signed out: keep the queue for the next sign-in, stop trying this session
      return;
    }
    if (res.ok || res.status === 400) {
      const sent = new Set(batch.map((b) => b.id));
      writeQueue(readQueue().filter((x) => !sent.has(x.id)));
      if (res.ok) {
        const r = (await res.json()) as PostResult;
        setSummary(r.summary);
        resultListeners.forEach((l) => l(r));
      }
      if (readQueue().length) schedule(300);
    } else {
      schedule(RETRY_MS);
    }
  } catch {
    schedule(RETRY_MS); // offline: the queue stays, try again later
  } finally {
    inflight = false;
  }
}

function beacon(): void {
  if (authFailed) return;
  const q = readQueue();
  if (!q.length || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    // The queue is not cleared: the server de-duplicates by event id, so the next load can safely re-send.
    navigator.sendBeacon("/api/atlas/progress", new Blob([JSON.stringify({ events: q.slice(0, BATCH), tz: new Date().getTimezoneOffset() })], { type: "application/json" }));
  } catch {
    /* ignore */
  }
}

/** Attach the listener. Returns the cleanup. */
export function startProgressListener(): () => void {
  const onEvent = (ev: Event) => {
    const d = (ev as CustomEvent<AtlasEventDetail>).detail;
    if (!d || typeof d.type !== "string") return;
    const q = readQueue().slice(-(MAX_QUEUE - 1));
    q.push({ ...d, id: newId() });
    writeQueue(q);
    schedule(DEBOUNCE_MS);
  };
  const onHide = () => {
    if (document.visibilityState === "hidden") beacon();
  };
  const onOnline = () => {
    authFailed = false;
    void flush();
  };
  window.addEventListener(ATLAS_PROGRESS_EVENT, onEvent);
  window.addEventListener("pagehide", beacon);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("online", onOnline);
  if (readQueue().length) schedule(1500); // events left from a previous visit
  return () => {
    window.removeEventListener(ATLAS_PROGRESS_EVENT, onEvent);
    window.removeEventListener("pagehide", beacon);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("online", onOnline);
    if (timer) clearTimeout(timer);
  };
}
