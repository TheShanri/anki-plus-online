"use client";
// The brainstem reference docked beside another view (Explore): shown when the selected structure is on the brainstem
// plates, collapsible (remembered in this browser), and while open it asks the 3D view to breathe its highlight in
// step with the plate (brainstemBreath).
import { useEffect, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { BrainstemRef, brainstemRefCovers } from "./BrainstemRef";
import { setBrainstemBreath } from "./plate/pulse";

const KEY = "bs3-ref-open";
const listeners = new Set<() => void>();
function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
function writeOpen(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
  for (const l of listeners) l();
}

export function BrainstemRefDock({ slug, side, onPick }: { slug: string | null | undefined; side?: "L" | "R" | "both"; onPick?: (slug: string) => void }) {
  const open = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readOpen,
    () => true,
  );
  const covers = !!slug && brainstemRefCovers([slug]);
  useEffect(() => {
    if (!covers || !open) return;
    setBrainstemBreath(1);
    return () => setBrainstemBreath(-1);
  }, [covers, open]);
  if (!covers || !slug) return null;
  return (
    <section className="bsr-dock" aria-label="Brainstem atlas reference">
      <button type="button" className="bsr-dock-head" aria-expanded={open} onClick={() => writeOpen(!open)}>
        <span className="min-w-0 flex-1 truncate">In the brainstem atlas</span>
        <ChevronDown size={14} aria-hidden className={open ? "bsr-chev bsr-chev-open" : "bsr-chev"} />
      </button>
      {open && <BrainstemRef structures={[slug]} side={side} compact onPick={onPick} />}
    </section>
  );
}
