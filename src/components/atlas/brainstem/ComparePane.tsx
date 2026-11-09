"use client";
// Compare: the same level in the other sources (course histology and drawings, the Coulombe atlas plates, Sobotta, the MRI
// slice). Only shown beside the plate when Compare is on; the main view stays the clean plate.
import { useState } from "react";
import { SectionViewer, imageSrc } from "./SectionViewer";
import { MriPane } from "./MriPane";
import { IMAGES, type BsImage, type BsLevel } from "./data";

type Group = { id: string; label: string; images: BsImage[] };

function groupsFor(level: BsLevel): Group[] {
  const imgs = IMAGES.filter((i) => i.level === level.slug);
  const by = (id: string, label: string, f: (i: BsImage) => boolean): Group => ({ id, label, images: imgs.filter(f) });
  const gs = [
    by("histology", "Histology", (i) => i.source === "course" && i.style === "histology"),
    by("drawings", "Drawings", (i) => i.source === "course" && i.style === "cartoon"),
    by("gross", "Gross", (i) => i.source === "course" && i.style === "gross"),
    by("coulombe", "Atlas plates", (i) => i.source === "open" && i.id.includes("fnana")),
    by("sobotta", "Sobotta", (i) => i.source === "open" && i.id.includes("sobo")),
    by("other", "Other", (i) => i.source === "open" && !i.id.includes("fnana") && !i.id.includes("sobo")),
  ].filter((g) => g.images.length);
  if (level.mniZ !== null) gs.push({ id: "mri", label: "MRI", images: [] });
  return gs;
}

export function ComparePane({ level, courseSlug }: { level: BsLevel; courseSlug: string }) {
  const groups = groupsFor(level);
  const [want, setWant] = useState("");
  const [idx, setIdx] = useState(0);
  const group = groups.find((g) => g.id === want) ?? groups[0];
  if (!group) return <p className="panel text-sm text-text-dim">No other sources for this view yet.</p>;
  const image = group.images[Math.min(idx, group.images.length - 1)];
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="bs-seg" role="tablist" aria-label="Compare with">
          {groups.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === group.id} onClick={() => (setWant(g.id), setIdx(0))}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {group.id === "mri" ? (
        <MriPane level={level} hoverSlug={null} onHover={() => {}} />
      ) : (
        <>
          {group.images.length > 1 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Images">
              {group.images.map((im, i) => (
                <button key={im.id} type="button" role="listitem" className="bs-thumb" aria-current={im === image ? "true" : undefined} aria-label={im.title} title={im.title} onClick={() => setIdx(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageSrc(im, courseSlug)} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
          <SectionViewer image={image} courseSlug={courseSlug} mode="clean" hoverSlug={null} onHover={() => {}} results={{}} active={null} onActivate={() => {}} />
          <p className="mt-1.5 text-xs text-text-dim">
            <span className="text-text">{image.title}</span>
            {image.source === "course" ? " · course material" : image.credit ? ` · ${image.short ?? image.credit}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
