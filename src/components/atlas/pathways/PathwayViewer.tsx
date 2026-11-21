"use client";

import { ViewerSkeleton } from "@/components/ui/Skeleton";
import dynamic from "next/dynamic";

/** The 3D scene, loaded in the browser only (three.js needs WebGL). */
export const PathwayViewer = dynamic(() => import("./PathwayScene"), {
  ssr: false,
  loading: () => <ViewerSkeleton height="100%" />,
});
