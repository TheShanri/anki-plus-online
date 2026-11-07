"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The atlas's modes, one route each. Every atlas page renders this bar at the top. */
export const ATLAS_MODES = [
  { href: "/atlas", label: "Explore" },
  { href: "/atlas/quiz", label: "Name that structure" },
  { href: "/atlas/pathways", label: "Pathway tracer" },
  { href: "/atlas/lesion", label: "Lesion lab" },
  { href: "/atlas/slice-match", label: "Slice match" },
  { href: "/atlas/supply", label: "Blood supply" },
  { href: "/atlas/memory", label: "My memory map" },
] as const;

export function AtlasModes() {
  const path = usePathname() ?? "/atlas";
  return (
    <nav aria-label="Atlas modes" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {ATLAS_MODES.map((m) => {
        const on = m.href === "/atlas" ? path === "/atlas" : path === m.href || path.startsWith(m.href + "/");
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={on ? "page" : undefined}
            className={`flex-none rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wider no-underline ${on ? "border-accent text-accent" : "border-panel-border text-text-dim hover:border-panel-border-hi hover:text-text"}`}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
