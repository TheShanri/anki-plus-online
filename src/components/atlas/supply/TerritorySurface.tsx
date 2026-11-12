"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasModel } from "../ui/modelCache";
import { SUPPLY, unitArteries } from "./supply-data";

/**
 * One soft territory skin over the cortex. The cortical gyri of gross.glb are merged into a single mesh; every vertex is
 * assigned to ACA, MCA or PCA from the course's supply map (and, where a gyrus is shared between ACA and MCA, from which way
 * the surface faces), then the assignment is blurred over a few millimetres, so the edges are soft instead of following mesh
 * borders. Colour and opacity are per-vertex, so only one translucent layer is ever drawn (no stacked fog).
 */
export type TerritoryShow = { artery: string; alpha: number };

const CORTICAL = ["aca", "mca", "pca"] as const;
const BLUR = 0.0065; // metres
const LIFT = 0.00035; // metres along the normal, so the skin sits just above the brain surface

type Built = { geo: THREE.BufferGeometry; w: Record<string, Float32Array>; n: number };

function buildSurface(root: THREE.Group, variant: string): Built | null {
  // cortical units are the first block of the supply map (up to the corpus callosum)
  const end = SUPPLY.units.findIndex((u) => u.name === "Corpus callosum");
  const units = SUPPLY.units.slice(0, end > 0 ? end : 24);
  const byName = new Map<string, THREE.Mesh>();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) byName.set(m.name, m);
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const arteryOf: number[] = []; // 0 aca 1 mca 2 pca, -1 none
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const u of units) {
    const arts = unitArteries(u, variant);
    const primary = arts[0];
    const shared = new Set(arts.slice(0, 2)).size === 2 && arts.includes("aca") && arts.includes("mca");
    for (const id of u.meshes) {
      for (const nodeName of [id, `${id}_m`]) {
        const mesh = byName.get(nodeName.replace(/[[\].:/]/g, ""));
        if (!mesh) continue;
        const g = mesh.geometry;
        const p = g.attributes.position as THREE.BufferAttribute;
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.normal as THREE.BufferAttribute;
        nm.getNormalMatrix(mesh.matrixWorld);
        const base = pos.length / 3;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          pos.push(v.x + nv.x * LIFT, v.y + nv.y * LIFT, v.z + nv.z * LIFT);
          nor.push(nv.x, nv.y, nv.z);
          let a = primary;
          if (shared) {
            const medial = -Math.sign(v.x || 1) * nv.x; // facing the midline
            a = medial > 0.35 || Math.abs(v.x) < 0.012 ? "aca" : "mca";
          }
          arteryOf.push(CORTICAL.indexOf(a as (typeof CORTICAL)[number]));
        }
        // mirrored meshes (negative determinant) have flipped winding: swap two corners so FrontSide faces outward
        const flip = mesh.matrixWorld.determinant() < 0;
        const ix = g.index;
        const cnt = ix ? ix.count : p.count;
        const at = (i: number) => base + (ix ? ix.getX(i) : i);
        for (let i = 0; i + 2 < cnt; i += 3) {
          if (flip) idx.push(at(i), at(i + 2), at(i + 1));
          else idx.push(at(i), at(i + 1), at(i + 2));
        }
      }
    }
  }
  const n = pos.length / 3;
  if (!n) return null;
  // blur the one-hot assignment over a spatial hash
  const cell = BLUR;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < n; i++) {
    const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  const w: Record<string, Float32Array> = { aca: new Float32Array(n), mca: new Float32Array(n), pca: new Float32Array(n) };
  const sigma2 = (BLUR * 0.5) ** 2;
  const R2 = BLUR * BLUR;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    let sum = 0;
    const acc = [0, 0, 0];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!l) continue;
          for (const j of l) {
            const ex = pos[j * 3] - x;
            const ey = pos[j * 3 + 1] - y;
            const ez = pos[j * 3 + 2] - z;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 > R2) continue;
            // do not blur through the other side of a thin fold: weight down surfaces that face away
            const dot = nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2];
            if (dot < 0.1) continue;
            const k = Math.exp(-d2 / (2 * sigma2));
            sum += k;
            const a = arteryOf[j];
            if (a >= 0) acc[a] += k;
          }
        }
    if (sum > 0) {
      w.aca[i] = acc[0] / sum;
      w.mca[i] = acc[1] / sum;
      w.pca[i] = acc[2] / sum;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  geo.setIndex(idx);
  return { geo, w, n };
}

export function TerritorySurface({ show, colors, variant, side, opacity = 0.72 }: { show: TerritoryShow[]; colors: Map<string, string>; variant: string; /** Only this hemisphere (left = +x). */ side?: "L" | "R"; opacity?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  /** Seen from the side: only the hemisphere on the camera side (the far one would show through the translucent brain). */
  const [camSide, setCamSide] = useState<"L" | "R" | undefined>(undefined);
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const needed = show.some((s) => (CORTICAL as readonly string[]).includes(s.artery));
  useEffect(() => {
    if (!needed || root) return;
    let alive = true;
    loadAtlasModel("gross.glb")
      .then((g) => alive && setRoot(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [needed, root]);
  const built = useMemo(() => (root ? buildSurface(root, variant) : null), [root, variant]);
  useEffect(() => () => built?.geo.dispose(), [built]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, roughness: 0.7, metalness: 0, side: THREE.FrontSide }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const fade = useRef({ cur: 0, tgt: 0 });

  /* three.js buffers are filled imperatively */
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    if (!built) return;
    const col = built.geo.attributes.color as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const rgb = CORTICAL.map((a) => new THREE.Color(colors.get(a) ?? "#999999").lerp(new THREE.Color("#ffffff"), 0.16));
    const amt = CORTICAL.map((a) => show.find((s) => s.artery === a)?.alpha ?? 0);
    const posA = built.geo.attributes.position.array as Float32Array;
    const eff = side ?? camSide;
    for (let i = 0; i < built.n; i++) {
      if (eff && (eff === "L") !== posA[i * 3] > 0) {
        arr[i * 4 + 3] = 0;
        continue;
      }
      const wa = built.w.aca[i] * amt[0];
      const wm = built.w.mca[i] * amt[1];
      const wp = built.w.pca[i] * amt[2];
      const t = wa + wm + wp;
      if (t < 0.02) {
        arr[i * 4 + 3] = 0;
        continue;
      }
      arr[i * 4] = (rgb[0].r * wa + rgb[1].r * wm + rgb[2].r * wp) / t;
      arr[i * 4 + 1] = (rgb[0].g * wa + rgb[1].g * wm + rgb[2].g * wp) / t;
      arr[i * 4 + 2] = (rgb[0].b * wa + rgb[1].b * wm + rgb[2].b * wp) / t;
      // soft edge: alpha follows the blurred weight, smoothstepped
      const s = Math.min(1, t);
      arr[i * 4 + 3] = s * s * (3 - 2 * s);
    }
    col.needsUpdate = true;
    fade.current.tgt = show.some((s) => (CORTICAL as readonly string[]).includes(s.artery)) ? opacity : 0;
    invalidate();
  }, [built, show, colors, side, camSide, opacity, invalidate]);

  useFrame((_, dt) => {
    const dx = camera.position.x - (controls?.target.x ?? 0);
    const dist = camera.position.distanceTo(controls?.target ?? new THREE.Vector3());
    const ratio = dist > 0 ? dx / dist : 0;
    const want = ratio > 0.6 ? "L" : ratio < -0.6 ? "R" : undefined;
    if (want !== camSide) setCamSide(want);
    const f = fade.current;
    if (Math.abs(f.cur - f.tgt) > 0.004) {
      f.cur += (f.tgt - f.cur) * (1 - Math.exp(-Math.min(dt, 0.1) * 8));
      invalidate();
    } else f.cur = f.tgt;
    mat.opacity = f.cur;
  });
  /* eslint-enable react-hooks/immutability */
  if (!built) return null;
  return <mesh geometry={built.geo} material={mat} renderOrder={5} raycast={() => null} />;
}
