"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { loadAtlasModel } from "@/lib/atlas/loader";
import type { Side, WP } from "@/lib/atlas/pathways";
import ANCHORS from "@/data/part-anchors.json";

/* Shared pieces of the pathway scene: waypoint resolution (with the schematic lateral "lane" offset that pulls the
 * two sides apart), the side-aware tube material (left solid, right dashed), tubes and marks. */

export interface SceneColors {
  left: string;
  right: string;
  dim: string;
  text: string;
  hi: string;
  bad: string;
}

/** Seconds a path beat takes to draw (ease-in-out). */
export const DRAW_S = 2.0;

/** Schematic half-gap (world units) between the midline and each side's lane, fading out with lateral distance. */
export const LANE = 0.0125;
const LANE_FALL = 0.04;

/* ---------- geometry cache: world-space vertices per structure, for resolving waypoints ---------- */
const VERTS = new Map<string, Promise<Float32Array | null>>();
export function loadVerts(id: string, file: string): Promise<Float32Array | null> {
  let p = VERTS.get(id);
  if (!p) {
    p = loadAtlasModel(file)
      .then((g) => {
        g.updateMatrixWorld(true);
        const out: number[] = [];
        const v = new THREE.Vector3();
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const pos = m.geometry.getAttribute("position");
          const step = pos.count > 9000 ? 3 : 1;
          for (let i = 0; i < pos.count; i += step) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            out.push(v.x, v.y, v.z);
          }
        });
        return new Float32Array(out);
      })
      .catch(() => null);
    VERTS.set(id, p);
  }
  return p;
}

/** Structure ids a waypoint depends on (an "@" point is placed relative to the structure it names). */
export const wpRefs = (w: WP): string[] =>
  w[0] === "part" ? [] : w[0] === "@" ? (typeof w[5] === "string" && !w[5].startsWith("part:") ? [w[5]] : []) : [w[0]];

/** World position of a part anchor ("spine:drg_C7", "head-targets:masseter") on the physical side `phys` (L = the part's own side). */
export function partAnchor(key: string, phys: Side | "m"): THREE.Vector3 | null {
  const [file, name] = key.split(":");
  const tab = (ANCHORS as unknown as Record<string, Record<string, number[]>>)[file];
  if (!tab) return null;
  if (phys === "R") {
    const r = tab[`${name}_R`];
    if (r) return new THREE.Vector3(r[0], r[1], r[2]);
    const l = tab[name];
    return l ? new THREE.Vector3(-l[0], l[1], l[2]) : null;
  }
  const a = tab[name];
  return a ? new THREE.Vector3(a[0], a[1], a[2]) : null;
}

/** Waypoint -> world point.
 *  [ref, rel, t, dx, dy, dz, axis]: t runs along `axis` (default y) across the half of the structure on that side;
 *  the point is the centroid of the vertices in a thin slab there. dx is mirrored by side (positive = lateral),
 *  dy / dz are absolute (z + is anterior).
 *  ["@", rel, lateralX, dy, dz, anchorRef, anchorT, anchorAxis]: a free point (body parts), lateralX is the absolute
 *  distance from the midline on the side `rel` names, y / z are relative to the anchor structure's point.
 *  ["part", rel, "file:anchor", dx, dy, dz]: an anchor of an anatomy part (public/pathways/parts.json), on the side rel names.
 *  In the first form t may be "y=<metres>": the point of that structure at that absolute height (a spinal level).
 *  `lane` pulls ipsilateral / contralateral points away from the midline (schematic, side-true). */
export function resolveWP(wp: WP, verts: Map<string, Float32Array>, body: Side, lane = 0): THREE.Vector3 | null {
  const arr = wp as unknown as [string, string, ...(number | string)[]];
  const rel = arr[1];
  const bodySgn = body === "L" ? 1 : -1;
  const sgn = rel === "i" ? bodySgn : rel === "c" ? -bodySgn : 0;
  if (arr[0] === "part") {
    const [, , key, dx = 0, dy = 0, dz = 0] = arr as unknown as [string, string, string, number?, number?, number?];
    const v = partAnchor(key, sgn === 0 ? "m" : sgn > 0 ? "L" : "R");
    return v ? v.add(new THREE.Vector3((sgn || 1) * Number(dx), Number(dy), Number(dz))) : null;
  }
  if (arr[0] === "@") {
    const [, , lx = 0, dy = 0, dz = 0, aref, at = 0.5, aax = "y"] = arr as [string, string, number?, number?, number?, string?, number?, string?];
    let y = 0, z = 0;
    if (aref?.startsWith("part:")) {
      const a = partAnchor(aref.slice(5), "L");
      if (!a) return null;
      y = a.y;
      z = a.z;
    } else if (aref) {
      const a = resolveWP([aref, "i", at, 0, 0, 0, aax] as WP, verts, body, 0);
      if (!a) return null;
      y = a.y;
      z = a.z;
    }
    return new THREE.Vector3(sgn * Number(lx), y + Number(dy), z + Number(dz));
  }
  const [ref, , t = 0.5, dx = 0, dy = 0, dz = 0, ax = "y"] = arr as [string, string, number | string | undefined, number?, number?, number?, string?];
  const v = verts.get(ref);
  if (!v || !v.length) return null;
  const a = ax === "x" ? 0 : ax === "z" ? 2 : 1;
  let lo = Infinity;
  let hi = -Infinity;
  const use: number[] = [];
  for (let i = 0; i < v.length; i += 3) {
    if (sgn !== 0 && v[i] * sgn <= 0) continue;
    use.push(i);
    const c = v[i + a];
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  if (!use.length) for (let i = 0; i < v.length; i += 3) use.push(i);
  if (!isFinite(lo)) {
    lo = Infinity;
    hi = -Infinity;
    for (const i of use) {
      lo = Math.min(lo, v[i + a]);
      hi = Math.max(hi, v[i + a]);
    }
  }
  const target = typeof t === "string" && t.startsWith("y=") ? Number(t.slice(2)) : lo + (hi - lo) * Math.min(1, Math.max(0, Number(t)));
  const slab = Math.max(0.0012, (hi - lo) * 0.05);
  let sx = 0, sy = 0, sz = 0, n = 0;
  let best = Infinity, bi = use[0];
  for (const i of use) {
    const d = Math.abs(v[i + a] - target);
    if (d < best) { best = d; bi = i; }
    if (d <= slab) { sx += v[i]; sy += v[i + 1]; sz += v[i + 2]; n++; }
  }
  if (!n) { sx = v[bi]; sy = v[bi + 1]; sz = v[bi + 2]; n = 1; }
  let x = rel === "m" ? 0 : sx / n;
  x += (sgn || 1) * Number(dx);
  if (sgn !== 0 && lane > 0) {
    const ax2 = Math.abs(x);
    x = sgn * (ax2 + lane * Math.max(0, 1 - ax2 / LANE_FALL));
  }
  return new THREE.Vector3(x, sy / n + Number(dy), sz / n + Number(dz));
}

/* ---------- materials ---------- */
/** Left side = solid, right side = dashed, by where the fibre physically is (x of the vertex): reads without colour. */
export function makeTubeMaterial(color: string | undefined): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: !color, color: color ?? "#ffffff", transparent: true, depthTest: false, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aU;\nvarying float vWX;\nvarying float vU;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWX = position.x;\nvU = aU;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vWX;\nvarying float vU;")
      .replace("#include <dithering_fragment>", "float sd = smoothstep(-0.0012, 0.0012, vWX);\nfloat dash = smoothstep(0.34, 0.42, fract(vU));\ngl_FragColor.a *= mix(dash, 1.0, sd);\n#include <dithering_fragment>");
  };
  mat.customProgramCacheKey = () => "pw-tube-dash";
  return mat;
}

function paintSide(geo: THREE.TubeGeometry, left: THREE.Color, right: THREE.Color, soft: number) {
  const pos = geo.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getX(i) / soft + 1) / 2)); // 0 = right, 1 = left
    c.copy(right).lerp(left, k);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

export interface BuiltTube {
  curve: THREE.CatmullRomCurve3;
  geo: THREE.TubeGeometry;
}
export function buildTube(pts: THREE.Vector3[], radius: number, color: string | undefined, colors: SceneColors): BuiltTube | null {
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const segs = Math.min(500, Math.max(32, pts.length * 28));
  const radial = 8;
  const geo = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  if (!color) paintSide(geo, new THREE.Color(colors.left), new THREE.Color(colors.right), 0.003);
  const len = curve.getLength();
  const period = radius * 7;
  const pos = geo.getAttribute("position");
  const u = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) u[i] = (Math.floor(i / (radial + 1)) / segs) * (len / period);
  geo.setAttribute("aU", new THREE.BufferAttribute(u, 1));
  return { curve, geo };
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
/** Helpers live outside the components so the immutability lint does not treat GPU objects as state. */
export function approach(cur: number, target: number, step: number) {
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}
function applyTube(mat: THREE.Material, geo: THREE.BufferGeometry, e: number, op: number, count: number) {
  mat.opacity = op;
  geo.setDrawRange(0, Math.floor((count * e) / 3) * 3);
}
function setOpacityOf(m: THREE.Material, v: number) {
  m.opacity = v;
}

/** A tube that draws itself along its length (ease in-out, about a second) with a glowing tip, then settles lit.
 *  Built once; `reveal` (0 or 1) only animates the draw range, so nothing is created per click. */
export function TubeMesh({
  pts,
  color,
  colors,
  opacity,
  reveal,
  radius,
  pulse,
  hover,
  reduced,
  interactive,
  onPick,
  onHover,
}: {
  pts: THREE.Vector3[];
  color?: string;
  colors: SceneColors;
  opacity: number;
  reveal: number;
  radius: number;
  pulse?: boolean;
  hover?: boolean;
  reduced?: boolean;
  interactive?: boolean;
  onPick?: () => void;
  onHover?: (h: boolean) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const prog = useRef(reveal ? 1 : 0);
  const op = useRef(opacity);
  const clock = useRef(0);
  const dot = useRef<THREE.Mesh>(null);
  const tip = useRef<THREE.Mesh>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const built = useMemo(() => buildTube(pts, radius, color, colors), [pts, radius, color, colors]);
  const hitGeo = useMemo(() => (interactive && built ? new THREE.TubeGeometry(built.curve, Math.min(120, Math.max(16, pts.length * 12)), radius * 3.2, 6, false) : null), [interactive, built, pts.length, radius]);
  useEffect(() => () => built?.geo.dispose(), [built]);
  useEffect(() => () => hitGeo?.dispose(), [hitGeo]);
  const mat = useMemo(() => makeTubeMaterial(color), [color]);
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => hitMat.dispose(), [hitMat]);
  useEffect(() => {
    setOpacityOf(hitMat, hover ? 0.22 : 0);
    invalidate();
  }, [hitMat, hover, invalidate]);
  useEffect(() => {
    invalidate();
  }, [reveal, opacity, invalidate]);
  useFrame((_, dt) => {
    if (!built) return;
    let busy = false;
    const target = reveal ? 1 : 0;
    if (prog.current !== target) {
      prog.current = approach(prog.current, target, dt / (reduced ? 0.2 : DRAW_S));
      busy = true;
    }
    const goal = hover ? Math.min(1, opacity + 0.35) : opacity;
    if (Math.abs(op.current - goal) > 0.004) {
      op.current += (goal - op.current) * Math.min(1, dt * 7);
      busy = true;
    } else op.current = goal;
    const e = reduced ? prog.current : easeInOut(prog.current);
    if (mesh.current) mesh.current.visible = prog.current > 0.002;
    applyTube(mat, built.geo, e, op.current * (reduced ? prog.current : 1), built.geo.index?.count ?? 0);
    // glowing tip while drawing
    if (tip.current) {
      const drawing = !reduced && prog.current > 0.002 && prog.current < 0.998;
      tip.current.visible = drawing;
      if (drawing) built.curve.getPointAt(Math.min(1, e), tip.current.position);
    }
    if (dot.current) {
      const show = pulse && prog.current > 0.98;
      dot.current.visible = !!show;
      if (show) {
        clock.current += dt * 0.35;
        built.curve.getPointAt(clock.current % 1, dot.current.position);
        busy = true;
      }
    }
    if (busy) invalidate();
  });
  if (!built) return null;
  return (
    <group renderOrder={20}>
      <mesh ref={mesh} geometry={built.geo} material={mat} renderOrder={20} visible={reveal > 0} />
      <mesh ref={tip} renderOrder={22} visible={false}>
        <sphereGeometry args={[radius * 3.4, 14, 10]} />
        <meshBasicMaterial color={colors.text} depthTest={false} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      {pulse && (
        <mesh ref={dot} renderOrder={21} visible={false}>
          <sphereGeometry args={[radius * 2.2, 14, 10]} />
          <meshBasicMaterial color={colors.text} depthTest={false} transparent opacity={0.95} toneMapped={false} />
        </mesh>
      )}
      {hitGeo && reveal > 0 && (
        <mesh
          geometry={hitGeo}
          material={hitMat}
          renderOrder={19}
          onClick={(e: { stopPropagation: () => void; delta: number }) => {
            if (e.delta > 6) return;
            e.stopPropagation();
            onPick?.();
          }}
          onPointerOver={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onHover?.(true);
          }}
          onPointerOut={() => onHover?.(false)}
        />
      )}
    </group>
  );
}

export type MarkKind = "soma" | "syn" | "dec" | "lesion" | "bound" | "recept" | "node";

/** Mark glyphs. A node scales in with a soft illumination ring; a decussation is a camera-facing X with a ring; a lesion a ball with a halo. */
export function MarkMesh({
  pos,
  kind,
  color,
  r,
  dim,
  show = true,
  hot,
  hover,
  reduced,
  onPick,
  onHover,
}: {
  pos: THREE.Vector3;
  kind: MarkKind;
  color: string;
  r: number;
  dim?: boolean;
  show?: boolean;
  hot?: boolean;
  hover?: boolean;
  reduced?: boolean;
  onPick?: () => void;
  onHover?: (h: boolean) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const sc = useRef(show ? 1 : 0);
  const pulse = useRef(1);
  const wasHot = useRef(false);
  useFrame((_, dt) => {
    let busy = false;
    const target = show ? 1 : 0;
    if (sc.current !== target) {
      sc.current = approach(sc.current, target, dt / (reduced ? 0.15 : 0.5));
      busy = true;
    }
    const k = reduced ? sc.current : easeInOut(sc.current);
    const s = Math.max(0.0001, k * (hover ? 1.25 : 1));
    if (group.current) {
      group.current.scale.setScalar(s);
      group.current.visible = sc.current > 0.002;
    }
    if (face.current && kind === "dec") face.current.quaternion.copy(camera.quaternion);
    if (hot && show && !wasHot.current) pulse.current = 0;
    wasHot.current = !!hot && show;
    if (pulse.current < 1) {
      pulse.current = Math.min(1, pulse.current + dt / (reduced ? 0.4 : 1.1));
      busy = true;
    }
    if (ring.current && ringMat.current) {
      const p = pulse.current;
      ring.current.visible = p < 1 && !reduced;
      ring.current.scale.setScalar(1 + p * 2.6);
      ringMat.current.opacity = (1 - p) * 0.8;
    }
    if (busy) invalidate();
  });
  const handlers = onPick
    ? {
        onClick: (e: { stopPropagation: () => void; delta: number }) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onPick();
        },
        onPointerOver: (e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          onHover?.(true);
        },
        onPointerOut: () => onHover?.(false),
      }
    : {};
  const op = dim ? 0.4 : 1;
  if (kind === "dec") {
    const L = r * 9;
    const W = r * 1.7;
    return (
      <group position={pos} renderOrder={30}>
        <group ref={group}>
          <group ref={face} {...handlers}>
            {[Math.PI / 4, -Math.PI / 4].map((a) => (
              <mesh key={a} rotation={[0, 0, a]} renderOrder={31}>
                <boxGeometry args={[L, W, W]} />
                <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95 * op} toneMapped={false} />
              </mesh>
            ))}
            <mesh renderOrder={30}>
              <torusGeometry args={[L * 0.58, W * 0.32, 8, 40]} />
              <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.6 * op} toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>
    );
  }
  const big = kind === "lesion";
  const node = kind === "node";
  return (
    <group position={pos} renderOrder={30}>
      <group ref={group}>
        <mesh renderOrder={30} {...handlers}>
          {kind === "syn" || kind === "bound" ? <torusGeometry args={[r * 2.2, r * 0.75, 8, 24]} /> : <sphereGeometry args={[r * (big ? 3.4 : node ? 2.6 : 2.0), 18, 12]} />}
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={(big ? 0.8 : 0.95) * op} toneMapped={false} />
        </mesh>
        {(big || node) && (
          <mesh renderOrder={29} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * (big ? 5.5 : 3.8), r * 0.3, 8, 40]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.55 * op} toneMapped={false} />
          </mesh>
        )}
        {node && (
          <mesh ref={ring} renderOrder={28} visible={false}>
            <sphereGeometry args={[r * 2.6, 16, 12]} />
            <meshBasicMaterial ref={ringMat} color={color} depthTest={false} transparent opacity={0} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
