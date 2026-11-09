"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Fullscreen for a scene container. After every change the canvas is told to re-measure (the resize event reaches
 *  r3f's size observer) and `onChange` lets the page re-frame the camera, so pointer coordinates never go stale. */
export function useFullscreen(onChange?: () => void) {
  const el = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((n: HTMLDivElement | null) => {
    el.current = n;
  }, []);
  const [fs, setFs] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const f = () => {
      setFs(document.fullscreenElement === el.current);
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
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const can = typeof document !== "undefined" && !!document.fullscreenEnabled;
  return { ref, fs, toggle, can };
}
