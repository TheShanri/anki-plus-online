"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { loadAtlasIndex, resolveStructureIds, unionBox } from "@/lib/atlas";
import type { AtlasEntry, AtlasIndex } from "@/lib/atlas";
import { loadAtlasModel, releaseAtlasCache, retainAtlasCache } from "@/lib/atlas/loader";
import { readCssColor } from "@/lib/atlas/theme";

export type AtlasMode = "focus" | "context";

export type ViewName = "anterior" | "posterior" | "left" | "right" | "superior" | "inferior" | "midsagittal" | "top";
const VIEWS: { id: ViewName; label: string; dir: [number, number, number]; hidden?: boolean }[] = [
  { id: "anterior", label: "Anterior", dir: [0, 0, 1] },
  { id: "posterior", label: "Posterior", dir: [0, 0, -1] },
  { id: "left", label: "Lateral L", dir: [1, 0, 0] },
  { id: "right", label: "Lateral R", dir: [-1, 0, 0] },
  { id: "superior", label: "Superior", dir: [0, 1, 0.02] },
  { id: "inferior", label: "Inferior", dir: [0, -1, 0.02] },
  { id: "midsagittal", label: "Midsagittal", dir: [1, 0, 0] },
  // from above with the front at the top of the screen (the MRI convention); only reachable through the `view` prop
  { id: "top", label: "Top", dir: [0, 1, -0.02], hidden: true },
];
const DEFAULT_CTX_CENTER = new THREE.Vector3(0, 1.605, -0.01);

export type AtlasViewerProps = {
  /** Atlas ids to highlight (group ids are expanded to their members). */
  structureIds: string[];
  /** "focus": target bright, shell faded to ~15%. "context": whole shell faint, no emphasis. */
  mode?: AtlasMode;
  /** Shows the "approximate location" badge (set when the ids are a fallback parent). */
  approximate?: boolean;
  /** Overrides the label (e.g. the course's own name for the structure). */
  label?: string;
  className?: string;
  height?: number | string;
  /** Other structures shown at the same time, each in its own colour (extras and neighbours). */
  overlays?: AtlasOverlay[];
  /** A structure was clicked in 3D (not dragged). Gets the mesh id. */
  onPickMesh?: (meshId: string) => void;
  /** Overlay key ("primary" or an overlay's key) hovered elsewhere (legend chips): highlighted in 3D. */
  hoverKey?: string | null;
  /** Overlay key hovered in 3D (or on an in-scene label): lets the legend highlight its chip. */
  onHoverKey?: (key: string | null) => void;
  /** Quiz mode: no names (tooltip, labels), no legend linking, clicking does nothing. */
  quiz?: boolean;
  /** Controlled cut plane (glTF metres along "x" left-right, "y" up, "z" anterior). Replaces the built-in cut controls. */
  cut?: { axis: "x" | "y" | "z"; position: number; /** remove the low side instead of the high side */ flip?: boolean } | null;
  /** Camera view; changing the value re-aims the camera (the view buttons still work in between). */
  view?: ViewName;
  /** No in-scene name labels and no Labels button (colour-coded modes with many structures). */
  hideLabels?: boolean;
  /** "mesh": hover highlights only the hovered mesh instead of every mesh of its overlay. */
  pickMode?: "key" | "mesh";
  /** Tooltip text for a hovered mesh (default: its atlas name). */
  tipText?: (meshId: string, name: string) => string;
  /** Translucent reference planes drawn in the scene (never clipped by the cut). */
  guides?: AtlasGuide[];
  /** Camera distance multiplier (below 1 comes closer); default 1. */
  zoom?: number;
};

export type AtlasGuide = { axis: "x" | "y" | "z"; position: number; color: string };

export type AtlasOverlay = { key: string; ids: string[]; color: string; opacity?: number };
type LoadedOverlay = { key: string; color: string; opacity: number; groups: THREE.Group[]; ids: string[] };
type Look = "brain" | "regions" | "xray";
const LOOKS: { id: Look; label: string }[] = [
  { id: "brain", label: "Brain" },
  { id: "regions", label: "Regions" },
  { id: "xray", label: "X-ray" },
];
type Hover = { key?: string; id?: string } | null;
type LabelItem = { key: string; sid: string; text: string; color: string; anchor: THREE.Vector3 };
type ClipAxis = "off" | "x" | "y" | "z";
type ClipState = { axis: ClipAxis; t: number; flip: boolean };
const CLIP_AXES: { id: ClipAxis; label: string }[] = [
  { id: "off", label: "No cut" },
  { id: "z", label: "Coronal cut" },
  { id: "x", label: "Sagittal cut" },
  { id: "y", label: "Transverse cut" },
];

type Loaded = { key: string; targets: THREE.Group[]; targetIds: string[]; ctx: THREE.Group | null; ovl: LoadedOverlay[]; error?: string };

/* Imperative three.js helpers kept outside components so the immutability lint does not treat GPU objects as state. */
function enableLocalClipping(gl: THREE.WebGLRenderer) {
  gl.localClippingEnabled = true;
}

function setPlanes(m: THREE.MeshStandardMaterial, planes: THREE.Plane[], alwaysDouble = false) {
  m.clippingPlanes = planes;
  m.side = alwaysDouble || planes.length ? THREE.DoubleSide : THREE.FrontSide;
  m.needsUpdate = true;
}

function configureContextMaterial(m: THREE.MeshStandardMaterial, opacity: number, planes: THREE.Plane[]) {
  m.opacity = opacity;
  setPlanes(m, planes);
}

/** Plane for a cut along an anatomical axis (glTF Y-up: x = left-right, y = up, z = anterior). */
function cutPlane(axis: ClipAxis, pos: number, flip: boolean, into: THREE.Plane): boolean {
  if (axis === "off") return false;
  const e = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  if (flip) {
    into.normal.copy(e);
    into.constant = -pos;
  } else {
    into.normal.copy(e).negate();
    into.constant = pos;
  }
  return true;
}

/** Short emissive + scale pulse after a highlight appears (frameloop is on demand, so it asks for frames while active). */
class Pulse {
  private until = 0;
  private dur = 1;
  start(ms: number) {
    this.dur = Math.max(1, ms);
    this.until = ms > 0 ? performance.now() + ms : 0;
  }
  /** Returns true while another frame is needed. */
  step(mat: THREE.MeshStandardMaterial, pivots: THREE.Group[]): boolean {
    if (this.until === 0) return false;
    const left = this.until - performance.now();
    if (left > 0) {
      const t = 1 - left / this.dur;
      const fade = left / this.dur;
      mat.emissiveIntensity = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 3)) * fade;
      const k = 1 + 0.035 * Math.sin(t * Math.PI * 3) * fade;
      for (const p of pivots) p.scale.setScalar(k);
      return true;
    }
    this.until = 0;
    mat.emissiveIntensity = 0.55;
    for (const p of pivots) p.scale.setScalar(1);
    return true;
  }
}

function Rig({ box, view, nonce, zoom }: { box: THREE.Box3 | null; view: ViewName; nonce: number; zoom: number }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  useEffect(() => {
    // frame between the target and the whole brain so the surroundings stay in view
    const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()).length() : 0.3;
    // tiny targets (cranial nerve nuclei, geniculates, habenula...) would be specks at brain scale: come closer
    const small = size < 0.03;
    const c = box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()).lerp(DEFAULT_CTX_CENTER, small ? 0.1 : 0.35) : DEFAULT_CTX_CENTER.clone();
    // Frame the whole brain around the target so students keep their bearings; they can zoom in.
    const dist = (view === "midsagittal" ? 0.42 : small ? 0.22 : Math.min(0.6, Math.max(0.44, size * 2.6))) * zoom;
    const v = VIEWS.find((x) => x.id === view) ?? VIEWS[2];
    const target = view === "midsagittal" ? DEFAULT_CTX_CENTER.clone().setX(0) : c;
    camera.position.copy(target).addScaledVector(new THREE.Vector3(...v.dir).normalize(), dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    invalidate();
  }, [box, view, nonce, zoom, camera, controls, invalidate]);
  return null;
}


function GuidePlane({ g, centre }: { g: AtlasGuide; centre: THREE.Vector3 }) {
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.15, 0.15), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  useEffect(
    () => () => {
      geo.dispose();
      edges.dispose();
    },
    [geo, edges],
  );
  useEffect(() => invalidate(), [g, invalidate]);
  const pos: [number, number, number] = [g.axis === "x" ? g.position : centre.x, g.axis === "y" ? g.position : centre.y, g.axis === "z" ? g.position : centre.z];
  const rot: [number, number, number] = g.axis === "x" ? [0, Math.PI / 2, 0] : g.axis === "y" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <group position={pos} rotation={rot} renderOrder={8}>
      <mesh geometry={geo} raycast={() => undefined}>
        <meshBasicMaterial color={g.color} transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => undefined}>
        <lineBasicMaterial color={g.color} />
      </lineSegments>
    </group>
  );
}

function readColors() {
  return { accent: readCssColor("--accent", "#ff2a6d"), dim: readCssColor("--text-dim", "#a996c9"), hover: readCssColor("--accent-2", "#22d3ee") };
}

/* ---------- gross look: materials, outlines, hover ---------- */
const CORTEX_TINT = "#dcb8aa";
const BRAIN_TINT: Record<string, string> = { cerebellum: "#cfa396", brainstem: "#d8c4a4" };
const LOBE_TINT: Record<string, string> = {
  "frontal-lobe": "#e3a0a0",
  "parietal-lobe": "#e6c58f",
  "temporal-lobe": "#9ccfa0",
  "occipital-lobe": "#8fb7e0",
  "limbic-lobe": "#c4a0dc",
  insula: "#e0a0c8",
  cerebellum: "#a0d4cf",
  brainstem: "#d6d09a",
};
const GROUPS = Object.keys(LOBE_TINT);

function groupOf(e: AtlasEntry | undefined): string {
  if (!e) return "frontal-lobe";
  if (e.region === "cerebellum") return "cerebellum";
  if (e.region === "brainstem") return "brainstem";
  return e.parent && LOBE_TINT[e.parent] ? e.parent : "frontal-lobe";
}

function eachMesh(root: THREE.Object3D, fn: (m: THREE.Mesh) => void) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.hull) fn(m);
  });
}

function buildGrossMats(look: Look): Record<string, THREE.MeshStandardMaterial> {
  const out: Record<string, THREE.MeshStandardMaterial> = {};
  for (const g of GROUPS) {
    const color = look === "regions" ? LOBE_TINT[g] : (BRAIN_TINT[g] ?? CORTEX_TINT);
    out[g] = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.62, metalness: 0 });
  }
  return out;
}

/** Back-face "inverted hull" outline: the mesh is drawn again, pushed outward in view space by a constant number of pixels. */
function makeHull(color: string, px: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const u = { value: px };
  m.onBeforeCompile = (s) => {
    s.uniforms.uW = u;
    s.vertexShader =
      "uniform float uW;\n" +
      s.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nmvPosition.xyz += normalize(normalMatrix * normal) * (-mvPosition.z) * uW;\ngl_Position = projectionMatrix * mvPosition;",
      );
  };
  m.customProgramCacheKey = () => "atlas-hull";
  return m;
}

function styleHull(m: THREE.MeshBasicMaterial, color: string, solid: boolean) {
  m.color.set(color);
  m.transparent = !solid;
  m.opacity = solid ? 1 : 0.3;
  m.depthWrite = solid;
  m.visible = solid; // outlines only make sense on the solid brain
  m.needsUpdate = true;
}

function configureGross(
  mats: Record<string, THREE.MeshStandardMaterial>,
  hull: THREE.MeshBasicMaterial,
  look: Look,
  solid: boolean,
  planes: THREE.Plane[],
) {
  for (const k of GROUPS) {
    const m = mats[k];
    m.transparent = !solid;
    m.opacity = solid ? 1 : 0.2;
    m.depthWrite = solid;
    m.clippingPlanes = planes;
    m.side = planes.length ? THREE.DoubleSide : THREE.FrontSide;
    m.needsUpdate = true;
  }
  styleHull(hull, look === "regions" ? "#14111c" : "#33211d", solid);
  hull.clippingPlanes = planes;
  hull.needsUpdate = true;
}

function applyGrossMats(meshes: Map<string, THREE.Mesh>, mats: Record<string, THREE.MeshStandardMaterial>) {
  for (const m of meshes.values()) m.material = mats[m.userData.g as string] ?? mats["frontal-lobe"];
}

function addHulls(root: THREE.Object3D, mat: THREE.Material): THREE.Mesh[] {
  const list: THREE.Mesh[] = [];
  eachMesh(root, (m) => {
    const h = new THREE.Mesh(m.geometry, mat);
    h.userData.hull = true;
    h.raycast = () => undefined;
    m.add(h);
    list.push(h);
  });
  return list;
}

function tagGross(root: THREE.Object3D, structures: Record<string, AtlasEntry>): Map<string, THREE.Mesh> {
  const byId = new Map<string, THREE.Mesh>();
  eachMesh(root, (m) => {
    let n: THREE.Object3D | null = m;
    while (n && !structures[n.name]) n = n.parent;
    if (!n) return;
    m.userData.gid = n.name;
    m.userData.g = groupOf(structures[n.name]);
    byId.set(n.name, m);
  });
  return byId;
}

function tagMeshes(root: THREE.Object3D, props: Record<string, unknown>) {
  eachMesh(root, (m) => Object.assign(m.userData, props));
}

function setGrossVisible(meshes: Map<string, THREE.Mesh>, show: boolean, hidden: Set<string>) {
  for (const [id, m] of meshes) m.visible = show && !hidden.has(id);
}

function setHoverMeshes(pool: THREE.Mesh[], list: THREE.Mesh[], mat: THREE.Material) {
  for (let i = 0; i < pool.length; i++) {
    const h = pool[i];
    h.removeFromParent();
    const src = list[i];
    if (src) {
      h.geometry = src.geometry;
      h.material = mat;
      src.add(h);
    }
  }
}

function setPickPlanes(m: THREE.MeshBasicMaterial, planes: THREE.Plane[]) {
  m.clippingPlanes = planes;
  m.side = planes.length ? THREE.DoubleSide : THREE.FrontSide;
  m.needsUpdate = true;
}

function setHullPlanes(m: THREE.MeshBasicMaterial, planes: THREE.Plane[]) {
  m.clippingPlanes = planes;
  m.needsUpdate = true;
}

const _hit = new THREE.Vector3();
function clippedBy(planes: THREE.Plane[], p: THREE.Vector3): boolean {
  for (const pl of planes) if (pl.distanceToPoint(p) < 0) return true;
  return false;
}

/* ---------- in-scene labels ---------- */
type LabRefs = { bottom: number; solid: boolean; tags: (HTMLDivElement | null)[]; lines: (SVGLineElement | null)[]; dots: (SVGCircleElement | null)[]; w: number[] };
const SAMPLE_MAX = 1200;
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _r = new THREE.Vector3();

/** One anchor per side for paired structures: the surface vertex nearest the centroid of each half (left = +x). */
function anchorsFor(group: THREE.Object3D, split: boolean): { p: THREE.Vector3; side: "" | "L" | "R" }[] {
  group.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  eachMesh(group, (m) => {
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / SAMPLE_MAX));
    for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  const parts: { side: "" | "L" | "R"; pts: THREE.Vector3[] }[] = split
    ? [
        { side: "L", pts: pts.filter((v) => v.x > 0) },
        { side: "R", pts: pts.filter((v) => v.x <= 0) },
      ]
    : [{ side: "", pts }];
  const real = parts.filter((x) => x.pts.length >= 3);
  const out: { p: THREE.Vector3; side: "" | "L" | "R" }[] = [];
  for (const part of real.length ? real : [{ side: "" as const, pts }]) {
    if (!part.pts.length) continue;
    const c = new THREE.Vector3();
    for (const v of part.pts) c.add(v);
    c.divideScalar(part.pts.length);
    let best = part.pts[0];
    let bd = Infinity;
    for (const v of part.pts) {
      const d = v.distanceToSquared(c);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    out.push({ p: best.clone(), side: real.length > 1 ? part.side : "" });
  }
  return out;
}

const MAX_LABELS = 40;
const sx = new Float32Array(MAX_LABELS);
const sy = new Float32Array(MAX_LABELS);
const bxA = new Float32Array(MAX_LABELS);
const byA = new Float32Array(MAX_LABELS);
const order: number[] = [];
const LH = 22;
const TOP_BAR = 46;

function layoutLabels(items: LabelItem[], lab: LabRefs, camera: THREE.Camera, W: number, H: number, centre: THREE.Vector3) {
  camera.updateMatrixWorld();
  _p.copy(centre).project(camera);
  const cx = (_p.x * 0.5 + 0.5) * W;
  const cy = (-_p.y * 0.5 + 0.5) * H;
  const n = Math.min(items.length, MAX_LABELS);
  order.length = 0;
  for (let i = 0; i < n; i++) {
    _p.copy(items[i].anchor).project(camera);
    sx[i] = (_p.x * 0.5 + 0.5) * W;
    sy[i] = (-_p.y * 0.5 + 0.5) * H;
    order.push(i);
  }
  order.sort((a, b) => sy[a] - sy[b]);
  for (let k = 0; k < n; k++) {
    const i = order[k];
    let ux = sx[i] - cx;
    let uy = sy[i] - cy;
    const len = Math.hypot(ux, uy);
    if (len < 10) {
      ux = 0;
      uy = -1;
    } else {
      ux /= len;
      uy /= len;
    }
    const w = lab.w[i] || 100;
    const tx = sx[i] + ux * 50;
    const ty = sy[i] + uy * 38;
    let bx = Math.min(Math.max(4, ux < 0 ? tx - w : tx), Math.max(4, W - w - 4));
    let by = Math.min(Math.max(TOP_BAR, ty - LH / 2), Math.max(TOP_BAR, H - LH - lab.bottom));
    for (let iter = 0; iter < 12; iter++) {
      let moved = false;
      for (let q = 0; q < k; q++) {
        const j = order[q];
        const wj = lab.w[j] || 100;
        if (bx < bxA[j] + wj + 4 && bx + w + 4 > bxA[j] && by < byA[j] + LH + 3 && by + LH + 3 > byA[j]) {
          by = byA[j] + LH + 3;
          moved = true;
        }
      }
      if (by > H - LH - lab.bottom) {
        by = Math.max(TOP_BAR, H - LH - lab.bottom);
        bx += w + 8;
        if (bx + w > W - 4) bx = 4;
      }
      if (!moved) break;
    }
    bxA[i] = bx;
    byA[i] = by;
  }
  for (let i = 0; i < n; i++) {
    const tag = lab.tags[i];
    const line = lab.lines[i];
    const dot = lab.dots[i];
    if (!tag || !line || !dot) continue;
    _p.copy(items[i].anchor).project(camera);
    const vis = _p.z < 1;
    // far side of a solid brain: the point is hidden, so the tag is dimmed
    _q.copy(items[i].anchor).sub(centre);
    const hidden = lab.solid && _q.dot(_r.copy(camera.position).sub(centre)) < 0;
    const w = lab.w[i] || 100;
    tag.style.opacity = hidden ? "0.45" : "1";
    line.style.opacity = hidden ? "0.35" : "1";
    dot.style.opacity = hidden ? "0.35" : "1";
    tag.style.transform = `translate(${bxA[i].toFixed(1)}px,${byA[i].toFixed(1)}px)`;
    tag.style.visibility = vis ? "visible" : "hidden";
    const x2 = Math.min(Math.max(sx[i], bxA[i]), bxA[i] + w);
    const y2 = Math.min(Math.max(sy[i], byA[i]), byA[i] + LH);
    line.setAttribute("x1", sx[i].toFixed(1));
    line.setAttribute("y1", sy[i].toFixed(1));
    line.setAttribute("x2", x2.toFixed(1));
    line.setAttribute("y2", y2.toFixed(1));
    line.style.visibility = vis ? "visible" : "hidden";
    dot.setAttribute("cx", sx[i].toFixed(1));
    dot.setAttribute("cy", sy[i].toFixed(1));
    dot.style.visibility = vis ? "visible" : "hidden";
  }
}

function LabelUpdater({ items, lab, enabled, centre, solid }: { items: LabelItem[]; lab: React.RefObject<LabRefs>; enabled: boolean; centre: THREE.Vector3; solid: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [items, enabled, size, solid, invalidate]);
  useFrame(() => {
    if (enabled && items.length) layoutLabels(items, lab.current, camera, size.width, size.height, centre);
  });
  return null;
}

/* ---------- pointer picking (hover + click), throttled to one raycast per animation frame ---------- */
type PickInfo = { hover: NonNullable<Hover>; name: string };

function Picker({
  pickables,
  grossPlanes,
  ownPlanes,
  structures,
  onHover,
  onMove,
  onPick,
}: {
  pickables: React.RefObject<THREE.Mesh[]>;
  grossPlanes: React.RefObject<THREE.Plane[]>;
  ownPlanes: React.RefObject<THREE.Plane[]>;
  structures: Record<string, AtlasEntry>;
  onHover: (h: Hover, name: string | null) => void;
  onMove: (x: number, y: number) => void;
  onPick: (id: string) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let raf = 0;
    let lx = 0;
    let ly = 0;
    let lastSig = "";
    let down: { x: number; y: number; t: number } | null = null;

    const pick = (cx: number, cy: number): PickInfo | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables.current, false);
      for (const h of hits) {
        const m = h.object as THREE.Mesh;
        _hit.copy(h.point);
        const gross = m.userData.gid !== undefined;
        if (clippedBy(gross ? grossPlanes.current : ownPlanes.current, _hit)) continue;
        const id = (gross ? m.userData.gid : m.userData.sid) as string;
        const name = structures[id]?.name ?? id;
        return { hover: gross ? { id } : { key: m.userData.key as string, id }, name };
      }
      return null;
    };
    const run = () => {
      raf = 0;
      const p = pick(lx, ly);
      const sig = p ? `${p.hover.key ?? ""}|${p.hover.id ?? ""}` : "";
      if (sig !== lastSig) {
        lastSig = sig;
        onHover(p ? p.hover : null, p ? p.name : null);
        el.style.cursor = p ? "pointer" : "";
      }
      if (p) {
        const r = el.getBoundingClientRect();
        onMove(lx - r.left, ly - r.top);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.buttons) return; // rotating / panning
      lx = e.clientX;
      ly = e.clientY;
      if (!raf) raf = requestAnimationFrame(run);
    };
    const leave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lastSig = "";
      el.style.cursor = "";
      onHover(null, null);
    };
    const dn = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (lastSig) {
        lastSig = "";
        onHover(null, null);
      }
    };
    const up = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
      const p = pick(e.clientX, e.clientY);
      if (p?.hover.id) onPick(p.hover.id);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", dn);
    el.addEventListener("pointerup", up);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.style.cursor = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", dn);
      el.removeEventListener("pointerup", up);
    };
  }, [gl, camera, pickables, grossPlanes, ownPlanes, structures, onHover, onMove, onPick]);
  return null;
}

function Scene({
  loaded,
  gross,
  structures,
  look,
  solid,
  mode,
  showCtx,
  midsagittal,
  accent,
  dim,
  hoverColor,
  clip,
  clipRange,
  hover,
  quiz,
  perMesh,
  guides,
  centre,
  onHover,
  onMove,
  onPick,
}: {
  loaded: Loaded;
  gross: THREE.Group | null;
  structures: Record<string, AtlasEntry>;
  look: Look;
  solid: boolean;
  mode: AtlasMode;
  showCtx: boolean;
  midsagittal: boolean;
  accent: THREE.Color;
  dim: THREE.Color;
  hoverColor: THREE.Color;
  clip: ClipState;
  clipRange: [number, number];
  hover: Hover;
  quiz: boolean;
  perMesh: boolean;
  guides: AtlasGuide[];
  centre: THREE.Vector3;
  onHover: (h: Hover, name: string | null) => void;
  onMove: (x: number, y: number) => void;
  onPick: (id: string) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  const cutP = useMemo(() => new THREE.Plane(), []);
  const grossPlanes = useRef<THREE.Plane[]>([]);
  const ownPlanes = useRef<THREE.Plane[]>([]);
  const pickables = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    enableLocalClipping(gl);
  }, [gl]);

  const hiMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
    [accent],
  );
  const ctxMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: dim, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.15, depthWrite: false }),
    [dim],
  );
  const accentHull = useMemo(() => makeHull("#" + accent.clone().multiplyScalar(1.15).getHexString(), 0.0024), [accent]);
  const grossHull = useMemo(() => makeHull("#33211d", 0.0013), []);
  const grossMats = useMemo(() => buildGrossMats(look), [look]);
  const hoverMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ color: hoverColor, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    [hoverColor],
  );
  useEffect(
    () => () => {
      hiMat.dispose();
      ctxMat.dispose();
      accentHull.dispose();
      hoverMat.dispose();
    },
    [hiMat, ctxMat, accentHull, hoverMat],
  );
  useEffect(() => () => grossHull.dispose(), [grossHull]);
  useEffect(() => () => Object.values(grossMats).forEach((m) => m.dispose()), [grossMats]);

  const ovlMats = useMemo(
    () =>
      loaded.ovl.map(
        (o) =>
          new THREE.MeshStandardMaterial({
            color: o.color,
            emissive: o.color,
            emissiveIntensity: 0.3,
            roughness: 0.6,
            metalness: 0,
            transparent: o.opacity < 1,
            opacity: o.opacity,
            side: THREE.DoubleSide,
          }),
      ),
    [loaded.ovl],
  );
  useEffect(() => () => ovlMats.forEach((m) => m.dispose()), [ovlMats]);

  const grossById = useMemo(() => (gross ? tagGross(gross, structures) : new Map<string, THREE.Mesh>()), [gross, structures]);
  useEffect(() => {
    if (!gross) return;
    const hulls = addHulls(gross, grossHull);
    return () => hulls.forEach((h) => h.removeFromParent());
  }, [gross, grossHull]);
  useEffect(() => {
    applyGrossMats(grossById, grossMats);
    invalidate();
  }, [grossById, grossMats, invalidate]);

  const ovlRoot = useMemo(() => {
    const root = new THREE.Group();
    loaded.ovl.forEach((o, k) =>
      o.groups.forEach((g, j) => {
        const c = g.clone(true);
        tagMeshes(c, { key: o.key, sid: o.ids[j], k });
        root.add(c);
      }),
    );
    return root;
  }, [loaded.ovl]);
  useEffect(() => {
    eachMesh(ovlRoot, (m) => {
      m.material = ovlMats[m.userData.k as number];
    });
    invalidate();
  }, [ovlRoot, ovlMats, invalidate]);

  // wrap each target in a pivot at its centroid so the pulse scales in place
  const { targetRoot, pivots } = useMemo(() => {
    const root = new THREE.Group();
    const list: THREE.Group[] = [];
    // Clone: the loaded scenes are cached and shared, and React may run this memo twice (Strict Mode),
    // so mutating the originals would shift the target off screen on every re-run.
    loaded.targets.forEach((src, i) => {
      const t = src.clone(true);
      tagMeshes(t, { key: "primary", sid: loaded.targetIds[i] });
      t.position.set(0, 0, 0);
      t.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(c);
      t.position.sub(c);
      pivot.add(t);
      root.add(pivot);
      list.push(pivot);
    });
    return { targetRoot: root, pivots: list };
  }, [loaded.targets, loaded.targetIds]);
  useEffect(() => {
    const hulls = addHulls(targetRoot, accentHull);
    return () => hulls.forEach((h) => h.removeFromParent());
  }, [targetRoot, accentHull]);

  useEffect(() => {
    eachMesh(targetRoot, (m) => {
      m.material = hiMat;
    });
    loaded.ctx?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = ctxMat;
    });
    invalidate();
  }, [targetRoot, loaded.ctx, hiMat, ctxMat, invalidate]);

  // cut planes
  useEffect(() => {
    const gp: THREE.Plane[] = [];
    if (midsagittal) gp.push(clipPlane);
    const pos = clipRange[0] + clip.t * (clipRange[1] - clipRange[0]);
    const cutting = cutPlane(clip.axis, pos, clip.flip, cutP);
    if (cutting) gp.push(cutP);
    grossPlanes.current = gp;
    configureContextMaterial(ctxMat, mode === "context" ? 0.4 : 0.15, gp);
    configureGross(grossMats, grossHull, look, solid, gp);
    const own = cutting ? [cutP] : [];
    ownPlanes.current = own;
    setPlanes(hiMat, own, true);
    ovlMats.forEach((m) => setPlanes(m, own, true));
    setHullPlanes(accentHull, own);
    invalidate();
  }, [ctxMat, hiMat, ovlMats, grossMats, grossHull, accentHull, look, solid, mode, midsagittal, clipPlane, cutP, clip, clipRange, invalidate]);

  // which gross meshes are shown / pickable (a target or overlay replaces the gross mesh with the same id)
  const hiddenIds = useMemo(() => new Set<string>([...loaded.targetIds, ...loaded.ovl.flatMap((o) => o.ids)]), [loaded]);
  const grossOn = showCtx && look !== "xray" && !!gross;
  useEffect(() => {
    setGrossVisible(grossById, grossOn, hiddenIds);
    const list: THREE.Mesh[] = [];
    eachMesh(targetRoot, (m) => list.push(m));
    eachMesh(ovlRoot, (m) => list.push(m));
    if (grossOn && solid) for (const [id, m] of grossById) if (!hiddenIds.has(id)) list.push(m);
    pickables.current = list;
    invalidate();
  }, [grossById, grossOn, solid, hiddenIds, targetRoot, ovlRoot, invalidate]);

  // hover highlight: a pooled tinted copy of the hovered mesh(es), parented to the source so transforms follow
  const pool = useMemo(
    () =>
      Array.from({ length: 12 }, () => {
        const h = new THREE.Mesh();
        h.userData.hull = true;
        h.raycast = () => undefined;
        h.renderOrder = 5;
        return h;
      }),
    [],
  );
  useEffect(() => {
    const list: THREE.Mesh[] = [];
    let grossHover = false;
    if (hover?.key) {
      if (hover.key === "primary") eachMesh(targetRoot, (m) => list.push(m));
      else eachMesh(ovlRoot, (m) => m.userData.key === hover.key && (!perMesh || !hover.id || m.userData.sid === hover.id) && list.push(m));
    } else if (hover?.id) {
      const m = grossById.get(hover.id);
      if (m && m.visible) {
        list.push(m);
        grossHover = true;
      }
    }
    setPickPlanes(hoverMat, grossHover ? grossPlanes.current : ownPlanes.current);
    setHoverMeshes(pool, list.slice(0, pool.length), hoverMat);
    invalidate();
    return () => setHoverMeshes(pool, [], hoverMat);
  }, [hover, pool, hoverMat, grossById, targetRoot, ovlRoot, perMesh, invalidate]);

  const [pulse] = useState(() => new Pulse());
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pulse.start(reduce || mode === "context" ? 0 : 1800);
    invalidate();
  }, [loaded, mode, invalidate, pulse]);

  useFrame(() => {
    if (pulse.step(hiMat, pivots)) invalidate();
  });

  return (
    <>
      <hemisphereLight args={[0xfff1e6, 0x4a3b5c, 1.0]} />
      <directionalLight position={[1, 2, 2]} intensity={1.5} />
      <directionalLight position={[-2, -1, -1.5]} intensity={0.55} />
      {loaded.ctx && showCtx && look === "xray" && <primitive object={loaded.ctx} />}
      {gross && <primitive object={gross} />}
      <primitive object={ovlRoot} />
      <primitive object={targetRoot} />
      {guides.map((g, i) => (
        <GuidePlane key={i} g={g} centre={centre} />
      ))}
      {!quiz && <Picker pickables={pickables} grossPlanes={grossPlanes} ownPlanes={ownPlanes} structures={structures} onHover={onHover} onMove={onMove} onPick={onPick} />}
    </>
  );
}

export default function AtlasViewer({
  structureIds,
  mode = "focus",
  approximate = false,
  label,
  className,
  height = 480,
  overlays,
  onPickMesh,
  hoverKey = null,
  onHoverKey,
  quiz = false,
  cut = null,
  view: viewProp,
  hideLabels = false,
  pickMode = "key",
  tipText,
  guides,
  zoom = 1,
}: AtlasViewerProps) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [gross, setGross] = useState<THREE.Group | null>(null);
  const [showCtx, setShowCtx] = useState(true);
  const [look, setLook] = useState<Look>("brain");
  const [solidPref, setSolidPref] = useState<boolean | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPos = useRef("translate(0px,0px)");
  const lab = useRef<LabRefs>({ bottom: 40, solid: false, tags: [], lines: [], dots: [], w: [] });
  const [view, setView] = useState<ViewName>(viewProp ?? "left");
  const [nonce, setNonce] = useState(0);
  const [prevViewProp, setPrevViewProp] = useState(viewProp);
  if (viewProp !== prevViewProp) {
    setPrevViewProp(viewProp);
    if (viewProp) {
      setView(viewProp);
      setNonce((n) => n + 1);
    }
  }
  const [clip, setClip] = useState<ClipState>({ axis: "off", t: 0.5, flip: false });
  const [colors, setColors] = useState(readColors);

  // theme colours: read at mount (state initialiser), refresh when data-theme changes
  useEffect(() => {
    const mo = new MutationObserver(() => setColors(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    retainAtlasCache();
    return () => releaseAtlasCache();
  }, []);

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setIndex(i))
      .catch((e) => alive && setIndexError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  // the gross brain (one ~1.3 MB file) is fetched only when a non-X-ray look is shown
  useEffect(() => {
    if (look === "xray" || gross) return;
    let alive = true;
    loadAtlasModel("gross.glb")
      .then((g) => alive && setGross(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [look, gross]);

  const resolved = useMemo(() => (index ? resolveStructureIds(index, structureIds) : []), [index, structureIds]);
  const key = resolved.join(",") + "|" + mode;
  const entries = useMemo(() => (index ? resolved.map((id) => index.structures[id]) : []), [index, resolved]);

  const ovlSig = (overlays ?? []).map((o) => `${o.key}:${o.ids.join("+")}:${o.color}:${o.opacity ?? ""}`).join("|");
  const ovlResolved = useMemo(
    () => (index ? (overlays ?? []).map((o) => ({ ...o, ids: resolveStructureIds(index, o.ids, 240).filter((id) => !resolved.includes(id)) })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, ovlSig, resolved],
  );
  const fullKey = key + "|" + ovlSig;

  useEffect(() => {
    if (!index) return;
    let alive = true;
    const ctxFile = index.context.file;
    Promise.all([
      loadAtlasModel(ctxFile).catch(() => null),
      Promise.all(resolved.map((id) => loadAtlasModel(index.structures[id].file!))),
      Promise.all(
        ovlResolved.map(async (o) => ({
          key: o.key,
          color: o.color,
          opacity: o.opacity ?? 0.95,
          ids: o.ids,
          groups: await Promise.all(o.ids.map((id) => loadAtlasModel(index.structures[id].file!))),
        })),
      ),
    ])
      .then(([ctx, targets, ovl]) => alive && setLoaded({ key: fullKey, ctx, targets, targetIds: resolved, ovl }))
      .catch((e) => alive && setLoaded({ key: fullKey, ctx: null, targets: [], targetIds: [], ovl: [], error: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, [index, resolved, ovlResolved, fullKey]);

  const current = loaded && loaded.key === fullKey ? loaded : null;
  // Keep the previous scene on screen while the next structure loads (no blank flash between picks).
  const shown = current ?? (loaded && !loaded.error ? loaded : null);
  const currentCtx = shown?.ctx ?? null;
  const ctxBox = useMemo(() => {
    const b = currentCtx ? new THREE.Box3().setFromObject(currentCtx) : null;
    return b && !b.isEmpty() ? b : null;
  }, [currentCtx]);
  const centre = useMemo(() => (ctxBox ? ctxBox.getCenter(new THREE.Vector3()) : DEFAULT_CTX_CENTER.clone()), [ctxBox]);
  const clipRange = useMemo<[number, number]>(() => {
    const ax = clip.axis === "off" ? "z" : clip.axis;
    if (!ctxBox) return ax === "x" ? [-0.08, 0.08] : ax === "y" ? [1.53, 1.68] : [-0.11, 0.1];
    return [ctxBox.min[ax], ctxBox.max[ax]];
  }, [ctxBox, clip.axis]);
  const box = useMemo(() => {
    const u = mode === "context" ? null : unionBox(entries);
    return u ? new THREE.Box3(new THREE.Vector3(...u.min), new THREE.Vector3(...u.max)) : null;
  }, [entries, mode]);

  function pickAxis(axis: ClipAxis) {
    if (axis === "off") return setClip((c) => ({ ...c, axis }));
    const lo = ctxBox ? ctxBox.min[axis] : axis === "x" ? -0.08 : axis === "y" ? 1.53 : -0.11;
    const hi = ctxBox ? ctxBox.max[axis] : axis === "x" ? 0.08 : axis === "y" ? 1.68 : 0.1;
    const c = box ? box.getCenter(new THREE.Vector3())[axis] : (lo + hi) / 2;
    setClip({ axis, t: Math.min(1, Math.max(0, (c - lo) / (hi - lo))), flip: false });
  }

  // Solid brain unless the selection is deep (then the cortex turns see-through so it can be found).
  const grossIds = useMemo(() => {
    const s = new Set<string>();
    gross?.traverse((o) => {
      if (index?.structures[o.name]) s.add(o.name);
    });
    return s;
  }, [gross, index]);
  const allSurface =
    !!shown && (shown.targetIds.length + shown.ovl.length === 0 || [...shown.targetIds, ...shown.ovl.flatMap((o) => o.ids)].every((id) => grossIds.has(id)));
  const solid = look === "xray" ? false : (solidPref ?? allSurface);

  // in-scene name labels (selected structure, added structures, neighbours)
  const labelItems = useMemo<LabelItem[]>(() => {
    if (quiz || hideLabels || !index || !shown) return [];
    const out: LabelItem[] = [];
    const accentHex = "#" + colors.accent.getHexString();
    const add = (k: string, color: string, g: THREE.Group, id: string, nameOverride?: string) => {
      const e = index.structures[id];
      if (!e) return;
      for (const a of anchorsFor(g, e.side === "lr")) {
        out.push({ key: k, sid: id, text: `${nameOverride ?? e.name}${a.side ? " (" + a.side + ")" : ""}`, color, anchor: a.p });
      }
    };
    shown.targets.forEach((g, i) => add("primary", accentHex, g, shown.targetIds[i], label && shown.targets.length === 1 ? label : undefined));
    shown.ovl.forEach((o) => o.groups.forEach((g, j) => add(o.key, o.color, g, o.ids[j])));
    return out.slice(0, MAX_LABELS);
  }, [quiz, hideLabels, index, shown, colors.accent, label]);
  const labelsOn = showLabels && !quiz && !hideLabels;
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    labelItems.forEach((_, i) => {
      lab.current.w[i] = lab.current.tags[i]?.offsetWidth ?? 100;
    });
    lab.current.bottom = (barRef.current?.offsetHeight ?? 32) + 12;
    lab.current.solid = solid;
  }, [labelItems, labelsOn, solid, look, showLabels]);

  const onHoverKeyRef = useRef(onHoverKey);
  const onPickRef = useRef(onPickMesh);
  const tipTextRef = useRef(tipText);
  useEffect(() => {
    onHoverKeyRef.current = onHoverKey;
    onPickRef.current = onPickMesh;
    tipTextRef.current = tipText;
  });
  const hoverStable = useMemo(
    () => (h: Hover, name: string | null) => {
      setHover(h);
      setTip(name !== null && h?.id && tipTextRef.current ? tipTextRef.current(h.id, name) : name);
    },
    [],
  );
  const moveStable = useMemo(
    () => (x: number, y: number) => {
      tipPos.current = `translate(${Math.round(x + 14)}px,${Math.round(y + 14)}px)`;
      if (tipRef.current) tipRef.current.style.transform = tipPos.current;
    },
    [],
  );
  useLayoutEffect(() => {
    if (tipRef.current) tipRef.current.style.transform = tipPos.current;
  }, [tip]);
  const pickStable = useMemo(() => (id: string) => onPickRef.current?.(id), []);
  const hoverKeyOut = hover?.key ?? null;
  useEffect(() => {
    onHoverKeyRef.current?.(hoverKeyOut);
  }, [hoverKeyOut]);

  const active: Hover = quiz ? null : (hover ?? (hoverKey ? { key: hoverKey } : null));

  const title =
    label ??
    (entries.length === 0
      ? ""
      : entries.length <= 3
        ? entries.map((e) => e.name).join(", ")
        : `${entries[0].name} + ${entries.length - 1} more`);
  const latin = !label && entries.length === 1 ? entries[0].latin : null;
  const missing = index && structureIds.length > 0 && resolved.length === 0;
  const btn = (on: boolean) =>
    `rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider backdrop-blur bg-panel ${on ? "border-accent-2 text-accent-2" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`;

  return (
    <div className={`relative w-full overflow-hidden rounded-card border border-panel-border bg-bg-2 ${className ?? ""}`} style={{ height }}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 35, near: 0.01, far: 6, position: [0.5, 1.605, -0.01] }}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        {shown && index && (
          <Scene
            loaded={shown}
            gross={gross}
            structures={index.structures}
            look={look}
            solid={solid}
            mode={mode}
            showCtx={showCtx}
            midsagittal={view === "midsagittal"}
            accent={colors.accent}
            dim={colors.dim}
            hoverColor={colors.hover}
            clip={cut ? { axis: cut.axis, t: cut.position, flip: !!cut.flip } : clip}
            clipRange={cut ? [0, 1] : clipRange}
            hover={active}
            quiz={quiz}
            perMesh={pickMode === "mesh"}
            guides={guides ?? []}
            centre={centre}
            onHover={hoverStable}
            onMove={moveStable}
            onPick={pickStable}
          />
        )}
        <LabelUpdater items={labelItems} lab={lab} enabled={labelsOn} centre={centre} solid={solid} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} screenSpacePanning minDistance={0.05} maxDistance={1.2} touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />
        <Rig box={box} view={view} nonce={nonce} zoom={zoom} />
      </Canvas>

      {labelsOn && labelItems.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {labelItems.map((it, i) => (
              <g key={i} stroke={it.color} fill={it.color}>
                <line ref={(el) => void (lab.current.lines[i] = el)} strokeWidth="1.5" strokeOpacity="0.9" />
                <circle ref={(el) => void (lab.current.dots[i] = el)} r="3" stroke="#000" strokeOpacity="0.5" strokeWidth="1" />
              </g>
            ))}
          </svg>
          {labelItems.map((it, i) => (
            <div
              key={i}
              ref={(el) => void (lab.current.tags[i] = el)}
              onPointerEnter={() => setHover({ key: it.key })}
              onPointerLeave={() => setHover(null)}
              onClick={() => onPickMesh?.(it.sid)}
              className={`pointer-events-auto absolute left-0 top-0 cursor-pointer whitespace-nowrap rounded-sm border bg-panel px-1.5 text-[11px] leading-[20px] text-text backdrop-blur ${active?.key === it.key ? "brightness-125" : ""}`}
              style={{ borderColor: it.color, borderLeftWidth: 4, height: 22, transform: "translate(-999px,-999px)" }}
            >
              {it.text}
            </div>
          ))}
        </div>
      )}

      {!quiz && tip && !hoverKey && (
        <div ref={tipRef} className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-sm border border-panel-border bg-panel-solid px-2 py-1 text-xs text-text shadow-pop">
          {tip}
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-col gap-1">
        {title && (
          <div className="rounded-sm border border-panel-border bg-panel px-2.5 py-1.5 text-sm backdrop-blur">
            <span className="font-display tracking-wide text-accent">{title}</span>
            {latin && <span className="ml-2 text-xs italic text-text-dim">{latin}</span>}
          </div>
        )}
        {approximate && (
          <div className="w-fit rounded-sm border border-hard px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-hard">
            Approximate location
          </div>
        )}
      </div>

      {!shown && !indexError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-dim" role="status">
          Loading 3D model...
        </div>
      ) : !current && !indexError ? (
        <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 rounded-sm border border-panel-border bg-panel px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim backdrop-blur" role="status">
          Loading...
        </div>
      ) : null}
      {(indexError || current?.error || missing) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-text-dim" role="alert">
          {missing ? "This structure has no 3D model in the atlas." : "The 3D atlas could not be loaded."}
        </div>
      )}

      {!cut && <div className="absolute right-2 top-2 flex max-w-[60%] flex-wrap items-center justify-end gap-1.5">
        {CLIP_AXES.map((a) => (
          <button key={a.id} type="button" onClick={() => pickAxis(a.id)} aria-pressed={clip.axis === a.id} className={btn(clip.axis === a.id)}>
            {a.label}
          </button>
        ))}
        {clip.axis !== "off" && (
          <div className="flex w-full items-center justify-end gap-2 rounded-sm border border-panel-border bg-panel px-2 py-1 backdrop-blur">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(clip.t * 1000)}
              onChange={(e) => setClip((c) => ({ ...c, t: Number(e.target.value) / 1000 }))}
              aria-label="Cut position"
              className="w-40 accent-accent"
            />
            <button type="button" onClick={() => setClip((c) => ({ ...c, flip: !c.flip }))} className="font-mono text-[11px] uppercase tracking-wider text-text-dim hover:text-text">
              Flip side
            </button>
          </div>
        )}
      </div>}

      <div ref={barRef} className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1.5">
        {VIEWS.filter((v) => !v.hidden).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setView(v.id);
              setNonce((n) => n + 1);
            }}
            aria-pressed={view === v.id}
            className={btn(view === v.id)}
          >
            {v.label}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {LOOKS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLook(l.id)} aria-pressed={look === l.id} className={btn(look === l.id)}>
              {l.label}
            </button>
          ))}
          {look !== "xray" && (
            <button type="button" onClick={() => setSolidPref(!solid)} aria-pressed={solid} title="Solid cortex, or see-through to find deep structures" className={btn(false)}>
              {solid ? "See through" : "Solid"}
            </button>
          )}
          {!quiz && !hideLabels && (
            <button type="button" onClick={() => setShowLabels((s) => !s)} aria-pressed={showLabels} className={btn(showLabels)}>
              Labels
            </button>
          )}
          <button type="button" onClick={() => setShowCtx((s) => !s)} aria-pressed={showCtx} className={btn(false)}>
            {showCtx ? "Hide shell" : "Show shell"}
          </button>
        </span>
      </div>
    </div>
  );
}
