"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Fullscreen for a scene container. After every change the canvas is told to re-measure (the resize event reaches
 *  r3f's size observer) and `onChange` lets the page re-frame the camera, so pointer coordinates never go stale.
 *  `attach` goes on the container's `ref`. The element is kept in state (not a returned ref object). */
export function useFullscreen(onChange?: () => void) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [fs, setFs] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!el) return;
    const f = () => {
      setFs(document.fullscreenElement === el);
      // the element needs a frame or two to reach its new size
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
          cb.current?.();
        });
      });
    };
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, [el]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el?.requestFullscreen?.().catch(() => undefined);
  }, [el]);
  // false on the server and during hydration, the browser's answer afterwards (a plain `document` check would mismatch: React error #418)
  const can = useSyncExternalStore(
    () => () => {},
    () => !!document.fullscreenEnabled,
    () => false,
  );
  return { attach: setEl, fs, toggle, can };
}
