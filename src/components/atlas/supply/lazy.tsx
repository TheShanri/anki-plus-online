"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { AtlasViewerProps } from "../AtlasViewer";

/** The 3D viewer loads on demand (three.js is heavy); shared by the supply, memory and slice-match modes. */
export const LazyAtlasViewer = dynamic(() => import("../AtlasViewer"), {
  ssr: false,
  loading: () => <div className="flex h-[480px] items-center justify-center rounded-card border border-panel-border text-sm text-text-dim">Loading 3D model...</div>,
}) as unknown as ComponentType<AtlasViewerProps>;
