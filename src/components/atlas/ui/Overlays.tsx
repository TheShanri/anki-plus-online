"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Lock, LockOpen, Plus, Search, Sparkles, X } from "lucide-react";
import { IconBtn } from "./Toolbar";
import "./atlas-ui.css";

export type LegendRow = { key: string; name: string; color: string; removable?: boolean; kind: "primary" | "added" | "neighbour" };

/** Compact, collapsible legend: colour dots, names, hover linking to the 3D/MRI highlight. */
export function Legend({
  rows,
  hoverKey,
  onHover,
  onRemove,
  side,
  onSide,
}: {
  rows: LegendRow[];
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  onRemove: (key: string) => void;
  /** Hemisphere the neighbours are shown for (3D only). */
  side?: "L" | "R" | null;
  onSide?: (s: "L" | "R") => void;
}) {
  const [open, setOpen] = useState(false); // collapsed: the in-scene labels need the room
  if (!rows.length) return null;
  const hasNb = rows.some((r) => r.kind === "neighbour");
  return (
    <div data-atl-obstacle="" className="atl-chip pointer-events-auto flex max-w-[min(280px,70vw)] flex-col items-stretch gap-1 p-1.5" role="group" aria-label="Legend">
      <div className="flex items-center gap-1.5">
        <button type="button" className="flex flex-1 items-center gap-1.5 text-left text-xs text-text-dim hover:text-text" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {rows.slice(0, 8).map((r) => (
            <span key={r.key} className="atl-dot" style={{ background: r.color }} />
          ))}
          <span className="ml-1">Legend</span>
          {open ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
        </button>
      </div>
      {open && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {rows.map((r) => (
            <li
              key={r.key}
              className={`flex items-center gap-2 rounded-sm px-1 py-0.5 text-xs ${hoverKey === r.key ? "bg-panel-2 text-text" : "text-text-dim"}`}
              onPointerEnter={() => onHover(r.key)}
              onPointerLeave={() => onHover(null)}
            >
              <span className="atl-dot" style={{ background: r.color }} />
              <span className="min-w-0 flex-1 truncate" title={r.name}>
                {r.name}
              </span>
              {r.kind === "neighbour" && <span className="font-mono text-[9px] uppercase text-text-faint">nb</span>}
              {r.removable && (
                <button type="button" aria-label={`Remove ${r.name}`} className="text-text-faint hover:text-text" onClick={() => onRemove(r.key)}>
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
          {hasNb && side && onSide && (
            <li className="mt-0.5 flex items-center gap-1 border-t border-panel-border pt-1 text-[11px] text-text-faint">
              <span>Neighbours on the</span>
              <span className="atl-seg" role="radiogroup" aria-label="Hemisphere of the neighbours">
                {(["L", "R"] as const).map((s) => (
                  <IconBtn key={s} radio on={side === s} label={s === "L" ? "Left hemisphere" : "Right hemisphere"} text={s} onClick={() => onSide(s)} />
                ))}
              </span>
              <span>side</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** A compact search that expands when opened and offers matches to add to the view. */
export function AddStructure({ q, setQ, results, onAdd }: { q: string; setQ: (s: string) => void; results: { key: string; name: string; icons?: React.ReactNode }[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open)
    return (
      <div data-atl-obstacle="" className="atl-bar pointer-events-auto">
        <IconBtn below label="Add a structure to compare" icon={<Plus />} onClick={() => setOpen(true)} />
      </div>
    );
  return (
    <div data-atl-obstacle="" className="pointer-events-auto relative">
      <div className="atl-bar items-center gap-1 pl-2">
        <Search size={14} className="text-text-faint" aria-hidden />
        <input
          ref={ref}
          aria-label="Add structure"
          className="h-8 w-44 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
          placeholder="Add structure..."
          value={q}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setQ("");
              setOpen(false);
            }
          }}
        />
        <IconBtn
          below
          label="Close"
          icon={<X />}
          onClick={() => {
            setQ("");
            setOpen(false);
          }}
        />
      </div>
      {results.length > 0 && (
        <ul className="atl-pop right-0 top-full mt-1 max-h-60 w-72 overflow-y-auto">
          {results.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className="atl-item"
                onClick={() => {
                  onAdd(r.key);
                  setQ("");
                }}
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.icons}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shown after a click on a greyed (not on the syllabus) region when it has not been opened. */
export function LockedCard({ name, onCurious, onClose }: { name: string; onCurious: () => void; onClose: () => void }) {
  return (
    <div className="atl-chip atl-card-in pointer-events-auto relative flex w-[min(340px,100%)] flex-col items-stretch gap-2 p-3" role="dialog" aria-label="Not part of your syllabus">
      <button type="button" aria-label="Close" className="absolute right-2 top-2 text-text-faint hover:text-text" onClick={onClose}>
        <X size={14} />
      </button>
      <p className="flex items-center gap-2 pr-5 text-sm font-medium text-text">
        <Lock size={14} className="text-text-faint" aria-hidden /> Not part of your syllabus
      </p>
      <p className="text-sm text-text-dim">{name}</p>
      <button type="button" className="btn btn-primary self-start" onClick={onCurious}>
        Oh, I&apos;m just curious
      </button>
    </div>
  );
}

/** Supplementary background for a structure that is not on the syllabus (unlocked on request). */
/** An atlas landmark that is not on the course's structure lists (the arcuate fasciculus, the locus coeruleus...): shown
 *  and highlightable like any structure, with the app's own short note. */
export function LandmarkCard({ name, blurb }: { name: string; blurb?: string }) {
  return (
    <section className="atl-card-in rounded-card border border-dashed border-panel-border bg-panel p-4" aria-label={`${name}: landmark`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">Landmark · not on the lab structure lists</p>
      <h2 className="mt-1 font-display text-xl tracking-wide text-text">{name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text">{blurb ?? "No note has been written for this landmark yet."}</p>
      <p className="mt-3 text-xs text-text-faint">Shown so you can find it on sections and in 3D. Your lab lists decide what is tested.</p>
    </section>
  );
}

export function ExtraInfoCard({ name, latin, blurb, region, onLock }: { name: string; latin?: string | null; blurb?: string; region?: string; onLock: () => void }) {
  return (
    <section className="atl-card-in rounded-card border border-dashed border-accent-2/60 bg-panel p-4" aria-label={`${name}: supplementary information`}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-accent-2">
        <Sparkles size={12} aria-hidden /> Supplementary · not in your slides
        <button type="button" onClick={onLock} aria-label="Lock again" className="ml-auto flex items-center gap-1 text-text-faint hover:text-text">
          <LockOpen size={12} aria-hidden /> lock
        </button>
      </p>
      <h2 className="mt-1 font-display text-xl tracking-wide text-text">{name}</h2>
      {(latin || region) && (
        <p className="text-xs italic text-text-dim">
          {latin}
          {latin && region ? " · " : ""}
          {region && <span className="not-italic">{region}</span>}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-text">{blurb ?? "No background note has been written for this structure yet."}</p>
      <p className="mt-3 text-xs text-text-faint">Extra context only. It will not appear in your cards or exams unless your course adds it.</p>
    </section>
  );
}
