"use client";
// Supplementary content = anything beyond the course syllabus and slides. It is locked and greyed by default.
// The first time a student opens supplementary content in a section they get a one-time heads-up; after that
// the toggle opens it straight away. Clicking anywhere outside it (or Esc) locks it again.
//
//   <Supplementary section="pathways" title="Named syndrome">Brown-Séquard syndrome …</Supplementary>
//
// For content that is not a block of text (a 3D mesh, a map region), use useSupplementaryGate(section) and
// <SupplementaryHeadsUp /> directly.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, Sparkles, X } from "lucide-react";

const KEY = "anki.supp.seen.v1";

function seenSections(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSeen(section: string) {
  try {
    const s = seenSections();
    s.add(section);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* private mode: the heads-up simply shows again next time */
  }
}

/** Lock state for one piece of supplementary content. request() opens it, asking first if this section is new. */
export function useSupplementaryGate(section: string) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const request = useCallback(() => {
    if (seenSections().has(section)) setOpen(true);
    else setAsking(true);
  }, [section]);
  const confirm = useCallback(() => {
    markSeen(section);
    setAsking(false);
    setOpen(true);
  }, [section]);
  const cancel = useCallback(() => setAsking(false), []);
  const lock = useCallback(() => {
    setOpen(false);
    setAsking(false);
  }, []);
  return { open, asking, request, confirm, cancel, lock };
}

/** The one-time heads-up shown the first time supplementary content is opened in a section. */
export function SupplementaryHeadsUp({ onConfirm, onCancel, what }: { onConfirm: () => void; onCancel: () => void; what?: string }) {
  return (
    <div role="dialog" aria-label="Supplementary information" className="rounded-sm border border-dashed border-panel-border-hi bg-bg-2 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-text">
        <Sparkles size={15} aria-hidden className="text-accent-2" />
        Heads up: {what ? `${what} is` : "this is"} beyond your syllabus and slides.
      </p>
      <p className="mt-1 text-text-dim">It is extra context, not something the course materials ask you to know. It locks again when you click away.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onConfirm} autoFocus>
          Oh, I&apos;m just curious
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Never mind
        </button>
      </div>
    </div>
  );
}

type Props = {
  /** One heads-up per section, e.g. "pathways", "lesion-lab", "atlas-3d", "brainstem", "study". */
  section: string;
  /** Short name of what is hidden, shown on the locked chip ("Named syndrome", "Clinical sign"). */
  title?: string;
  children: ReactNode;
  /** Inline chip instead of a block (for a word or phrase inside a sentence or list). */
  inline?: boolean;
  className?: string;
};

export function Supplementary({ section, title = "Supplementary", children, inline = false, className = "" }: Props) {
  const gate = useSupplementaryGate(section);
  const ref = useRef<HTMLElement | null>(null);
  const { open, lock } = gate;

  // click anywhere outside, or Esc, locks it again
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) lock();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") lock();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, lock]);

  const Tag = inline ? "span" : "div";
  if (gate.asking) {
    return (
      <Tag ref={ref as never} className={`${inline ? "inline-block align-top" : "block"} my-1 ${className}`}>
        <SupplementaryHeadsUp what={title === "Supplementary" ? undefined : title} onConfirm={gate.confirm} onCancel={gate.cancel} />
      </Tag>
    );
  }
  if (!open) {
    return (
      <Tag ref={ref as never} className={`${inline ? "inline-flex" : "flex"} my-1 ${className}`}>
        <button
          type="button"
          onClick={gate.request}
          className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-panel-border px-2 py-1 text-xs text-text-faint opacity-80 hover:border-panel-border-hi hover:text-text-dim"
          title="Beyond your syllabus and slides: click to peek"
        >
          <Lock size={12} aria-hidden />
          <span>{title}</span>
          <span className="font-mono uppercase tracking-wider">· supplementary</span>
        </button>
      </Tag>
    );
  }
  return (
    <Tag
      ref={ref as never}
      className={`${inline ? "inline" : "block"} relative my-1 rounded-sm border border-dashed border-accent-2/60 bg-bg-2/60 ${inline ? "px-1" : "p-2 pr-7"} ${className}`}
    >
      {!inline && (
        <span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-accent-2">
          <Sparkles size={11} aria-hidden /> Supplementary · not in your slides
        </span>
      )}
      {children}
      {!inline && (
        <button type="button" onClick={lock} aria-label="Lock again" className="absolute right-1.5 top-1.5 text-text-faint hover:text-text">
          <X size={14} aria-hidden />
        </button>
      )}
    </Tag>
  );
}
