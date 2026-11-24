"use client";

import { useEffect, useMemo, useState } from "react";
import { Atlas3Canvas, type Atlas3Props } from "./engine/Atlas3Canvas";
import type { Index3, Label3 } from "./engine/data";
import { loadCatalog, loadFibres, type CatItem, type Fibres } from "./catalog";
import { deepSets, presentItem } from "./present";
import { AtlasLoader } from "@/components/atlas/ui/AtlasLoader";
import "./atlas3.css";

/** One structure shown by itself in the v3 atlas (Name that structure, the atlas peek, the blood supply quiz), presented
 * as Explore presents it: the view that shows it best, the deep view, the see-through brainstem, a tract's fibres. `quiz`
 * hides every name (no pins, no hover names). Remount it (key) per structure. */
export function StructureView3({
  slug,
  pick,
  height = 480,
  quiz = false,
  label,
}: {
  /** a course structure */
  slug?: string;
  /** or the structure from the loaded catalog and index (null: not in the atlas); keep it stable (useCallback) */
  pick?: (index: Index3, items: CatItem[]) => CatItem | null;
  height?: number | string;
  quiz?: boolean;
  label?: string;
}) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [items, setItems] = useState<CatItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCatalog().then((c) => alive && setItems(c.items));
    return () => {
      alive = false;
    };
  }, []);
  /** undefined while loading, null when the atlas does not have it */
  const item = useMemo<CatItem | null | undefined>(() => {
    if (!items) return undefined;
    if (slug) return items.find((x) => x.slug === slug) ?? null;
    if (!pick) return null;
    return index ? pick(index, items) : undefined;
  }, [items, slug, pick, index]);
  const byId = useMemo(() => new Map<number, Label3>((index?.labels ?? []).map((l) => [l.id, l])), [index]);
  // a tract drawn as fibres (no labels of its own): its polylines, seen in the deep view, the camera framed on them
  const fibreOnly = !!item?.fibre && !item.ids.length;
  const [fib, setFib] = useState<{ slug: string; f: Fibres } | null>(null);
  useEffect(() => {
    if (!item || !fibreOnly) return;
    let alive = true;
    const s = item.slug;
    loadFibres(s).then((f) => alive && setFib({ slug: s, f }));
    return () => {
      alive = false;
    };
  }, [item, fibreOnly]);
  const fibreLines = fibreOnly && fib?.slug === item?.slug ? fib.f.lines : null;
  const pr = useMemo(() => (index && item ? presentItem(item, index, byId) : null), [index, item, byId]);
  const ds = useMemo(() => ((pr?.deep || fibreOnly) && index && item ? deepSets(index, item.ids, byId, fibreOnly) : null), [pr, fibreOnly, index, item, byId]);
  const hideSides = useMemo<("L" | "R")[]>(() => (pr?.sides === "L" ? ["R"] : pr?.sides === "R" ? ["L"] : []), [pr]);
  const pins = useMemo(() => {
    if (quiz || !item) return [];
    const out: { id: number; text: string }[] = [];
    const seen = new Set<string>();
    for (const id of item.ids) {
      const l = byId.get(id);
      if (!l || seen.has(l.side) || hideSides.includes(l.side as "L" | "R")) continue;
      seen.add(l.side);
      out.push({ id, text: label ?? item.name });
    }
    return out.slice(0, 2);
  }, [quiz, item, byId, hideSides, label]);
  const focus = useMemo<Atlas3Props["focus"]>(() => {
    if (fibreLines) {
      const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const l of fibreLines)
        for (let i = 0; i < l.length; i += 3)
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], l[i + k]);
            hi[k] = Math.max(hi[k], l[i + k]);
          }
      return lo[0] <= hi[0] ? { ids: [], box: [lo, hi], nonce: 2 } : null;
    }
    return pr && pr.focusIds.length ? { ids: pr.focusIds, nonce: 1 } : null;
  }, [pr, fibreLines]);
  const props: Atlas3Props = {
    view: pr?.view ?? "left",
    viewNonce: pr ? 1 : 0,
    hideSides,
    hiddenIds: ds?.hiddenIds ?? [],
    ghostIds: ds?.ghostIds ?? [],
    ghost: !!ds?.hull,
    selected: item?.ids ?? [],
    dimOthers: !!pr?.deep,
    sulcus: item?.sulcus,
    areaMask: item?.area !== undefined ? 1 << item.area : 0,
    focus,
    fibres: fibreLines,
    pins,
    quiz,
    onReady: setIndex,
  };
  return (
    <div className="atl3-one" style={{ height }}>
      <Atlas3Canvas {...props} />
      {item === null && <div className="atl3-one-note">Not in the 3D model.</div>}
      {(!index || item === undefined) && (
        <div className="atl3-loading">
          <AtlasLoader label="Loading the 3D atlas" progress={0.1} stages={[{ id: "atlas", label: "Brain surface", state: "active" }]} />
        </div>
      )}
    </div>
  );
}

export default StructureView3;
