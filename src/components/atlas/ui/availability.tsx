"use client";

import { Box, Layers, Scan } from "lucide-react";
import { LINKS } from "@/lib/atlas/catalog";
import type { CatalogItem } from "@/lib/atlas/catalog";
import { inSections } from "../brainstem/SectionEmbed";

export type Avail = "exact" | "partial" | "none";
export type AvailInfo = { d3: Avail; d3Why: string; mri: Avail; mriWhy: string; sec: Avail; secWhy: string };

export const slugOf = (it: CatalogItem | null): string | null => (it ? (it.slug ?? (it.key.startsWith("slug:") ? it.key.slice(5) : null)) : null);

/** Where a structure can be seen: 3D, MRI slices and course sections, each exact / partial (approximate, region, derived) / none. */
export function availabilityFor(it: CatalogItem | null): AvailInfo {
  const slug = slugOf(it);
  const l = slug ? LINKS[slug] : undefined;
  let d3: Avail = "none";
  let d3Why = "Not in the 3D model";
  if (l) {
    if (l.meshIds.length && !l.approximate) (d3 = "exact"), (d3Why = "Exact in 3D");
    else if (l.approximate || l.fallbackParentId || l.meshIds.length) (d3 = "partial"), (d3Why = "Approximate in 3D: highlights the structure that contains it");
  } else if (it && it.meshIds.length) {
    d3 = it.approximate ? "partial" : "exact";
    d3Why = it.approximate ? "Approximate in 3D" : "Exact in 3D";
  }
  const q = it?.slices ?? l?.slices ?? null;
  const mri: Avail = q === "exact" ? "exact" : q ? "partial" : "none";
  const mriWhy = q === "exact" ? "Exact in the MRI atlas" : q === "derived" ? "Derived in the MRI atlas (built from other labels)" : q === "regional" ? "Region only in the MRI atlas" : "Not in the MRI atlas";
  const s = inSections(slug);
  const sec: Avail = s === "course" ? "exact" : s ? "partial" : "none";
  const secWhy = s === "course" ? "On the course cross-sections" : s ? "Standard anatomy at a section level (not labelled on a slide)" : "Not on the course cross-sections";
  return { d3, d3Why, mri, mriWhy, sec, secWhy };
}

const STYLE: Record<Avail, string> = {
  exact: "text-accent-2",
  partial: "text-accent-2 opacity-70",
  none: "text-text-faint opacity-25",
};

/** Three tiny icons (3D cube, MRI scan, section layers): coloured when present, dotted when approximate, faint when missing. Same everywhere a structure is listed. */
export function AvailIcons({ a, size = 13 }: { a: AvailInfo; size?: number }) {
  const rows: [string, typeof Box, Avail, string][] = [
    ["3D", Box, a.d3, a.d3Why],
    ["MRI", Scan, a.mri, a.mriWhy],
    ["Sections", Layers, a.sec, a.secWhy],
  ];
  return (
    <span className="inline-flex flex-none items-center gap-1" role="group" aria-label="Where this structure is available">
      {rows.map(([n, Icon, st, why]) => (
        <span key={n} title={why} aria-label={why} className={`inline-flex ${STYLE[st]}`}>
          <Icon size={size} strokeWidth={st === "exact" ? 2.2 : 1.6} strokeDasharray={st === "partial" ? "2.4 2.2" : undefined} aria-hidden="true" />
        </span>
      ))}
    </span>
  );
}
