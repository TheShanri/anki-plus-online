"use client";
// An axial MRI slice at the level's MNI z, curriculum structures coloured. NiiVue and the volumes load only when this
// pane is opened (SliceViewer is imported dynamically, atlas2.json is fetched on first use).
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadAtlas2, type Atlas2 } from "@/lib/atlas/slices";
import { STRUCTURES, type BsLevel } from "./data";

// the loader pulls in three.js helpers, so it loads only here, with NiiVue
const AtlasLoader = dynamic(() => import("@/components/atlas/ui/AtlasLoader").then((m) => m.AtlasLoader), { ssr: false });
const SliceViewer = dynamic(() => import("@/components/atlas/SliceViewer"), {
  ssr: false,
  loading: () => <MriLoading indexDone />,
});

function MriLoading({ indexDone }: { indexDone: boolean }) {
  const stages = [
    { id: "index", label: "Reading the structure index", state: indexDone ? ("done" as const) : ("active" as const) },
    { id: "viewer", label: "Starting the MRI viewer and loading the slices", state: indexDone ? ("active" as const) : ("todo" as const) },
  ];
  return (
    <div className="flex h-full items-center justify-center overflow-auto">
      <AtlasLoader stages={stages} label="Loading the MRI atlas" />
    </div>
  );
}

export function MriPane({ level, hoverSlug, onHover }: { level: BsLevel; hoverSlug: string | null; onHover: (s: string | null) => void }) {
  const [atlas, setAtlas] = useState<Atlas2 | null>(null);
  const [err, setErr] = useState(false);
  const [h, setH] = useState(480);
  useEffect(() => {
    let alive = true;
    loadAtlas2()
      .then((a) => alive && setAtlas(a))
      .catch(() => alive && setErr(true));
    const fit = () => setH(window.innerWidth < 640 ? 340 : 480);
    fit();
    window.addEventListener("resize", fit);
    return () => {
      alive = false;
      window.removeEventListener("resize", fit);
    };
  }, []);

  // only structures the atlas holds with exact or derived geometry are coloured (regional boxes would mislead)
  const shown = useMemo(() => {
    if (!atlas) return [];
    return level.structures
      .map((s) => ({ slug: s.slug, st: STRUCTURES[s.slug], q: atlas.structures[s.slug]?.quality }))
      .filter((x) => x.st && x.st.onList && (x.q === "exact" || x.q === "derived"));
  }, [atlas, level]);
  const overlays = useMemo(() => shown.map((x) => ({ slug: x.slug, color: x.st.color })), [shown]);
  const atMm = useMemo(() => (level.mniZ === null ? null : [0, -30, level.mniZ]), [level.mniZ]);

  if (err) return <div className="panel text-sm text-text-dim">The MRI atlas data could not be loaded.</div>;
  return (
    <div>
      <div className="overflow-hidden rounded-card" style={{ height: h }}>
        {!atlas && <MriLoading indexDone={false} />}
        {atlas && <SliceViewer atlas={atlas} primary={null} primaryColor="#ff2a6d" overlays={overlays} view="axial" jumpTo={null} atMm={atMm} height={h} />}
      </div>
      <p className="mt-2 text-xs text-text-dim">
        Axial MRI template (MNI space) at z = {level.mniZ} mm, from {level.mniNote}. The level is approximate: brainstem levels are tilted relative to the axial plane.
        Only structures with exact or derived geometry are coloured.
      </p>
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {shown.map((x) => (
            <li key={x.slug}>
              <button type="button" className={`bs-row !w-auto !py-0.5 ${hoverSlug === x.slug ? "bs-hot" : ""}`} onPointerEnter={() => onHover(x.slug)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(x.slug)} onBlur={() => onHover(null)}>
                <span className="bs-sw" style={{ background: x.st.color }} />
                {x.st.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
