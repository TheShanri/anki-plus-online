"use client";
// The level's plate (atlas v3): illustration on the left, the course's myelin-stained section on the right, registered
// at the midline. Quiet by default: hovering a structure lights it on both halves and names it; clicking opens it.
// View: Split (default), Illustration or Photo; Histology (Gross where a source exists); Atlas labels in the margins.
// Level changes crossfade. A small sagittal locator shows where the cut is.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Brain, Columns2, Image as ImageIcon, Microscope, PenTool, Tags } from "lucide-react";
import { STRUCTURES } from "./data";
import { usePlate } from "./plate/usePlate";
import { PlateArt, type PlateView } from "./plate/PlateArt";
import { LevelLocator } from "./plate/LevelLocator";

export const NAMES: Record<string, string> = Object.fromEntries(Object.entries(STRUCTURES).map(([k, s]) => [k, s.name]));

const PREF = "bs3-view";
type Prefs = { view: PlateView; labels: boolean };
const DEFAULT_PREFS: Prefs = { view: "split", labels: false };
let prefsCache: Prefs | null = null;
const prefListeners = new Set<() => void>();
function readPrefs(): Prefs {
  if (prefsCache) return prefsCache;
  prefsCache = DEFAULT_PREFS;
  try {
    const v = JSON.parse(localStorage.getItem(PREF) ?? "null") as Partial<Prefs> | null;
    if (v && (v.view === "split" || v.view === "illustration" || v.view === "photo")) prefsCache = { view: v.view, labels: !!v.labels };
  } catch {}
  return prefsCache;
}
function writePrefs(p: Prefs) {
  prefsCache = p;
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {}
  for (const l of prefListeners) l();
}
/** The plate view preferences (remembered per browser). */
export function usePlatePrefs(): [Prefs, (p: Prefs) => void] {
  const prefs = useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      return () => prefListeners.delete(cb);
    },
    readPrefs,
    () => DEFAULT_PREFS,
  );
  return [prefs, writePrefs];
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: React.ComponentType<{ size?: number }>; disabled?: boolean; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="bs-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={o.disabled} title={o.title ?? o.label} onClick={() => onChange(o.id)}>
          {o.icon && <o.icon size={14} />}
          <span className="bs-seg-t">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PlateStage({
  level,
  hover,
  onHover,
  selected,
  onSelect,
  mastery,
}: {
  level: string;
  hover: string | null;
  onHover: (slug: string | null) => void;
  selected: string | null;
  onSelect: (slug: string) => void;
  mastery: Record<string, number>;
}) {
  const [prefs, save] = usePlatePrefs();
  const [side, setSide] = useState<"L" | "R" | "M" | null>(null);
  // crossfade: keep the previous level on screen while the new one fades in
  const [cur, setCur] = useState(level);
  const [prev, setPrev] = useState<string | null>(null);
  if (level !== cur) {
    setPrev(cur);
    setCur(level);
  }
  useEffect(() => {
    if (!prev) return;
    const t = setTimeout(() => setPrev(null), 280);
    return () => clearTimeout(t);
  }, [prev]);

  const plate = usePlate(level);
  const prevPlate = usePlate(prev);
  const ready = plate && plate !== "missing" ? plate : null;
  const names = NAMES;
  const hot = hover;
  const pct = hot && mastery[hot] !== undefined ? ` · ${Math.round(mastery[hot] * 100)}%` : "";
  const approx = ready && hot ? ready.regions.some((r) => r.slug === hot && r.approx) : false;
  const surface = ready?.view === "surface";
  const hasPhoto = !!ready?.photo?.src && ready.sym !== false;
  const callText = hot ? `${names[hot] ?? hot.replace(/-/g, " ")}${approx ? " (approx.)" : ""}${pct}` : null;

  return (
    <div className="bsp-stage">
      <div className="bsp-tools" role="toolbar" aria-label="Plate view">
        <Seg
          label="View"
          value={ready && !hasPhoto ? "illustration" : prefs.view}
          onChange={(v) => save({ ...prefs, view: v })}
          options={[
            { id: "split", label: "Split", icon: Columns2, disabled: !!ready && !hasPhoto, title: hasPhoto ? "Illustration and photo, split at the midline" : "No course photo published for this view" },
            { id: "illustration", label: "Illustration", icon: PenTool },
            { id: "photo", label: surface ? "Photo" : "Section", icon: ImageIcon, disabled: !!ready && !hasPhoto, title: surface ? "The course's specimen photo" : "The course's myelin-stained section" },
          ]}
        />
        <Seg
          label={surface ? "Specimen" : "Section stain"}
          value={!hasPhoto && ready ? ("" as "gross") : surface ? "gross" : "histology"}
          onChange={() => undefined}
          options={[
            { id: "histology", label: "Histology", icon: Microscope, disabled: surface, title: surface ? "A surface view: no stained section" : "Myelin-stained section (Weil)" },
            { id: "gross", label: "Gross", icon: Brain, disabled: !surface || !hasPhoto, title: surface ? (hasPhoto ? "Gross specimen (Lab 7)" : "No course photo published for this view") : "Gross: no gross section of this level in the course or the open atlases" },
          ]}
        />
        <button type="button" className={`bs-ib${prefs.labels ? " bs-on" : ""}`} aria-pressed={prefs.labels} title="Atlas labels (L)" aria-label="Atlas labels (L)" onClick={() => save({ ...prefs, labels: !prefs.labels })}>
          <Tags size={16} aria-hidden />
        </button>
      </div>
      <div className="bsp-frame">
        {ready?.schematic && <div className="bsp-schematic">{ready.schematic}</div>}
        {ready ? (
          <div key={cur} className="bs-fade-in">
            <PlateArt
              plate={ready}
              view={prefs.view}
              hot={hot}
              hotSide={side}
              selected={selected}
              labels={prefs.labels}
              callout={!prefs.labels}
              calloutText={callText}
              names={names}
              interactive
              onHover={(s, sd) => {
                onHover(s);
                setSide(sd ?? null);
              }}
              onPick={onSelect}
              ariaLabel={`Brainstem plate, ${level}`}
            />
          </div>
        ) : plate === "missing" ? (
          <div className="p-6 text-sm text-text-dim">The plate could not be loaded.</div>
        ) : (
          <div className="plate-skel" style={{ aspectRatio: "4 / 3" }} aria-busy />
        )}
        {/* the previous level fades out over the new one */}
        {prev && prevPlate && prevPlate !== "missing" && (
          <div className="bsp-layer bs-fade-out" aria-hidden>
            <PlateArt plate={prevPlate} view={prefs.view} labels={prefs.labels} names={names} />
          </div>
        )}
        {!surface && (
          <div className="bsp-locator" title="Where this section is cut">
            <LevelLocator level={level} />
          </div>
        )}
      </div>
    </div>
  );
}
