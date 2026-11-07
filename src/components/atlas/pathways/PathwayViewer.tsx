"use client";

import dynamic from "next/dynamic";

/** The 3D scene, loaded in the browser only (three.js needs WebGL). */
export const PathwayViewer = dynamic(() => import("./PathwayScene"), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-text-dim">Loading 3D model…</div>,
});
