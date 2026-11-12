"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { lineMaterial } from "./materials";

/* The section cap: where the auto cut opens the brain behind a beat, the cut face is drawn as a flat, opaque section of the
 * brain's outline (clay fill, ink edge), like a textbook's coronal / sagittal / axial figure behind the fibres. It is computed
 * from the context mesh at the plane: triangle-plane segments joined into loops, nested loops as holes. */

type Axis = "x" | "y" | "z";
const AX: Record<Axis, [number, number, number]> = { x: [0, 1, 2], y: [1, 0, 2], z: [2, 0, 1] };

/** Closed loops of the mesh's section at `pos` along `axis`, in the plane's 2D coordinates (u, v = the other two axes). */
export function sectionLoops(geo: THREE.BufferGeometry, axis: Axis, pos: number): THREE.Vector2[][] {
  const [a, u, v] = AX[axis];
  const P = geo.getAttribute("position") as THREE.BufferAttribute;
  const I = geo.getIndex();
  const n = I ? I.count : P.count;
  const idx = (k: number) => (I ? I.getX(k) : k);
  const q = 1e6;
  const key = (x: number, y: number) => `${Math.round(x * q)},${Math.round(y * q)}`;
  const adj = new Map<string, { p: [number, number]; to: string[] }>();
  const link = (p1: [number, number], p2: [number, number]) => {
    const k1 = key(p1[0], p1[1]), k2 = key(p2[0], p2[1]);
    if (k1 === k2) return;
    if (!adj.has(k1)) adj.set(k1, { p: p1, to: [] });
    if (!adj.has(k2)) adj.set(k2, { p: p2, to: [] });
    adj.get(k1)!.to.push(k2);
    adj.get(k2)!.to.push(k1);
  };
  const c = [0, 0, 0];
  for (let t = 0; t + 2 < n; t += 3) {
    const pts: [number, number][] = [];
    const ids = [idx(t), idx(t + 1), idx(t + 2)];
    const d = ids.map((i) => P.getComponent(i, a) - pos);
    for (let e = 0; e < 3; e++) {
      const i0 = ids[e], i1 = ids[(e + 1) % 3];
      const d0 = d[e], d1 = d[(e + 1) % 3];
      if ((d0 > 0) === (d1 > 0)) continue;
      const s = d0 / (d0 - d1);
      for (const k of [u, v]) c[k] = P.getComponent(i0, k) + (P.getComponent(i1, k) - P.getComponent(i0, k)) * s;
      pts.push([c[u], c[v]]);
    }
    if (pts.length === 2) link(pts[0], pts[1]);
  }
  const used = new Set<string>();
  const loops: THREE.Vector2[][] = [];
  for (const [start] of adj) {
    if (used.has(start)) continue;
    const loop: THREE.Vector2[] = [];
    let cur = start;
    let prev = "";
    for (let guard = 0; guard < 200000; guard++) {
      used.add(cur);
      const node = adj.get(cur)!;
      loop.push(new THREE.Vector2(node.p[0], node.p[1]));
      const next = node.to.find((k) => k !== prev && !used.has(k));
      if (!next) break;
      prev = cur;
      cur = next;
    }
    if (loop.length >= 8) loops.push(loop);
  }
  return loops;
}

const area = (l: THREE.Vector2[]) => Math.abs(THREE.ShapeUtils.area(l));
function inside(p: THREE.Vector2, l: THREE.Vector2[]) {
  let k = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
    if (l[i].y > p.y !== l[j].y > p.y && p.x < ((l[j].x - l[i].x) * (p.y - l[i].y)) / (l[j].y - l[i].y) + l[i].x) k = !k;
  }
  return k;
}

/** Filled geometry of the loops (even nesting depth = solid, odd = hole), placed on the plane in world space. */
export function capGeometry(loops: THREE.Vector2[][], axis: Axis, pos: number): THREE.BufferGeometry | null {
  const sorted = loops.map((l) => ({ l, a: area(l) })).filter((x) => x.a > 4e-6).sort((p, q) => q.a - p.a);
  const depth = sorted.map((x, i) => sorted.slice(0, i).filter((y) => inside(x.l[0], y.l)).length);
  const parent = sorted.map((x, i) => {
    let best = -1;
    for (let j = 0; j < i; j++) if (inside(x.l[0], sorted[j].l) && (best < 0 || sorted[j].a < sorted[best].a)) best = j;
    return best;
  });
  const [a, u, v] = AX[axis];
  const pos3: number[] = [];
  const index: number[] = [];
  sorted.forEach((x, i) => {
    if (depth[i] % 2 === 1) return;
    const holes = sorted.filter((_, j) => parent[j] === i && depth[j] % 2 === 1).map((y) => y.l);
    const contour = THREE.ShapeUtils.isClockWise(x.l) ? [...x.l].reverse() : x.l;
    const hs = holes.map((h) => (THREE.ShapeUtils.isClockWise(h) ? h : [...h].reverse()));
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = [...contour, ...hs.flat()];
    const base = pos3.length / 3;
    for (const p of all) {
      const w = [0, 0, 0];
      w[a] = pos;
      w[u] = p.x;
      w[v] = p.y;
      pos3.push(w[0], w[1], w[2]);
    }
    for (const t of tris) index.push(base + t[0], base + t[1], base + t[2]);
  });
  if (!index.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos3, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function SectionCap({ geo, axis, pos, color, ink }: { geo: THREE.BufferGeometry; axis: Axis; pos: number; color: string; ink: string }) {
  const built = useMemo(() => {
    const loops = sectionLoops(geo, axis, pos);
    const fill = capGeometry(loops, axis, pos);
    // flat and unlit, like a printed section: the lit structures and the fibres read against it
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const edges = loops
      .filter((l) => area(l) > 4e-6)
      .map((l) => {
        const [a, u, v] = AX[axis];
        const pts: number[] = [];
        for (const p of [...l, l[0]]) {
          const w = [0, 0, 0];
          w[a] = pos;
          w[u] = p.x;
          w[v] = p.y;
          pts.push(w[0], w[1], w[2]);
        }
        const lg = new LineGeometry();
        lg.setPositions(pts);
        const lm = lineMaterial(ink, { rim: true });
        lm.linewidth = 1.6;
        lm.transparent = false;
        const line = new Line2(lg, lm);
        line.renderOrder = 6;
        line.onBeforeRender = (renderer) => {
          const vp = new THREE.Vector4();
          renderer.getCurrentViewport(vp);
          const r = renderer.getPixelRatio();
          lm.resolution.set(vp.z / r, vp.w / r);
        };
        line.raycast = () => undefined;
        return line;
      });
    return { fill, mat, edges };
  }, [geo, axis, pos, color, ink]);
  useEffect(
    () => () => {
      built.fill?.dispose();
      built.mat.dispose();
      built.edges.forEach((e) => {
        e.geometry.dispose();
        (e.material as LineMaterial).dispose();
      });
    },
    [built],
  );
  if (!built.fill) return null;
  return (
    <group>
      <mesh geometry={built.fill} material={built.mat} renderOrder={5} raycast={() => undefined} />
      {built.edges.map((e, i) => (
        <primitive key={i} object={e} />
      ))}
    </group>
  );
}
