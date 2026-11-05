"use client";
// Time on task. Counts a second only while the tab is visible AND the user did something in the last 60 s.
// Accumulates locally (2 s ticks), flushes a batch every 30 s, and on hide / pagehide with sendBeacon.
// The server adds the batch to study_sessions.active_ms (engine_heartbeat), so it feeds the professor dashboard.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { countsAsActive, kindForPath, sessionIdFor, type ActivityKind } from "@/lib/study/activity";

const TICK_MS = 2000;
const FLUSH_MS = 30_000;
const ENDPOINT = "/api/study/heartbeat";

export function ActivityTracker({ courseId }: { courseId?: string | null }) {
  const pathname = usePathname();
  const kindRef = useRef<ActivityKind>(kindForPath(pathname));
  const pending = useRef(0);
  const lastInput = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const lastTick = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const course = useRef<string | null>(courseId ?? null);
  course.current = courseId ?? null;

  // a route change to another kind: flush what the old kind earned first
  useEffect(() => {
    const next = kindForPath(pathname);
    if (next !== kindRef.current) {
      flush(false);
      kindRef.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function flush(beacon: boolean) {
    const ms = Math.round(pending.current);
    if (ms < 1000) return;
    pending.current = 0;
    const kind = kindRef.current;
    const body = JSON.stringify({ sessionId: sessionIdFor(kind), courseId: course.current, kind, ms: Math.min(ms, 120_000) });
    try {
      if (beacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        // text/plain keeps the beacon a "simple" request (no CORS preflight); the route parses the text itself
        if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
      }
      void fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "text/plain" }, keepalive: true }).catch(() => {
        pending.current += ms; // try again with the next batch
      });
    } catch {
      pending.current += ms;
    }
  }

  useEffect(() => {
    const mark = () => {
      lastInput.current = performance.now();
    };
    let moveAt = 0;
    const onMove = () => {
      const n = performance.now();
      if (n - moveAt > 500) {
        moveAt = n;
        mark();
      }
    };
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("keydown", mark, opts);
    window.addEventListener("pointerdown", mark, opts);
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("wheel", mark, opts);
    window.addEventListener("touchstart", mark, opts);
    window.addEventListener("scroll", onMove, opts);

    const tick = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - lastTick.current, TICK_MS * 2); // a sleeping laptop must not bank hours
      lastTick.current = now;
      if (countsAsActive(document.visibilityState === "visible", now - lastInput.current)) pending.current += dt;
    }, TICK_MS);
    const flusher = window.setInterval(() => flush(false), FLUSH_MS);
    const onVis = () => {
      lastTick.current = performance.now();
      if (document.visibilityState === "hidden") flush(true);
    };
    const onHide = () => flush(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("keydown", mark, opts);
      window.removeEventListener("pointerdown", mark, opts);
      window.removeEventListener("pointermove", onMove, opts);
      window.removeEventListener("wheel", mark, opts);
      window.removeEventListener("touchstart", mark, opts);
      window.removeEventListener("scroll", onMove, opts);
      window.clearInterval(tick);
      window.clearInterval(flusher);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      flush(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
