"use client";

import { ViewerSkeleton } from "@/components/ui/Skeleton";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { AtlasViewerProps } from "../AtlasViewer";

/** The 3D viewer loads on demand (three.js is heavy); shared by the supply, memory and slice-match modes. */
export const LazyAtlasViewer = dynamic(() => import("../AtlasViewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton height={480} />,
}) as unknown as ComponentType<AtlasViewerProps>;
