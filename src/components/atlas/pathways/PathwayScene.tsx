"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { loadAtlasIndex, resolveStructureIds } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { loadAtlasModel, releaseAtlasCache, retainAtlasCache } from "@/lib/atlas/loader";
import type { Side, WP } from "@/lib/atlas/pathways";
import { LANE, MarkMesh, TubeMesh, loadVerts, resolveWP, wpRefs, type MarkKind, type SceneColors } from "./sceneCore";
import { EYE_SCALE } from "./eyeScale";
import { loadPart, type PartFile } from "./PartModels";
import { Anatomy, type SceneAnatomy } from "./AnatomyParts";
import { EYE_R, EyeBall, Limb, TRIGEMINAL_ZONES, type EyeSpec, type LimbSpec } from "./PathwayExtras";

export { resolveWP };
export type { SceneColors };

/* A purpose-built 3D scene for pathways and lesions: structures lit per side (clipped at the midline), tracts drawn as
 * tubes (left solid, right dashed, the two sides pulled apart into lanes), step marks with collision-free labels,
 * body parts where the signal starts or ends, an impulse that travels the pathway, and a camera that follows. */

export type View = "anterior" | "posterior" | "left" | "right" | "top";
export const VIEWS: { id: View; label: string; dir: [number, number, number] }[] = [
  { id: "anterior", label: "Front", dir: [0, 0, 1] },
  { id: "posterior", label: "Back", dir: [0, 0, -1] },
  { id: "left", label: "Left", dir: [1, 0, 0] },
  { id: "right", label: "Right", dir: [-1, 0, 0] },
  { id: "top", label: "Top", dir: [0, 1, 0.001] },
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
  /** Beat at which it lights (beat mode); omitted = always lit. */
  beat?: number;
  /** Body side it belongs to, for the side focus dimming. */
  body?: Side;
  /** Info popover this structure opens (beat mode): the lit mesh itself is the clickable thing. */
  info?: string;
  /** Dimmed (14%) when the camera looks from this side: the near hemisphere would hide the far one. */
  nearView?: View;
}
export interface SceneTube {
  key: string;
  pts: WP[];
  /** The body side served: resolves the i / c waypoints. */
  body: Side;
  /** One colour for the whole tube; omitted = coloured by side (left / right). */
  color?: string;
  /** Lesion lab (no beats): fixed opacity and reveal. */
  opacity?: number;
  reveal?: number;
  pulse?: boolean;
  width?: number;
  /** Beat that draws this tube, the neuron it belongs to and the info popover it opens. */
  beat?: number;
  neuron?: number;
  info?: string;
  /** A real mesh already shows this tract: the tube is a slim, faint signal along it and is not clickable. */
  meshed?: boolean;
  /** An ascending run (a tract climbing the cord): points that would dip below the one before are dropped. */
  rise?: boolean;
}
export interface SceneMark {
  key: string;
  p: WP;
  body: Side;
  kind: MarkKind;
  text?: string;
  color: string;
  /** 2 = this step (prominent), 1 = context, 0 = faded. */
  prio?: 0 | 1 | 2;
  /** Which side of the anchor the label sits on (screen): by default away from the midline. */
  dir?: -1 | 0 | 1;
  /** Beat at which it appears and the info popover it opens (beat mode). */
  beat?: number;
  info?: string;
  /** A midline structure drawn once (body L): it follows the stronger of the two sides' focus. */
  mid?: boolean;
}
export interface SceneLimb extends LimbSpec {
  at: WP;
  /** Beats during which the part is drawn at full strength (it stays visible, dimmer, otherwise). */
  from?: number;
  to?: number;
}
export interface SceneEyes {
  spec: EyeSpec;
  nerve: WP;
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
  /** Show the Left / Right tags down both sides. */
  tags?: boolean;
  limbs?: SceneLimb[];
  eyes?: SceneEyes;
  /** Real anatomy (spine, thorax, gut, head targets) drawn around the pathway. */
  anatomy?: SceneAnatomy[];
  zoneColors?: string[];
  /** Beat mode: the highest beat drawn so far (omitted = everything) and the current beat (null = none, e.g. the whole pathway). */
  reveal?: number;
  hot?: number | null;
  /** 1 = full strength, small = dimmed (the side that is not in focus). */
  sideAlpha?: { L: number; R: number };
  reduced?: boolean;
  /** Info key hovered in the schematic (or in 3D); a click opens the popover. */
  hoverInfo?: string | null;
  onHoverInfo?: (key: string | null) => void;
  onPickInfo?: (key: string | null) => void;
  onLimbPick?: (s: Side) => void;
  onPick?: (meshId: string, side: Side, point: THREE.Vector3) => void;
  onHover?: (meshId: string | null) => void;
  onReady?: (ready: boolean) => void;
  /** Real loading progress: things placed so far / things needed (structure geometry, lit structures, body parts). */
  onLoad?: (done: number, total: number) => void;
  hoverId?: string | null;
}

/** Keeps a climbing run climbing: a point more than 1 mm below the last kept one is dropped (the last point always stays). */
function monotoneUp(v: THREE.Vector3[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  v.forEach((q, i) => {
    if (i === 0 || i === v.length - 1 || q.y >= out[out.length - 1].y - 0.001) out.push(q);
  });
  return out;
}

const PLANE_L = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0); // keeps x >= 0 (patient's left)
const PLANE_R = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

/* Imperative material helpers live outside the components so the immutability lint does not treat GPU objects as state. */
function styleLayerMat(mat: THREE.MeshStandardMaterial, o: { color: string; opacity: number; pickable?: boolean; hovered: boolean; side: Side | "both"; glow?: boolean }) {
  mat.color.set(o.color);
  mat.emissive.set(o.color);
  mat.emissiveIntensity = o.pickable ? (o.hovered ? 0.7 : 0.25) : o.glow ? 1.15 : o.hovered ? 0.9 : 0.55;
  mat.opacity = o.hovered ? Math.min(1, o.opacity + 0.25) : o.opacity;
  mat.transparent = mat.opacity < 0.98;
  mat.depthWrite = !mat.transparent;
  mat.clippingPlanes = o.side === "both" ? [] : [o.side === "L" ? PLANE_L : PLANE_R];
  mat.needsUpdate = true;
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
  glow,
  infoKey,
  onPickInfo,
  onHoverInfo,
  onPick,
  onHover,
  onLoaded,
}: {
  id: string;
  file: string;
  name: string;
  side: Side | "both";
  color: string;
  opacity: number;
  pickable?: boolean;
  hovered: boolean;
  glow?: boolean;
  infoKey?: string;
  onPickInfo?: (k: string | null) => void;
  onHoverInfo?: (k: string | null) => void;
  onPick?: (meshId: string, side: Side, point: THREE.Vector3) => void;
  onHover?: (meshId: string | null) => void;
  onLoaded?: () => void;
}) {
  const [g, setG] = useState<THREE.Group | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide }), []);
  const cur = useRef(0);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    styleLayerMat(mat, { color, opacity: cur.current, pickable, hovered, side, glow });
    invalidate();
  }, [mat, color, pickable, hovered, side, glow, invalidate]);
  useEffect(() => {
    let alive = true;
    loadAtlasModel(file).then((m) => {
      if (!alive) return;
      m.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh) me.material = mat;
      });
      setG(m);
      onLoaded?.();
      invalidate();
    }).catch(() => onLoaded?.());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, mat, invalidate]);
  // the lit structure fades to its target opacity instead of popping
  useFrame((_, dt) => {
    if (!g) return;
    if (Math.abs(cur.current - opacity) < 0.004) {
      if (cur.current !== opacity) fadeLayer(mat, g, opacity, hovered, pickable);
      cur.current = opacity;
      return;
    }
    cur.current += (opacity - cur.current) * Math.min(1, dt * 6);
    fadeLayer(mat, g, cur.current, hovered, pickable);
    invalidate();
  });
  if (!g) return null;
  return (
    <primitive
      object={g}
      name={name}
      onPointerOver={pickable ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover?.(id); } : infoKey && onHoverInfo && opacity > 0.05 ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHoverInfo(infoKey); } : undefined}
      onPointerOut={pickable ? () => onHover?.(null) : infoKey && onHoverInfo ? () => onHoverInfo(null) : undefined}
      onClick={
        !pickable && infoKey && onPickInfo && opacity > 0.05
          ? (e: { stopPropagation: () => void; delta: number }) => {
              if (e.delta > 6) return;
              e.stopPropagation();
              onPickInfo(infoKey);
            }
          : pickable && onPick
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
function fadeLayer(mat: THREE.MeshStandardMaterial, g: THREE.Group, v: number, hovered: boolean, pickable?: boolean) {
  mat.opacity = hovered ? Math.min(1, v + 0.25) : v;
  mat.transparent = mat.opacity < 0.98;
  mat.depthWrite = !mat.transparent;
  g.visible = mat.opacity > 0.01;
  void pickable;
}

/* ---------- labels: projected to the DOM, no overlaps, leader lines, this step prominent ---------- */
interface LabelItem {
  key: string;
  v: THREE.Vector3;
  prio: number;
  dir?: number;
  /** Fixed tags (the Left / Right pills) are obstacles and never move. */
  fixed?: boolean;
  /** false = not yet revealed: hidden. */
  show?: boolean;
}
type Size = { w: number; h: number };

function LabelProjector({
  items,
  els,
  lines,
  sizes,
  obstacles,
}: {
  obstacles: React.MutableRefObject<number[]>;
  items: LabelItem[];
  els: React.MutableRefObject<Map<string, HTMLElement>>;
  lines: React.MutableRefObject<Map<string, SVGLineElement>>;
  sizes: React.MutableRefObject<Map<string, Size>>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const mid = useMemo(() => new THREE.Vector3(), []);
  const order = useMemo(() => [...items].sort((a, b) => Number(!!b.fixed) - Number(!!a.fixed) || b.prio - a.prio), [items]);
  const rectBuf = useRef(new Float64Array(4 * 80));
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [items, invalidate]);
  useFrame(() => {
    let n = 0;
    const rects = rectBuf.current;
    const ob = obstacles.current;
    for (let i = 0; i + 3 < ob.length && n < 8; i += 4, n++) {
      rects[n * 4] = ob[i];
      rects[n * 4 + 1] = ob[i + 1];
      rects[n * 4 + 2] = ob[i + 2];
      rects[n * 4 + 3] = ob[i + 3];
    }
    const W = size.width;
    const H = size.height;
    for (const it of order) {
      const el = els.current.get(it.key);
      if (!el) continue;
      tmp.copy(it.v).project(camera);
      const vis = tmp.z > -1 && tmp.z < 1;
      const ax = (tmp.x * 0.5 + 0.5) * W;
      const ay = (-tmp.y * 0.5 + 0.5) * H;
      const sz = sizes.current.get(it.key) ?? { w: 120, h: 22 };
      const ln = lines.current.get(it.key);
      const shown = vis && it.show !== false;
      el.style.visibility = shown ? "visible" : "hidden";
      if (!shown) {
        if (ln) ln.style.visibility = "hidden";
        continue;
      }
      let x: number, y: number;
      if (it.fixed) {
        x = ax - sz.w / 2;
        y = ay - sz.h / 2;
      } else {
        mid.set(0, it.v.y, it.v.z).project(camera);
        const mx = (mid.x * 0.5 + 0.5) * W;
        const dir = it.dir && it.dir !== 0 ? it.dir : ax >= mx ? 1 : -1;
        x = dir > 0 ? ax + 16 : ax - 16 - sz.w;
        if (it.dir === 0) x = ax - sz.w / 2;
        x = Math.min(Math.max(4, x), Math.max(4, W - sz.w - 4));
        y = ay - sz.h / 2;
        if (it.dir === 0) y = ay - sz.h - 14;
        const y0 = y;
        for (let k = 0; k < 14; k++) {
          const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (sz.h + 4) * (it.dir === 0 ? -1 : 1);
          const yy = Math.min(Math.max(4, y0 + dy), Math.max(4, H - sz.h - 4));
          let hit = false;
          for (let r = 0; r < n; r++) {
            const o = r * 4;
            if (x < rects[o + 2] + 3 && x + sz.w + 3 > rects[o] && yy < rects[o + 3] + 3 && yy + sz.h + 3 > rects[o + 1]) {
              hit = true;
              break;
            }
          }
          if (!hit || k === 13) {
            y = yy;
            break;
          }
        }
      }
      if (n < 80) {
        const o = n * 4;
        rects[o] = x;
        rects[o + 1] = y;
        rects[o + 2] = x + sz.w;
        rects[o + 3] = y + sz.h;
        n++;
      }
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (ln && !it.fixed) {
        const edge = x > ax ? x : x + sz.w;
        const near = Math.abs(edge - ax) > 6 || Math.abs(y + sz.h / 2 - ay) > 6;
        ln.style.visibility = near ? "visible" : "hidden";
        ln.setAttribute("x1", ax.toFixed(1));
        ln.setAttribute("y1", ay.toFixed(1));
        ln.setAttribute("x2", Math.min(Math.max(edge, x), x + sz.w).toFixed(1));
        ln.setAttribute("y2", (y + sz.h / 2).toFixed(1));
      }
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
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <group position={[0, c.y, c.z]}>
      <mesh rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={colors.dim} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edges} rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
        <lineBasicMaterial color={colors.dim} transparent opacity={0.45} />
      </lineSegments>
    </group>
  );
}

interface GrabControls {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

/** Gentle camera for the beats. It stops the moment the user grabs the view and never springs back. */
function Rig({ box, view, nonce }: { box: THREE.Box3 | null; view: View; nonce: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as GrabControls | null;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const last = useRef({ view: "" as string, nonce: -1 });
  useEffect(() => {
    (window as unknown as { __pwCam?: THREE.Camera }).__pwCam = camera; // read by the pointer-drag test
  }, [camera]);
  useEffect(() => {
    if (!controls) return;
    const grab = () => {
      goal.current = null;
    };
    controls.addEventListener("start", grab);
    return () => controls.removeEventListener("start", grab);
  }, [controls]);
  useEffect(() => {
    if (!box || !controls) return;
    const keep = last.current.view === view && last.current.nonce === nonce;
    last.current = { view, nonce };
    if (!keep) camera.up.set(0, 1, 0);
    const dir = keep ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...VIEWS.find((v) => v.id === view)!.dir).normalize();
    const c = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
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
    const d = Math.max(uu / tan, rr / (tan * aspect)) * 1.12 + dd + 0.01;
    goal.current = { pos: c.clone().add(dir.multiplyScalar(d)), target: c };
    invalidate();
  }, [box, view, nonce, camera, controls, size.width, size.height, invalidate]);
  useFrame(() => {
    const g = goal.current;
    if (!g || !controls) return;
    camera.position.lerp(g.pos, 0.07);
    controls.target.lerp(g.target, 0.07);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 2e-4 && controls.target.distanceTo(g.target) < 2e-4) goal.current = null;
    invalidate();
  });
  return null;
}

export default function PathwayScene(p: SceneProps) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [verts, setVerts] = useState<Map<string, Float32Array>>(new Map());
  const [limbHover, setLimbHover] = useState(false);
  const [hoverLocal, setHoverLocal] = useState<string | null>(null);
  const [layersDone, setLayersDone] = useState(0);
  const [partsDone, setPartsDone] = useState(0);
  const { onReady, onLoad } = p;
  const hoverKey = p.hoverInfo ?? hoverLocal;
  const sideAlpha = p.sideAlpha ?? { L: 1, R: 1 };
  const beatMode = p.reveal !== undefined;
  const hot = p.hot ?? null;
  const setHover = (k: string | null) => {
    setHoverLocal(k);
    p.onHoverInfo?.(k);
  };

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
    p.limbs?.forEach((l) => wpRefs(l.at).forEach((r) => s.add(r)));
    if (p.eyes) wpRefs(p.eyes.nerve).forEach((r) => s.add(r));
    return [...s].sort();
  }, [p.tubes, p.marks, p.fit, p.limbs, p.eyes]);
  const refKey = refs.join(",");
  useEffect(() => {
    if (!index) return;
    let alive = true;
    // a group structure (cerebellum, cerebral peduncle ...) has no file of its own: its members' vertices stand in for it
    const need = refs.filter((r) => !verts.has(r) && resolveStructureIds(index, [r], 40).length > 0);
    if (!need.length) return;
    Promise.all(
      need.map((r) =>
        Promise.all(resolveStructureIds(index, [r], 40).map((id) => loadVerts(id, index.structures[id].file!))).then((parts) => {
          const ok = parts.filter((x): x is Float32Array => !!x);
          const all = new Float32Array(ok.reduce((n, x) => n + x.length, 0));
          let o = 0;
          for (const x of ok) {
            all.set(x, o);
            o += x.length;
          }
          return [r, all.length ? all : null] as const;
        }),
      ),
    ).then((res) => {
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

  // body parts: fetched up front too, so nothing is loaded when a beat plays
  const partFiles = useMemo(() => {
    const f = new Set<PartFile>();
    p.limbs?.forEach((l) => {
      if (l.part === "hand" || l.part === "foot" || l.part === "leg") f.add(l.part);
      if (l.part === "muscle") f.add("muscle");
    });
    if (p.eyes) f.add("eye");
    p.anatomy?.forEach((a) => f.add(a.file));
    return [...f];
  }, [p.limbs, p.eyes, p.anatomy]);
  useEffect(() => {
    let alive = true;
    partFiles.forEach((f) => loadPart(f).then(() => alive && setPartsDone((n) => n + 1)));
    return () => {
      alive = false;
    };
  }, [partFiles]);

  const layerParts = useMemo(() => {
    if (!index) return [];
    return p.layers.flatMap((l) =>
      // pathway layers expand group structures into their members; the lesion lab keeps its single-file picking meshes
      (l.beat !== undefined ? resolveStructureIds(index, l.ids, 40) : l.ids.filter((id) => index.structures[id]?.file))
        .map((id) => ({ k: `${l.key}:${id}:${l.side}`, id, file: index.structures[id].file!, name: index.structures[id].name, l })),
    );
  }, [index, p.layers]);
  const vertsDone = index ? refs.filter((r) => verts.has(r) || resolveStructureIds(index, [r], 40).length === 0).length : 0;
  const total = refs.length + layerParts.length + partFiles.length;
  const done = vertsDone + Math.min(layersDone, layerParts.length) + Math.min(partsDone, partFiles.length);
  const ready = !!index && done >= total;
  useEffect(() => {
    onReady?.(ready);
  }, [ready, onReady]);
  useEffect(() => {
    onLoad?.(done, Math.max(1, total));
  }, [done, total, onLoad]);

  const tubes = useMemo(
    () =>
      p.tubes.map((t) => {
        const v = t.pts.map((w) => resolveWP(w, verts, t.body, LANE)).filter((x): x is THREE.Vector3 => !!x);
        return { ...t, v: t.rise ? monotoneUp(v) : v, nres: v.length };
      }),
    [p.tubes, verts],
  );
  const marks = useMemo(() => p.marks.map((m) => ({ ...m, v: resolveWP(m.p, verts, m.body, LANE) })).filter((m) => m.v), [p.marks, verts]);
  const limbs = useMemo(() => (p.limbs ?? []).map((l) => ({ ...l, v: resolveWP(l.at, verts, l.body, 0) })).filter((l) => l.v), [p.limbs, verts]);
  const eyes = useMemo(() => {
    if (!p.eyes) return [];
    return (["L", "R"] as Side[])
      .map((s) => {
        const e = resolveWP(p.eyes!.nerve, verts, s, LANE);
        return e ? { side: s, at: e.clone().add(new THREE.Vector3(0, 0, EYE_R * EYE_SCALE)) } : null;
      })
      .filter((x): x is { side: Side; at: THREE.Vector3 } => !!x);
  }, [p.eyes, verts]);

  // what the vetting script (tools/pathways/vet.mjs) reads: the resolved 3D objects
  useEffect(() => {
    if (!ready) return;
    (window as unknown as { __pwDebug?: unknown }).__pwDebug = {
      tubes: tubes.map((t) => ({ key: t.key, beat: t.beat, info: t.info, body: t.body, n: t.nres, want: t.pts.length, a: t.v[0]?.toArray(), b: t.v[t.v.length - 1]?.toArray(), xr: [Math.min(...t.v.map((v) => v.x)), Math.max(...t.v.map((v) => v.x))] })),
      marks: marks.map((m) => ({ key: m.key, mid: !!m.mid, beat: m.beat, info: m.info, kind: m.kind, text: m.text, body: m.body, at: m.v!.toArray() })),
      want: { tubes: p.tubes.length, marks: p.marks.length },
    };
  }, [ready, tubes, marks, p.tubes.length, p.marks.length]);

  const box = useMemo(() => {
    const b = new THREE.Box3();
    for (const f of p.fit) {
      const v = resolveWP(f.wp, verts, f.body, LANE);
      if (v) b.expandByPoint(v);
    }
    if (b.isEmpty()) return null;
    const pad = Math.max(0.005, b.getSize(new THREE.Vector3()).length() * 0.1);
    b.min.x = Math.min(b.min.x, -LANE * 2.2);
    b.max.x = Math.max(b.max.x, LANE * 2.2);
    const mid = (b.min.y + b.max.y) / 2;
    if (b.max.y - b.min.y < 0.02) {
      b.min.y = mid - 0.01;
      b.max.y = mid + 0.01;
    }
    return b.expandByScalar(pad);
  }, [p.fit, verts]);
  const extent = box ? box.getSize(new THREE.Vector3()).length() : 0.2;
  const radius = Math.min(0.0042, Math.max(0.0007, extent * 0.0052));

  /* ----- labels ----- */
  const labelEls = useRef(new Map<string, HTMLElement>());
  const leaderEls = useRef(new Map<string, SVGLineElement>());
  const sizes = useRef(new Map<string, Size>());
  const rootRef = useRef<HTMLDivElement>(null);
  const obstacleRects = useRef<number[]>([]);
  // toolbars and the legend are obstacles: labels never sit under them
  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!root || !host) return;
    const measure = () => {
      const hb = root.getBoundingClientRect();
      const out: number[] = [];
      host.querySelectorAll("[data-label-obstacle]").forEach((el) => {
        const r = el.getBoundingClientRect();
        out.push(r.left - hb.left - 4, r.top - hb.top - 4, r.right - hb.left + 4, r.bottom - hb.top + 4);
      });
      obstacleRects.current = out;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    host.querySelectorAll("[data-label-obstacle]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);
  const shownMarks = useMemo(() => marks.filter((m) => m.text), [marks]);
  // only the current beat is labelled (plus the crossing X once it has drawn): the schematic carries every name
  const sideA = (m: { body: Side; mid?: boolean }) => (m.mid ? Math.max(sideAlpha.L, sideAlpha.R) : sideAlpha[m.body]);
  const isShown = (m: { beat?: number; body: Side; kind: MarkKind; mid?: boolean }) =>
    (beatMode && m.beat !== undefined ? (m.beat === hot ? m.beat <= p.reveal! : false) : true) && sideA(m) >= 0.5;
  const prioOf = (m: { beat?: number; prio?: 0 | 1 | 2; kind: MarkKind }): 0 | 1 | 2 => (beatMode && m.beat !== undefined ? (m.beat === hot ? 2 : m.kind === "dec" ? 1 : 0) : (m.prio ?? 1));
  const tagLevels = useMemo(() => {
    if (!box || !p.tags) return [] as { key: string; side: Side; v: THREE.Vector3 }[];
    const c = box.getCenter(new THREE.Vector3());
    const halfX = Math.max(box.getSize(new THREE.Vector3()).x / 2, LANE * 3) * 0.94;
    const out: { key: string; side: Side; v: THREE.Vector3 }[] = [];
    const top = p.view === "top";
    [0.1, 0.5, 0.9].forEach((f, i) => {
      // in the top view the long axis of the picture is front to back (z), otherwise it is vertical
      const y = top ? c.y : box.min.y + (box.max.y - box.min.y) * f;
      const z = top ? box.min.z + (box.max.z - box.min.z) * f : c.z;
      out.push({ key: `tag:L${i}`, side: "L", v: new THREE.Vector3(halfX, y, z) });
      out.push({ key: `tag:R${i}`, side: "R", v: new THREE.Vector3(-halfX, y, z) });
    });
    return out;
  }, [box, p.tags, p.view]);
  const labelItems = useMemo<LabelItem[]>(
    () => [
      ...tagLevels.map((t) => ({ key: t.key, v: t.v, prio: 9, fixed: true })),
      ...shownMarks.map((m) => ({ key: m.key, v: m.v!.clone().add(new THREE.Vector3(0, radius * 2.5, 0)), prio: prioOf(m), dir: m.dir, show: isShown(m) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownMarks, tagLevels, radius, hot, p.reveal, sideAlpha.L, sideAlpha.R],
  );
  useEffect(() => {
    const measure = () => {
      labelEls.current.forEach((el, k) => sizes.current.set(k, { w: el.offsetWidth, h: el.offsetHeight }));
    };
    measure();
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [shownMarks, tagLevels, hot]);

  const zoneColors = p.zoneColors ?? TRIGEMINAL_ZONES.map(() => p.colors.hi);
  const limbColors = (b: Side) => ({ side: b === "L" ? p.colors.left : p.colors.right, dim: p.colors.dim });
  const labelStyle = (m: { color: string }, pr: number): React.CSSProperties => ({
    width: "max-content",
    maxWidth: pr === 2 ? 240 : 190,
    font: `${pr === 2 ? 700 : 600} ${pr === 2 ? 12 : 10.5}px/1.25 var(--font-mono, ui-monospace, monospace)`,
    letterSpacing: "0.03em",
    padding: pr === 2 ? "3px 8px" : "2px 6px",
    borderRadius: 6,
    background: "color-mix(in srgb, var(--panel-solid, #111) 90%, transparent)",
    color: "var(--text)",
    border: `${pr === 2 ? 2 : 1}px solid ${m.color}`,
    opacity: pr === 2 ? 1 : pr === 1 ? 0.78 : 0.34,
    transition: "opacity 200ms",
  });
  const interactive = !!p.onPickInfo;

  return (
    <div ref={rootRef} data-hover={hoverKey ?? ""} className="relative h-full w-full">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 35, near: 0.005, far: 8, position: [0.4, 1.6, 0.2] }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        style={{ cursor: limbHover || hoverKey ? "pointer" : undefined }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
        onPointerMissed={() => p.onPickInfo?.(null)}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[1, 2, 3]} intensity={1.3} />
        <directionalLight position={[-2, 1, -2]} intensity={0.7} />
        {/* a trackball: free rotation on both axes, no pole stops */}
        <TrackballControls makeDefault staticMoving rotateSpeed={2.4} zoomSpeed={1.2} panSpeed={0.8} minDistance={0.03} maxDistance={4} keys={["F13", "F14", "F15"]} />
        <Rig box={box} view={p.view} nonce={p.frameNonce} />
        {index && <ContextShell file={index.context.file} color={p.colors.dim} />}
        {p.anatomy?.map((a) => (
          <Anatomy key={a.key} spec={a} sideAlpha={sideAlpha} reveal={beatMode ? p.reveal! : 999} hot={hot} />
        ))}
        {layerParts.map((x) => {
          const lb = beatMode && x.l.beat !== undefined;
          const lit = !lb || x.l.beat! <= p.reveal!;
          const sa = x.l.body ? sideAlpha[x.l.body] : 1;
          const strength = lb ? (hot === null || hot === x.l.beat ? 1 : 0.55) : 1;
          const near = x.l.nearView && x.l.nearView === p.view ? 0.14 : 1;
          return (
            <LayerMesh
              key={x.k}
              id={x.id}
              file={x.file}
              name={x.name}
              side={x.l.side}
              color={x.l.color}
              opacity={lit ? x.l.opacity * sa * strength * near : 0}
              pickable={x.l.pickable}
              hovered={p.hoverId === x.id || (!!x.l.info && hoverKey === x.l.info)}
              glow={lb && hot === x.l.beat}
              infoKey={lb ? x.l.info : undefined}
              onPickInfo={p.onPickInfo}
              onHoverInfo={setHover}
              onPick={p.onPick}
              onHover={p.onHover}
              onLoaded={() => setLayersDone((n) => n + 1)}
            />
          );
        })}
        {box && p.midline !== false && p.view !== "left" && p.view !== "right" && <SidePlane box={box} colors={p.colors} />}
        {limbs.map((l) => {
          const prominent = !beatMode || hot === null || (hot >= (l.from ?? 0) && hot <= (l.to ?? 999));
          return (
            <Limb
              key={l.key}
              spec={{ ...l, alpha: l.alpha * sideAlpha[l.body] * (prominent ? 1 : 0.2) }}
              at={l.v!}
              colors={limbColors(l.body)}
              zoneColors={zoneColors}
              onPick={p.onLimbPick}
              onHover={setLimbHover}
            />
          );
        })}
        {eyes.map((e) => (
          <EyeBall key={e.side} at={e.at} side={e.side} spec={{ ...p.eyes!.spec, alpha: sideAlpha }} dimColor={p.colors.dim} />
        ))}
        {tubes.map((t) => {
          const bm = beatMode && t.beat !== undefined;
          const revealed = bm ? (t.beat! <= p.reveal! ? 1 : 0) : (t.reveal ?? 1);
          const base = bm ? (hot === null ? 0.9 : t.beat === hot ? 1 : 0.45) : (t.opacity ?? 1);
          return (
            <TubeMesh
              key={t.key}
              pts={t.v}
              color={t.color}
              colors={p.colors}
              opacity={base * sideAlpha[t.body] * (t.meshed ? 0.8 : 1)}
              reveal={revealed}
              radius={radius * (t.width ?? 1) * (t.meshed ? 0.8 : 1)}
              pulse={t.pulse}
              hover={!!t.info && hoverKey === t.info}
              reduced={p.reduced}
              interactive={interactive && !!t.info && !t.meshed}
              onPick={() => p.onPickInfo?.(t.info!)}
              onHover={(h) => setHover(h ? t.info! : null)}
            />
          );
        })}
        {marks.map((m) => {
          const bm = beatMode && m.beat !== undefined;
          const show = bm ? m.beat! <= p.reveal! : true;
          const dim = sideA(m) < 0.5 || (bm && hot !== null && m.beat !== hot && m.kind !== "dec");
          return (
            <MarkMesh
              key={m.key}
              pos={m.v!}
              kind={m.kind}
              color={m.color}
              r={radius}
              dim={dim || (!bm && m.prio === 0)}
              show={show}
              hot={bm && m.beat === hot}
              hover={!!m.info && hoverKey === m.info}
              reduced={p.reduced}
              onPick={interactive && m.info ? () => p.onPickInfo?.(m.info!) : undefined}
              onHover={(h) => setHover(h ? m.info! : null)}
            />
          );
        })}
        <LabelProjector items={labelItems} els={labelEls} lines={leaderEls} sizes={sizes} obstacles={obstacleRects} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <svg className="absolute inset-0 h-full w-full">
          {shownMarks.map((m) => {
            const pr = prioOf(m);
            return (
              <line
                key={m.key}
                ref={(el) => { if (el) leaderEls.current.set(m.key, el); else leaderEls.current.delete(m.key); }}
                stroke={m.color}
                strokeWidth={pr === 2 ? 1.6 : 1}
                strokeOpacity={pr === 2 ? 0.9 : pr === 0 ? 0.25 : 0.55}
                style={{ visibility: "hidden" }}
              />
            );
          })}
        </svg>
        {shownMarks.map((m) => (
          <div key={m.key} ref={(el) => { if (el) labelEls.current.set(m.key, el); else labelEls.current.delete(m.key); }} style={{ position: "absolute", left: 0, top: 0, visibility: "hidden", willChange: "transform" }}>
            <div style={labelStyle(m, prioOf(m))}>{m.text}</div>
          </div>
        ))}
        {tagLevels.map((t) => (
          <div key={t.key} ref={(el) => { if (el) labelEls.current.set(t.key, el); else labelEls.current.delete(t.key); }} style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                font: "700 11px var(--font-mono, ui-monospace, monospace)",
                letterSpacing: "0.08em",
                color: "var(--panel-solid, #000)",
                background: t.side === "L" ? p.colors.left : p.colors.right,
                borderRadius: 99,
                padding: "2px 9px 2px 7px",
                opacity: 0.92,
              }}
            >
              <svg width="16" height="6" aria-hidden>
                <line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="2.4" strokeDasharray={t.side === "L" ? undefined : "4 3"} />
              </svg>
              {t.side === "L" ? "LEFT" : "RIGHT"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
