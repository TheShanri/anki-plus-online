"use client";

import { useEffect, useMemo, useState } from "react";
import { Atlas3Canvas, type Atlas3Props } from "./engine/Atlas3Canvas";
import type { Index3, Label3 } from "./engine/data";
import { loadCatalog, type CatItem } from "./catalog";
import { deepSets, presentItem } from "./present";
import { AtlasLoader } from "@/components/atlas/ui/AtlasLoader";
import "./atlas3.css";

/** One structure shown by itself in the v3 atlas (Name that structure, the atlas peek), presented as Explore presents it:
 * the view that shows it best, the deep view, the see-through brainstem. `quiz` hides every name (no pins, no hover
 * names). Remount it (key) per structure. */
export function StructureView3({ slug, height = 480, quiz = false, label }: { slug: string; height?: number | string; quiz?: boolean; label?: string }) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [item, setItem] = useState<CatItem | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadCatalog().then((c) => alive && setItem(c.items.find((x) => x.slug === slug) ?? null));
    return () => {
      alive = false;
    };
  }, [slug]);
  const byId = useMemo(() => new Map<number, Label3>((index?.labels ?? []).map((l) => [l.id, l])), [index]);
  const pr = useMemo(() => (index && item ? presentItem(item, index, byId) : null), [index, item, byId]);
  const ds = useMemo(() => (pr?.deep && index && item ? deepSets(index, item.ids, byId) : null), [pr, index, item, byId]);
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
  const focus = useMemo(() => (pr && pr.focusIds.length ? { ids: pr.focusIds, nonce: 1 } : null), [pr]);
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
