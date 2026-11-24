"use client";

import { useEffect, useRef, useState } from "react";
import { Bone, Brain, Cable, ChevronDown, ChevronUp, Crosshair, FlipHorizontal2, Layers as LayersIcon, Lock, LockOpen, Maximize2, Minimize2, Orbit, Palette, RotateCcw, Sprout, Tag } from "lucide-react";
import { Divider, Group, IconBtn, MenuItem, Popover } from "@/components/atlas/ui/Toolbar";
import { CutCoronalIcon, CutNoneIcon, CutSagittalIcon, CutTransverseIcon, SeeThroughIcon, SolidIcon } from "@/components/atlas/ui/icons";
import { NavHelpButton } from "@/components/atlas/ui/navigation";
import type { View3 } from "./engine/Atlas3Canvas";
import { DEEP, GROUPS, PRESETS, WHOLE, type Group as LayerGroup, type Layers, type Mode } from "./layers";

/* The 3D atlas's toolkit (the classic atlas's layout, owner 2026-11-24: "Really like the tool kit from the old atlas so
 * adopt that"): one bar, collapsible, grouped View | Cut | Look | Toggles | Layout; the cut's slider on its own bar above.
 * Every control changes one thing, and each thing has one control: the hemispheres live in the Show menu only. */

export type CutAxis = "off" | "z" | "x" | "y";
export type Sides = "both" | "L" | "R";
export const VIEWS: { id: View3; label: string; short: string; key: string }[] = [
  { id: "left", label: "Left lateral", short: "Lateral L", key: "1" },
  { id: "right", label: "Right lateral", short: "Lateral R", key: "2" },
  { id: "anterior", label: "Anterior", short: "Anterior", key: "3" },
  { id: "posterior", label: "Posterior", short: "Posterior", key: "4" },
  { id: "superior", label: "Superior (from above)", short: "Superior", key: "5" },
  { id: "inferior", label: "Inferior (the base)", short: "Inferior", key: "6" },
  { id: "medial-left", label: "Medial, left hemisphere", short: "Medial L", key: "7" },
  { id: "medial-right", label: "Medial, right hemisphere", short: "Medial R", key: "8" },
];
const CUTS: { id: CutAxis; label: string; key?: string }[] = [
  { id: "off", label: "No cut" },
  { id: "z", label: "Coronal cut", key: "C" },
  { id: "x", label: "Sagittal cut", key: "S" },
  { id: "y", label: "Horizontal cut", key: "H" },
];
const MODES: { id: Mode; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "glass", label: "See-through" },
  { id: "off", label: "Off" },
];
/** the same brain layers (the skull and spine are their own toggle, outside the presets) */
const same = (a: Layers, b: Layers) => GROUPS.every((g) => g.id === "bones" || a[g.id] === b[g.id]);

export interface ExploreBarProps {
  view: View3;
  onView: (v: View3) => void;
  onFrame: () => void;
  locked: boolean;
  onLock: () => void;
  cutAxis: CutAxis;
  onCut: (a: CutAxis) => void;
  cutPos: number;
  cutRange: [number, number];
  onCutPos: (p: number) => void;
  onFlip: () => void;
  /** where the cut is, in words (coronal, 8 mm anterior to the anterior commissure) */
  cutNote: string;
  look: "natural" | "regions";
  onLook: (l: "natural" | "regions") => void;
  /** the layers in force (the student's, with the selection's auto layers over them) */
  layers: Layers;
  /** groups a selection made see-through for now */
  auto: Partial<Layers>;
  onLayer: (g: LayerGroup, m: Mode) => void;
  onPreset: (l: Layers) => void;
  sides: Sides;
  onSides: (s: Sides) => void;
  labels: boolean;
  onLabels: () => void;
  full: boolean;
  canFull: boolean;
  onFull: () => void;
  onReset: () => void;
}

export function ExploreBar(p: ExploreBarProps) {
  const [open, setOpen] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = barRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 760));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const v = VIEWS.find((x) => x.id === p.view) ?? VIEWS[0];
  const deepOn = same(p.layers, DEEP);
  const wholeOn = same(p.layers, WHOLE);
  const toggle = (g: LayerGroup, on: Mode, off: Mode) => p.onLayer(g, p.layers[g] === off ? on : off);
  return (
    <div className="atl3-bar">
      <div className="flex max-w-full flex-col items-center gap-1.5">
        {p.cutAxis !== "off" && (
          <div className="atl-bar atl3-cutbar" role="group" aria-label="Cut position">
            <span className="atl3-cutnote" aria-live="polite">
              {p.cutNote}
            </span>
            <input type="range" min={p.cutRange[0]} max={p.cutRange[1]} step={0.0005} value={p.cutPos} aria-label="Cut position" onChange={(e) => p.onCutPos(Number(e.target.value))} />
            <IconBtn icon={<FlipHorizontal2 />} label="Keep the other side" onClick={p.onFlip} />
          </div>
        )}
        <div ref={barRef} className={`atl-bar${narrow ? " atl-narrow" : ""}`} role="toolbar" aria-label="3D view controls">
          <IconBtn label={open ? "Hide controls" : "Show controls"} icon={open ? <ChevronDown /> : <ChevronUp />} onClick={() => setOpen((o) => !o)} />
          {open && (
            <>
              <Divider />
              <Group label="View">
                <Popover trigger={({ open: o, toggle: t }) => <IconBtn label="Camera view" keys="1-8" icon={<Orbit />} text={narrow ? undefined : v.short} on={o} onClick={t} />}>
                  {(close) =>
                    VIEWS.map((x) => (
                      <MenuItem
                        key={x.id}
                        label={x.label}
                        keys={x.key}
                        on={p.view === x.id}
                        onClick={() => {
                          p.onView(x.id);
                          close();
                        }}
                      />
                    ))
                  }
                </Popover>
                <IconBtn label="Frame the selection from this side" keys="F" icon={<Crosshair />} onClick={p.onFrame} />
                <IconBtn label={p.locked ? "View locked: choosing a structure will not move the camera" : "Lock the view (stop the camera following the selection)"} on={p.locked} onClick={p.onLock} icon={p.locked ? <Lock /> : <LockOpen />} />
              </Group>
              <Divider />
              <Group label="Cut">
                {CUTS.map((c) => (
                  <IconBtn
                    key={c.id}
                    radio
                    label={c.label}
                    keys={c.key}
                    on={p.cutAxis === c.id}
                    onClick={() => p.onCut(c.id)}
                    icon={c.id === "off" ? <CutNoneIcon /> : c.id === "z" ? <CutCoronalIcon /> : c.id === "x" ? <CutSagittalIcon /> : <CutTransverseIcon />}
                  />
                ))}
              </Group>
              <Divider />
              <Group label="Look">
                <IconBtn radio label="Natural colours" on={p.look === "natural"} onClick={() => p.onLook("natural")} icon={<Brain />} />
                <IconBtn radio label="Lobes and regions in colour" on={p.look === "regions"} onClick={() => p.onLook("regions")} icon={<Palette />} />
                <span className="atl-div" aria-hidden="true" />
                <IconBtn radio label="Solid brain" keys="D" on={wholeOn} onClick={() => p.onPreset({ ...WHOLE, bones: p.layers.bones })} icon={<SolidIcon />} />
                <IconBtn radio label="See-through: the deep structures" keys="D" on={deepOn} onClick={() => p.onPreset({ ...DEEP, bones: p.layers.bones })} icon={<SeeThroughIcon />} />
                <Popover align="left" trigger={({ open: o, toggle: t }) => <IconBtn label="Show: each part solid, see-through or off" keys="V" icon={<LayersIcon />} on={o || (!deepOn && !wholeOn)} onClick={t} />}>
                  {() => <ShowPanel {...p} />}
                </Popover>
              </Group>
              <Divider />
              <Group label="Toggles">
                <IconBtn label={p.labels ? "Hide labels" : "Show labels"} keys="L" on={p.labels} onClick={p.onLabels} icon={<Tag />} />
                <IconBtn label={p.layers.bones === "off" ? "Show the skull and spine" : "Hide the skull and spine"} keys="K" on={p.layers.bones !== "off"} onClick={() => toggle("bones", "glass", "off")} icon={<Bone />} />
                <IconBtn label={p.layers.nerves === "off" ? "Show the cranial nerves" : "Hide the cranial nerves"} keys="E" on={p.layers.nerves !== "off"} onClick={() => toggle("nerves", "solid", "off")} icon={<Cable />} />
                <IconBtn label={p.layers.brainstem === "off" ? "Show the brainstem" : "Hide the brainstem"} keys="W" on={p.layers.brainstem !== "off"} onClick={() => toggle("brainstem", "solid", "off")} icon={<Sprout />} />
              </Group>
              <Divider />
              <Group label="Layout">
                {p.canFull && <IconBtn label={p.full ? "Exit full screen" : "Full screen"} keys="Z" on={p.full} onClick={p.onFull} icon={p.full ? <Minimize2 /> : <Maximize2 />} />}
                <NavHelpButton />
                <IconBtn icon={<RotateCcw />} label="Reset the view (whole brain, no cut)" onClick={p.onReset} />
              </Group>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The Show menu: each group solid, see-through or off; the hemispheres; presets. */
function ShowPanel(p: ExploreBarProps) {
  return (
    <div className="atl3-show" role="group" aria-label="Show">
      <div className="atl3-show-presets">
        {PRESETS.map((pr) => (
          <button key={pr.id} type="button" className="atl-cutbtn" aria-pressed={same(p.layers, pr.layers)} onClick={() => p.onPreset({ ...pr.layers, bones: p.layers.bones })}>
            {pr.name}
          </button>
        ))}
      </div>
      <table className="atl3-show-tab">
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Part
            </th>
            {MODES.map((m) => (
              <th key={m.id} scope="col">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g) => (
            <tr key={g.id} title={g.note}>
              <th scope="row">
                {g.name}
                {p.auto[g.id] && <span className="atl3-auto"> (for the selection)</span>}
              </th>
              {MODES.map((m) => (
                <td key={m.id}>
                  <input type="radio" name={`show-${g.id}`} aria-label={`${g.name}: ${m.label}`} checked={p.layers[g.id] === m.id} onChange={() => p.onLayer(g.id, m.id)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="atl3-show-sides" role="radiogroup" aria-label="Hemispheres">
        <span>Hemispheres</span>
        {(["both", "L", "R"] as Sides[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={p.sides === s} className="atl-cutbtn" onClick={() => p.onSides(s)}>
            {s === "both" ? "Both" : s === "L" ? "Left only" : "Right only"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ExploreBar;
