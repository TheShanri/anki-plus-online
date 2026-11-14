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

export function LabelUpdater({ items, dom, enabled, obstacleTop, obstacleBottom, avoid }: { items: LabelItem[]; dom: React.RefObject<LabelDom>; enabled: boolean; obstacleTop: number; obstacleBottom: number; avoid?: THREE.Vector3[] }) {
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
  /* Smooth following (owner: labels jittery, lagging and snapping while the brain moves). Every frame the anchors are projected
   * and the leader lines and dots written to the DOM in the same frame. The tag boxes keep their gutter side and slot while the
   * view is moving (no re-sorting, no snapping); the slots are re-solved only when the view has settled (or the labels or size
   * changed) and the tags then glide to their new slots. */
  const st = useRef(new Map<string, { side: "l" | "r"; y: number; ty: number; w: number; h: number; rank: number }>());
  const pose = useRef({ m: new Float32Array(16), zoom: 0, w: 0, h: 0, moveAt: 0, dirty: true, sig: "" });
  useFrame((_, dt) => {
    const d = dom.current;
    if (!d) return;
    const W = size.width, H = size.height;
    const now = performance.now();
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
    // has the view moved since the last frame?
    const ps = pose.current;
    const zoom = (camera as THREE.PerspectiveCamera).zoom;
    const sizeChanged = ps.w !== W || ps.h !== H;
    let moved = ps.zoom !== zoom || sizeChanged;
    const me = camera.matrixWorld.elements;
    for (let i = 0; i < 16 && !moved; i++) if (Math.abs(me[i] - ps.m[i]) > 1e-6) moved = true;
    if (moved) {
      ps.m.set(me);
      ps.zoom = zoom;
      ps.dirty = true;
      ps.moveAt = now;
    }
    const sig = sorted.map((i) => i.key).join("|") + `#${enabled}`;
    const itemsChanged = sig !== ps.sig;
    ps.w = W;
    ps.h = H;
    const settled = now - ps.moveAt > 160;
    // the slots are solved every frame (the targets follow the anchors), but while the view moves the order of the tags in a
    // gutter and their side are kept (no re-sorting, no side flips: nothing snaps); they are re-sorted once it settles
    const solveNow = true;

    // anchors this frame
    const anc = new Map<string, { ax: number; ay: number; vis: boolean }>();
    for (const it of sorted) {
      _p.copy(it.at).project(camera);
      const vis = enabled && _p.z > -1 && _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
      anc.set(it.key, { ax: (_p.x * 0.5 + 0.5) * W, ay: (-_p.y * 0.5 + 0.5) * H, vis });
    }
    // below the legend (top left) on wide screens; on phones the legend is folded into a button
    let top = W < 640 ? 44 : obstacleTop;
    const hide = (key: string) => {
      const el = d.tags.get(key), ln = d.lines.get(key), dot = d.dots.get(key);
      if (el) el.style.visibility = "hidden";
      if (ln) ln.style.visibility = "hidden";
      if (dot) dot.style.visibility = "hidden";
    };
    // every tag in the gutter has a stored rank (a frozen order is only possible then)
    const list0 = (l: { key: string }[]) => l.every((x) => st.current.has(x.key));
    const gut: Record<"l" | "r", { key: string; ay: number; h: number; w: number }[]> = { l: [], r: [] };
    const sizeOf = (it: LabelItem, el: HTMLDivElement) => {
      el.style.maxWidth = `${Math.round(Math.min(it.prio === 3 ? 320 : 200, it.prio === 3 ? W * 0.62 : W * 0.5 - 40))}px`;
      return { w: el.offsetWidth || 90, h: el.offsetHeight || 20 };
    };
    for (const it of sorted) {
      const el = d.tags.get(it.key), ln = d.lines.get(it.key), dot = d.dots.get(it.key);
      const a = anc.get(it.key)!;
      if (!el || !ln || !dot) continue;
      if (!a.vis) {
        hide(it.key);
        continue;
      }
      if (it.prio === 3) {
        // the crossing callout: a banner at the top centre, its leader line down to the crossing
        const { w, h } = sizeOf(it, el);
        const x = (W - w) / 2;
        el.style.visibility = "visible";
        el.style.transform = `translate(${x.toFixed(1)}px,${top.toFixed(1)}px)`;
        ln.setAttribute("x1", (W / 2).toFixed(1));
        ln.setAttribute("y1", (top + h).toFixed(1));
        ln.setAttribute("x2", a.ax.toFixed(1));
        ln.setAttribute("y2", a.ay.toFixed(1));
        ln.style.visibility = "visible";
        dot.setAttribute("cx", a.ax.toFixed(1));
        dot.setAttribute("cy", a.ay.toFixed(1));
        dot.style.visibility = "visible";
        top += h + 6;
        continue;
      }
      // an item the layout has not placed yet (it came into view mid-drag) is placed right away
      const known = st.current.get(it.key);
      if (solveNow || !known) {
        const { w, h } = sizeOf(it, el);
        // side: kept unless the anchor is well across the middle (a hysteresis band), and always re-decided once settled
        const near = known && !settled && Math.abs(a.ax - W / 2) < 56;
        const side = known && (near || !settled) ? known.side : a.ax < W / 2 ? "l" : "r";
        gut[side].push({ key: it.key, ay: a.ay, h, w });
      }
    }
    if (gut.l.length || gut.r.length) {
      // the open key box (top left) is an obstacle too: the left gutter stacks below its real bottom edge
      let keyBottom = 0;
      const keyEl = document.querySelector<HTMLElement>("[data-pw-key]");
      const rootEl = d.root ?? tagsRoot(d);
      if (keyEl && rootEl && keyEl.offsetParent) keyBottom = keyEl.getBoundingClientRect().bottom - rootEl.getBoundingClientRect().top + 6;
      // the lit fibre on screen, to keep the tag boxes off it
      const av: number[] = [];
      if (avoid?.length)
        for (const q of avoid) {
          _p.copy(q).project(camera);
          if (_p.z > -1 && _p.z < 1) av.push((_p.x * 0.5 + 0.5) * W, (-_p.y * 0.5 + 0.5) * H);
        }
      const hits = (x: number, y: number, w: number, h: number) => {
        let n = 0;
        for (let i = 0; i < av.length; i += 2) if (av[i] > x - 2 && av[i] < x + w + 2 && av[i + 1] > y - 2 && av[i + 1] < y + h + 2) n++;
        return n;
      };
      for (const side of ["l", "r"] as const) {
        const frozen = !settled && !itemsChanged && list0(gut[side]);
        const list = gut[side].sort((a, b) => (frozen ? st.current.get(a.key)!.rank - st.current.get(b.key)!.rank : a.ay - b.ay));
        if (!list.length) continue;
        // stack without overlaps between the toolbar band at the top and the controls at the bottom
        const lo0 = side === "l" ? Math.max(top, keyBottom) : top;
        let y = lo0;
        const placed: number[] = [];
        for (const it of list) {
          const want = Math.max(y, it.ay - it.h / 2);
          placed.push(want);
          y = want + it.h + 4;
        }
        // pull back up if the stack overflows the bottom
        let over = y - 4 - (H - obstacleBottom);
        for (let i = list.length - 1; i >= 0 && over > 0; i--) {
          const room = i === 0 ? placed[0] - lo0 : placed[i] - (placed[i - 1] + list[i - 1].h + 4);
          const m = Math.min(room, over);
          for (let j = i; j < list.length; j++) placed[j] -= m;
          over -= m;
        }
        // nudge a tag up or down (clear of its neighbours and the bands) when its box covers the lit fibre
        if (av.length) {
          const hi = H - obstacleBottom;
          list.forEach((it, i) => {
            const x = side === "l" ? 30 : W - it.w - 30;
            const here = hits(x, placed[i], it.w, it.h);
            if (!here) return;
            const minY = i === 0 ? lo0 : placed[i - 1] + list[i - 1].h + 4;
            const maxY = (i === list.length - 1 ? hi : placed[i + 1] - 4) - it.h;
            let best = placed[i], bestN = here;
            for (let dy = 6; dy <= 120 && bestN > 0; dy += 6)
              for (const yy of [placed[i] - dy, placed[i] + dy]) {
                if (yy < minY || yy > maxY) continue;
                const n = hits(x, yy, it.w, it.h);
                if (n < bestN) {
                  bestN = n;
                  best = yy;
                }
              }
            placed[i] = best;
          });
        }
        list.forEach((it, i) => {
          const prev = st.current.get(it.key);
          // a tag that was already on screen glides to its new slot; a new one appears in place
          st.current.set(it.key, { side, y: prev ? prev.y : placed[i], ty: placed[i], w: it.w, h: it.h, rank: frozen ? prev!.rank : i });
        });
      }
      if (solveNow) ps.dirty = false;
    }
    if (solveNow) {
      ps.sig = sig;
      if (settled) ps.dirty = false;
    }
    // glide and write: tags ease toward their slots; leader lines and dots follow the anchors exactly, every frame
    let animating = false;
    for (const it of sorted) {
      if (it.prio === 3) continue;
      const s = st.current.get(it.key);
      const a = anc.get(it.key)!;
      const el = d.tags.get(it.key), ln = d.lines.get(it.key), dot = d.dots.get(it.key);
      if (!s || !el || !ln || !dot) continue;
      if (!a.vis) {
        hide(it.key);
        continue;
      }
      // time-based exponential follow (about 55 ms): smooth, with no visible lag and no snapping
      const dy = s.ty - s.y;
      if (Math.abs(dy) > 0.25) {
        s.y += dy * (1 - Math.exp(-Math.min(dt, 0.1) / 0.055));
        animating = true;
      } else s.y = s.ty;
      const x = s.side === "l" ? 30 : W - s.w - 30;
      el.style.visibility = "visible";
      el.style.transform = `translate(${x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
      ln.setAttribute("x1", (s.side === "l" ? x + s.w : x).toFixed(1));
      ln.setAttribute("y1", (s.y + s.h / 2).toFixed(1));
      ln.setAttribute("x2", a.ax.toFixed(1));
      ln.setAttribute("y2", a.ay.toFixed(1));
      ln.style.visibility = "visible";
      dot.setAttribute("cx", a.ax.toFixed(1));
      dot.setAttribute("cy", a.ay.toFixed(1));
      dot.style.visibility = "visible";
    }
    // the scene renders on demand: keep frames coming while a tag glides and until the view has settled (the re-solve)
    if (animating || ps.dirty) invalidate();
  });
  return null;
}
