"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/* Crisp DOM labels in the left and right gutters with leader lines to their anchors (1 to 3 words each, no floating pills).
 * Positions are written straight to the DOM in useFrame: React never re-renders per frame. The fixed L | R chips at the
 * screen edges follow the camera (which edge is the patient's left). */

export interface LabelItem {
  key: string;
  text: string;
  at: THREE.Vector3;
  /** 2 = current (bold), 1 = visible stop, 3 = the crossing callout */
  prio: number;
  color?: string;
}
export interface LabelDom {
  tags: Map<string, HTMLDivElement>;
  lines: Map<string, SVGLineElement>;
  dots: Map<string, SVGCircleElement>;
  chipL: HTMLDivElement | null;
  chipR: HTMLDivElement | null;
  root: HTMLDivElement | null;
}

/** The overlay the labels live in (the parent of any tag), when `dom.root` was never set. */
const tagsRoot = (d: LabelDom) => d.tags.values().next().value?.parentElement ?? null;
const _p = new THREE.Vector3();
const _x = new THREE.Vector3();

export function LabelUpdater({ items, dom, enabled, obstacleTop, obstacleBottom }: { items: LabelItem[]; dom: React.RefObject<LabelDom>; enabled: boolean; obstacleTop: number; obstacleBottom: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lastFlip = useRef<boolean | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const sorted = useMemo(() => [...items].sort((a, b) => b.prio - a.prio), [items]);
  // the scene renders on demand: when the tags change (a new beat) their wrapped heights are only known after React has laid
  // them out, so lay the stack out again a moment later instead of keeping the first, stale heights (overlapping labels)
  useEffect(() => {
    invalidate();
    const t = [60, 250].map((ms) => setTimeout(invalidate, ms));
    return () => t.forEach(clearTimeout);
  }, [items, invalidate]);
  useFrame(() => {
    const d = dom.current;
    if (!d) return;
    const W = size.width, H = size.height;
    // L | R chips: which screen edge is the patient's left (+x)?
    _x.set(1, 0, 0).transformDirection(camera.matrixWorldInverse);
    const leftOnRight = _x.x > 0;
    if (lastFlip.current !== leftOnRight && d.chipL && d.chipR) {
      lastFlip.current = leftOnRight;
      d.chipL.style.left = leftOnRight ? "auto" : "6px";
      d.chipL.style.right = leftOnRight ? "6px" : "auto";
      d.chipR.style.left = leftOnRight ? "6px" : "auto";
      d.chipR.style.right = leftOnRight ? "auto" : "6px";
    }
    const gut: Record<"l" | "r", { key: string; ay: number; ax: number; h: number; w: number }[]> = { l: [], r: [] };
    // below the legend (top left) on wide screens; on phones the legend is folded into a button
    const top0 = W < 640 ? 44 : obstacleTop;
    let top = top0;
    for (const it of sorted) {
      const el = d.tags.get(it.key);
      const ln = d.lines.get(it.key);
      const dot = d.dots.get(it.key);
      if (!el || !ln || !dot) continue;
      _p.copy(it.at).project(camera);
      const vis = enabled && _p.z > -1 && _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
      if (!vis) {
        el.style.visibility = "hidden";
        ln.style.visibility = "hidden";
        dot.style.visibility = "hidden";
        continue;
      }
      const ax = (_p.x * 0.5 + 0.5) * W;
      const ay = (-_p.y * 0.5 + 0.5) * H;
      el.style.maxWidth = `${Math.round(Math.min(it.prio === 3 ? 320 : 200, it.prio === 3 ? W * 0.62 : W * 0.5 - 40))}px`;
      if (it.prio === 3) {
        // the crossing callout: a banner at the top centre, its leader line down to the crossing
        const w = el.offsetWidth || 200, h = el.offsetHeight || 20;
        const x = (W - w) / 2;
        el.style.visibility = "visible";
        el.style.transform = `translate(${x.toFixed(1)}px,${top.toFixed(1)}px)`;
        ln.setAttribute("x1", (W / 2).toFixed(1));
        ln.setAttribute("y1", (top + h).toFixed(1));
        ln.setAttribute("x2", ax.toFixed(1));
        ln.setAttribute("y2", ay.toFixed(1));
        ln.style.visibility = "visible";
        dot.setAttribute("cx", ax.toFixed(1));
        dot.setAttribute("cy", ay.toFixed(1));
        dot.style.visibility = "visible";
        top += h + 6;
        continue;
      }
      const side = ax < W / 2 ? "l" : "r";
      gut[side].push({ key: it.key, ay, ax, h: el.offsetHeight || 20, w: el.offsetWidth || 90 });
    }
    // the open key box (top left) is an obstacle too: the left gutter stacks below its real bottom edge
    let keyBottom = 0;
    const keyEl = document.querySelector<HTMLElement>("[data-pw-key]");
    const rootEl = d.root ?? tagsRoot(d);
    if (keyEl && rootEl && keyEl.offsetParent) keyBottom = keyEl.getBoundingClientRect().bottom - rootEl.getBoundingClientRect().top + 6;
    for (const side of ["l", "r"] as const) {
      const list = gut[side].sort((a, b) => a.ay - b.ay);
      // stack without overlaps between the toolbar band at the top and the controls at the bottom
      let y = side === "l" ? Math.max(top, keyBottom) : top;
      const placed: number[] = [];
      for (const it of list) {
        const want = Math.max(y, it.ay - it.h / 2);
        placed.push(want);
        y = want + it.h + 4;
      }
      // pull back up if the stack overflows the bottom
      let over = y - 4 - (H - obstacleBottom);
      for (let i = list.length - 1; i >= 0 && over > 0; i--) {
        const room = i === 0 ? placed[0] - (side === "l" ? Math.max(top, keyBottom) : top) : placed[i] - (placed[i - 1] + list[i - 1].h + 4);
        const m = Math.min(room, over);
        for (let j = i; j < list.length; j++) placed[j] -= m;
        over -= m;
      }
      list.forEach((it, i) => {
        const el = d.tags.get(it.key)!;
        const ln = d.lines.get(it.key)!;
        const dot = d.dots.get(it.key)!;
        // clear of the fixed L | R chips at the screen edges
        const x = side === "l" ? 30 : W - it.w - 30;
        const yy = placed[i];
        el.style.visibility = "visible";
        el.style.transform = `translate(${x.toFixed(1)}px,${yy.toFixed(1)}px)`;
        const ex = side === "l" ? x + it.w : x;
        const ey = yy + it.h / 2;
        ln.setAttribute("x1", ex.toFixed(1));
        ln.setAttribute("y1", ey.toFixed(1));
        ln.setAttribute("x2", it.ax.toFixed(1));
        ln.setAttribute("y2", it.ay.toFixed(1));
        ln.style.visibility = "visible";
        dot.setAttribute("cx", it.ax.toFixed(1));
        dot.setAttribute("cy", it.ay.toFixed(1));
        dot.style.visibility = "visible";
      });
    }
  });
  return null;
}
