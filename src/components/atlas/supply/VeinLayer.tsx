"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasModel } from "../ui/modelCache";
import { makeLine, pointAt, taperedTube, type Line } from "./VesselLayer";
import { layoutLabels, type LabelBus, type RawLabel } from "./margin-labels";

/**
 * Drainage layer. The sinus meshes themselves are drawn by the viewer (overlays); this adds what the atlas lacks: flow pulses
 * along each sinus (centrelines taken from the meshes), and thin schematic tubes for the great cerebral vein, the bridging veins and
 * the internal jugular vein, which have no mesh. Directions follow lecture 16 slides 27-30.
 */
const FILES: Record<string, string> = {
  sss: "s/superior-sagittal-sinus.glb",
  straight: "s/straight-sinus.glb",
  transverse: "s/transverse-sinus.glb",
  sigmoid: "s/sigmoid-sinus.glb",
};
const LABELS: Record<string, string> = {
  bridging: "Bridging veins",
  sss: "Superior sagittal sinus",
  gcv: "Great cerebral vein",
  straight: "Straight sinus",
  confluence: "Confluence of sinuses",
  sigmoid: "Sigmoid sinus",
  ijv: "Internal jugular vein",
};
const VEIN = "#4f7cc4";
const PALE = new THREE.Color("#cfe0ff");

type Path = { id: string; lines: Line[]; flat: number[][]; tube: boolean };

/** Centreline of a tubular mesh: principal axis, then the mean position of equal-count bins along it. */
function centreline(points: THREE.Vector3[]): number[] {
  const n = points.length;
  const c = new THREE.Vector3();
  points.forEach((p) => c.add(p));
  c.multiplyScalar(1 / n);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const a = new THREE.Vector3(1, 0.3, 0.2).normalize();
  for (let i = 0; i < 24; i++) {
    a.set(xx * a.x + xy * a.y + xz * a.z, xy * a.x + yy * a.y + yz * a.z, xz * a.x + yz * a.y + zz * a.z).normalize();
  }
  const order = points.map((p, i) => ({ t: p.clone().sub(c).dot(a), i })).sort((u, v) => u.t - v.t);
  const bins = 22;
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = Math.floor((b * n) / bins);
    const hi = Math.max(lo + 1, Math.floor(((b + 1) * n) / bins));
    const m = new THREE.Vector3();
    for (let k = lo; k < hi; k++) m.add(points[order[k].i]);
    m.multiplyScalar(1 / (hi - lo));
    out.push(m.x, m.y, m.z);
  }
  return out;
}
const first = (f: number[]) => new THREE.Vector3(f[0], f[1], f[2]);
const last = (f: number[]) => new THREE.Vector3(f[f.length - 3], f[f.length - 2], f[f.length - 1]);
function reverse(f: number[]): number[] {
  const o: number[] = [];
  for (let i = f.length - 3; i >= 0; i -= 3) o.push(f[i], f[i + 1], f[i + 2]);
  return o;
}
function orient(id: string, f: number[]): number[] {
  const a = first(f);
  const b = last(f);
  if (id === "sss" || id === "straight") return a.z < b.z ? reverse(f) : f; // anterior to posterior
  if (id === "transverse") return Math.abs(a.x) > Math.abs(b.x) ? reverse(f) : f; // from the confluence outwards
  if (id === "sigmoid") return a.y < b.y ? reverse(f) : f; // down toward the jugular foramen
  return f;
}

export function VeinLayer({ ids, current, animate, bus }: { ids: Set<string>; current: string[]; animate: boolean; bus: LabelBus }) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const [roots, setRoots] = useState<Record<string, THREE.Group> | null>(null);
  const on = ids.size > 0;
  useEffect(() => {
    if (!on || roots) return;
    let alive = true;
    Promise.all(Object.entries(FILES).map(async ([id, f]) => [id, await loadAtlasModel(f)] as const))
      .then((r) => alive && setRoots(Object.fromEntries(r)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [on, roots]);

  const paths = useMemo<Path[]>(() => {
    if (!roots) return [];
    const out: Path[] = [];
    const flatOf: Record<string, number[][]> = {};
    for (const [id, g] of Object.entries(roots)) {
      g.updateWorldMatrix(true, true);
      const pts: THREE.Vector3[] = [];
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i += 2) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
      });
      if (pts.length < 20) continue;
      const groups = id === "transverse" || id === "sigmoid" ? [pts.filter((p) => p.x > 0), pts.filter((p) => p.x <= 0)] : [pts];
      flatOf[id] = groups.filter((g2) => g2.length > 20).map((g2) => orient(id, centreline(g2)));
      out.push({ id, flat: flatOf[id], lines: flatOf[id].map(makeLine), tube: false });
    }
    // schematic veins that have no mesh
    const sss = flatOf.sss?.[0];
    const straight = flatOf.straight?.[0];
    if (straight) {
      const s0 = first(straight);
      const g0 = s0.clone().add(new THREE.Vector3(0, -0.014, 0.015));
      const mid = s0.clone().add(new THREE.Vector3(0, -0.012, 0.004));
      const f = [g0.x, g0.y, g0.z, mid.x, mid.y, mid.z, s0.x, s0.y, s0.z];
      out.push({ id: "gcv", flat: [f], lines: [makeLine(f)], tube: true });
    }
    if (sss) {
      const sl = makeLine(sss);
      const flats: number[][] = [];
      const p = new THREE.Vector3();
      const t = new THREE.Vector3();
      for (const u of [0.18, 0.3, 0.42, 0.54, 0.66, 0.78]) {
        pointAt(sl, sl.len * u, p, t);
        for (const sx of [1, -1]) {
          flats.push([sx * 0.034, p.y - 0.03, p.z + 0.004, sx * 0.022, p.y - 0.014, p.z + 0.002, sx * 0.008, p.y - 0.003, p.z]);
        }
      }
      out.push({ id: "bridging", flat: flats, lines: flats.map(makeLine), tube: true });
    }
    const sig = flatOf.sigmoid ?? [];
    if (sig.length) {
      const flats = sig.map((f) => {
        const e = last(f);
        const sx = Math.sign(e.x || 1);
        return [e.x, e.y, e.z, e.x + sx * 0.003, e.y - 0.025, e.z - 0.004, e.x + sx * 0.005, e.y - 0.055, e.z - 0.006];
      });
      out.push({ id: "ijv", flat: flats, lines: flats.map(makeLine), tube: true });
    }
    return out;
  }, [roots]);

  // tubes for the schematic veins
  const tubes = useMemo(() => {
    const g = new THREE.Group();
    const mats: THREE.MeshStandardMaterial[] = [];
    for (const p of paths) {
      if (!p.tube) continue;
      const r0 = p.id === "ijv" ? 0.0032 : p.id === "gcv" ? 0.0016 : 0.00055;
      const mat = new THREE.MeshStandardMaterial({ color: VEIN, roughness: 0.45, transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(taperedTube(p.flat, r0, r0 * 0.9), mat);
      m.name = p.id;
      m.renderOrder = 6;
      g.add(m);
      mats.push(mat);
    }
    return { g, mats };
  }, [paths]);
  useEffect(
    () => () => {
      tubes.g.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      tubes.mats.forEach((m) => m.dispose());
    },
    [tubes],
  );

  // pulses
  const parts = useMemo(() => {
    const out: { id: string; line: Line; phase: number }[] = [];
    for (const p of paths)
      for (const line of p.lines) {
        if (line.len < 0.01) continue;
        const n = Math.max(2, Math.round(line.len / 0.012));
        for (let k = 0; k < n; k++) out.push({ id: p.id, line, phase: (k / n) * line.len });
      }
    return out;
  }, [paths]);
  const inst = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.ConeGeometry(1, 5, 7, 1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: PALE, toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const p3 = useMemo(() => new THREE.Vector3(), []);
  const t3 = useMemo(() => new THREE.Vector3(), []);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const fade = useRef(new Map<string, number>());
  const lastKey = useRef("");

  const anchors = useMemo(() => {
    const m = new Map<string, THREE.Vector3[]>();
    const add = (id: string, v: THREE.Vector3) => m.set(id, [...(m.get(id) ?? []), v]);
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (const path of paths) {
      if (path.id === "bridging") {
        const l = path.lines[2];
        if (l) {
          pointAt(l, l.len * 0.35, p, t);
          add("bridging", p.clone());
        }
        continue;
      }
      const l = path.lines[0];
      if (!l) continue;
      pointAt(l, l.len * (path.id === "sss" ? 0.5 : path.id === "sigmoid" ? 0.45 : 0.5), p, t);
      add(path.id, p.clone());
      if (path.id === "sss") {
        pointAt(l, l.len * 0.995, p, t);
        add("confluence", p.clone());
      }
    }
    return m;
  }, [paths]);

  // eslint-disable-next-line react-hooks/immutability -- three.js materials are mutated per frame on purpose
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7);
    let moving = false;
    for (const m of tubes.g.children as THREE.Mesh[]) {
      const tgt = ids.has(m.name) ? (current.includes(m.name) ? 1 : 0.8) : 0;
      const mm = m.material as THREE.MeshStandardMaterial;
      if (Math.abs(mm.opacity - tgt) > 0.004) {
        // eslint-disable-next-line react-hooks/immutability
        mm.opacity += (tgt - mm.opacity) * k;
        moving = true;
      }
      m.visible = mm.opacity > 0.01;
    }
    const f = fade.current;
    const im = inst.current;
    if (im) {
      const time = performance.now() / 1000;
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        const tgt = ids.has(pt.id) ? 1 : 0;
        const cur = (f.get(pt.id) ?? 0) + (tgt - (f.get(pt.id) ?? 0)) * k;
        f.set(pt.id, Math.abs(cur - tgt) < 0.01 ? tgt : cur);
        if (cur < 0.02) {
          dummy.scale.setScalar(0);
        } else {
          const L = pt.line.len;
          const s = animate && !reduced ? (((pt.phase + time * 0.032) % L) + L) % L : (pt.phase + L * 0.08) % L;
          pointAt(pt.line, s, p3, t3);
          dummy.position.copy(p3);
          dummy.quaternion.setFromUnitVectors(up, t3);
          const base = pt.id === "ijv" ? 0.0021 : pt.id === "sss" || pt.id === "straight" || pt.id === "transverse" || pt.id === "sigmoid" ? 0.0019 : pt.id === "gcv" ? 0.0011 : 0.0004;
          dummy.scale.setScalar(base * cur * (0.5 + 0.5 * Math.sin((Math.PI * s) / L)));
          if (Math.abs(cur - tgt) > 0.01) moving = true;
        }
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    if (moving) invalidate();

    // margin labels for the current step
    if (!bus.ready()) return;
    const w = size.width;
    const h = size.height;
    const items: RawLabel[] = [];
    const v = new THREE.Vector3();
    for (const id of current) {
      const label = LABELS[id];
      for (const a of anchors.get(id) ?? []) {
        if (!label) continue;
        v.copy(a).project(camera);
        if (v.z > 1) continue;
        items.push({ id: `${id}${items.length}`, text: label, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, color: VEIN });
      }
    }
    const out = layoutLabels(items, w, h, 104);
    const key = out.map((o) => `${o.id}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.ly)}`).join("|") + `|${w}x${h}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      bus.emit(out, w, h);
    }
  });
  useEffect(() => {
    lastKey.current = "";
    invalidate();
  }, [ids, current, animate, invalidate]);
  useEffect(() => {
    if (!animate || reduced || !on) return;
    const t = window.setInterval(invalidate, 1000 / 30);
    return () => window.clearInterval(t);
  }, [animate, reduced, on, invalidate]);
  useEffect(
    () => () => {
      bus.emit([], 0, 0);
    },
    [bus],
  );

  return (
    <group>
      <primitive object={tubes.g} raycast={() => null} />
      <instancedMesh ref={inst} args={[geo, mat, Math.max(1, parts.length)]} frustumCulled={false} renderOrder={9} raycast={() => null} key={parts.length} />
    </group>
  );
}
