"use client";

import { useEffect, useState } from "react";
import { readCssColor } from "@/lib/atlas/theme";
import type { SceneColors } from "./PathwayScene";

function read(): SceneColors {
  const c = (name: string, fb: string) => readCssColor(name, fb).getStyle();
  return {
    left: c("--blue", "#3d8bff"),
    right: c("--orange", "#ff9e3d"),
    dim: c("--text-dim", "#a996c9"),
    text: c("--text", "#ffffff"),
    hi: c("--highlight", "#fffb96"),
    bad: c("--again", "#ff5a78"),
  };
}

const SSR: SceneColors = { left: "#3d8bff", right: "#ff9e3d", dim: "#a996c9", text: "#ffffff", hi: "#fffb96", bad: "#ff5a78" };

/** Scene colours from the theme tokens (left = --blue, right = --orange, lesion = --again), refreshed on theme change. */
export function useSceneColors(): SceneColors {
  const [colors, setColors] = useState<SceneColors>(SSR);
  useEffect(() => {
    const update = () => setColors(read());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);
  return colors;
}
