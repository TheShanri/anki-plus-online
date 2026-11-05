"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { atlasTargetForSlug, bestAtlasTab } from "@/lib/atlas/catalog";
import { loadAtlas2 } from "@/lib/atlas/slices";
import type { Atlas2 } from "@/lib/atlas/slices";
import { accentHex } from "@/lib/atlas/palette";
import AtlasViewer from "./AtlasViewer";
import type { SliceView } from "./SliceViewer";

const SliceViewer = dynamic(() => import("./SliceViewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-text-dim">Loading MRI slices...</div>,
});

const PLANES: { id: SliceView; label: string }[] = [
  { id: "coronal", label: "Coronal" },
  { id: "sagittal", label: "Sagittal" },
  { id: "axial", label: "Transverse" },
];

/**
 * The atlas in a modal over the study card, so a session is never left to look a structure up.
 * Keys pressed inside it do not reach the study shortcuts; Esc or the close button returns to the card.
 */
export default function AtlasPeek({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const target = atlasTargetForSlug(slug);
  const [tab, setTab] = useState<"model" | "slices">(() => (target ? bestAtlasTab(target) : "model"));
  const [plane, setPlane] = useState<SliceView>("coronal");
  const [atlas2, setAtlas2] = useState<Atlas2 | null>(null);
  const [accent] = useState(() => accentHex());
  const [h, setH] = useState(480);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const fit = () => setH(Math.max(280, Math.min(560, window.innerHeight - 220)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (tab !== "slices" || atlas2) return;
    let alive = true;
    loadAtlas2()
      .then((a) => alive && setAtlas2(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tab, atlas2]);

  const hasSlices = !!target?.slices;
  const has3d = !!target?.ids.length;
  const tabBtn = (id: "model" | "slices", label: string, enabled: boolean) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      disabled={!enabled}
      onClick={() => setTab(id)}
      className={`rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wider disabled:opacity-40 ${tab === id ? "border-accent text-accent" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`}
    >
      {label}
    </button>
  );

  return (
    <dialog
      ref={ref}
      aria-label={`${name} in the atlas`}
      onKeyDown={(e) => e.stopPropagation()}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(980px,calc(100vw-24px))] max-w-none rounded-card border border-panel-border bg-panel-solid p-3 text-text shadow-pop backdrop:bg-black/60 sm:p-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-lg tracking-wide text-accent">{name}</h2>
        <div className="flex gap-1.5" role="tablist" aria-label="Atlas view">
          {tabBtn("model", "3D model", has3d)}
          {tabBtn("slices", "MRI slices", hasSlices)}
        </div>
        <button type="button" className="btn" onClick={() => ref.current?.close()} autoFocus>
          Close
        </button>
      </div>

      {!target ? (
        <p className="p-6 text-center text-sm text-text-dim">This structure is not in the open atlases.</p>
      ) : tab === "model" ? (
        <AtlasViewer structureIds={target.ids} approximate={target.approximate} label={name} height={h} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {PLANES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={plane === p.id}
                onClick={() => setPlane(p.id)}
                className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${plane === p.id ? "border-accent-2 text-accent-2" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ height: h - 36 }}>
            {atlas2 ? (
              <SliceViewer atlas={atlas2} primary={slug} primaryColor={accent} overlays={[]} view={plane} jumpTo={slug} height={h - 36} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-dim">Loading MRI atlas...</div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-dim">
        {target && tab === "model" && target.approximate && (
          <span className="text-hard">
            Approximate: the highlight is the structure that contains it.
            {hasSlices && target.slices !== "regional" && (
              <>
                {" "}
                <button type="button" className="text-accent-2 underline underline-offset-2" onClick={() => setTab("slices")}>
                  See it exactly in MRI slices
                </button>
              </>
            )}
          </span>
        )}
        {target && tab === "slices" && target.slices === "regional" && <span className="text-hard">Region only in the MRI atlas.</span>}
        <a className="ml-auto text-accent-2" href={`/atlas?s=${encodeURIComponent(slug)}`} target="_blank" rel="noopener">
          Open the full atlas in a new tab
        </a>
      </div>
    </dialog>
  );
}
