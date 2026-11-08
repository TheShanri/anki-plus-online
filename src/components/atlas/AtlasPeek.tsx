"use client";

import { useEffect, useRef, useState } from "react";
import { AtlasBrowser } from "./AtlasBrowser";

/**
 * The whole atlas (search, 3D, MRI slices, neighbours) in a window over the study card, so a session is never
 * left to look something up. Keys typed inside it do not reach the study shortcuts; Esc, Close or a click on
 * the backdrop returns to the same card.
 */
export default function AtlasPeek({ slug, name, onClose }: { slug: string | null; name?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [h, setH] = useState(480);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const fit = () => setH(Math.max(320, Math.min(760, window.innerHeight - 150)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={name ? `${name} in the atlas` : "Atlas"}
      onKeyDown={(e) => e.stopPropagation()}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-16px)] w-[min(1180px,calc(100vw-16px))] max-w-none overflow-y-auto rounded-card border border-panel-border bg-panel-solid p-3 text-text shadow-pop backdrop:bg-black/60 sm:p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="mr-auto font-display text-lg tracking-wide">
          Atlas
          {name && <span className="text-accent">: {name}</span>}
        </h2>
        <span className="hidden text-xs text-text-dim sm:inline">Your cards wait right here.</span>
        <button type="button" className="btn" onClick={() => ref.current?.close()} autoFocus>
          Back to cards
        </button>
      </div>
      <AtlasBrowser initialS={slug ?? undefined} embedded height={h} />
    </dialog>
  );
}
