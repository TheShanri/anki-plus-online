"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Activity, BarChart3, Brain, Droplets, Layers, Map as MapIcon, Route, ScanSearch, Target } from "lucide-react";
import { preloadAtlas } from "./ui/modelCache";

/** The atlas's modes, one route each. Every atlas page renders this bar at the top. */
export const ATLAS_MODES = [
  { href: "/atlas", label: "Explore", icon: Brain },
  { href: "/atlas/quiz", label: "Name that structure", icon: Target },
  { href: "/atlas/pathways", label: "Pathway tracer", icon: Route },
  { href: "/atlas/lesion", label: "Lesion lab", icon: Activity },
  { href: "/atlas/slice-match", label: "Slice match", icon: ScanSearch },
  { href: "/atlas/supply", label: "Blood supply", icon: Droplets },
  { href: "/atlas/brainstem", label: "Brainstem", icon: Layers },
  { href: "/atlas/memory", label: "My memory map", icon: MapIcon },
  { href: "/atlas/progress", label: "Progress", icon: BarChart3 },
] as const;

export function AtlasModes() {
  const path = usePathname() ?? "/atlas";
  // any atlas route: warm the index and the brain model while the page is idle, so the next mode opens fast
  useEffect(() => preloadAtlas(), []);
  return (
    <nav aria-label="Atlas modes" className="mb-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {ATLAS_MODES.map((m) => {
        const on = m.href === "/atlas" ? path === "/atlas" : path === m.href || path.startsWith(m.href + "/");
        const Icon = m.icon;
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={on ? "page" : undefined}
            title={m.label}
            className={`flex flex-none items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs no-underline ${on ? "border-accent bg-panel text-accent" : "border-transparent text-text-dim hover:border-panel-border hover:text-text"}`}
          >
            <Icon size={14} aria-hidden />
            <span className={on ? "" : "hidden sm:inline"}>{m.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
