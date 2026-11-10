"use client";

import { useEffect, useRef } from "react";

export type LabelItem = { id: string; text: string; x: number; y: number; lx: number; ly: number; side: 0 | 1; color: string; mark?: boolean };
/** The 3D layers project their label anchors to the screen and hand them to this painter (crisp DOM/SVG text, no churn). */
export type LabelBus = {
  attach: (fn: ((items: LabelItem[], w: number, h: number) => void) | null) => void;
  emit: (items: LabelItem[], w: number, h: number) => void;
  /** true while a painter is mounted */
  ready: () => boolean;
};
export function createLabelBus(): LabelBus {
  let fn: ((items: LabelItem[], w: number, h: number) => void) | null = null;
  return { attach: (f) => void (fn = f), emit: (i, w, h) => fn?.(i, w, h), ready: () => !!fn };
}
export type RawLabel = { id: string; text: string; x: number; y: number; color: string; mark?: boolean };

/** Pushes labels to the left and right margins (by which half of the canvas the anchor is in), keeping a minimum gap and the bands clear. */
export function layoutLabels(items: RawLabel[], w: number, h: number, topInset = 18, bounds?: { minX: number; maxX: number }): LabelItem[] {
  const top = topInset;
  const bottom = h - 66;
  const GAP = 21;
  const out: LabelItem[] = [];
  for (const side of [0, 1] as const) {
    const seen = new Set<string>();
    const col = items
      .filter((i) => (i.x < w / 2 ? 0 : 1) === side)
      .sort((a, b) => a.y - b.y)
      .filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true))); // one label per name in a column
    const ys = col.map((c) => Math.min(bottom, Math.max(top, c.y)));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP);
    if (ys.length && ys[ys.length - 1] > bottom) ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - GAP);
    // the label columns hug the drawn vessels (short leaders) and stay inside the canvas
    const tw = Math.max(0, ...col.map((c) => c.text.length)) * 6.9 + 14;
    const lx = side === 0 ? Math.max(tw, Math.min(w / 2 - 20, (bounds?.minX ?? 100) - 26)) : Math.min(w - tw, Math.max(w / 2 + 20, (bounds?.maxX ?? w - 100) + 26));
    col.forEach((c, i) => out.push({ ...c, side, lx, ly: ys[i] }));
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function MarginLabels({ bus }: { bus: LabelBus }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    bus.attach((items, w, h) => {
      const el = ref.current;
      if (!el) return;
      el.setAttribute("viewBox", `0 0 ${w} ${h}`);
      el.innerHTML = items
        .map((l) => {
          const ex = l.side === 0 ? l.lx + 5 : l.lx - 5;
          const ax = l.side === 0 ? "end" : "start";
          const mark = l.mark ? `<path d="M${l.x - 5} ${l.y - 5}L${l.x + 5} ${l.y + 5}M${l.x + 5} ${l.y - 5}L${l.x - 5} ${l.y + 5}" stroke="#d1495b" stroke-width="2.4" stroke-linecap="round"/>` : "";
          return (
            `<path d="M${l.x.toFixed(1)} ${l.y.toFixed(1)}L${ex.toFixed(1)} ${l.ly.toFixed(1)}" stroke="${l.color}" stroke-opacity=".75" stroke-width="1" fill="none"/>` +
            `<circle cx="${l.x.toFixed(1)}" cy="${l.y.toFixed(1)}" r="2.6" fill="${l.color}" stroke="var(--panel-solid)" stroke-width="1"/>` +
            mark +
            `<text x="${l.lx}" y="${(l.ly + 4).toFixed(1)}" text-anchor="${ax}" font-size="12" font-weight="600" fill="var(--text)" stroke="var(--panel-solid)" stroke-width="3" paint-order="stroke" stroke-linejoin="round" style="font-family:var(--font-body,system-ui,sans-serif)">${esc(l.text)}</text>`
          );
        })
        .join("");
    });
    return () => bus.attach(null);
  }, [bus]);
  return <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
