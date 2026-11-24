"use client";

import { useEffect, useMemo, useState } from "react";
import { Atlas3Canvas, type View3 } from "./engine/Atlas3Canvas";
import type { Index3, Label3 } from "./engine/data";
import { loadCatalog, type CatItem } from "./catalog";
import { ARTERIES, ARTERY, SUPPLY, artShort, unitArteries, type SupplyUnit } from "@/components/atlas/supply/supply-data";
import { unitIds } from "./supplyUnits";
import "./atlas3.css";

/* Blood supply on the 3D atlas v3: the atlas in the Pathway tracer's frame (where Blood supply's own arteries, veins and
 * flow lines are), its outside surface one see-through layer with the arterial territories painted per vertex
 * (tools/atlas3/frameglb.py: the course's supply map, shared gyri split by where the surface lies and faces), and inside
 * it the deep structures of the territories shown now, in their artery's colour. Blood supply's vessel and vein layers
 * are drawn in the same scene (children). */

const CORTEX_END = SUPPLY.units.findIndex((u) => u.name === "Corpus callosum");
/** surface units (cortex, the callosum, the cerebellum's cortex): painted on the glass, not drawn as deep structures (the
 * cerebellar peduncles and the spinocerebellar tracts are) */
const SURFACE_UNIT = (u: SupplyUnit, ui: number) => ui < CORTEX_END || u.name === "Corpus callosum" || /vermis|tonsil|flocculus|cerebellar hemisphere/i.test(u.name);

/** Every atlas label -> the most specific supply unit holding it. */
function unitMap(index: Index3, items: CatItem[]): Map<number, { unit: SupplyUnit; ui: number }> {
  const best = new Map<number, { unit: SupplyUnit; ui: number; n: number }>();
  SUPPLY.units.forEach((u, ui) => {
    const ids = new Set(unitIds(u, index, items));
    for (const i of ids) {
      const cur = best.get(i);
      if (!cur || ids.size < cur.n) best.set(i, { unit: u, ui, n: ids.size });
    }
  });
  return new Map([...best].map(([i, e]) => [i, { unit: e.unit, ui: e.ui }]));
}

export type SupplyView = "inferior" | "left" | "midsagittal" | "superior" | "posterior";

export default function SupplyCanvas3({
  show,
  colors,
  side,
  variant,
  glass,
  medial,
  view,
  viewNonce,
  onPickUnit,
  overlay,
  children,
}: {
  /** the territories shown now, and how strongly */
  show: { artery: string; alpha: number }[];
  /** colours of the arteries (a blocked vessel's territory is drawn in the block red) */
  colors: Map<string, string>;
  side?: "L" | "R";
  variant: string;
  glass: number;
  medial: boolean;
  view: SupplyView;
  viewNonce: number;
  onPickUnit: (u: SupplyUnit) => void;
  overlay?: React.ReactNode;
  children?: React.ReactNode;
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
  const units = useMemo(() => (index && items ? unitMap(index, items) : null), [index, items]);
  const shown = useMemo(() => new Map(show.map((s) => [s.artery, s.alpha])), [show]);

  // inside the glass: only the deep structures of the territories shown, in their artery's colour
  const { hiddenIds, colorsById } = useMemo(() => {
    const hidden: number[] = [];
    const cols: Record<number, string> = {};
    if (!index || !units) return { hiddenIds: hidden, colorsById: cols };
    for (const l of index.labels) {
      const e = units.get(l.id);
      const a = e && !SURFACE_UNIT(e.unit, e.ui) ? unitArteries(e.unit, variant)[0] : null;
      if (a && shown.has(a) && (!side || l.side === side || l.side === "M")) cols[l.id] = colors.get(a) ?? ARTERY.get(a)?.color ?? "#cccccc";
      else hidden.push(l.id);
    }
    return { hiddenIds: hidden, colorsById: cols };
  }, [index, units, shown, colors, variant, side]);
  const territories = useMemo(
    () => [{ color: "#000000", alpha: 0 }, ...ARTERIES.map((a) => ({ color: colors.get(a.id) ?? a.color, alpha: (shown.get(a.id) ?? 0) * 0.78 }))],
    [colors, shown],
  );
  const tipText = useMemo(
    () => (l: Label3) => {
      const e = units?.get(l.id);
      return e ? `${e.unit.name}: ${artShort(unitArteries(e.unit, variant))}` : l.name;
    },
    [units, variant],
  );
  const onPick = useMemo(
    () => (l: Label3 | null) => {
      const e = l ? units?.get(l.id) : undefined;
      if (e) onPickUnit(e.unit);
    },
    [units, onPickUnit],
  );
  const v3view: View3 = view === "midsagittal" ? "left" : view;
  return (
    <div className="relative h-full w-full">
      <Atlas3Canvas
        frame="tracer"
        glass={glass}
        territories={territories}
        territorySide={side}
        hiddenIds={hiddenIds}
        colors={colorsById}
        view={v3view}
        viewNonce={viewNonce}
        cut={medial ? { axis: "x", pos: 0 } : null}
        tipText={tipText}
        onPick={onPick}
        onReady={setIndex}
      >
        {children}
      </Atlas3Canvas>
      {overlay}
    </div>
  );
}
