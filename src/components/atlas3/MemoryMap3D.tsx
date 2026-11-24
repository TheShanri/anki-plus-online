"use client";

import { useMemo, useState } from "react";
import { Atlas3Canvas, type View3 } from "./engine/Atlas3Canvas";
import type { Index3, Label3 } from "./engine/data";
import { DEEP_HIDE } from "./present";
import { IconBtn } from "@/components/atlas/ui/Toolbar";
import { SeeThroughIcon, SolidIcon } from "@/components/atlas/ui/icons";
import "@/components/atlas/ui/atlas-ui.css";
import "./atlas3.css";

const VIEWS: { id: View3; text: string; label: string }[] = [
  { id: "left", text: "L", label: "Left lateral" },
  { id: "right", text: "R", label: "Right lateral" },
  { id: "superior", text: "Sup", label: "Superior" },
  { id: "inferior", text: "Inf", label: "Inferior (base)" },
  { id: "medial-left", text: "Med", label: "Medial (left hemisphere)" },
];

/** The memory map's brain: every structure coloured by how well the student recalls it (the colours come from the
 * caller), the deep structures shown through a see-through brain on request, a click picks a structure. */
export default function MemoryMap3D({
  colors,
  selected,
  tipText,
  onPick,
  height = 560,
}: {
  colors: Record<number, string>;
  selected: number[];
  tipText: (l: Label3) => string;
  onPick: (l: Label3 | null) => void;
  height?: number;
}) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [view, setView] = useState<View3>("left");
  const [nonce, setNonce] = useState(0);
  const [deep, setDeep] = useState(false);
  const hiddenIds = useMemo(() => (deep && index ? index.labels.filter((l) => DEEP_HIDE.has(l.tissue)).map((l) => l.id) : []), [deep, index]);
  const hideSides = useMemo<("L" | "R")[]>(() => (view === "medial-left" ? ["R"] : []), [view]);
  const focus = useMemo(() => (selected.length ? { ids: selected, nonce: selected[0] } : null), [selected]);
  return (
    <div className="atl3-one" style={{ height }}>
      <Atlas3Canvas
        view={view}
        viewNonce={nonce}
        hideSides={hideSides}
        hiddenIds={hiddenIds}
        ghost={deep}
        selected={selected}
        colors={colors}
        focus={focus}
        tipText={tipText}
        onPick={onPick}
        onReady={setIndex}
      />
      <div className="atl3-bar">
        <div className="atl-bar">
          {VIEWS.map((v) => (
            <IconBtn
              key={v.id}
              text={v.text}
              label={v.label}
              on={view === v.id}
              onClick={() => {
                setView(v.id);
                setNonce((n) => n + 1);
              }}
            />
          ))}
          <IconBtn icon={deep ? <SeeThroughIcon /> : <SolidIcon />} label={deep ? "Deep structures" : "Whole brain"} on={deep} onClick={() => setDeep((d) => !d)} />
        </div>
      </div>
    </div>
  );
}
