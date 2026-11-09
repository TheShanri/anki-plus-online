"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Fullscreen for a scene container. After every change the canvas is told to re-measure (the resize event reaches
 *  r3f's size observer) and `onChange` lets the page re-frame the camera, so pointer coordinates never go stale. */
export function useFullscreen(onChange?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const f = () => {
      setFs(document.fullscreenElement === ref.current);
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
    else void ref.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const can = typeof document !== "undefined" && !!document.fullscreenEnabled;
  return { ref, fs, toggle, can };
}
