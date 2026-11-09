"use client";
import { useEffect } from "react";

/** Marks <html data-bg-paused> while the tab is hidden so the backdrop's CSS animations stop (backdrop.css reads it).
 * Renders nothing. Study screens pause the scene through CSS (html:has(.st-wrap)). */
export function BackdropPause() {
  useEffect(() => {
    const h = document.documentElement;
    const sync = () => (document.hidden ? h.setAttribute("data-bg-paused", "") : h.removeAttribute("data-bg-paused"));
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      h.removeAttribute("data-bg-paused");
    };
  }, []);
  return null;
}
