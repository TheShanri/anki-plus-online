"use client";
// Explore's "Brainstem" focus: the 3D brainstem with its diencephalic landmarks, cranial nerves and the section planes.
// A landmark picked here becomes Explore's selection (its notes and the docked brainstem plate follow); a plane picked
// here opens that level's plate beside the model, with a link to the brainstem atlas.
import { useState } from "react";
import { X } from "lucide-react";
import Brainstem3D from "./Brainstem3D";
import { BrainstemRef } from "../BrainstemRef";
import { LEVEL_NAME, in3D } from "./model";
import "./bs3d.css";

export default function BrainstemFocus({ slug, onPick }: { slug: string | null; onPick: (slug: string) => void }) {
  const [level, setLevel] = useState<string | null>(null);
  const lit = slug && in3D(slug) ? slug : null;
  return (
    <div className="bs3d-focus">
      <Brainstem3D level={level} selected={lit} onSelect={onPick} onLevel={setLevel} height="100%" className="bs3d-fill" ariaLabel="Brainstem focus: landmarks, cranial nerves and section planes" />
      {level && (
        <section className="bs3d-plate atl-card-in" aria-label={`Plate: ${LEVEL_NAME(level)}`}>
          <button type="button" className="bs3d-plate-x" onClick={() => setLevel(null)} aria-label="Close the plate" title="Close the plate">
            <X size={14} aria-hidden />
          </button>
          <BrainstemRef level={level} structures={slug ? [slug] : []} compact onPick={onPick} />
        </section>
      )}
      {!slug && !level && <div className="bs3d-hint atl-chip">Hover a landmark to name it, click to select it. Click a plane (or a level) to open its plate.</div>}
    </div>
  );
}
