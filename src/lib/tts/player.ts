"use client";
// Tiny audio manager for pre-generated answer clips: one <audio> element, an in-memory LRU of clip blobs,
// CacheStorage for persistence, and a low-priority rolling prefetch. Never throws; a missing clip falls back
// to the browser voice (or silence).
import cfg from "./config.json";
import { clipHash } from "./hash";

const LRU_MAX = 40;
const CACHE = "tts-v1";
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${cfg.bucket}`;

const lru = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob | null>>();
const missing = new Set<string>();
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let ext: string | null | undefined;
let token = 0;

function format(): string | null {
  if (ext !== undefined) return ext;
  const a = document.createElement("audio");
  ext = cfg.formats.find((f) => a.canPlayType(f.mime) !== "")?.ext ?? null;
  return ext;
}

/** False when the student asked to save data or the connection is slow: then clips load only on demand. */
export function canPrefetch(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || (c?.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)));
}

function remember(key: string, blob: Blob) {
  lru.delete(key);
  lru.set(key, blob);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string);
}

async function load(text: string, priority: "low" | "auto"): Promise<Blob | null> {
  const f = format();
  if (!f || !text.trim()) return null;
  let key: string;
  try {
    key = await clipHash(text);
  } catch {
    return null;
  }
  if (missing.has(key)) return null;
  const hit = lru.get(key);
  if (hit) {
    remember(key, hit);
    return hit;
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const url = `${BASE}/${key}.${f}`;
  const job = (async () => {
    try {
      const cache = "caches" in window ? await caches.open(CACHE) : null;
      let res = (await cache?.match(url)) ?? null;
      if (!res) {
        res = await fetch(url, { priority } as RequestInit);
        if (!res.ok) {
          if (res.status === 404 || res.status === 400) missing.add(key);
          return null;
        }
        void cache?.put(url, res.clone()).catch(() => {});
      }
      const blob = await res.blob();
      remember(key, blob);
      return blob;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** Fetch clips ahead of time at low priority, during idle time. Skipped on data-saver or slow links. */
export function prefetch(texts: string[]): void {
  if (typeof window === "undefined" || !canPrefetch()) return;
  const run = () => {
    for (const t of texts) void load(t, "low");
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 1500 });
  else window.setTimeout(run, 200);
}

export function stop(): void {
  token++;
  audio?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function browserVoice(text: string): void {
  try {
    if (typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch {
    /* silent */
  }
}

/** Play the clip for `text`. Resolves once playback has started (or fallen back); never rejects. */
export async function speak(text: string, onState?: (s: "loading" | "playing" | "idle") => void): Promise<void> {
  if (typeof window === "undefined" || !text.trim()) return;
  const mine = ++token;
  audio?.pause();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  onState?.("loading");
  const blob = await load(text, "auto");
  if (mine !== token) return;
  if (!blob) {
    onState?.("idle");
    browserVoice(text);
    return;
  }
  try {
    audio ??= new Audio();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    audio.onended = audio.onpause = audio.onerror = () => onState?.("idle");
    await audio.play();
    onState?.("playing");
  } catch {
    onState?.("idle");
  }
}
