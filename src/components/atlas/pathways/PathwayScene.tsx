"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { loadAtlasIndex } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { loadAtlasModel, releaseAtlasCache, retainAtlasCache } from "@/lib/atlas/loader";
import type { Side, WP } from "@/lib/atlas/pathways";

/* A purpose-built 3D scene for pathways and lesions: structures lit per side (clipped at the midline),
 * tracts drawn as tubes coloured by side (so a decussation visibly changes colour), step marks and a midline plane. */

export type View = "anterior" | "posterior" | "left" | "right";
export const VIEWS: { id: View; label: string; dir: [number, number, number] }[] = [
  { id: "anterior", label: "Front", dir: [0, 0, 1] },
  { id: "posterior", label: "Back", dir: [0, 0, -1] },
  { id: "left", label: "Left", dir: [1, 0, 0] },
  { id: "right", label: "Right", dir: [-1, 0, 0] },
];

export interface SceneLayer {
  key: string;
  ids: string[];
  /** Physical side: only that half of each structure is lit. */
  side: Side | "both";
  color: string;
  opacity: number;
  /** Faint, clickable structures (lesion lab picking). */
  pickable?: boolean;
}
export interface SceneTube {
  key: string;
  pts: WP[];
  /** The body side served: resolves the i / c waypoints. */
  body: Side;
  /** One colour for the whole tube; omitted = coloured by side (left / right). */
  color?: string;
  opacity: number;
  /** Target fraction drawn (0 hides it, 1 shows it all; animates). */
  reveal: number;
  pulse?: boolean;
  width?: number;
}
export interface SceneMark {
  key: string;
  p: WP;
  body: Side;
  kind: "soma" | "syn" | "dec" | "lesion";
  text?: string;
  color: string;
}
export interface SceneColors {
  left: string;
  right: string;
  dim: string;
  text: string;
  hi: string;
  bad: string;
}
export interface SceneProps {
  layers: SceneLayer[];
  tubes: SceneTube[];
  marks: SceneMark[];
  fit: { wp: WP; body: Side }[];
  view: View;
  /** Bump to re-frame the camera on the fit box (e.g. the "frame" button). */
  frameNonce: number;
  colors: SceneColors;
  midline?: boolean;
  /** Resting scale of tubes and marks relative to the framed extent. */
  onPick?: (meshId: string, side: Side, point: THREE.Vector3) => void;
  onHover?: (meshId: string | null) => void;
  onReady?: (ready: boolean) => void;
  hoverId?: string | null;
}

/* ---------- geometry cache: world-space vertices per structure, for resolving waypoints ---------- */
const VERTS = new Map<string, Promise<Float32Array | null>>();
function loadVerts(id: string, file: string): Promise<Float32Array | null> {
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

const wpRefs = (w: WP) => (w[0] === "@" ? [] : [w[0]]);

/** Waypoint -> world point: [ref, rel, t, dx, dy, dz, axis]. t runs along `axis` (default y) across the half of
 *  the structure on that side; the point is the centroid of the vertices in a thin slab there. dx is mirrored
 *  by side (positive = lateral), dy/dz are absolute (z + is anterior). */
export function resolveWP(wp: WP, verts: Map<string, Float32Array>, body: Side): THREE.Vector3 | null {
  const [ref, rel, t = 0.5, dx = 0, dy = 0, dz = 0, ax = "y"] = wp as [string, string, number?, number?, number?, number?, string?];
  const v = verts.get(ref);
  if (!v || !v.length) return null;
  const bodySgn = body === "L" ? 1 : -1;
  const sgn = rel === "i" ? bodySgn : rel === "c" ? -bodySgn : 0;
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
  const target = lo + (hi - lo) * Math.min(1, Math.max(0, Number(t)));
  const slab = Math.max(0.0012, (hi - lo) * 0.05);
  let sx = 0, sy = 0, sz = 0, n = 0;
  let best = Infinity, bi = use[0];
  for (const i of use) {
    const d = Math.abs(v[i + a] - target);
    if (d < best) { best = d; bi = i; }
    if (d <= slab) { sx += v[i]; sy += v[i + 1]; sz += v[i + 2]; n++; }
  }
  if (!n) { sx = v[bi]; sy = v[bi + 1]; sz = v[bi + 2]; n = 1; }
  const x = rel === "m" ? 0 : sx / n;
  return new THREE.Vector3(x + (sgn || 1) * Number(dx), sy / n + Number(dy), sz / n + Number(dz));
}

const PLANE_L = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0); // keeps x >= 0 (patient's left)
const PLANE_R = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

/* Imperative material helpers live outside the components so the immutability lint does not treat GPU objects as state. */
function styleLayerMat(mat: THREE.MeshStandardMaterial, o: { color: string; opacity: number; pickable?: boolean; hovered: boolean; side: Side | "both" }) {
  mat.color.set(o.color);
  mat.emissive.set(o.color);
  mat.emissiveIntensity = o.pickable ? (o.hovered ? 0.7 : 0.25) : 0.55;
  mat.opacity = o.hovered ? Math.min(1, o.opacity + 0.25) : o.opacity;
  mat.transparent = mat.opacity < 0.98;
  mat.depthWrite = !mat.transparent;
  mat.clippingPlanes = o.side === "both" ? [] : [o.side === "L" ? PLANE_L : PLANE_R];
  mat.needsUpdate = true;
}
function setOpacity(mat: THREE.Material, v: number) {
  mat.opacity = v;
}

function ContextShell({ file, color }: { file: string; color: string }) {
  const [g, setG] = useState<THREE.Group | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let alive = true;
    loadAtlasModel(file).then((m) => {
      if (!alive) return;
      const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.035, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide });
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) {
          me.material = mat;
          me.raycast = () => {};
        }
      });
      setG(m);
      invalidate();
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [file, color, invalidate]);
  return g ? <primitive object={g} /> : null;
}

function LayerMesh({
  id,
  file,
  name,
  side,
  color,
  opacity,
  pickable,
  hovered,
  onPick,
  onHover,
}: {
  id: string;
  file: string;
  name: string;
  side: Side | "both";
  color: string;
  opacity: number;
  pickable?: boolean;
  hovered: boolean;
  onPick?: (meshId: string, side: Side, point: THREE.Vector3) => void;
  onHover?: (meshId: string | null) => void;
}) {
  const [g, setG] = useState<THREE.Group | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    styleLayerMat(mat, { color, opacity, pickable, hovered, side });
    invalidate();
  }, [mat, color, opacity, pickable, hovered, side, invalidate]);
  useEffect(() => {
    let alive = true;
    loadAtlasModel(file).then((m) => {
      if (!alive) return;
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) me.material = mat;
      });
      setG(m);
      invalidate();
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [file, mat, invalidate]);
  if (!g) return null;
  return (
    <primitive
      object={g}
      name={name}
      onPointerOver={pickable ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover?.(id); } : undefined}
      onPointerOut={pickable ? () => onHover?.(null) : undefined}
      onClick={
        pickable && onPick
          ? (e: { stopPropagation: () => void; delta: number; point: THREE.Vector3 }) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              onPick(id, e.point.x >= 0 ? "L" : "R", e.point.clone());
            }
          : undefined
      }
    />
  );
}

function sideColoured(curve: THREE.CatmullRomCurve3, geo: THREE.TubeGeometry, left: THREE.Color, right: THREE.Color, soft: number) {
  void curve;
  const pos = geo.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = Math.min(1, Math.max(0, (x / soft + 1) / 2)); // 0 = right, 1 = left
    c.copy(right).lerp(left, k);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

function TubeMesh({
  pts,
  color,
  colors,
  opacity,
  reveal,
  radius,
  pulse,
}: {
  pts: THREE.Vector3[];
  color?: string;
  colors: SceneColors;
  opacity: number;
  reveal: number;
  radius: number;
  pulse?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const prog = useRef(0);
  const clock = useRef(0);
  const dot = useRef<THREE.Mesh>(null);
  const built = useMemo(() => {
    if (pts.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const segs = Math.min(500, Math.max(32, pts.length * 28));
    const geo = new THREE.TubeGeometry(curve, segs, radius, 8, false);
    if (!color) sideColoured(curve, geo, new THREE.Color(colors.left), new THREE.Color(colors.right), 0.0025);
    return { curve, geo };
  }, [pts, radius, color, colors.left, colors.right]);
  useEffect(() => () => built?.geo.dispose(), [built]);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: !color, color: color ?? "#ffffff", transparent: true, depthTest: false, toneMapped: false }),
    [color],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    setOpacity(mat, opacity);
    invalidate();
  }, [mat, opacity, invalidate]);
  useFrame((_, dt) => {
    if (!built) return;
    const idx = built.geo.index?.count ?? 0;
    let busy = false;
    if (Math.abs(prog.current - reveal) > 0.002) {
      const step = dt * 1.3;
      prog.current = prog.current < reveal ? Math.min(reveal, prog.current + step) : Math.max(reveal, prog.current - step * 2);
      busy = true;
    } else prog.current = reveal;
    const n = Math.floor((idx * prog.current) / 3) * 3;
    built.geo.setDrawRange(0, n);
    if (dot.current) {
      const show = pulse && prog.current > 0.98;
      dot.current.visible = !!show;
      if (show) {
        clock.current += dt * 0.35;
        dot.current.position.copy(built.curve.getPointAt(clock.current % 1));
        busy = true;
      }
    }
    if (busy) invalidate();
  });
  if (!built) return null;
  return (
    <group renderOrder={20}>
      <mesh geometry={built.geo} material={mat} renderOrder={20} />
      {pulse && (
        <mesh ref={dot} renderOrder={21} visible={false}>
          <sphereGeometry args={[radius * 2.2, 14, 10]} />
          <meshBasicMaterial color={colors.text} depthTest={false} transparent opacity={0.95} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function MarkMesh({ pos, kind, color, r }: { pos: THREE.Vector3; kind: SceneMark["kind"]; color: string; r: number }) {
  const big = kind === "dec" || kind === "lesion";
  return (
    <group position={pos} renderOrder={30}>
      <mesh renderOrder={30}>
        {kind === "dec" ? <octahedronGeometry args={[r * 2.4, 0]} /> : <sphereGeometry args={[r * (kind === "lesion" ? 3.4 : 2.0), 18, 12]} />}
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={kind === "lesion" ? 0.8 : 0.95} toneMapped={false} />
      </mesh>
      {big && (
        <mesh renderOrder={29} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * (kind === "lesion" ? 5.5 : 4.2), r * 0.35, 8, 40]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

type LabelItem = { key: string; v: THREE.Vector3 };
/** Projects 3D anchors to the DOM label elements every rendered frame (no drei <Html>: its nested React roots misbehave under strict mode). */
function LabelProjector({ items, els }: { items: LabelItem[]; els: React.MutableRefObject<Map<string, HTMLElement>> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [items, invalidate]);
  useFrame(() => {
    for (const it of items) {
      const el = els.current.get(it.key);
      if (!el) continue;
      tmp.copy(it.v).project(camera);
      const vis = tmp.z > -1 && tmp.z < 1;
      el.style.visibility = vis ? "visible" : "hidden";
      el.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * size.width).toFixed(1)}px,${((-tmp.y * 0.5 + 0.5) * size.height).toFixed(1)}px)`;
    }
  });
  return null;
}

function SidePlane({ box, colors }: { box: THREE.Box3; colors: SceneColors }) {
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const h = size.y * 1.15 + 0.01;
  const w = Math.max(size.z, 0.06) * 1.3;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), [w, h]);
  return (
    <group position={[0, c.y, c.z]}>
      <mesh rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={colors.dim} transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edges} rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
        <lineBasicMaterial color={colors.dim} transparent opacity={0.45} />
      </lineSegments>
    </group>
  );
}

function Rig({ box, view, nonce }: { box: THREE.Box3 | null; view: View; nonce: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const last = useRef({ view: "" as string, nonce: -1 });
  useEffect(() => {
    if (!box || !controls) return;
    const keep = last.current.view === view && last.current.nonce === nonce && goal.current === null;
    last.current = { view, nonce };
    const dir = keep ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...VIEWS.find((v) => v.id === view)!.dir).normalize();
    const c = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    let rr = 0, uu = 0, dd = 0;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      rr = Math.max(rr, Math.abs(p.dot(right)));
      uu = Math.max(uu, Math.abs(p.dot(up)));
      dd = Math.max(dd, Math.abs(p.dot(dir)));
    }
    const aspect = size.width / Math.max(1, size.height);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const d = Math.max(uu / tan, rr / (tan * aspect)) * 1.18 + dd + 0.01;
    goal.current = { pos: c.clone().add(dir.multiplyScalar(d)), target: c };
    invalidate();
  }, [box, view, nonce, camera, controls, size.width, size.height, invalidate]);
  useFrame(() => {
    const g = goal.current;
    if (!g || !controls) return;
    camera.position.lerp(g.pos, 0.16);
    controls.target.lerp(g.target, 0.16);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 2e-4 && controls.target.distanceTo(g.target) < 2e-4) goal.current = null;
    invalidate();
  });
  return null;
}

export default function PathwayScene(p: SceneProps) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [verts, setVerts] = useState<Map<string, Float32Array>>(new Map());
  const { onReady } = p;

  useEffect(() => {
    retainAtlasCache();
    let alive = true;
    loadAtlasIndex().then((i) => alive && setIndex(i)).catch(() => {});
    return () => {
      alive = false;
      releaseAtlasCache();
    };
  }, []);

  // every structure a waypoint refers to must be loaded before the points can be placed
  const refs = useMemo(() => {
    const s = new Set<string>();
    p.tubes.forEach((t) => t.pts.forEach((w) => wpRefs(w).forEach((r) => s.add(r))));
    p.marks.forEach((m) => wpRefs(m.p).forEach((r) => s.add(r)));
    p.fit.forEach((f) => wpRefs(f.wp).forEach((r) => s.add(r)));
    return [...s].sort();
  }, [p.tubes, p.marks, p.fit]);
  const refKey = refs.join(",");
  useEffect(() => {
    if (!index) return;
    let alive = true;
    const need = refs.filter((r) => !verts.has(r) && index.structures[r]?.file);
    if (!need.length) return;
    Promise.all(need.map((r) => loadVerts(r, index.structures[r].file!).then((v) => [r, v] as const))).then((res) => {
      if (!alive) return;
      setVerts((prev) => {
        const next = new Map(prev);
        for (const [r, v] of res) if (v) next.set(r, v);
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, refKey]);

  const ready = !!index && refs.every((r) => verts.has(r) || !index.structures[r]?.file);
  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);

  const tubes = useMemo(
    () =>
      p.tubes.map((t) => ({
        ...t,
        v: t.pts.map((w) => resolveWP(w, verts, t.body)).filter((x): x is THREE.Vector3 => !!x),
      })),
    [p.tubes, verts],
  );
  const marks = useMemo(() => p.marks.map((m) => ({ ...m, v: resolveWP(m.p, verts, m.body) })).filter((m) => m.v), [p.marks, verts]);
  const box = useMemo(() => {
    const b = new THREE.Box3();
    for (const f of p.fit) {
      const v = resolveWP(f.wp, verts, f.body);
      if (v) b.expandByPoint(v);
    }
    if (b.isEmpty()) return null;
    // always keep both sides in frame so the crossing is visible, and pad
    const pad = Math.max(0.005, b.getSize(new THREE.Vector3()).length() * 0.1);
    b.min.x = Math.min(b.min.x, -0.014);
    b.max.x = Math.max(b.max.x, 0.014);
    const mid = (b.min.y + b.max.y) / 2;
    if (b.max.y - b.min.y < 0.02) {
      b.min.y = mid - 0.01;
      b.max.y = mid + 0.01;
    }
    return b.expandByScalar(pad);
  }, [p.fit, verts]);
  const extent = box ? box.getSize(new THREE.Vector3()).length() : 0.2;
  const radius = Math.min(0.0032, Math.max(0.0007, extent * 0.0048));

  const labelEls = useRef(new Map<string, HTMLElement>());
  const labelItems = useMemo<LabelItem[]>(() => {
    const out: LabelItem[] = marks.filter((m) => m.text).map((m) => ({ key: m.key, v: m.v!.clone().add(new THREE.Vector3(0, radius * 6, 0)) }));
    if (box && p.midline !== false) {
      const c = box.getCenter(new THREE.Vector3());
      const halfX = Math.max(box.getSize(new THREE.Vector3()).x / 2, 0.02);
      out.push({ key: "tag:L", v: new THREE.Vector3(halfX * 0.92, box.min.y + (box.max.y - box.min.y) * 0.1, c.z) });
      out.push({ key: "tag:R", v: new THREE.Vector3(-halfX * 0.92, box.min.y + (box.max.y - box.min.y) * 0.1, c.z) });
    }
    return out;
  }, [marks, box, radius, p.midline]);

  const layerParts = useMemo(() => {
    if (!index) return [];
    return p.layers.flatMap((l) =>
      l.ids
        .filter((id) => index.structures[id]?.file)
        .map((id) => ({ k: `${l.key}:${id}:${l.side}`, id, file: index.structures[id].file!, name: index.structures[id].name, l })),
    );
  }, [index, p.layers]);

  return (
    <div className="relative h-full w-full">
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: 35, near: 0.005, far: 8, position: [0.4, 1.6, 0.2] }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[1, 2, 3]} intensity={1.3} />
      <directionalLight position={[-2, 1, -2]} intensity={0.7} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.03} maxDistance={4} rotateSpeed={0.8} />
      <Rig box={box} view={p.view} nonce={p.frameNonce} />
      {index && <ContextShell file={index.context.file} color={p.colors.dim} />}
      {layerParts.map((x) => (
        <LayerMesh
          key={x.k}
          id={x.id}
          file={x.file}
          name={x.name}
          side={x.l.side}
          color={x.l.color}
          opacity={x.l.opacity}
          pickable={x.l.pickable}
          hovered={p.hoverId === x.id}
          onPick={p.onPick}
          onHover={p.onHover}
        />
      ))}
      {box && p.midline !== false && <SidePlane box={box} colors={p.colors} />}
      {tubes.map((t) => (
        <TubeMesh key={t.key} pts={t.v} color={t.color} colors={p.colors} opacity={t.opacity} reveal={t.reveal} radius={radius * (t.width ?? 1)} pulse={t.pulse} />
      ))}
      {marks.map((m) => (
        <MarkMesh key={m.key} pos={m.v!} kind={m.kind} color={m.color} r={radius} />
      ))}
      <LabelProjector items={labelItems} els={labelEls} />
    </Canvas>
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {marks.filter((m) => m.text).map((m) => (
        <div key={m.key} ref={(el) => { if (el) labelEls.current.set(m.key, el); else labelEls.current.delete(m.key); }} style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}>
          <div
            style={{
              transform: "translate(-50%,-100%)",
              width: "max-content",
              maxWidth: 210,
              textAlign: "center",
              font: "600 11px/1.25 var(--font-mono, ui-monospace, monospace)",
              letterSpacing: "0.04em",
              padding: "2px 7px",
              borderRadius: 6,
              background: "color-mix(in srgb, var(--panel-solid, #111) 88%, transparent)",
              color: m.kind === "dec" || m.kind === "lesion" ? p.colors.hi : p.colors.text,
              border: `1px solid ${m.color}`,
            }}
          >
            {m.text}
          </div>
        </div>
      ))}
      {(["L", "R"] as const).map((sd) => (
        <div key={sd} ref={(el) => { if (el) labelEls.current.set(`tag:${sd}`, el); else labelEls.current.delete(`tag:${sd}`); }} style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}>
          <div style={{ transform: "translate(-50%,-50%)", font: "700 12px var(--font-mono, ui-monospace, monospace)", color: "var(--panel-solid, #000)", background: sd === "L" ? p.colors.left : p.colors.right, borderRadius: 99, padding: "1px 9px" }}>{sd}</div>
        </div>
      ))}
    </div>
    </div>
  );
}
