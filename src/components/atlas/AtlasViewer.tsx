"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { loadAtlasIndex, resolveStructureIds, unionBox } from "@/lib/atlas";
import type { AtlasEntry, AtlasIndex } from "@/lib/atlas";
import { loadAtlasModel } from "./ui/modelCache";
import type { Prog } from "./ui/modelCache";
import { AtlasLoader, mbText, stagesFrom } from "./ui/AtlasLoader";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { readCssColor } from "@/lib/atlas/theme";
import { trackAtlas } from "@/lib/atlas/progress";
import {
  Bone, Brain, Cable, ChevronDown, ChevronUp, Crosshair, FlipHorizontal2, GitBranch, LayoutGrid, Lock, LockOpen, Maximize2, Minimize2, Orbit, Palette, RotateCcw, ScanLine, Sprout, Tag, Undo2, X,
} from "lucide-react";
import { Divider, Group, IconBtn, MenuItem, Popover } from "./ui/Toolbar";
import { CutCoronalIcon, CutNoneIcon, CutSagittalIcon, CutTransverseIcon, NeighborIcon, SeeThroughIcon, ShellIcon, SolidIcon } from "./ui/icons";
import { fitDistance, frameBox } from "./ui/framing";
import { NAV_MOUSE, NAV_TOUCH, NavExtras, NavHelpButton, NavHint, pivotedRecently } from "./ui/navigation";
import { PLANE_AXIS, PLANE_LABEL, applySectionOnly, planStructureCut, quietPalette } from "./ui/structureCut";
import type { CutPlaneName } from "./ui/structureCut";
import type { CamState } from "./ui/translate";
import type { SkullFocus } from "@/lib/atlas/catalog";
import { BrainstemBreathDriver, onBrainstemBreath } from "./brainstem/plate/pulse";
import { SectionFace, prewarmSectionCaps } from "./section/SectionFace";
import { DEEP, SectionOutlines, addSectionPaint, makeSectionPaint, tintPaint } from "./section/deep";
import { bakeGeometry, planeSection } from "./section/geometry";
import { sectionPalette, sectionSwatch, useSectionTheme } from "./section/palette";
import { SEC, insideTissue, setPalette, setSectionPlanes, setTissue } from "./section/shader";
import { loadTissue } from "./section/tissue";
// labelled interior (section/labels.ts, section/api.ts): cut faces, their pick, highlight and key come from one label volume
import { interiorNow, loadInterior } from "./section/labels";
import { hasLabels, sectionAnchors, sectionKeyFor, sectionPickRay, setSectionActive, setSectionRedraw, setSectionState } from "./section/api";
import { setInterior } from "./section/shader";

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
/** (interaction overhaul) Ventral surface parts shown with the default brain: the inferior view reads like the course's base-of-brain specimen. */
const VENTRAL_IDS = ["optic-chiasm", "optic-tract", "mamillary-body", "interpeduncular-fossa", "base-of-peduncle", "olive", "pyramid-of-medulla-oblongata"];
const DEEP_IDS = new Set(DEEP.map((d) => d.id));

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
  /** A structure was clicked in 3D (not dragged). Gets the mesh id and the hemisphere that was hit. */
  onPickMesh?: (meshId: string, side?: "L" | "R") => void;
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
  /** Keyboard shortcuts while the viewer has focus (views 1-7, cuts, looks, labels...). Off by default: other pages own their keys. */
  shortcuts?: boolean;
  /** Offer the 2x2 multi-view (anterior, lateral, superior, free orbit). */
  multiview?: boolean;
  /** Neighbour toggle in the toolbar (shown when the handler is given). */
  neighbors?: boolean;
  onToggleNeighbors?: () => void;
  /** Mesh ids on the student's syllabus. Every other gross mesh is drawn greyed and "locked". Unset: no locking. */
  syllabus?: ReadonlySet<string> | null;
  /** A locked mesh the student chose to look at anyway (drawn in normal colour). */
  unlocked?: string | null;
  /** Pick a better view / look by itself when the selection is hidden from the current one. */
  autoReveal?: boolean;
  onUserView?: (view: ViewName) => void;
  /** A click (not a drag) landed on empty space. */
  onPickNothing?: () => void;
  /** The skull and spine layer was switched on or off (by the toolbar, the K key or the auto rule). */
  onLayerChange?: (on: boolean) => void;
  /** Skull & spine layer: true when the selection is a skull or spine structure (on), false for brain structures (off). The toolbar toggle overrides this until the type changes. */
  layerAuto?: boolean;
  /** Extra three.js content drawn inside the Canvas in the same world space as gross.glb (also in every multi-view pane). Children may call invalidate()/useFrame themselves while animating (the frameloop stays on demand). */
  children?: React.ReactNode;
  /** Opacity of the base brain (everything not in an overlay), 0-1, e.g. 0.12. Below 1 the brain is drawn translucent with depthWrite off, so solid vessels inside it render correctly. */
  brainOpacity?: number;
  /** Explore only: cuts show a solid, brain-coloured section instead of a hollow shell (loads the small brainfill.glb). Off for embedders that draw their own content. */
  solidCuts?: boolean;
  /** node-name prefix -> structure slug for the skull and spine layer meshes (picking); names by slug / node. */
  skullNodes?: { prefix: string; slug: string }[];
  skullNames?: Record<string, string>;
  /** A structure of the skull and spine layer to show (patch, markers, tubes or meningeal shells). Turns the layer on. */
  skull?: SkullFocus | null;
  /** Camera view, multi-view and cut, reported whenever they change (the MRI tab shows the matching slice). */
  onCameraState?: (s: CamState) => void;
  /** Ask the viewer to switch view and/or multi-view (applied once per `n`). */
  request?: { n: number; view?: ViewName; multi?: boolean } | null;
  /** Overlay content (legend, cards) placed over the canvas; wrappers should set their own pointer-events. */
  overlay?: React.ReactNode;
  /** Extra buttons appended to the toolbar. */
  toolbarExtra?: React.ReactNode;
  /** Explore: an X on the selection chip (and the hint mentions Esc / empty click) to clear the selection. */
  onDeselect?: () => void;
  /** Explore: the selection chip offers "Show its cut" (coronal / sagittal / horizontal through the structure). */
  structureTools?: boolean;
};

export type AtlasGuide = { axis: "x" | "y" | "z"; position: number; color: string };

export type AtlasOverlay = { key: string; ids: string[]; color: string; opacity?: number; /** Only this hemisphere of a paired mesh (left = +x). */ side?: "L" | "R" };
type LoadedOverlay = { key: string; color: string; opacity: number; groups: THREE.Group[]; ids: string[]; side?: "L" | "R" };
type Look = "brain" | "regions" | "xray";
const LOOKS: { id: Look; label: string; key: string }[] = [
  { id: "brain", label: "Brain", key: "B" },
  { id: "regions", label: "Regions", key: "R" },
  { id: "xray", label: "X-ray", key: "X" },
];
const VIEW_KEYS: Record<ViewName, string> = { anterior: "1", posterior: "2", left: "3", right: "4", superior: "5", inferior: "6", midsagittal: "7", top: "" };
type Hover = { key?: string; id?: string } | null;
type LabelItem = { key: string; sid: string; text: string; color: string; anchor: THREE.Vector3 };
type ClipAxis = "off" | "x" | "y" | "z";
type ClipState = { axis: ClipAxis; t: number; flip: boolean };
const CLIP_AXES: { id: ClipAxis; label: string; key: string; plane: string }[] = [
  { id: "off", label: "No cut", key: "N", plane: "" },
  { id: "z", label: "Coronal cut", key: "C", plane: "coronal" },
  { id: "x", label: "Sagittal cut", key: "S", plane: "sagittal" },
  { id: "y", label: "Transverse cut", key: "T", plane: "transverse" },
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

/** A plane that clips nothing. Materials that carry the heavy section shader always get the same number of clipping
 * planes (padded with this), so turning a cut on or off never recompiles them: three.js keys its programs on the plane
 * count, and the first cut used to stall ~1-2 s compiling them again. */
const INERT_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
const PAD_PLANES = 2;
function padPlanes(planes: THREE.Plane[], n = PAD_PLANES): THREE.Plane[] {
  const out = planes.slice(0, n);
  while (out.length < n) out.push(INERT_PLANE);
  return out;
}

function capOpacity(m: THREE.Material, cap: number | undefined) {
  if (cap !== undefined) m.opacity = Math.min(m.opacity, cap);
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

type Pane = { el: HTMLElement | null; cam: THREE.PerspectiveCamera | null; view?: ViewName };
const FIXED_PANES: { id: string; view: ViewName; label: string }[] = [
  { id: "anterior", view: "anterior", label: "Anterior" },
  { id: "left", view: "left", label: "Lateral" },
  { id: "superior", view: "top", label: "Superior" },
];
const FREE_DIR = new THREE.Vector3(0.8, 0.5, 0.75).normalize();
const DEFAULT_BRAIN = new THREE.Box3(new THREE.Vector3(-0.07, 1.58, -0.1), new THREE.Vector3(0.07, 1.7, 0.085));
type Dims = { w: number; h: number };
const EMPTY_NODES: { prefix: string; slug: string }[] = [];
const EMPTY_NAMES: Record<string, string> = {};

/** The triangles of the (merged) layer meshes whose centre lies within r of an anchor: a highlighted patch of bone (approximate). */
function carvePatch(roots: THREE.Object3D[], anchors: number[][], r: number): THREE.BufferGeometry | null {
  const out: number[] = [];
  const r2 = r * r;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute("position");
      const idx = m.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const i0 = idx ? idx.getX(i) : i;
        const i1 = idx ? idx.getX(i + 1) : i + 1;
        const i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
        mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
        for (const p of anchors) {
          const dx = mid.x - p[0];
          const dy = mid.y - p[1];
          const dz = mid.z - p[2];
          if (dx * dx + dy * dy + dz * dz <= r2) {
            out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
            break;
          }
        }
      }
    });
  }
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

const SHELLS: { key: "pia" | "arachnoid" | "dura"; s: number; color: string; label: string }[] = [
  { key: "pia", s: 1.012, color: "#ff9ab8", label: "Pia mater (generated)" },
  { key: "arachnoid", s: 1.032, color: "#7fd8ff", label: "Arachnoid mater (generated)" },
  { key: "dura", s: 1.058, color: "#c3b2ff", label: "Dura mater (generated shell)" },
];
const SHELL_PAIR: Record<string, string[]> = { epidural: ["dura"], subdural: ["dura", "arachnoid"], subarachnoid: ["arachnoid", "pia"] };
const EMPTY_LAYER: THREE.Group[] = [];
/** Pan/zoom of one fixed multi-view pane (rotation stays locked): offsets along the pane's right/up axes, zoom factor. */
type PaneView = { z: number; ox: number; oy: number };
type PaneBase = { pos: THREE.Vector3; target: THREE.Vector3; dist: number };
const _pr = new THREE.Vector3();
const _pu = new THREE.Vector3();
function applyPaneCam(cam: THREE.PerspectiveCamera, base: PaneBase, v: PaneView) {
  _pr.set(1, 0, 0).applyQuaternion(cam.quaternion);
  _pu.set(0, 1, 0).applyQuaternion(cam.quaternion);
  cam.position.copy(base.pos).addScaledVector(_pr, v.ox).addScaledVector(_pu, v.oy);
  cam.zoom = v.z;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
function setAt<T>(arr: { current: T[] }, i: number, v: T) {
  arr.current[i] = v;
}
function setFn(ref: { current: () => void }, f: () => void) {
  ref.current = f;
}
function setFlag(ref: { current: boolean }, v: boolean) {
  ref.current = v;
}
function setAspect(cam: THREE.PerspectiveCamera, a: number) {
  cam.aspect = a;
  cam.updateProjectionMatrix();
}

/** Frames the camera(s): fits the target plus some context to each pane's own aspect (exact per-corner fit). */
function Rig({
  box, brain, view, nonce, frameTick, lockView, zoom, multi, dims, fixed, fixedDims, moved, sizeKey, paneView, fixedBase,
}: {
  paneView: { current: PaneView[] };
  fixedBase: { current: (PaneBase | null)[] };
  box: THREE.Box3 | null; brain: THREE.Box3 | null; view: ViewName; nonce: number; frameTick: number; lockView: boolean; zoom: number; multi: boolean;
  dims: React.RefObject<Dims>; fixed: THREE.PerspectiveCamera[]; fixedDims: React.RefObject<Dims[]>; moved: React.RefObject<boolean>; sizeKey: string;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const anim = useRef(0);
  const first = useRef(true);
  /** Eased camera move: the viewing direction turns along the shortest arc, the target and distance blend. Interrupted by the next move or by the user grabbing the view. */
  const glide = (toPos: THREE.Vector3, toTarget: THREE.Vector3) => {
    cancelAnimationFrame(anim.current);
    const fromT = controls ? controls.target.clone() : toTarget.clone();
    const fo = camera.position.clone().sub(fromT);
    const to = toPos.clone().sub(toTarget);
    const lf = Math.max(1e-6, fo.length());
    const lt = Math.max(1e-6, to.length());
    const q = new THREE.Quaternion().setFromUnitVectors(fo.clone().normalize(), to.clone().normalize());
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduce ? 0 : 480;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const tg = fromT.clone().lerp(toTarget, e);
      const off = fo.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, e)).multiplyScalar(lf * Math.pow(lt / lf, e));
      camera.position.copy(tg).add(off);
      camera.up.set(0, 1, 0);
      camera.lookAt(tg);
      if (controls) {
        controls.target.copy(tg);
        controls.update();
      }
      invalidate();
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  const fit = (reset: boolean, mode: "snap" | "glide" | "glideKeep") => {
    cancelAnimationFrame(anim.current);
    const b = brain ?? DEFAULT_BRAIN;
    const mid = view === "midsagittal" && !multi;
    const fb = mid ? b.clone() : frameBox(b, box);
    const c = fb.getCenter(new THREE.Vector3());
    if (mid) c.x = 0;
    const d = dims.current;
    const aspect = d.w > 4 && d.h > 4 ? d.w / d.h : camera.aspect || 1.5;
    let dir = multi ? FREE_DIR : new THREE.Vector3(...(VIEWS.find((x) => x.id === view) ?? VIEWS[2]).dir).normalize();
    if (mode === "glideKeep" && controls && !multi) {
      // keep the direction the student is looking from
      const cur = camera.position.clone().sub(controls.target);
      if (cur.lengthSq() > 1e-10) dir = cur.normalize();
    }
    const dist = fitDistance(fb, dir, camera.fov, aspect) * zoom;
    const toPos = c.clone().addScaledVector(dir, dist);
    if (mode !== "snap" && !multi && controls) {
      glide(toPos, c);
    } else {
      camera.position.copy(toPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(c);
      if (controls) {
        controls.target.copy(c);
        controls.update();
      }
    }
    if (multi) {
      FIXED_PANES.forEach((p, i) => {
        const cam = fixed[i];
        const fd = fixedDims.current[i];
        const fa = fd && fd.w > 4 && fd.h > 4 ? fd.w / fd.h : aspect;
        const fdir = new THREE.Vector3(...(VIEWS.find((x) => x.id === p.view) ?? VIEWS[2]).dir).normalize();
        cam.fov = camera.fov;
        cam.aspect = fa;
        cam.near = camera.near;
        cam.far = camera.far;
        const fdist = fitDistance(fb, fdir, camera.fov, fa) * zoom;
        cam.position.copy(c).addScaledVector(fdir, fdist);
        cam.up.set(0, 1, 0);
        cam.lookAt(c);
        cam.zoom = 1;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        const pb = { pos: cam.position.clone(), target: c.clone(), dist: fdist };
        setAt(fixedBase, i, pb);
        if (reset) setAt(paneView, i, { z: 1, ox: 0, oy: 0 });
        applyPaneCam(cam, pb, paneView.current[i]);
      });
    }
    setFlag(moved, false);
    invalidate();
  };
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });
  // a new view, zoom, layout or camera: refit (eased, after the first fit)
  // (interaction overhaul) a view change in the same commit as a selection change wins: deselecting restores the view the
  // student had before "Show its cut", it must not be overridden by the keep-direction move of the deselection
  const viewFitNow = useRef(false);
  useEffect(() => {
    const m = first.current ? "snap" : "glide";
    first.current = false;
    viewFitNow.current = true;
    fitRef.current(true, m);
  }, [brain, view, nonce, zoom, multi, camera, controls, invalidate]);
  // a different selection: an eased move that keeps the viewing direction; never when the view is locked, nor right after
  // the student double-clicked a pivot (the double-click's first click is what selected it)
  const prevBox = useRef(box);
  useEffect(() => {
    if (prevBox.current === box) return;
    prevBox.current = box;
    if (viewFitNow.current) return;
    if (!lockView && !pivotedRecently(controls)) fitRef.current(true, "glideKeep");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);
  useEffect(() => {
    viewFitNow.current = false;
  });
  // F: frame the selection on demand (also when locked)
  useEffect(() => {
    if (frameTick > 0) fitRef.current(true, "glideKeep");
  }, [frameTick]);
  useEffect(() => {
    if (!moved.current) fitRef.current(false, "snap");
  }, [sizeKey, moved]);
  useEffect(() => {
    if (!controls) return;
    const c = controls as unknown as { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
    const f = () => {
      moved.current = true;
      cancelAnimationFrame(anim.current);
    };
    c.addEventListener("start", f);
    return () => {
      c.removeEventListener("start", f);
      cancelAnimationFrame(anim.current);
    };
  }, [controls, moved]);
  return null;
}

/** Multi-view: one WebGL context, one scene, one scissored render per pane (runs only when mounted; frameloop stays on demand). */
function MultiRender({ panes, invalidateRef }: { panes: React.RefObject<Pane[]>; invalidateRef: { current: () => void } }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setFn(invalidateRef, invalidate);
  }, [invalidateRef, invalidate]);
  useFrame(({ gl, scene, camera: cam0, size: sz }) => {
    const root = gl.domElement.getBoundingClientRect();
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setScissorTest(true);
    for (const p of panes.current) {
      if (!p.el) continue;
      const r = p.el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w < 4 || h < 4) continue;
      const x = Math.floor(r.left - root.left);
      const y = Math.floor(root.bottom - r.bottom);
      const cam = p.cam ?? (cam0 as THREE.PerspectiveCamera);
      if (!p.cam) setAspect(cam, w / h);
      gl.setViewport(x, y, w, h);
      gl.setScissor(x, y, w, h);
      gl.clear();
      gl.render(scene, cam);
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, sz.width, sz.height);
    gl.autoClear = auto;
  }, 1);
  useEffect(
    () => () => {
      camera.aspect = size.width / Math.max(1, size.height);
      camera.updateProjectionMatrix();
      invalidate();
    },
    [camera, size, invalidate],
  );
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


/** A cut mesh shows its inside flat in its own colour, so a section through a closed structure reads as solid tissue. */
function flatInside(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace("#include <opaque_fragment>", "if (!gl_FrontFacing) outgoingLight = diffuseColor.rgb * 0.95;\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "atlas-flat-inside";
}

/** Solid look: every gyral mesh is pushed out along its normals by ~0.45 mm, so neighbouring patches overlap and the cracks between them close. */
const MEDULLA_CUT = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.52);
/** The cranial-nerve layer stops 2 cm below the brain (kept side: y >= 1.445). */
const NERVE_FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.445);
/* ---------- (interaction overhaul) cranial nerves: roots and intracranial course by default ---------- */
/** Branches that lie wholly outside the skull (or on the dura): only drawn with "Peripheral branches" on. */
const PERIPHERAL_NERVES = new Set([
  "anterior-division-of-mandibular-nerve", "posterior-division-of-mandibular-nerve", "buccal-nerve", "chorda-tympani", "inferior-alveolar-nerve",
  "lingual-nerve", "mental-nerve", "nerve-to-mylohyoid-muscle", "meningeal-branch-of-maxillary-nerve",
]);
/** Distance (in voxel steps) from the brain surface, on a 1.5 mm grid around the brain; 255 = far. */
type BrainField = { o: THREE.Vector3; h: number; nx: number; ny: number; nz: number; d: Uint8Array };
const FIELD_H = 0.0015;
const FIELD_MAX = 8;
function buildBrainField(roots: THREE.Object3D[]): BrainField {
  roots.forEach((r) => r.updateMatrixWorld(true));
  const box = new THREE.Box3().setFromObject(roots[0]).expandByScalar(0.014);
  const h = FIELD_H;
  const nx = Math.ceil((box.max.x - box.min.x) / h) + 1;
  const ny = Math.ceil((box.max.y - box.min.y) / h) + 1;
  const nz = Math.ceil((box.max.z - box.min.z) / h) + 1;
  const d = new Uint8Array(nx * ny * nz).fill(255);
  const q: number[] = [];
  const v = new THREE.Vector3();
  for (const root of roots) root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.hull) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const ix = Math.round((v.x - box.min.x) / h);
      const iy = Math.round((v.y - box.min.y) / h);
      const iz = Math.round((v.z - box.min.z) / h);
      const k = ix + nx * (iy + ny * iz);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
      if (d[k] !== 0) {
        d[k] = 0;
        q.push(k);
      }
    }
  });
  // breadth-first growth over the 26 neighbours (Chebyshev distance in steps), up to FIELD_MAX
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const dk = d[k];
    if (dk >= FIELD_MAX) continue;
    const ix = k % nx;
    const iy = Math.floor(k / nx) % ny;
    const iz = Math.floor(k / (nx * ny));
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = ix + dx;
          const y = iy + dy;
          const z = iz + dz;
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
          const kk = x + nx * (y + ny * z);
          if (d[kk] > dk + 1) {
            d[kk] = dk + 1;
            q.push(kk);
          }
        }
  }
  return { o: box.min.clone(), h, nx, ny, nz, d };
}
function fieldAt(f: BrainField, p: THREE.Vector3): number {
  const ix = Math.round((p.x - f.o.x) / f.h);
  const iy = Math.round((p.y - f.o.y) / f.h);
  const iz = Math.round((p.z - f.o.z) / f.h);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= f.nx || iy >= f.ny || iz >= f.nz) return 255;
  return f.d[ix + f.nx * (iy + f.ny * iz)];
}
/** Floor of the intracranial course (just below the foramen magnum and the jugular foramina). */
const NERVE_SKULL_FLOOR = 1.548;
/** The orbit starts in front of the optic canal / superior orbital fissure; the face lies lateral to the skull-base exits. */
const NERVE_ORBIT_Z = 0.047;
const NERVE_MAX_X = 0.045;
const SEED_STEPS = 2; // within ~3 mm of the brain: a root
const KEEP_STEPS = 6; // the course to the skull exit stays within ~9 mm of the brain
const intraCaches = new WeakMap<BrainField, WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>>();
/**
 * Keeps the part of a nerve mesh that is connected to its root on the brain and stays close to the brain: the root and the
 * intracranial course up to the skull exit. Grown from the root along the mesh, so branches that only come near the brain
 * again further out (the orbit roof) are not kept.
 */
function intracranial(src: THREE.BufferGeometry, matrix: THREE.Matrix4, f: BrainField, onPlate = false): THREE.BufferGeometry {
  let intraCache = intraCaches.get(f);
  if (!intraCache) intraCaches.set(f, (intraCache = new WeakMap()));
  const hit = intraCache.get(src);
  if (hit) return hit;
  const pos = src.getAttribute("position");
  const idx = src.getIndex();
  const nTri = idx ? idx.count / 3 : pos.count / 3;
  const vi = (t: number, c: number) => (idx ? idx.getX(t * 3 + c) : t * 3 + c);
  // weld by position (separate primitives and seams must still connect)
  const canon = new Int32Array(pos.count);
  const keyOf = new Map<string, number>();
  const dist = new Uint8Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = `${Math.round(v.x * 2e5)},${Math.round(v.y * 2e5)},${Math.round(v.z * 2e5)}`;
    const c = keyOf.get(k);
    if (c !== undefined) canon[i] = c;
    else {
      keyOf.set(k, i);
      canon[i] = i;
    }
    v.applyMatrix4(matrix);
    // (the olfactory bulb and tract lie on the cribriform plate, in front of the orbit line: `onPlate`)
    dist[i] = v.y < NERVE_SKULL_FLOOR || Math.abs(v.x) > NERVE_MAX_X || (!onPlate && v.z > NERVE_ORBIT_Z) ? 255 : fieldAt(f, v);
  }
  const adj = new Map<number, number[]>();
  for (let t = 0; t < nTri; t++)
    for (let c = 0; c < 3; c++) {
      const a = canon[vi(t, c)];
      const l = adj.get(a);
      if (l) l.push(t);
      else adj.set(a, [t]);
    }
  const ok = new Uint8Array(pos.count);
  const q: number[] = [];
  for (let i = 0; i < pos.count; i++)
    if (canon[i] === i && dist[i] <= SEED_STEPS) {
      ok[i] = 1;
      q.push(i);
    }
  for (let head = 0; head < q.length; head++) {
    for (const t of adj.get(q[head]) ?? [])
      for (let c = 0; c < 3; c++) {
        const b = canon[vi(t, c)];
        if (!ok[b] && dist[b] <= KEEP_STEPS) {
          ok[b] = 1;
          q.push(b);
        }
      }
  }
  const keep: number[] = [];
  for (let t = 0; t < nTri; t++) {
    const a = vi(t, 0);
    const b = vi(t, 1);
    const c = vi(t, 2);
    if (ok[canon[a]] && ok[canon[b]] && ok[canon[c]]) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.getAttribute(k));
  g.setIndex(keep);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  intraCache.set(src, g);
  return g;
}

const INFLATE = { value: 0 };
/**
 * The gross brain material. Uncut, it is a plain lit material; while a cut is on (userData.sec) it carries the section
 * shader, so its inside shows the tissue on the plane. The section variant is one program for every gross material
 * (onPlane is a uniform) and is compiled in the background while the atlas sits idle (prewarmGross): on a cold Windows
 * shader cache each variant took seconds, and the page froze ~20 s after loading (owner 2026-11-19: "still laggy").
 */
function inflate(m: THREE.MeshStandardMaterial, onPlane = false) {
  const plane = { value: onPlane ? 1 : 0 };
  m.onBeforeCompile = (s) => {
    s.uniforms.uInflate = INFLATE;
    s.vertexShader = "uniform float uInflate;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(objectNormal) * uInflate;");
    // a cut mesh shows its inside: the section tissue on the plane (flat in its own colour until the tissue volume is in)
    if (m.userData.sec) insideTissue(s, "outgoingLight = diffuseColor.rgb * 0.93;", plane);
  };
  m.customProgramCacheKey = () => (m.userData.sec ? "atlas-inflate-sec" : "atlas-inflate");
}
/** Gross materials always carry this many clipping planes (padded): one program per variant, whatever the cut. */
const GROSS_PLANES = 3;
/** Compile the gross section variants in the background, against the live lights: one per kind of gross geometry
 * (RGB and RGBA vertex colours are separate programs). */
async function prewarmGross(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, gross: THREE.Object3D) {
  let src: THREE.BufferGeometry | null = null;
  gross.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute("normal")) src = (o as THREE.Mesh).geometry;
  });
  if (!src) return;
  const s = src as THREE.BufferGeometry;
  const sc = new THREE.Scene();
  for (const size of [3, 4]) {
    // a small stand-in with the live meshes' attribute layout (position, normal, RGB or RGBA colour)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(3 * size), size));
    if (s.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(6), 2));
    const m = new THREE.MeshStandardMaterial({ color: CORTEX_TINT, vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    inflate(m);
    m.userData.sec = true;
    m.clippingPlanes = padPlanes([], GROSS_PLANES);
    sc.add(new THREE.Mesh(geo, m));
    grossWarm.push(m); // kept alive: three.js releases a program when its last material is disposed
  }
  await gl.compileAsync(sc, camera, scene);
}
const grossWarm: THREE.Material[] = [];
function setInflate(on: boolean) {
  INFLATE.value = on ? 0.0006 : 0;
}

function buildGrossMats(look: Look): Record<string, THREE.MeshStandardMaterial> {
  const out: Record<string, THREE.MeshStandardMaterial> = {};
  for (const g of GROUPS) {
    const color = look === "regions" ? LOBE_TINT[g] : (BRAIN_TINT[g] ?? CORTEX_TINT);
    out[g] = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.62, metalness: 0 });
    inflate(out[g], g === "brainstem" || g === "cerebellum"); // their half-meshes have medial faces on the midline: those are section too
  }
  // meshes that are not on the syllabus: a desaturated, slightly lighter warm grey-pink (still "part of the brain"); the lock shows on hover
  out.locked = new THREE.MeshStandardMaterial({ color: look === "regions" ? "#b8a9ab" : "#d8b8ab", vertexColors: true, roughness: 0.7, metalness: 0 });
  inflate(out.locked);
  return out;
}

/** Smooth shading: merge duplicated vertices (position + colour) and rebuild vertex normals once per cached geometry. */
const smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function smoothGeometry(m: THREE.Mesh) {
  const src = m.geometry;
  const hit = smoothCache.get(src);
  if (hit) {
    m.geometry = hit;
    return;
  }
  const g = src.clone();
  g.deleteAttribute("normal");
  const merged = mergeVertices(g, 1e-6);
  merged.computeVertexNormals();
  smoothCache.set(src, merged);
  m.geometry = merged;
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
  brainOpacity?: number,
) {
  const op = brainOpacity ?? (solid ? 1 : 0.2);
  for (const k of [...GROUPS, "locked"]) {
    const m = mats[k];
    m.transparent = op < 1;
    m.opacity = op;
    m.depthWrite = op >= 1; // translucent layers never write depth, so what sits inside them stays visible
    // the lower medulla is an open thin tube (it read as a dark stalk): the brainstem material stops where the medulla stops being a solid body
    m.clippingPlanes = k === "brainstem" ? [...padPlanes(planes, GROSS_PLANES - 1), MEDULLA_CUT] : padPlanes(planes, GROSS_PLANES);
    // opaque: always double-sided (the back faces of a closed shell never show), so the side does not change with the cut
    m.side = planes.length || k === "brainstem" || op >= 1 ? THREE.DoubleSide : THREE.FrontSide;
    m.userData.sec = planes.length > 0;
    m.needsUpdate = true;
  }
  styleHull(hull, look === "regions" ? "#3a3646" : "#6a4e46", solid && op >= 1 && planes.length === 0); // outlines are off while cut: their back faces would show through the section
  setInflate(solid && op >= 1);
  hull.clippingPlanes = [...planes, MEDULLA_CUT];
  hull.needsUpdate = true;
}

function applyGrossMats(meshes: Map<string, THREE.Mesh>, mats: Record<string, THREE.MeshStandardMaterial>, locked: ReadonlySet<string>) {
  for (const [id, m] of meshes) m.material = locked.has(id) ? mats.locked : (mats[m.userData.g as string] ?? mats["frontal-lobe"]);
}

function addHulls(root: THREE.Object3D, mat: THREE.Material): THREE.Mesh[] {
  const list: THREE.Mesh[] = [];
  eachMesh(root, (m) => {
    if (m.userData.g === "brainstem") return; // no outline on the brainstem: its thin lower tube turned into a dark stalk
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
    smoothGeometry(m);
    m.userData.gid = n.name;
    m.userData.g = groupOf(structures[n.name]);
    byId.set(n.name, m);
  });
  return byId;
}

/** Colours a backer geometry (world metres) vertex by vertex with the tint of the nearest gross mesh, so a gap between gyral patches shows the neighbouring lobe's colour instead of a dark shell. */
function tintByNearest(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, gross: THREE.Object3D, structures: Record<string, AtlasEntry>, look: Look): THREE.BufferGeometry {
  const CELL = 0.005;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  const tints = GROUPS.map((g) => new THREE.Color(look === "regions" ? LOBE_TINT[g] : (BRAIN_TINT[g] ?? CORTEX_TINT)));
  const cells = new Map<string, number[]>();
  const pts: number[] = [];
  const gi: number[] = [];
  const v = new THREE.Vector3();
  gross.updateWorldMatrix(true, true);
  eachMesh(gross, (m) => {
    let n: THREE.Object3D | null = m;
    while (n && !structures[n.name]) n = n.parent;
    if (!n) return;
    const gidx = Math.max(0, GROUPS.indexOf(groupOf(structures[n.name])));
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const k = key(v.x, v.y, v.z);
      const c = cells.get(k);
      const id = gi.length;
      pts.push(v.x, v.y, v.z);
      gi.push(gidx);
      if (c) c.push(id);
      else cells.set(k, [id]);
    }
  });
  const g = geo.clone();
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const fb = new THREE.Color(CORTEX_TINT);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    let best = -1;
    let bd = Infinity;
    for (let r = 1; r <= 3 && best < 0; r++) {
      const cx = Math.floor(v.x / CELL), cy = Math.floor(v.y / CELL), cz = Math.floor(v.z / CELL);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const c = cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!c) continue;
        for (const id of c) {
          const d = (pts[id * 3] - v.x) ** 2 + (pts[id * 3 + 1] - v.y) ** 2 + (pts[id * 3 + 2] - v.z) ** 2;
          if (d < bd) {
            bd = d;
            best = id;
          }
        }
      }
    }
    const t = best >= 0 ? tints[gi[best]] : fb;
    col[i * 3] = t.r;
    col[i * 3 + 1] = t.g;
    col[i * 3 + 2] = t.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const stalkCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** The context cerebrum has a stalk running down the midline (brainstem): drop those triangles so only the hemispheres back the gross meshes. */
function withoutStalk(src: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const hit = stalkCache.get(src);
  if (hit) return hit;
  const pos = src.getAttribute("position");
  const idx = src.getIndex();
  if (!pos || !idx) return src;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    // the node transform (position / scale of the exported context mesh) puts the vertices in world metres
    a.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(matrix);
    b.fromBufferAttribute(pos, idx.getX(i + 1)).applyMatrix4(matrix);
    c.fromBufferAttribute(pos, idx.getX(i + 2)).applyMatrix4(matrix);
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    if (cy < 1.607 && Math.abs(cx) < 0.034) continue;
    keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  }
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.getAttribute(k));
  g.setIndex(keep);
  stalkCache.set(src, g);
  return g;
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
type Rect = { x: number; y: number; w: number; h: number };
type LabRefs = { bottom: number; obs: Rect[]; solid: boolean; tags: (HTMLDivElement | null)[]; lines: (SVGLineElement | null)[]; dots: (SVGCircleElement | null)[]; w: number[] };
const SAMPLE_MAX = 1200;
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _r = new THREE.Vector3();

/** One anchor per side for paired structures: the surface vertex nearest the centroid of each half (left = +x). With a
 * cut, the anchor sits on the cut face: only the vertices near the plane count, and the anchor is moved onto it. */
function anchorsFor(group: THREE.Object3D, split: boolean, cut?: { axis: "x" | "y" | "z"; pos: number }): { p: THREE.Vector3; side: "" | "L" | "R" }[] {
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
  if (cut)
    for (const part of parts) {
      const near = part.pts.filter((v) => Math.abs(v[cut.axis] - cut.pos) < 0.0015);
      if (near.length >= 3) part.pts = near;
    }
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
    const p = best.clone();
    if (cut) p[cut.axis] = cut.pos;
    out.push({ p, side: real.length > 1 ? part.side : "" });
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
      // legend, "+" button and toolbar are obstacles: step left of them, else below
      for (const o of lab.obs) {
        if (bx < o.x + o.w + 3 && bx + w + 3 > o.x && by < o.y + o.h + 3 && by + LH + 3 > o.y) {
          if (o.x - w - 6 >= 4) bx = o.x - w - 6;
          else by = o.y + o.h + 4;
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
    const show = vis && !hidden; // never point a label at a surface where the structure is not visible
    tag.style.transform = `translate(${bxA[i].toFixed(1)}px,${byA[i].toFixed(1)}px)`;
    tag.style.visibility = show ? "visible" : "hidden";
    const x2 = Math.min(Math.max(sx[i], bxA[i]), bxA[i] + w);
    const y2 = Math.min(Math.max(sy[i], byA[i]), byA[i] + LH);
    line.setAttribute("x1", sx[i].toFixed(1));
    line.setAttribute("y1", sy[i].toFixed(1));
    line.setAttribute("x2", x2.toFixed(1));
    line.setAttribute("y2", y2.toFixed(1));
    line.style.visibility = show ? "visible" : "hidden";
    dot.setAttribute("cx", sx[i].toFixed(1));
    dot.setAttribute("cy", sy[i].toFixed(1));
    dot.style.visibility = show ? "visible" : "hidden";
  }
}

function LabelUpdater({ items, lab, enabled, centre, solid, dims, tick }: { items: LabelItem[]; lab: React.RefObject<LabRefs>; enabled: boolean; centre: THREE.Vector3; solid: boolean; dims: React.RefObject<Dims>; tick: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [items, enabled, size, solid, tick, invalidate]);
  useFrame(() => {
    const d = dims.current;
    if (enabled && items.length) layoutLabels(items, lab.current, camera, d.w > 4 ? d.w : size.width, d.h > 4 ? d.h : size.height, centre);
  });
  return null;
}

/* ---------- pointer picking (hover + click), throttled to one raycast per animation frame ---------- */
type PickInfo = { hover: NonNullable<Hover>; name: string };

function Picker({
  el,
  getPanes,
  pickables,
  grossPlanes,
  ownPlanes,
  structures,
  nameOf,
  layerFirst,
  onHover,
  onMove,
  onPick,
  onMiss,
}: {
  nameOf?: (id: string) => string | undefined;
  layerFirst?: boolean;
  onMiss?: () => void;
  el: HTMLElement | null;
  getPanes: () => Pane[];
  pickables: React.RefObject<THREE.Mesh[]>;
  grossPlanes: React.RefObject<THREE.Plane[]>;
  ownPlanes: React.RefObject<THREE.Plane[]>;
  structures: Record<string, AtlasEntry>;
  onHover: (h: Hover, name: string | null) => void;
  onMove: (x: number, y: number) => void;
  onPick: (id: string, side?: "L" | "R") => void;
}) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!el) return;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let raf = 0;
    let lx = 0;
    let ly = 0;
    let lastSig = "";
    let down: { x: number; y: number; t: number } | null = null;
    // (interaction overhaul) a click acts after the double-click window: a double-click only moves the pivot, it does not select
    let pending = 0;

    const pick = (cx: number, cy: number): (PickInfo & { side?: "L" | "R" }) | null => {
      let pane: Pane | null = null;
      let r: DOMRect | null = null;
      for (const p of getPanes()) {
        if (!p.el) continue;
        const rr = p.el.getBoundingClientRect();
        if (cx >= rr.left && cx <= rr.right && cy >= rr.top && cy <= rr.bottom) {
          pane = p;
          r = rr;
          break;
        }
      }
      if (!pane || !r) return null;
      const cam = pane.cam ?? camera;
      cam.updateMatrixWorld();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(pickables.current, false);
      let layerHit: (PickInfo & { side?: "L" | "R" }) | null = null;
      // labelled interior: the section face names what it shows; it lies in front of every mesh behind the plane
      const sp = sectionPickRay(ray.ray);
      const spInfo: (PickInfo & { side?: "L" | "R" }) | null = sp
        ? { hover: { id: sp.row.ids[0] ?? "" }, name: sp.part ? sp.row.name : (structures[sp.row.ids[0] ?? ""]?.name ?? sp.row.name), side: sp.point.x > 0.002 ? "L" : sp.point.x < -0.002 ? "R" : undefined }
        : null;
      for (const h of hits) {
        if (sp && spInfo && h.distance > sp.distance) return spInfo;
        const m = h.object as THREE.Mesh;
        _hit.copy(h.point);
        const lid = m.userData.lid as string | undefined;
        const gross = m.userData.gid !== undefined || lid !== undefined;
        if (clippedBy(gross ? grossPlanes.current : ownPlanes.current, _hit)) continue;
        if (m.userData.nerve && NERVE_FLOOR.distanceToPoint(_hit) < 0) continue; // the nerve's lower run is clipped away (NERVE_FLOOR): not pickable either
        const ms = m.userData.side as "L" | "R" | undefined;
        if (ms && (ms === "L") !== _hit.x > 0) continue; // the clipped-away hemisphere of a one-sided overlay
        const side: "L" | "R" | undefined = _hit.x > 0.002 ? "L" : _hit.x < -0.002 ? "R" : undefined;
        if (lid) {
          const info = { hover: { id: lid }, name: nameOf?.(lid) ?? lid, side };
          if (layerFirst) return info; // a skull structure is selected: the bone is what is being explored
          layerHit ??= info; // otherwise the brain behind it wins; bones answer where there is no brain
          continue;
        }
        const id = (m.userData.gid !== undefined ? m.userData.gid : m.userData.sid) as string;
        const name = structures[id]?.name ?? id;
        return { hover: m.userData.gid !== undefined ? { id } : { key: m.userData.key as string, id }, name, side };
      }
      return spInfo ?? layerHit;
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
      if (pending) {
        window.clearTimeout(pending); // second press of a double-click
        pending = 0;
        down = null;
        return;
      }
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
      pending = window.setTimeout(() => {
        pending = 0;
        if (p?.hover.id) onPick(p.hover.id, p.side);
        else onMiss?.();
      }, 260);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", dn);
    el.addEventListener("pointerup", up);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (pending) window.clearTimeout(pending);
      el.style.cursor = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", dn);
      el.removeEventListener("pointerup", up);
    };
  }, [el, getPanes, camera, pickables, grossPlanes, ownPlanes, structures, onHover, onMove, onPick, onMiss, nameOf, layerFirst]);
  return null;
}

/** A boolean preference kept in localStorage (per device). The viewer is client-only (dynamic import, no SSR). */
function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = typeof window === "undefined" ? null : window.localStorage.getItem(key);
      return s === "1" ? true : s === "0" ? false : initial;
    } catch {
      return initial; // storage blocked
    }
  });
  const set = useCallback(
    (nv: boolean) => {
      setV(nv);
      try {
        window.localStorage.setItem(key, nv ? "1" : "0");
      } catch {
        /* storage blocked */
      }
    },
    [key],
  );
  return [v, set];
}

function Scene({
  loaded,
  gross,
  fill,
  deep,
  tissueOk,
  colourCuts,
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
  lockedSet,
  brainOpacity,
  skull,
  layer,
  layerShow,
  nerves,
  showBrainstem,
  quiet,
  ventral,
  nervePeripheral,
  skullNodes,
  skullNames,
  onWarm,
  probeRef,
  pickEl,
  getPanes,
  onHover,
  onMove,
  onPick,
  onMiss,
}: {
  onMiss?: () => void;
  lockedSet: ReadonlySet<string>;
  brainOpacity?: number;
  skull: SkullFocus | null;
  layer: THREE.Group[];
  layerShow: boolean;
  /** cranial nerve meshes (the "Cranial nerves" toggle), or null while off / not loaded */
  nerves: { id: string; g: THREE.Group }[] | null;
  /** the gross brainstem meshes are drawn (the "Brainstem" toggle) */
  showBrainstem: boolean;
  /** "Show its cut": the section around the selection is drawn quiet (washed toward white matter) */
  quiet: boolean;
  /** ventral diencephalon and brainstem surface parts drawn as part of the brain (mammillary bodies, optic chiasm...) */
  ventral: { id: string; g: THREE.Group }[] | null;
  /** the cranial-nerve layer shows the whole peripheral tree, not only roots and the intracranial course */
  nervePeripheral: boolean;
  skullNodes: { prefix: string; slug: string }[];
  skullNames: Record<string, string>;
  onWarm: () => void;
  probeRef: React.MutableRefObject<((dir: THREE.Vector3, mid: boolean) => number) | null>;
  pickEl: HTMLElement | null;
  getPanes: () => Pane[];
  loaded: Loaded;
  gross: THREE.Group | null;
  fill: THREE.Group | null;
  deep: { id: string; g: THREE.Group }[] | null;
  /** the section tissue volume is loaded (the section faces paint grey/white matter instead of a flat tone) */
  tissueOk: boolean;
  /** section option: deep structures tinted in their own colours instead of tissue tones */
  colourCuts: boolean;
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
  onPick: (id: string, side?: "L" | "R") => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const sidePlanes = useMemo(() => ({ L: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), R: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) }), []);
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
  const grossHull = useMemo(() => makeHull("#6a4e46", 0.0008), []);
  const grossMats = useMemo(() => buildGrossMats(look), [look]);
  // midsagittal: the hemisphere's medial wall (cingulate gyrus, its sulcus, paraterminal area), built from the Allen labels
  // (tools/atlas/medial_wall.py): Z-Anatomy's gyral shell has no medial wall in the frontal / callosal region
  const [medialWall, setMedialWall] = useState<THREE.Group | null>(null);
  useEffect(() => {
    if (!midsagittal || medialWall) return;
    let alive = true;
    loadAtlasModel("medial-wall.glb?v=6")
      .then((g) => alive && setMedialWall(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [midsagittal, medialWall]);
  // the wall's vertex colour says what it is: 1 cortex (the cortex tint), 0 the third ventricle's wall (thalamus,
  // hypothalamus: a grey-matter tone from the section palette, set below with the theme)
  const medialWallTone = useMemo(() => ({ value: new THREE.Color() }), []);
  const medialMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: look === "regions" ? "#c9b9c4" : CORTEX_TINT, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWallTone = medialWallTone;
      sh.fragmentShader = "uniform vec3 uWallTone;\n" + sh.fragmentShader.replace("#include <color_fragment>", "diffuseColor.rgb = mix(uWallTone, diffuseColor.rgb, smoothstep(0.15, 0.85, vColor.r));");
    };
    return m;
  }, [look, medialWallTone]);
  useEffect(() => {
    medialWall?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = medialMat;
      m.raycast = () => {}; // context only: picking goes to the labelled structures
    });
    invalidate();
  }, [medialWall, medialMat, invalidate]);
  useEffect(() => {
    SEC.uMedialWall.value = midsagittal && medialWall ? 1 : 0;
    invalidate();
  }, [midsagittal, medialWall, invalidate]);
  const sectionLook = look === "regions" ? "regions" : "brain";
  const secTheme = useSectionTheme();
  useEffect(() => {
    const p = sectionPalette(sectionLook, secTheme);
    medialWallTone.value.set(p.gm).lerp(new THREE.Color(p.wm), 0.38);
    invalidate();
  }, [sectionLook, secTheme, medialWallTone, invalidate]);
  // the "Cranial nerves" toggle: one cream nerve tone, lit
  const nerveMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e9d9a6", emissive: "#5a4a20", emissiveIntensity: 0.25, roughness: 0.6, metalness: 0 }), []);
  useEffect(() => () => nerveMat.dispose(), [nerveMat]);
  const secPalRaw = sectionPalette(sectionLook, secTheme);
  const secPal = quiet ? quietPalette(secPalRaw) : secPalRaw;
  const deepMats = useMemo(() => {
    const out: Record<string, THREE.MeshStandardMaterial> = {};
    for (const d of DEEP) {
      const c = colourCuts ? d.hue : sectionSwatch(d.tissue, sectionLook, secTheme);
      // seen as surfaces only beside a midsagittal cut (the thalamus wall of the third ventricle, the fornix): lit, but held near their tissue tone
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
      flatInside(m);
      if (d.under) m.depthWrite = false; // the internal capsule overlaps the nuclei: it must not hide their cut faces
      out[d.id] = m;
    }
    return out;
  }, [colourCuts, sectionLook, secTheme]);
  useEffect(() => () => Object.values(deepMats).forEach((m) => m.dispose()), [deepMats]);
  // the cut face of each deep structure (and of a selected structure): tissue on the plane, see section/deep.tsx
  const paintMats = useMemo(() => Object.fromEntries(DEEP.map((d) => [d.id, makeSectionPaint(d.tissue, d.shade, { under: d.under, midSkip: d.midSkip })])) as Record<string, THREE.MeshBasicMaterial>, []);
  const targetPaint = useMemo(() => makeSectionPaint("grey"), []);
  useEffect(() => () => [...Object.values(paintMats), targetPaint].forEach((m) => m.dispose()), [paintMats, targetPaint]);
  // with the Brainstem layer off the section face must not paint brainstem tissue: its back faces clear the section stencil (no colour)
  const bsClearMat = useMemo(
    () => new THREE.MeshBasicMaterial({ side: THREE.BackSide, colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
    [],
  );
  useEffect(() => () => bsClearMat.dispose(), [bsClearMat]);
  useEffect(() => {
    const p = sectionPalette(sectionLook, secTheme);
    setPalette(quiet ? quietPalette(p) : p);
    invalidate();
  }, [sectionLook, secTheme, tissueOk, quiet, invalidate]);
  const hoverMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: hoverColor, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // a gross mesh is drawn inflated (0.6 mm along its normals, inflate()): its hover copy is inflated the same, or the
    // highlight sinks under the surface and shows only in torn patches when zoomed in (owner 2026-11-19)
    m.userData.inflate = { value: 0 };
    m.onBeforeCompile = (s) => {
      s.uniforms.uHoverInflate = m.userData.inflate;
      s.vertexShader = "uniform float uHoverInflate;\n" + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(objectNormal) * uHoverInflate;");
    };
    m.customProgramCacheKey = () => "atlas-hover";
    return m;
  }, [hoverColor]);
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
            depthWrite: o.opacity >= 0.9, // a translucent territory must not hide the vessels inside it
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
    applyGrossMats(grossById, grossMats, lockedSet);
    invalidate();
  }, [grossById, grossMats, lockedSet, invalidate]);

  // compile the shaders for the first frame now (idle), so the first interaction does not hitch
  const sceneObj = useThree((s) => s.scene);
  const cam0 = useThree((s) => s.camera);
  useEffect(() => {
    if (!gross && look !== "xray") return;
    const t = window.setTimeout(() => {
      try {
        gl.compile(sceneObj, cam0);
      } catch {
        /* a failed warm-up only costs the first frame */
      }
      onWarm();
      invalidate();
    }, 0);
    return () => window.clearTimeout(t);
  }, [gross, look, gl, sceneObj, cam0, onWarm, invalidate]);

  // skull & spine layer: translucent bone behind the brain highlight, never hiding the selection
  const boneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e6dcc3", roughness: 0.9, metalness: 0, transparent: true, opacity: skull ? (skull.shells === "epidural" ? 0.4 : 0.3) : 0.2, depthWrite: false, side: THREE.DoubleSide }),
    [skull],
  );
  const skullMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.45, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    [accent],
  );
  const markMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, depthTest: false, transparent: true }), [accent]);
  useEffect(
    () => () => {
      skullMat.dispose();
      markMat.dispose();
    },
    [skullMat, markMat],
  );
  const shellMats = useMemo(() => {
    const pair = skull?.shells ? SHELL_PAIR[skull.shells] : [];
    return SHELLS.map((sh) => new THREE.MeshStandardMaterial({ color: sh.color, roughness: 0.8, metalness: 0, transparent: true, opacity: pair.includes(sh.key) ? 0.38 : 0.08, depthWrite: false, side: THREE.DoubleSide }));
  }, [skull]);
  useEffect(() => () => shellMats.forEach((m) => m.dispose()), [shellMats]);
  useEffect(() => () => boneMat.dispose(), [boneMat]);
  const layerRoots = useMemo(
    () =>
      layer.map((g) => {
        const c = g.clone(true);
        const hit = skull?.nodes ?? [];
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.material = boneMat;
            m.renderOrder = -2;
            const nm = m.name || m.parent?.name || "";
            const nn = skullNodes.find((n) => nm.startsWith(n.prefix));
            m.userData.lid = "skull:" + (nn ? nn.slug : "node:" + nm);
            m.visible = layerShow; // hiding the bones hides only the bones (a selected structure's own mesh stays, below)
          }
        });
        // the exact per-node meshes of the selected structure (bones, vertebrae, sutures, dura)
        if (hit.length)
          c.traverse((o) => {
            if (!hit.some((p) => o.name.startsWith(p))) return;
            o.traverse((x) => {
              const m = x as THREE.Mesh;
              if (m.isMesh) {
                m.material = skullMat;
                m.renderOrder = 4;
                m.visible = true;
              }
            });
          });
        return c;
      }),
    [layer, boneMat, skull, skullMat, layerShow, skullNodes],
  );

  const nameOf = useMemo(
    () => (id: string) => {
      if (!id.startsWith("skull:")) return undefined;
      const k = id.slice(6);
      if (k.startsWith("node:")) return k.slice(5).replace(/[-_]l$/, " (L)").replace(/[-_]r$/, " (R)").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
      return skullNames[k] ?? k;
    },
    [skullNames],
  );

  // skull focus: bone patch, landmark markers, suture / canal tubes
  const skullGroup = useMemo(() => {
    if (!skull) return null;
    const g = new THREE.Group();
    if (skull.anchors.length && skull.radius > 0 && layerRoots.length) {
      const geo = carvePatch(layerRoots, skull.anchors, skull.radius);
      if (geo) {
        const m = new THREE.Mesh(geo, skullMat);
        m.raycast = () => undefined;
        g.add(m);
      }
    }
    for (const t of skull.tubes) {
      if (t.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(t.map((p) => new THREE.Vector3(p[0], p[1], p[2])), skull.closed);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(400, t.length * 3), skull.tubeR || 0.0015, 6, skull.closed), markMat);
      m.renderOrder = 10;
      m.userData.lid = "skull:" + (skull.slug ?? "");
      g.add(m);
    }
    const dot = new THREE.SphereGeometry(0.0035, 12, 8);
    for (const l of skull.labels) {
      const m = new THREE.Mesh(dot, markMat);
      m.position.set(l[0], l[1], l[2]);
      m.renderOrder = 11;
      m.scale.setScalar(2.2); // a larger hit target than the dot
      m.userData.lid = "skull:" + (skull.slug ?? "");
      g.add(m);
    }
    return g;
  }, [skull, layerRoots, skullMat, markMat]);
  useEffect(
    () => () => {
      skullGroup?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
    [skullGroup],
  );
  // meningeal spaces: generated shells (pia, arachnoid, dura) offset from the brain surface
  const shellGroup = useMemo(() => {
    if (!skull?.shells || !loaded.ctx) return null;
    const root = new THREE.Group();
    SHELLS.forEach((sh, i) => {
      const c = loaded.ctx!.clone(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = shellMats[i];
          m.raycast = () => undefined;
          m.renderOrder = 1 + i;
        }
      });
      const holder = new THREE.Group();
      holder.scale.setScalar(sh.s);
      holder.position.copy(centre).multiplyScalar(1 - sh.s);
      holder.add(c);
      root.add(holder);
    });
    return root;
  }, [skull, loaded.ctx, shellMats, centre]);

  // fills the holes between the gross meshes: a dark cortex-coloured shell behind them (solid brain only)
  const backMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#d8d8d8", vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }),
    [],
  );
  useEffect(() => () => backMat.dispose(), [backMat]);
  const backer = useMemo(() => {
    if (!loaded.ctx) return null;
    const g = loaded.ctx.clone(true);
    const drop: THREE.Object3D[] = [];
    g.traverse((o) => {
      if (/cord|brainstem/i.test(o.name)) drop.push(o);
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.updateMatrix();
        m.geometry = withoutStalk(m.geometry, m.matrix);
        if (gross) m.geometry = tintByNearest(m.geometry, m.matrix, gross, structures, look);
        m.material = backMat;
        m.raycast = () => undefined;
      }
    });
    drop.forEach((o) => o.removeFromParent());
    g.scale.setScalar(0.985); // a little inward of the gyri
    g.position.copy(centre).multiplyScalar(1 - 0.985);
    return g;
  }, [loaded.ctx, backMat, centre, gross, structures, look]);

  const ovlRoot = useMemo(() => {
    const root = new THREE.Group();
    loaded.ovl.forEach((o, k) =>
      o.groups.forEach((g, j) => {
        const c = g.clone(true);
        tagMeshes(c, { key: o.key, sid: o.ids[j], k, side: o.side });
        root.add(c);
      }),
    );
    return root;
  }, [loaded.ovl]);
  useEffect(() => {
    eachMesh(ovlRoot, (m) => {
      const k = m.userData.k as number;
      m.material = ovlMats[k];
      m.renderOrder = (loaded.ovl[k]?.opacity ?? 1) < 0.9 ? 3 : 1; // translucent territories draw after the solid parts
    });
    invalidate();
  }, [ovlRoot, ovlMats, loaded.ovl, invalidate]);

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

  const capPlanes = useMemo(() => [...(midsagittal ? [clipPlane] : []), ...(clip.axis !== "off" ? [cutP] : [])], [midsagittal, clip.axis, clipPlane, cutP]);
  const sectionOn = !!fill && capPlanes.length > 0 && showCtx && look !== "xray" && !!gross && (brainOpacity ?? 1) >= 1;
  // ---- labelled interior (section/api.ts): with the label volume in, the cut faces draw every structure themselves
  const labelsOn = sectionOn && tissueOk && !!interiorNow();
  useEffect(() => {
    setSectionRedraw(invalidate);
    return () => setSectionRedraw(null);
  }, [invalidate]);
  // the section volumes (tissue 4.8 MB, labels 3.8 MB, ~80 MB on the GPU) are fetched and uploaded while the atlas sits
  // idle, one texture per idle slot, so the first cut does not wait for the network or freeze on the uploads (owner
  // 2026-11-18: "5-10 seconds before it loads, and huge lag when cross section is selected"). Desktop only (phones fetch
  // on the first cut, as before).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __atlasGl?: unknown }).__atlasGl = gl; // perf probes
  }, [gl]);
  useEffect(() => {
    if (!gross || typeof window === "undefined" || !window.matchMedia?.("(pointer: fine) and (min-width: 900px)").matches) return;
    let cancelled = false;
    const idle = (fn: () => void) => {
      const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 5000 });
      else setTimeout(fn, 400);
    };
    const nextIdle = () => new Promise<void>((r) => idle(r));
    const timer = setTimeout(async () => {
      await nextIdle();
      const [t, I] = await Promise.all([loadTissue().catch(() => null), loadInterior().catch(() => null)]);
      for (const tex of [t?.aux, I?.vol, I?.pal, t?.field]) {
        await nextIdle();
        if (cancelled) return;
        if (tex) gl.initTexture(tex);
      }
      // then the section shaders, compiled in parallel off the main thread (KHR_parallel_shader_compile)
      await nextIdle();
      if (cancelled) return;
      await prewarmGross(gl, camera, scene, gross).catch(() => undefined);
      await nextIdle();
      if (!cancelled) await prewarmSectionCaps(gl, camera, scene).catch(() => undefined);
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gross, gl, camera, scene]);
  useEffect(() => {
    setSectionActive(labelsOn, capPlanes, midsagittal ? clipPlane : null, showBrainstem);
  });
  useEffect(() => {
    setSectionState({ hover: hover?.id && !hover.key ? hover.id : null, selected: loaded.targetIds, colour: colourCuts, accent, hoverColor });
  }, [hover, loaded.targetIds, colourCuts, accent, hoverColor, labelsOn]); // labelsOn: repaint once the label volume is in
  // ---- end labelled interior
  useEffect(() => invalidate(), [tissueOk, invalidate]);
  // cut planes
  useEffect(() => {
    const gp: THREE.Plane[] = [];
    if (midsagittal) gp.push(clipPlane);
    const pos = clipRange[0] + clip.t * (clipRange[1] - clipRange[0]);
    const cutting = cutPlane(clip.axis, pos, clip.flip, cutP);
    if (cutting) gp.push(cutP);
    grossPlanes.current = gp;
    configureContextMaterial(ctxMat, mode === "context" ? 0.4 : 0.15, gp);
    configureGross(grossMats, grossHull, look, solid, gp, brainOpacity);
    capOpacity(ctxMat, brainOpacity);
    const own = cutting ? [cutP] : [];
    ownPlanes.current = own;
    setPlanes(hiMat, own, true);
    ovlMats.forEach((m, k) => {
      const sd = loaded.ovl[k]?.side;
      setPlanes(m, sd ? [...own, sidePlanes[sd]] : own, true);
    });
    setPlanes(backMat, gp);
    const gpPad = padPlanes(gp);
    Object.values(deepMats).forEach((m) => setPlanes(m, gpPad, true));
    for (const m of [...Object.values(paintMats), targetPaint, bsClearMat]) {
      m.clippingPlanes = gpPad;
      m.needsUpdate = true;
    }
    setSectionPlanes(gp, midsagittal ? clipPlane : null);
    setPlanes(boneMat, gp, true);
    setPlanes(nerveMat, gp, true);
    nerveMat.clippingPlanes = [...gp, NERVE_FLOOR]; // the vagus and the spinal accessory run on into the neck and thorax
    shellMats.forEach((m) => setPlanes(m, gp, true));
    setHullPlanes(accentHull, own);
    invalidate();
  }, [ctxMat, hiMat, ovlMats, grossMats, grossHull, accentHull, backMat, deepMats, paintMats, targetPaint, bsClearMat, boneMat, nerveMat, shellMats, sidePlanes, loaded.ovl, brainOpacity, look, solid, mode, midsagittal, clipPlane, cutP, clip, clipRange, invalidate]);

  // which gross meshes are shown / pickable (a target or overlay replaces the gross mesh with the same id)
  const hiddenIds = useMemo(() => new Set<string>([...loaded.targetIds, ...loaded.ovl.flatMap((o) => o.ids)]), [loaded]);
  const grossOn = showCtx && look !== "xray" && !!gross;
  // the gyral meshes do not meet everywhere (orbital surface, insula): through a gap the view used to fall out of the brain
  // (owner 2026-11-19: "gaps in the brain... looks like Phineas Gage"). The closed brain solid's far, inside faces are drawn
  // behind them in a deep sulcal shadow: a gap reads as a sulcus. Back faces only, so it never covers a gyrus.
  const fillBackGeo = useMemo(() => (fill ? bakeGeometry(fill) : null), [fill]);
  const fillBackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(CORTEX_TINT).multiplyScalar(0.3), side: THREE.BackSide }), []);
  useEffect(() => () => fillBackMat.dispose(), [fillBackMat]);
  // ids hidden from the gross brain: a selected structure (drawn by its own layer) and, with the toggle off, the brainstem
  const grossHidden = useMemo(() => {
    if (showBrainstem) return hiddenIds;
    const out = new Set(hiddenIds);
    for (const [id, m] of grossById) if (m.userData.g === "brainstem") out.add(id);
    return out;
  }, [hiddenIds, showBrainstem, grossById]);
  useEffect(() => {
    if (!gross || showBrainstem) return;
    const added: THREE.Mesh[] = [];
    for (const m of grossById.values()) {
      if (m.userData.g !== "brainstem" || !m.parent) continue;
      const c = new THREE.Mesh(m.geometry, bsClearMat);
      c.position.copy(m.position);
      c.quaternion.copy(m.quaternion);
      c.scale.copy(m.scale);
      c.userData.hull = true;
      c.userData.secPaint = true;
      c.raycast = () => undefined;
      c.renderOrder = 0.3;
      m.parent.add(c);
      added.push(c);
    }
    invalidate();
    return () => {
      added.forEach((c) => c.removeFromParent());
      invalidate();
    };
  }, [gross, grossById, showBrainstem, bsClearMat, invalidate]);
  // (interaction overhaul) roots and intracranial course by default; the peripheral tree is a sub-option
  const wantField = !!nerves && !nervePeripheral;
  const brainField = useMemo(() => (gross && wantField ? buildBrainField([gross, ...(ventral ?? []).map((x) => x.g)]) : null), [gross, ventral, wantField]);
  const nerveRoot = useMemo(() => {
    if (!nerves || look === "xray") return null;
    if (!nervePeripheral && !brainField) return null;
    const root = new THREE.Group();
    for (const { id, g } of nerves) {
      if (hiddenIds.has(id)) continue; // a selected nerve is drawn by its own layer
      if (!nervePeripheral && PERIPHERAL_NERVES.has(id)) continue;
      const c = g.clone(true);
      c.updateMatrixWorld(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (!nervePeripheral && brainField) m.geometry = intracranial(m.geometry, m.matrixWorld, brainField, id === "olfactory-nerve-i");
        m.material = nerveMat;
        m.userData.gid = id;
        m.userData.nerve = true;
      });
      root.add(c);
    }
    return root;
  }, [nerves, look, hiddenIds, nerveMat, nervePeripheral, brainField]);
  // (interaction overhaul) the ventral diencephalon and brainstem surface parts, drawn and picked as part of the brain
  const ventralRoot = useMemo(() => {
    if (!ventral) return null;
    const root = new THREE.Group();
    for (const { id, g } of ventral) {
      const c = g.clone(true);
      const bs = structures[id]?.region === "brainstem";
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.userData.gid = id;
        m.userData.g = "brainstem";
        m.userData.vbs = bs;
        smoothGeometry(m);
        // the shared gross materials use vertex colours (baked shading); these meshes have none: plain white, or they render black
        if (!m.geometry.getAttribute("color")) {
          const g2 = m.geometry.clone();
          g2.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g2.getAttribute("position").count * 3).fill(0.93), 3));
          m.geometry = g2;
        }
      });
      root.add(c);
    }
    return root;
  }, [ventral, structures]);
  useEffect(() => {
    if (!ventralRoot) return;
    eachMesh(ventralRoot, (m) => {
      const id = m.userData.gid as string;
      m.material = lockedSet.has(id) ? grossMats.locked : grossMats.brainstem;
      // in a section the deep layer draws the chiasm and mammillary bodies (with their cut faces): no second copy
      m.visible = grossOn && !hiddenIds.has(id) && (showBrainstem || !m.userData.vbs) && !(deep && DEEP_IDS.has(id));
    });
    invalidate();
  }, [ventralRoot, grossMats, lockedSet, grossOn, hiddenIds, showBrainstem, deep, invalidate]);
  const deepRoot = useMemo(() => {
    if (!deep) return null;
    const root = new THREE.Group();
    for (const { id, g } of deep) {
      if (hiddenIds.has(id)) continue; // a selected structure is drawn by its own layer
      const c = g.clone(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = deepMats[id];
        m.userData.gid = id;
        m.userData.deep = true;
        m.renderOrder = 0.05; // before the section face, which covers whatever lies behind the plane
      });
      root.add(c);
    }
    addSectionPaint(root, (m) => paintMats[m.userData.gid as string] ?? null);
    return root;
  }, [deep, deepMats, paintMats, hiddenIds]);
  // midsagittal: the cut runs down the third ventricle, so its lateral wall (thalamus, hypothalamus) is what shows, not the cavity cast
  useEffect(() => {
    if (!deepRoot) return;
    deepRoot.traverse((o) => {
      if (o.userData.gid === "third-ventricle" && (o as THREE.Mesh).isMesh) o.visible = !midsagittal;
    });
    invalidate();
  }, [deepRoot, midsagittal, invalidate]);
  useEffect(() => {
    setGrossVisible(grossById, grossOn, grossHidden);
    const list: THREE.Mesh[] = [];
    eachMesh(targetRoot, (m) => list.push(m));
    eachMesh(ovlRoot, (m) => list.push(m));
    if (grossOn && solid) for (const [id, m] of grossById) if (!grossHidden.has(id)) list.push(m);
    if (ventralRoot && grossOn && solid) eachMesh(ventralRoot, (m) => m.visible && list.push(m));
    if (nerveRoot) eachMesh(nerveRoot, (m) => list.push(m));
    if (deepRoot) eachMesh(deepRoot, (m) => list.push(m));
    for (const r of layerRoots)
      r.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.visible && m.userData.lid) list.push(m);
      });
    skullGroup?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.lid) list.push(m);
    });
    pickables.current = list;
    invalidate();
  }, [grossById, grossOn, solid, grossHidden, nerveRoot, ventralRoot, targetRoot, ovlRoot, deepRoot, layerRoots, skullGroup, showBrainstem, hiddenIds, deep, invalidate]);

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
    } else if (hover?.id?.startsWith("skull:")) {
      for (const r of layerRoots)
        r.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.visible && m.userData.lid === hover.id) list.push(m);
        });
      grossHover = true;
    } else if (hover?.id) {
      const m = grossById.get(hover.id);
      if (m && m.visible) {
        list.push(m);
        grossHover = true;
      } else if (ventralRoot && (eachMesh(ventralRoot, (d) => d.userData.gid === hover.id && d.visible && list.push(d)), list.length)) {
        grossHover = true;
      } else if (deepRoot && !sectionOn) {
        eachMesh(deepRoot, (d) => d.userData.gid === hover.id && list.push(d));
        grossHover = list.length > 0;
      }
      if (!list.length && nerveRoot) {
        eachMesh(nerveRoot, (d) => d.userData.gid === hover.id && list.push(d));
        grossHover = list.length > 0;
      }
    }
    setPickPlanes(hoverMat, grossHover ? grossPlanes.current : ownPlanes.current);
    const inflated = list.length > 0 && list.every((m) => m.material === grossMats[m.userData.g as string] || m.material === grossMats.locked);
    (hoverMat.userData.inflate as { value: number }).value = inflated ? INFLATE.value + 0.0001 : 0;
    // in a cut, a labelled structure's cut face is tinted by the label volume (tight to the structure); the mesh copy only
    // tints its outside, never its inside, whose outline is the mesh's, not the structure's
    // a gross mesh's inside lies behind the section face (which writes no depth): tinting it painted torn patches of
    // hover colour over the section (owner 2026-11-19, the angular gyrus across a sagittal cut)
    if (sectionOn && hover?.id && !hover.key && (grossHover || hasLabels(hover.id)) && hoverMat.side !== THREE.FrontSide) {
      hoverMat.side = THREE.FrontSide;
      hoverMat.needsUpdate = true;
    }
    setHoverMeshes(pool, list.slice(0, pool.length), hoverMat);
    invalidate();
    return () => setHoverMeshes(pool, [], hoverMat);
  }, [hover, pool, hoverMat, grossById, grossMats, solid, brainOpacity, targetRoot, ovlRoot, deepRoot, nerveRoot, ventralRoot, layerRoots, perMesh, sectionOn, invalidate]);

  // in a section, a hovered deep structure tints its own cut face (not its whole body behind the plane); a selected one is in the accent
  useEffect(() => {
    for (const d of DEEP) {
      const m = paintMats[d.id];
      if (hover?.id === d.id && !hover.key) tintPaint(m, hoverColor, 0.5);
      else if (quiet) tintPaint(m, secPal.wm, 0.6); // "Show its cut": the neighbours' cut faces recede
      else if (colourCuts) tintPaint(m, d.hue, 0.62);
      else tintPaint(m, null, 0);
    }
    tintPaint(targetPaint, accent, quiet ? 1 : 0.58);
    invalidate();
  }, [hover, hoverColor, colourCuts, quiet, secPal.wm, accent, paintMats, targetPaint, invalidate]);
  useEffect(() => {
    if (!sectionOn || (labelsOn && loaded.targetIds.some(hasLabels))) return; // labelled: the cut face tints itself
    const undo = addSectionPaint(targetRoot, () => targetPaint);
    invalidate();
    return () => {
      undo();
      invalidate();
    };
  }, [sectionOn, labelsOn, loaded.targetIds, targetRoot, targetPaint, invalidate]);
  const outlineRoots = useMemo(() => (sectionOn && !labelsOn ? [deepRoot, targetRoot].filter((r): r is THREE.Group => !!r) : []), [sectionOn, labelsOn, deepRoot, targetRoot]);
  const outlineKey = `${clip.axis}:${clip.t}:${clip.flip}:${midsagittal}:${clipRange[0]}:${clipRange[1]}`;

  // how much of the target can be seen from a direction (rays from the camera to sample points, blocked by the solid brain)
  useEffect(() => {
    const ray = new THREE.Raycaster();
    probeRef.current = (dir, mid) => {
      const shell = pickables.current.filter((m) => m.userData.gid !== undefined && !m.userData.deep && !m.userData.nerve && m.visible);
      if (!shell.length || !solid || !grossOn) return 1;
      targetRoot.updateMatrixWorld(true);
      const pts: THREE.Vector3[] = [];
      eachMesh(targetRoot, (m) => {
        const pos = m.geometry.getAttribute("position");
        if (!pos) return;
        const step = Math.max(1, Math.floor(pos.count / 40));
        for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
      });
      const use = mid ? pts.filter((p) => p.x <= 0) : pts;
      if (!use.length) return mid ? 0 : 1;
      const planes = mid ? [clipPlane, ...(clip.axis === "off" ? [] : [cutP])] : grossPlanes.current;
      const eye = centre.clone().addScaledVector(dir.clone().normalize(), 0.5);
      let seen = 0;
      const dirv = new THREE.Vector3();
      for (const p of use) {
        dirv.copy(p).sub(eye);
        const dist = dirv.length();
        ray.set(eye, dirv.normalize());
        ray.far = dist - 0.002;
        const hits = ray.intersectObjects(shell, false);
        if (!hits.some((h) => !clippedBy(planes, h.point))) seen++;
      }
      return seen / use.length;
    };
    const ref = probeRef;
    return () => {
      ref.current = null;
    };
  });

  const [pulse] = useState(() => new Pulse());
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pulse.start(reduce || mode === "context" ? 0 : 1800);
    invalidate();
  }, [loaded, mode, invalidate, pulse]);

  // a docked brainstem reference (BrainstemRefDock) lights the same structure: the highlight breathes on its clock
  const [breath] = useState(() => new BrainstemBreathDriver());
  useEffect(() => onBrainstemBreath(invalidate), [invalidate]);
  useFrame(() => {
    if (pulse.step(hiMat, pivots) || breath.step(hiMat, mode === "focus")) invalidate();
  });

  return (
    <>
      <hemisphereLight args={[0xfff1e6, 0x9d8c9e, 1.05]} />
      <directionalLight position={[1, 2, 2]} intensity={1.5} />
      <directionalLight position={[-2, -2, -1.5]} intensity={1.0} />
      {loaded.ctx && showCtx && look === "xray" && <primitive object={loaded.ctx} />}
      {skullGroup && <primitive object={skullGroup} />}
      {shellGroup && <primitive object={shellGroup} />}
      {layerRoots.map((r, i) => (
        <primitive key={i} object={r} />
      ))}
      {backer && solid && grossOn && (brainOpacity ?? 1) >= 1 && <primitive object={backer} />}
      {gross && <primitive object={gross} />}
      {ventralRoot && gross && <primitive object={ventralRoot} />}
      {midsagittal && medialWall && gross && <primitive object={medialWall} />}
      {deepRoot && grossOn && !labelsOn && <primitive object={deepRoot} />}
      {nerveRoot && <primitive object={nerveRoot} />}
      {fillBackGeo && grossOn && solid && (brainOpacity ?? 1) >= 1 && capPlanes.length === 0 && !midsagittal && (
        <mesh geometry={fillBackGeo} material={fillBackMat} renderOrder={-1} raycast={() => undefined} />
      )}
      {fill && sectionOn && <SectionFace fill={fill} planes={capPlanes} centre={centre} color={secPal.wm} medial={midsagittal ? clipPlane : null} />}
      {fill && capPlanes.length > 0 && look === "xray" && <SectionFace ghost fill={fill} planes={capPlanes} centre={centre} color="#1d2522" />}
      {outlineRoots.length > 0 && <SectionOutlines roots={outlineRoots} planes={capPlanes} version={outlineKey} color={secPal.line} />}
      <primitive object={ovlRoot} />
      <primitive object={targetRoot} />
      {guides.map((g, i) => (
        <GuidePlane key={i} g={g} centre={centre} />
      ))}
      {!quiz && <Picker nameOf={nameOf} layerFirst={!!skull} el={pickEl} getPanes={getPanes} pickables={pickables} grossPlanes={grossPlanes} ownPlanes={ownPlanes} structures={structures} onHover={onHover} onMove={onMove} onPick={onPick} onMiss={onMiss} />}
    </>
  );
}

const VIEW_SHORT: Record<ViewName, string> = { anterior: "Anterior", posterior: "Posterior", left: "Lateral L", right: "Lateral R", superior: "Superior", inferior: "Inferior", midsagittal: "Midsagittal", top: "Top" };

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
  tipText: tipTextProp,
  guides,
  zoom = 1,
  shortcuts = false,
  multiview = false,
  neighbors = false,
  onToggleNeighbors,
  syllabus = null,
  unlocked = null,
  autoReveal = false,
  onUserView,
  onPickNothing,
  onLayerChange,
  onCameraState,
  children,
  brainOpacity: brainOpacityProp,
  solidCuts = false,
  skull = null,
  skullNodes = EMPTY_NODES,
  skullNames = EMPTY_NAMES,
  layerAuto: layerAutoProp = false,
  request = null,
  overlay,
  toolbarExtra,
  onDeselect,
  structureTools = false,
}: AtlasViewerProps) {
  const tipText = tipTextProp;
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [gross, setGross] = useState<THREE.Group | null>(null);
  const [fill, setFill] = useState<THREE.Group | null>(null);
  const [deep, setDeep] = useState<{ id: string; g: THREE.Group }[] | null>(null);
  const [deepFailed, setDeepFailed] = useState(false);
  const [showCtx, setShowCtx] = useState(true);
  const [grossProg, setGrossProg] = useState<Prog>({ loaded: 0, total: 0 });
  const [warmed, setWarmed] = useState(false);
  const onWarm = useCallback(() => setWarmed(true), []);
  // dev/perf aid: ms from this viewer mounting to the first fully ready frame (see window.__atlasReady)
  const mountedAt = useRef(0);
  const readyLogged = useRef(false);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);
  const [look, setLook] = useState<Look>("brain");
  const [solidPref, setSolidPref] = useState<boolean | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLocked, setTipLocked] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipPos = useRef("translate(0px,0px)");
  const lab = useRef<LabRefs>({ bottom: 56, obs: [], solid: false, tags: [], lines: [], dots: [], w: [] });
  const [view, setView] = useState<ViewName>(viewProp ?? "left");
  const [nonce, setNonce] = useState(0);
  const [frameTick, setFrameTick] = useState(0);
  const [lockView, setLockView] = useState(false);
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
  const [multi, setMulti] = useState(false);
  const [barOpen, setBarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 640));
  const [notice, setNotice] = useState<string | null>(null);
  const [fs, setFs] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [layerEl, setLayerEl] = useState<HTMLDivElement | null>(null);
  const [mainEl, setMainEl] = useState<HTMLDivElement | null>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const dims = useRef<Dims>({ w: 0, h: 0 });
  const fixedDims = useRef<Dims[]>([
    { w: 0, h: 0 },
    { w: 0, h: 0 },
    { w: 0, h: 0 },
  ]);
  const [sizeKey, setSizeKey] = useState("");
  const moved = useRef(false);
  const fixedCams = useMemo(() => FIXED_PANES.map(() => new THREE.PerspectiveCamera(35, 1.3, 0.01, 6)), []);
  const panes = useRef<Pane[]>([]);
  const paneView = useRef<PaneView[]>(FIXED_PANES.map(() => ({ z: 1, ox: 0, oy: 0 })));
  const fixedBase = useRef<(PaneBase | null)[]>([null, null, null]);
  const invalidateRef = useRef<() => void>(() => undefined);
  const layerAuto = layerAutoProp || !!skull;
  const [cssFs, setCssFs] = useState(false);
  // skull & spine layer: automatic from the selection type, with a manual override that holds until the type changes
  const [layerOv, setLayerOv] = useState<{ auto: boolean; v: boolean } | null>(null);
  // the cranial-nerve and brainstem layers: on/off like the skull and spine, remembered on this device
  const [showNerves, setShowNerves] = useStoredFlag("atlas.layer.nerves", false);
  const [showBrainstem, setShowBrainstem] = useStoredFlag("atlas.layer.brainstem", true);
  const [nerves, setNerves] = useState<{ id: string; g: THREE.Group }[] | null>(null);
  const [nervesFailed, setNervesFailed] = useState(false);
  // (interaction overhaul) the nerve layer's peripheral tree is a sub-option, off by default
  const [nervePeripheral, setNervePeripheral] = useStoredFlag("atlas.layer.nervesPeripheral", false);
  const [ventral, setVentral] = useState<{ id: string; g: THREE.Group }[] | null>(null);
  const layerOn = layerOv && layerOv.auto === layerAuto ? layerOv.v : layerAuto;
  useEffect(() => {
    onLayerChange?.(layerOn);
  }, [layerOn, onLayerChange]);
  const brainOpacity = brainOpacityProp ?? (skull && layerOn ? 0.22 : undefined);
  const [layerGroups, setLayerGroups] = useState<THREE.Group[]>([]);
  const [layerMissing, setLayerMissing] = useState(false);
  // the layer button only appears once the skull model is actually published
  useEffect(() => {
    let alive = true;
    fetch("/atlas/skull.glb", { method: "HEAD" })
      .then((r) => alive && !r.ok && setLayerMissing(true))
      .catch(() => alive && setLayerMissing(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!(layerOn || skull) || layerGroups.length || layerMissing) return;
    let alive = true;
    Promise.all(["skull.glb", "spine-atlas.glb"].map((f) => loadAtlasModel(f).catch(() => null))).then((g) => {
      if (!alive) return;
      const ok = g.filter((x): x is THREE.Group => !!x);
      if (ok.length) setLayerGroups(ok);
      else setLayerMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [layerOn, skull, layerGroups.length, layerMissing]);
  const probeRef = useRef<((dir: THREE.Vector3, mid: boolean) => number) | null>(null);
  const getPanes = useCallback(() => panes.current, []);

  useLayoutEffect(() => {
    panes.current = multi
      ? [...FIXED_PANES.map((p, i) => ({ el: cellRefs.current[i], cam: fixedCams[i], view: p.view })), { el: mainEl, cam: null }]
      : [{ el: mainEl, cam: null }];
  }, [multi, mainEl, fixedCams]);

  // pane sizes (aspect for the framing, size for the labels)
  useEffect(() => {
    if (!mainEl || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      dims.current = { w: mainEl.clientWidth, h: mainEl.clientHeight };
      FIXED_PANES.forEach((_, i) => {
        const c = cellRefs.current[i];
        fixedDims.current[i] = c ? { w: c.clientWidth, h: c.clientHeight } : { w: 0, h: 0 };
      });
      setSizeKey(`${dims.current.w}x${dims.current.h}|${multi ? 1 : 0}`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mainEl);
    if (multi) cellRefs.current.forEach((c) => c && ro.observe(c));
    return () => ro.disconnect();
  }, [mainEl, multi]);

  useEffect(() => {
    const f = () => setFs(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  // multi-view: the three fixed panes pan (drag, one finger) and zoom (wheel, pinch) in their own plane; rotation stays locked
  const resetPane = useCallback(
    (i: number) => {
      paneView.current[i] = { z: 1, ox: 0, oy: 0 };
      const b = fixedBase.current[i];
      if (b) applyPaneCam(fixedCams[i], b, paneView.current[i]);
      invalidateRef.current();
    },
    [fixedCams],
  );
  useEffect(() => {
    if (!multi) return;
    const cleanups: (() => void)[] = [];
    FIXED_PANES.forEach((_, i) => {
      const el = cellRefs.current[i];
      if (!el) return;
      const ptrs = new Map<number, { x: number; y: number }>();
      let lastDist = 0;
      const cam = fixedCams[i];
      const ppu = () => {
        const b = fixedBase.current[i];
        return b ? el.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * b.dist) : 0;
      };
      const refresh = () => {
        const b = fixedBase.current[i];
        if (b) applyPaneCam(cam, b, paneView.current[i]);
        invalidateRef.current();
      };
      const zoomAt = (cx: number, cy: number, f: number) => {
        const v = paneView.current[i];
        const k = ppu();
        if (!k) return;
        const r = el.getBoundingClientRect();
        const u = cx - r.left - r.width / 2;
        const w = r.height / 2 - (cy - r.top);
        const nz = Math.min(14, Math.max(0.6, v.z * f));
        v.ox += u / (k * v.z) - u / (k * nz);
        v.oy += w / (k * v.z) - w / (k * nz);
        v.z = nz;
        refresh();
      };
      const dist2 = () => {
        if (ptrs.size !== 2) return 0;
        const [a, b] = [...ptrs.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        el.setPointerCapture?.(e.pointerId);
        lastDist = dist2();
      };
      const move = (e: PointerEvent) => {
        const p = ptrs.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (ptrs.size === 1) {
          const k = ppu();
          if (!k) return;
          const v = paneView.current[i];
          v.ox -= dx / (k * v.z);
          v.oy += dy / (k * v.z);
          refresh();
        } else if (ptrs.size === 2) {
          const d = dist2();
          const [a, b] = [...ptrs.values()];
          if (lastDist > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastDist);
          lastDist = d;
        }
      };
      const up = (e: PointerEvent) => {
        ptrs.delete(e.pointerId);
        lastDist = dist2();
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.03 : 0.0015)));
      };
      const dbl = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("button")) return;
        resetPane(i);
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("wheel", wheel, { passive: false });
      el.addEventListener("dblclick", dbl);
      cleanups.push(() => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.removeEventListener("wheel", wheel);
        el.removeEventListener("dblclick", dbl);
      });
    });
    return () => cleanups.forEach((f) => f());
  }, [multi, fixedCams, resetPane]);

  // entering or leaving full screen changes the canvas size: nudge every size listener (canvas, orbit controls, panes)
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event("resize"));
    const a = requestAnimationFrame(kick);
    const b = window.setTimeout(kick, 250);
    return () => {
      cancelAnimationFrame(a);
      window.clearTimeout(b);
    };
  }, [fs, cssFs]);

  const flashT = useRef(0);
  const flash = useCallback((m: string) => {
    setNotice(m);
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setNotice(null), 4500);
  }, []);
  useEffect(() => () => window.clearTimeout(flashT.current), []);

  // theme colours: read at mount (state initialiser), refresh when data-theme changes
  useEffect(() => {
    const mo = new MutationObserver(() => setColors(readColors()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
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
    loadAtlasModel("gross.glb", (p) => alive && setGrossProg(p))
      .then((g) => alive && setGross(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [look, gross]);
  // the closed brain solid (small): stencil-capped cut faces; without it a cut shows the hollow shell
  useEffect(() => {
    if (!solidCuts || fill) return;
    let alive = true;
    loadAtlasModel("brainfill.glb")
      .then((g) => alive && setFill(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [fill, solidCuts]);
  // the deep structures a section passes through: fetched the first time a cut or the midsagittal view is used
  const cutNow = solidCuts && look !== "xray" && (clip.axis !== "off" || (view === "midsagittal" && !multi));
  useEffect(() => {
    if (!cutNow || deep || deepFailed || !index) return;
    let alive = true;
    Promise.all(DEEP.filter(({ id }) => index.structures[id]?.file).map(({ id }) => loadAtlasModel(index.structures[id].file as string).then((g) => ({ id, g }))))
      .then((r) => alive && setDeep(r))
      .catch(() => alive && setDeepFailed(true));
    return () => {
      alive = false;
    };
  }, [cutNow, deep, deepFailed, index]);
  // the tissue volume the section faces paint (grey ribbon, white matter, sulci, ventricles): fetched with the deep structures
  const [tissueOk, setTissueOk] = useState(false);
  const [colourCuts, setColourCuts] = useState(false);
  const secThemeKey = useSectionTheme();
  useEffect(() => {
    if (!cutNow || tissueOk) return;
    let alive = true;
    Promise.all([loadTissue(), loadInterior().catch(() => null)])
      .then(([t, interior]) => {
        setTissue(t);
        setInterior(interior); // the labelled interior; without it the deep meshes paint the cut as before
        if (alive) setTissueOk(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cutNow, tissueOk]);
  // cranial nerve meshes, fetched the first time the layer is switched on
  useEffect(() => {
    if (!showNerves || nerves || nervesFailed || !index) return;
    let alive = true;
    const ids = resolveStructureIds(index, ["cranial-nerves"], 200).filter((id) => index.structures[id]?.file);
    Promise.all(ids.map((id) => loadAtlasModel(index.structures[id].file as string).then((g) => ({ id, g }))))
      .then((r) => alive && setNerves(r))
      .catch(() => alive && setNervesFailed(true));
    return () => {
      alive = false;
    };
  }, [showNerves, nerves, nervesFailed, index]);
  // (interaction overhaul) the ventral diencephalon and brainstem surface parts belong to the default brain (inferior view)
  const ventralWanted = !!gross && look !== "xray" && !!index;
  useEffect(() => {
    if (!ventralWanted || ventral || !index) return;
    let alive = true;
    const ids = VENTRAL_IDS.filter((id) => index.structures[id]?.file);
    Promise.all(ids.map((id) => loadAtlasModel(index.structures[id].file as string).then((g) => ({ id, g }))))
      .then((r) => alive && setVentral(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ventralWanted, ventral, index]);
  const deepLoading = cutNow && !deep && !deepFailed;
  const [keyOpen, setKeyOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 640));
  // a narrow viewer (info panel open) drops the view name and the dividers so the bar stays on one row
  const narrow = (Number(sizeKey.split("x")[0]) || 9999) < 880;

  const resolved = useMemo(() => (index ? resolveStructureIds(index, structureIds) : []), [index, structureIds]);
  const key = resolved.join(",") + "|" + mode;
  const entries = useMemo(() => (index ? resolved.map((id) => index.structures[id]) : []), [index, resolved]);

  const ovlSig = (overlays ?? []).map((o) => `${o.key}:${o.ids.join("+")}:${o.color}:${o.opacity ?? ""}:${o.side ?? ""}`).join("|");
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
          side: o.side,
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
  useEffect(() => {
    if (readyLogged.current || !current || !warmed || !(gross || look === "xray")) return;
    readyLogged.current = true;
    const w = window as unknown as { __atlasReady?: number[] };
    (w.__atlasReady ??= []).push(Math.round(performance.now() - mountedAt.current));
  }, [current, warmed, gross, look]);
  // Keep the previous scene on screen while the next structure loads (no blank flash between picks).
  const shown = current ?? (loaded && !loaded.error ? loaded : null);
  const currentCtx = shown?.ctx ?? null;
  const ctxBoxRaw = useMemo(() => {
    const b = currentCtx ? new THREE.Box3().setFromObject(currentCtx) : null;
    return b && !b.isEmpty() ? b : null;
  }, [currentCtx]);
  // Every reload of the scene makes a new context mesh with the same size; keep one box by value so the camera is not re-framed (snapped) by it.
  const ctxKey = ctxBoxRaw ? `${ctxBoxRaw.min.toArray().map((v) => v.toFixed(5))}|${ctxBoxRaw.max.toArray().map((v) => v.toFixed(5))}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctxBox = useMemo(() => ctxBoxRaw, [ctxKey]);
  const centre = useMemo(() => (ctxBox ? ctxBox.getCenter(new THREE.Vector3()) : DEFAULT_CTX_CENTER.clone()), [ctxBox]);
  const clipRange = useMemo<[number, number]>(() => {
    const ax = clip.axis === "off" ? "z" : clip.axis;
    if (!ctxBox) return ax === "x" ? [-0.08, 0.08] : ax === "y" ? [1.53, 1.68] : [-0.11, 0.1];
    return [ctxBox.min[ax], ctxBox.max[ax]];
  }, [ctxBox, clip.axis]);
  /** The structures a section shows: deep structures the cut actually passes through (the same rule for the midsagittal plane), then brainstem and cerebellum. Swatches use the section's tissue tones unless "colour" is on. */
  const sectionKey = useMemo(() => {
    if (!cutNow || !deep || !index) return [] as { id: string; name: string; colour: string }[];
    const mid = view === "midsagittal" && !multi ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) : null;
    const cut = clip.axis !== "off" ? new THREE.Plane() : null;
    if (cut) cutPlane(clip.axis, clipRange[0] + clip.t * (clipRange[1] - clipRange[0]), clip.flip, cut);
    const planes = [mid, cut].filter((p): p is THREE.Plane => !!p);
    const sl = look === "regions" ? "regions" : "brain";
    const pal = sectionPalette(sl, secThemeKey);
    const out: { id: string; name: string; colour: string }[] = [];
    const behind = (e: AtlasEntry, pl: THREE.Plane, depth: number) => {
      if (!e.bbox) return false;
      const [a, b] = e.bbox;
      let dmin = Infinity;
      let dmax = -Infinity;
      for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) {
        const d = pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant;
        dmin = Math.min(dmin, d);
        dmax = Math.max(dmax, d);
      }
      return dmax >= 0 && dmin <= depth;
    };
    const segs: number[] = [];
    for (const d of DEEP) {
      const e = index.structures[d.id];
      const g = deep.find((x) => x.id === d.id)?.g;
      if (!e || !g) continue;
      let hit = false;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (hit || !m.isMesh) return;
        planes.forEach((pl, i) => {
          segs.length = 0;
          planeSection(m, pl, planes.filter((_, j) => j !== i), segs);
          if (segs.length) hit = true;
        });
      });
      if (hit) out.push({ id: d.id, name: e.name, colour: colourCuts ? d.hue : sectionSwatch(d.tissue, sl, secThemeKey) });
    }
    for (const id of ["brainstem", "cerebellum"]) {
      if (id === "brainstem" && !showBrainstem) continue; // the Brainstem layer is off: no brainstem in the cut, none in the key
      const e = index.structures[id];
      if (e && planes.every((pl) => behind(e, pl, 0))) out.push({ id, name: e.name, colour: `linear-gradient(135deg, ${pal.gm} 50%, ${pal.wm} 50%)` });
    }
    return out;
  }, [cutNow, deep, index, view, multi, clip.axis, clip.t, clip.flip, clipRange, look, colourCuts, secThemeKey, showBrainstem]);
  // labelled interior: the key lists exactly what the plane cuts, from the same labels as the face (the deep-mesh key above is the fallback)
  const labelKey = useMemo(() => {
    if (!cutNow || !tissueOk || !interiorNow()) return null;
    const mid = view === "midsagittal" && !multi ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0) : null;
    const cut = clip.axis !== "off" ? new THREE.Plane() : null;
    if (cut) cutPlane(clip.axis, clipRange[0] + clip.t * (clipRange[1] - clipRange[0]), clip.flip, cut);
    const pal = sectionPalette(look === "regions" ? "regions" : "brain", secThemeKey);
    const c = new THREE.Color();
    const swatch = (r: { cls: string; tone: number }) =>
      r.cls === "csf" ? pal.csf : r.cls === "plx" ? "#" + c.set("#a05a63").lerp(new THREE.Color(pal.gm), 0.35).getHexString() : r.cls === "w" || r.cls === "wm" ? pal.wm
        : r.tone < 0 ? "#" + c.set(pal.gm).lerp(new THREE.Color(pal.csf), -r.tone * 1.6).getHexString() : "#" + c.set(pal.gm).lerp(new THREE.Color(pal.wm), r.tone).getHexString();
    const items = sectionKeyFor([mid, cut].filter((p): p is THREE.Plane => !!p), mid, { showBrainstem, colour: colourCuts, swatch });
    return items?.map((k) => ({ id: "lab:" + k.key, name: k.name, colour: k.colour })) ?? null;
  }, [cutNow, tissueOk, view, multi, clip.axis, clip.t, clip.flip, clipRange, look, colourCuts, secThemeKey, showBrainstem]);
  const sectionKeyShown = labelKey ?? sectionKey;
  const boxRaw = useMemo(() => {
    const u = mode === "context" ? null : unionBox(entries);
    return u ? new THREE.Box3(new THREE.Vector3(...u.min), new THREE.Vector3(...u.max)) : null;
  }, [entries, mode]);
  // one box per value, so a reload of the same selection does not look like a new selection to the camera
  const boxKey = boxRaw ? `${boxRaw.min.toArray().map((v) => v.toFixed(5))}|${boxRaw.max.toArray().map((v) => v.toFixed(5))}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const box = useMemo(() => boxRaw, [boxKey]);

  /* ---------- (interaction overhaul) "Show its cut" and deselection: state ---------- */
  type SCut = { key: string; plane: CutPlaneName; lo: number; hi: number; prev: { clip: ClipState; view: ViewName; keyOpen: boolean } };
  const [sCut, setSCut] = useState<SCut | null>(null);
  // the see-through cortex chosen by autoReveal for a deep structure goes back to solid when that selection goes
  const [autoSolid, setAutoSolid] = useState(false);
  const selKey = resolved.join(",");
  function showCut(plane: CutPlaneName) {
    if (!box) return;
    const plan = planStructureCut(plane, resolved, box);
    const ax = plan.axis;
    const lo = ctxBox ? ctxBox.min[ax] : ax === "x" ? -0.08 : ax === "y" ? 1.53 : -0.11;
    const hi = ctxBox ? ctxBox.max[ax] : ax === "x" ? 0.08 : ax === "y" ? 1.68 : 0.1;
    const prev = sCut ? sCut.prev : { clip, view, keyOpen };
    setSCut({ key: selKey, plane, lo: plan.lo, hi: plan.hi, prev });
    setMulti(false);
    setKeyOpen(false); // only the sliced view: the section key folds away (one click opens it)
    setClip({ axis: ax, t: Math.min(1, Math.max(0, (plan.pos - lo) / (hi - lo))), flip: false });
    setViewUser(ax === "y" ? "top" : ax === "z" ? "anterior" : "left");
    trackAtlas({ type: "cut_used", plane: `structure-${plane}` });
  }
  /** Back to the whole structure: the cut and the view from before "Show its cut". */
  function wholeStructure() {
    if (!sCut) return;
    setClip(sCut.prev.clip);
    setView(sCut.prev.view);
    setKeyOpen(sCut.prev.keyOpen);
    setNonce((n) => n + 1);
    setSCut(null);
  }
  // a new selection (or none) drops a structure cut that belonged to the previous one, restoring the view from before it
  const [prevSel, setPrevSel] = useState(selKey);
  if (prevSel !== selKey) {
    setPrevSel(selKey);
    if (autoSolid) {
      setAutoSolid(false);
      if (solidPref === false) setSolidPref(null);
    }
    if (sCut && sCut.key !== selKey) {
      setClip(sCut.prev.clip);
      setView(sCut.prev.view);
      setKeyOpen(sCut.prev.keyOpen);
      setNonce((n) => n + 1);
      setSCut(null);
    }
  }
  const sCutOn = !!sCut && clip.axis === PLANE_AXIS[sCut.plane];
  useEffect(() => {
    applySectionOnly(sCutOn && sCut ? resolved : null, sCutOn && sCut ? sCut.plane : null);
  }, [sCutOn, sCut, resolved]);
  useEffect(() => () => applySectionOnly(null, null), []);
  // the tissue around the structure is quietened in both cases: a native structure-only render may still show the template
  // tissue where it leaves other structures out
  const quietSection = sCutOn;

  // frame the skull / spine target (not the brain) when one is selected
  const skullBox = useMemo(() => {
    if (!skull || skull.shells) return null;
    const pts: THREE.Vector3[] = [];
    for (const p of skull.anchors) pts.push(new THREE.Vector3(p[0], p[1], p[2]));
    for (const l of skull.labels) pts.push(new THREE.Vector3(l[0], l[1], l[2]));
    for (const t of skull.tubes) for (const p of t) pts.push(new THREE.Vector3(p[0], p[1], p[2]));
    if (!pts.length) return null;
    return new THREE.Box3().setFromPoints(pts).expandByScalar(Math.max(skull.radius, 0.03) + 0.035);
  }, [skull]);

  function pickAxis(axis: ClipAxis) {
    setSCut(null); // the toolbar's own cut replaces "Show its cut" (nothing to restore)
    if (axis === "off") return setClip((c) => ({ ...c, axis }));
    const lo = ctxBox ? ctxBox.min[axis] : axis === "x" ? -0.08 : axis === "y" ? 1.53 : -0.11;
    const hi = ctxBox ? ctxBox.max[axis] : axis === "x" ? 0.08 : axis === "y" ? 1.68 : 0.1;
    const c = box ? box.getCenter(new THREE.Vector3())[axis] : axis === "z" ? -0.008 : axis === "y" ? 1.625 : axis === "x" ? -0.02 : (lo + hi) / 2; // coronal: through the thalamus, hippocampal head and midbrain; transverse: caudate head, lentiform nucleus, thalamus and splenium (the course's "through the thalamus" level)
    setClip({ axis, t: Math.min(1, Math.max(0, (c - lo) / (hi - lo))), flip: false });
    if (axis === "y") setViewUser("top"); // front at the top, as the course's horizontal sections are shown
    else if (axis === "z") setViewUser("anterior");
    else if (axis === "x") setViewUser("left");
    trackAtlas({ type: "cut_used", plane: CLIP_AXES.find((a) => a.id === axis)?.plane ?? axis });
  }
  const toggleAxis = (axis: ClipAxis) => (clip.axis === axis ? pickAxis("off") : pickAxis(axis));

  function setViewUser(v: ViewName) {
    setView(v);
    setNonce((n) => n + 1);
    onUserView?.(v);
    trackAtlas({ type: "view_changed", view: v });
  }
  function toggleMulti() {
    if (!multi) trackAtlas({ type: "multiview_opened" });
    setMulti(!multi);
    setView((v) => (v === "midsagittal" ? "left" : v));
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
  // a cut shows a deep selection in its section (accent cut face), so the brain stays solid there
  const solid = look === "xray" ? false : (solidPref ?? (allSurface || cutNow));

  const lockedSet = useMemo(() => {
    const s = new Set<string>();
    if (syllabus) for (const id of grossIds) if (!syllabus.has(id) && id !== unlocked) s.add(id);
    return s;
  }, [syllabus, grossIds, unlocked]);

  // "Show its cut": the selected structure's label points at its cut face, not at the (cut away) middle of the mesh
  const cutAxis = clip.axis !== "off" && view !== "midsagittal" ? clip.axis : null;
  const cutLo = cutAxis ? (ctxBox ? ctxBox.min[cutAxis] : cutAxis === "x" ? -0.08 : cutAxis === "y" ? 1.53 : -0.11) : 0;
  const cutHi = cutAxis ? (ctxBox ? ctxBox.max[cutAxis] : cutAxis === "x" ? 0.08 : cutAxis === "y" ? 1.68 : 0.1) : 0;
  const cutPos = cutAxis ? +(cutLo + clip.t * (cutHi - cutLo)).toFixed(4) : null;
  const anyCut = useMemo(() => (cutAxis && cutPos !== null ? { axis: cutAxis, pos: cutPos } : undefined), [cutAxis, cutPos]);
  const cutAt = sCutOn ? anyCut : undefined;
  // in-scene name labels (selected structure, added structures, neighbours)
  const labelItems = useMemo<LabelItem[]>(() => {
    if (quiz || hideLabels || !index || !shown) return [];
    const out: LabelItem[] = [];
    const accentHex = "#" + colors.accent.getHexString();
    const add = (k: string, color: string, g: THREE.Group, id: string, nameOverride?: string, only?: "L" | "R") => {
      const e = index.structures[id];
      if (!e) return;
      // on a cut: inside the structure's labelled cut face; a structure "Show its cut" puts on the plane but the labels
      // do not cover: on its mesh, near the plane
      const onCut = anyCut && k === "primary" && tissueOk ? sectionAnchors(id, anyCut.axis, anyCut.pos, e.side === "lr") : null;
      for (const a of onCut ?? anchorsFor(g, e.side === "lr", k === "primary" ? cutAt : undefined)) {
        if (only && a.side && a.side !== only) continue;
        out.push({ key: k, sid: id, text: `${nameOverride ?? e.name}${a.side ? " (" + a.side + ")" : only ? " (" + only + ")" : ""}`, color, anchor: a.p });
      }
    };
    shown.targets.forEach((g, i) => add("primary", accentHex, g, shown.targetIds[i], label && shown.targets.length === 1 ? label : undefined));
    shown.ovl.forEach((o) => o.groups.forEach((g, j) => add(o.key, o.color, g, o.ids[j], undefined, o.side)));
    if (skull) {
      for (const l of skull.labels) out.push({ key: "primary", sid: "", text: l[3], color: accentHex, anchor: new THREE.Vector3(l[0], l[1], l[2]) });
      if (skull.shells && ctxBox) {
        const c = ctxBox.getCenter(new THREE.Vector3());
        for (const sh of SHELLS) out.push({ key: "shell-" + sh.key, sid: "", text: sh.label, color: sh.color, anchor: new THREE.Vector3(0, c.y + (ctxBox.max.y - c.y) * sh.s, c.z) });
      }
    }
    return out.slice(0, MAX_LABELS);
  }, [quiz, hideLabels, index, shown, colors.accent, label, skull, ctxBox, cutAt, anyCut, tissueOk]);
  const labelsOn = showLabels && !quiz && !hideLabels;
  const barRef = useRef<HTMLDivElement>(null);
  const [obsTick, setObsTick] = useState(0);
  // overlays marked data-atl-obstacle (legend, add button) and the toolbar keep labels out of their way
  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!mainEl || !parent) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const mr = mainEl.getBoundingClientRect();
      const els: Element[] = [...parent.querySelectorAll("[data-atl-obstacle]")];
      if (barRef.current) els.push(barRef.current);
      lab.current.obs = els
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left - mr.left, y: r.top - mr.top, w: r.width, h: r.height };
        })
        .filter((o) => o.w > 0 && o.h > 0);
      setObsTick((t) => t + 1);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    queue();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queue);
    ro?.observe(parent);
    const mo = new MutationObserver(queue);
    mo.observe(parent, { childList: true, subtree: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
    };
  }, [mainEl, multi, barOpen]);
  useLayoutEffect(() => {
    labelItems.forEach((_, i) => {
      lab.current.w[i] = lab.current.tags[i]?.offsetWidth ?? 100;
    });
    lab.current.bottom = (barRef.current?.offsetHeight ?? 36) + 14;
    lab.current.solid = solid;
  }, [labelItems, labelsOn, solid, look, showLabels, barOpen]);

  // When the selection is hidden from the current view, pick a view (or the see-through look) that shows it.
  const revealed = useRef("");
  const nameForNotice = label ?? entries[0]?.name ?? "This structure";
  useEffect(() => {
    if (!autoReveal || quiz || viewProp !== undefined || !current || !gross || mode === "context" || !resolved.length) return;
    if (revealed.current === fullKey) return;
    const t = window.setTimeout(() => {
      const probe = probeRef.current;
      if (!probe) return;
      revealed.current = fullKey;
      if (!solid || multi) return;
      const dirOf = (v: ViewName) => new THREE.Vector3(...(VIEWS.find((x) => x.id === v) ?? VIEWS[2]).dir);
      if (probe(dirOf(view), view === "midsagittal") >= 0.3) return;
      let best: ViewName | null = null;
      let bf = 0;
      for (const v of ["midsagittal", "left", "right", "anterior", "posterior", "superior", "inferior"] as ViewName[]) {
        const f = probe(dirOf(v), v === "midsagittal");
        if (f > bf + 0.05) {
          bf = f;
          best = v;
        }
      }
      if (best && bf >= 0.35) {
        setView(best);
        setNonce((n) => n + 1);
        onUserView?.(best);
        flash(`${nameForNotice} is hidden from that side, so the view turned to ${VIEW_SHORT[best].toLowerCase()}.`);
      } else {
        setSolidPref(false);
        setAutoSolid(true);
        flash(`${nameForNotice} sits inside the brain, so the cortex is see-through.`);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [autoReveal, quiz, viewProp, current, gross, mode, resolved, fullKey, solid, view, multi, flash, nameForNotice, onUserView]);

  const onHoverKeyRef = useRef(onHoverKey);
  const onPickRef = useRef(onPickMesh);
  const tipTextRef = useRef(tipText);
  const syllabusRef = useRef({ syllabus, unlocked });
  useEffect(() => {
    onHoverKeyRef.current = onHoverKey;
    onPickRef.current = onPickMesh;
    tipTextRef.current = tipText;
    syllabusRef.current = { syllabus, unlocked };
  });
  const hoverStable = useMemo(
    () => (h: Hover, name: string | null) => {
      setHover(h);
      setTip(name !== null && h?.id && tipTextRef.current ? tipTextRef.current(h.id, name) : name);
      const sy = syllabusRef.current;
      const skullId = h?.id?.startsWith("skull:");
      setTipLocked(!!(h?.id && !h.key && (skullId ? h.id?.startsWith("skull:node:") : sy.syllabus && !sy.syllabus.has(h.id) && h.id !== sy.unlocked)));
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
  const pickStable = useMemo(() => (id: string, side?: "L" | "R") => onPickRef.current?.(id, side), []);
  const onMissRef = useRef(onPickNothing);
  useEffect(() => {
    onMissRef.current = onPickNothing;
  });
  const missStable = useMemo(() => () => onMissRef.current?.(), []);
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

  // native full screen where the browser allows it (not on iPhones, not in some embedded views), otherwise a fixed full-window layout
  const canFs = typeof document !== "undefined";
  const fsOn = fs || cssFs;
  function toggleFs() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (cssFs) {
      setCssFs(false);
      return;
    }
    const el = rootRef.current;
    if (!el?.requestFullscreen) return setCssFs(true);
    el.requestFullscreen().catch(() => setCssFs(true));
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && cssFs) {
      setCssFs(false);
      e.stopPropagation();
      return;
    }
    if (!shortcuts || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const k = e.key.toLowerCase();
    const vk = (Object.keys(VIEW_KEYS) as ViewName[]).find((v) => VIEW_KEYS[v] === k && k !== "");
    let used = true;
    if (vk && !multi) setViewUser(vk);
    else if (k === "n" && !cut) pickAxis("off");
    else if (k === "c" && !cut) toggleAxis("z");
    else if (k === "s" && !cut) toggleAxis("x");
    else if (k === "t" && !cut) toggleAxis("y");
    else if (k === "b") setLook("brain");
    else if (k === "r") setLook("regions");
    else if (k === "x") setLook("xray");
    else if (k === "v" && look !== "xray") setSolidPref(!solid);
    else if (k === "l" && !quiz && !hideLabels) setShowLabels((x) => !x);
    else if (k === "h") setShowCtx((x) => !x);
    else if (k === "k" && shortcuts && !layerMissing) setLayerOv({ auto: layerAuto, v: !layerOn });
    else if (k === "e" && shortcuts && e.shiftKey) {
      if (!showNerves) setShowNerves(true);
      setNervePeripheral(!nervePeripheral);
    } else if (k === "e" && shortcuts) setShowNerves(!showNerves);
    else if (k === "w" && shortcuts) setShowBrainstem(!showBrainstem);
    else if (k === "g" && onToggleNeighbors) onToggleNeighbors();
    else if (k === "m" && multiview && !cut) toggleMulti();
    else if (k === "f" && !multi) setFrameTick((n) => n + 1);
    else if (k === "z" && canFs) toggleFs();
    else used = false;
    if (used) e.preventDefault();
  };

  const clipEff = cut ? { axis: cut.axis, t: cut.position, flip: !!cut.flip } : clip;
  // owner 2026-11-18: a sagittal cut within a few mm of the midline is drawn as the textbook midsagittal view (the medial
  // surface of the hemisphere as a surface, only the midline structures cut), not as a tangential slice through medial gyri
  const sagPos = clipEff.axis === "x" && !cut ? clipRange[0] + clipEff.t * (clipRange[1] - clipRange[0]) : null;
  const nearMid = sagPos !== null && Math.abs(sagPos) < 0.005 && !multi;
  const sceneClip = nearMid ? { ...clipEff, axis: "off" as const } : clipEff;

  // report the camera state to the host (view, multi-view, cut) for the 3D <-> MRI translation
  const camCb = useRef(onCameraState);
  useEffect(() => {
    camCb.current = onCameraState;
  });
  const cutAxisNow = !cut && clip.axis !== "off" ? clip.axis : null;
  const cutPosNow = clipRange[0] + clip.t * (clipRange[1] - clipRange[0]);
  useEffect(() => {
    camCb.current?.({ view, multi, cut: cutAxisNow ? { axis: cutAxisNow, position: cutPosNow } : null });
  }, [view, multi, cutAxisNow, cutPosNow]);

  // meningeal spaces are shown in a midsagittal cut
  const shellsKey = skull?.shells ?? "";
  useEffect(() => {
    if (!shellsKey) return;
    const t = window.setTimeout(() => {
      setMulti(false);
      setView("midsagittal");
      setNonce((n) => n + 1);
    }, 0);
    return () => window.clearTimeout(t);
  }, [shellsKey]);

  // a host request (from the MRI tab): switch view / multi-view once per request number
  const lastReq = useRef(0);
  useEffect(() => {
    if (!request || request.n === lastReq.current) return;
    lastReq.current = request.n;
    const t = window.setTimeout(() => {
      if (request.multi !== undefined) setMulti(request.multi);
      if (request.view) {
        setView(request.view);
        setNonce((n) => n + 1);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [request]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerEnter={(e) => {
        const a = document.activeElement as HTMLElement | null;
        if (shortcuts && e.pointerType === "mouse" && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) rootRef.current?.focus({ preventScroll: true });
      }}
      className={`relative w-full overflow-hidden rounded-card border border-panel-border bg-bg-2 outline-none ${className ?? ""}`}
      style={cssFs ? { position: "fixed", inset: 0, width: "100%", height: "100dvh", zIndex: 200, borderRadius: 0 } : { height }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 35, near: 0.01, far: 6, position: [0.5, 1.605, -0.01] }}
        gl={{ antialias: true, stencil: solidCuts, powerPreference: "low-power" }}
      >
        {shown && index && (
          <Scene
            loaded={shown}
            gross={gross}
            fill={fill}
            deep={cutNow ? deep : null}
            tissueOk={tissueOk}
            colourCuts={colourCuts}
            structures={index.structures}
            look={look}
            solid={solid}
            mode={mode}
            showCtx={showCtx}
            midsagittal={(view === "midsagittal" && !multi) || nearMid}
            accent={colors.accent}
            dim={colors.dim}
            hoverColor={colors.hover}
            clip={sceneClip}
            clipRange={cut ? [0, 1] : clipRange}
            hover={active}
            quiz={quiz}
            perMesh={pickMode === "mesh"}
            guides={guides ?? []}
            centre={centre}
            lockedSet={lockedSet}
            brainOpacity={brainOpacity}
            skull={skull}
            layer={layerOn || skull ? layerGroups : EMPTY_LAYER}
            layerShow={layerOn}
            nerves={showNerves ? nerves : null}
            showBrainstem={showBrainstem}
            quiet={quietSection}
            ventral={ventral}
            nervePeripheral={nervePeripheral}
            skullNodes={skullNodes}
            skullNames={skullNames}
            onWarm={onWarm}
            probeRef={probeRef}
            pickEl={layerEl}
            getPanes={getPanes}
            onHover={hoverStable}
            onMove={moveStable}
            onPick={pickStable}
            onMiss={missStable}
          />
        )}
        {children}
        <LabelUpdater items={labelItems} lab={lab} enabled={labelsOn} centre={centre} solid={solid} dims={dims} tick={obsTick} />
        <OrbitControls
          makeDefault
          domElement={mainEl ?? undefined}
          enableDamping
          dampingFactor={0.12}
          screenSpacePanning
          zoomToCursor
          minDistance={0.05}
          maxDistance={1.2}
          mouseButtons={NAV_MOUSE}
          touches={NAV_TOUCH}
        />
        {/* (interaction overhaul) trackpad pan, double-click / double-tap pivot */}
        <NavExtras el={mainEl} wheelEl={layerEl} />
        <Rig box={skullBox ?? box} brain={skullBox ?? ctxBox} view={view} nonce={nonce} frameTick={frameTick} lockView={lockView} zoom={zoom} multi={multi} dims={dims} fixed={fixedCams} fixedDims={fixedDims} moved={moved} sizeKey={sizeKey} paneView={paneView} fixedBase={fixedBase} />
        {multi && <MultiRender panes={panes} invalidateRef={invalidateRef} />}
      </Canvas>

      {/* interaction layer: one cell, or the 2x2 multi-view grid (anterior, lateral, superior, free orbit) */}
      <div ref={setLayerEl} className={`absolute inset-0 ${multi ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-px" : ""}`}>
        {multi &&
          FIXED_PANES.map((p, i) => (
            <div key={p.id} ref={(el) => void (cellRefs.current[i] = el)} className="atl-multi-cell" style={{ touchAction: "none", cursor: "grab" }}>
              <span className="atl-ptitle-row">
                <button
                  type="button"
                  className="atl-ptitle"
                  onClick={() => {
                    setMulti(false);
                    setViewUser(p.view);
                  }}
                  aria-label={`${p.label} view, click to enlarge`}
                  title="Click to enlarge"
                >
                  {p.label}
                </button>
                <button type="button" className="atl-ptitle" onClick={() => resetPane(i)} aria-label={`Reset ${p.label} pan and zoom`} title="Reset pan and zoom (double-click the pane)">
                  <RotateCcw size={11} aria-hidden />
                </button>
              </span>
            </div>
          ))}
        <div ref={setMainEl} className={multi ? "atl-multi-cell" : "absolute inset-0"} style={{ touchAction: "none" }}>
          {multi && <span className="atl-ptitle pointer-events-none">Free orbit</span>}
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={() => it.sid && onPickMesh?.(it.sid)}
                  className={`pointer-events-auto absolute left-0 top-0 cursor-pointer whitespace-nowrap rounded-sm border bg-panel px-1.5 text-[11px] leading-[20px] text-text backdrop-blur ${active?.key === it.key ? "brightness-125" : ""}`}
                  style={{ borderColor: it.color, borderLeftWidth: 4, height: 22, transform: "translate(-999px,-999px)" }}
                >
                  {it.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!quiz && tip && !hoverKey && (
        <div ref={tipRef} className="pointer-events-none absolute left-0 top-0 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-panel-border bg-panel-solid px-2 py-1 text-xs text-text shadow-pop">
          {tipLocked && <Lock className="h-3 w-3 text-text-faint" aria-hidden="true" />}
          <span className={tipLocked ? "text-text-dim" : ""}>{tip}</span>
          {tipLocked && <span className="text-text-faint">not on your syllabus</span>}
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[60%] flex-col items-start gap-1">
        {title && !multi && !(structureTools || onDeselect) && (
          <div className="atl-chip">
            <span className="font-display tracking-wide text-accent">{title}</span>
            {latin && <span className="hidden text-xs italic text-text-dim sm:inline">{latin}</span>}
          </div>
        )}
        {/* (interaction overhaul) selection chip: name, "Show its cut", an obvious X */}
        {title && !multi && (structureTools || onDeselect) && (
          <div data-atl-obstacle="" className="atl-chip pointer-events-auto flex-col items-stretch gap-1 !py-1" role="group" aria-label={`Selected: ${title}`}>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate font-display tracking-wide text-accent">{title}</span>
              {latin && <span className="hidden truncate text-xs italic text-text-dim sm:inline">{latin}</span>}
              {structureTools && box && solidCuts && !sCut && (
                <Popover
                  up={false}
                  trigger={({ open, toggle }) => (
                    <button type="button" className="atl-cutbtn" aria-expanded={open} onClick={toggle} title="Show only the section through this structure">
                      <ScanLine size={13} aria-hidden /> <span className="max-sm:hidden">Show its cut</span>
                    </button>
                  )}
                >
                  {(close) =>
                    (Object.keys(PLANE_AXIS) as CutPlaneName[]).map((pl) => (
                      <MenuItem
                        key={pl}
                        label={`${PLANE_LABEL[pl]} cut through it`}
                        onClick={() => {
                          showCut(pl);
                          close();
                        }}
                      />
                    ))
                  }
                </Popover>
              )}
              {onDeselect && (
                <button type="button" className="atl-xbtn" aria-label={`Deselect ${title} (Esc)`} title="Deselect (Esc)" onClick={onDeselect}>
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
            {sCut && (
              <div className="flex flex-wrap items-center gap-1 border-t border-panel-border pt-1 text-[11px]">
                <span className="text-text-faint">Its cut:</span>
                <span className="atl-seg" role="radiogroup" aria-label="Plane of the cut through the structure">
                  {(Object.keys(PLANE_AXIS) as CutPlaneName[]).map((pl) => (
                    <IconBtn key={pl} radio on={sCut.plane === pl} label={`${PLANE_LABEL[pl]} cut through it`} text={narrow ? PLANE_LABEL[pl].slice(0, 3) : PLANE_LABEL[pl]} onClick={() => showCut(pl)} />
                  ))}
                </span>
                <button type="button" className="atl-cutbtn" onClick={wholeStructure} title="Back to the whole structure">
                  <Undo2 size={12} aria-hidden /> Whole structure
                </button>
              </div>
            )}
          </div>
        )}
        {sectionKeyShown.length > 0 && !multi && (
          <div className="atl-chip pointer-events-auto flex-col items-stretch gap-1 !py-1.5" role="group" aria-label="Colour key for the section">
            <button type="button" className="flex items-center gap-1.5 rounded-sm font-mono text-[10px] uppercase tracking-widest text-text-dim focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]" onClick={() => setKeyOpen((o) => !o)} aria-expanded={keyOpen}>
              {keyOpen ? <ChevronDown size={11} aria-hidden /> : <ChevronUp size={11} aria-hidden />} Section key
            </button>
            {keyOpen && (
              <ul className="grid gap-0.5 text-[11px] text-text">
                {sectionKeyShown.map((k) => (
                  <li key={k.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-panel-border" style={{ background: k.colour }} aria-hidden />
                    {k.name}
                  </li>
                ))}
              </ul>
            )}
            {keyOpen && (
              <label className="mt-0.5 flex cursor-pointer items-center gap-1.5 border-t border-panel-border pt-1 text-[11px] text-text-dim">
                <input type="checkbox" className="accent-[var(--accent)]" checked={colourCuts} onChange={(e) => setColourCuts(e.target.checked)} />
                Colour structures
              </label>
            )}
          </div>
        )}
        {approximate && <div className="atl-chip w-fit border-hard font-mono text-[10px] uppercase tracking-widest text-hard">Approximate location</div>}
      </div>

      {notice && (
        <div className="atl-card-in pointer-events-none absolute left-1/2 top-12 z-20 max-w-[90%] -translate-x-1/2 sm:top-2" role="status">
          <div className="atl-chip text-text-dim">{notice}</div>
        </div>
      )}

      {overlay}

      {!indexError && !(shown && warmed && (gross || look === "xray")) ? (
        <AtlasLoader
          label="Loading the 3D atlas"
          stages={stagesFrom([
            ["index", "Reading the structure index", !!index],
            ["model", "Fetching the brain model", !!gross || look === "xray", grossProg.total ? mbText(grossProg.loaded, grossProg.total) : undefined],
            ["meshes", "Building meshes", !!shown && !!gross, gross ? `${grossIds.size} gyri and nuclei` : undefined],
            ["shaders", "Compiling shaders", warmed],
            ["labels", "Placing labels", !!current && warmed],
          ])}
        />
      ) : deepLoading ? (
        <div className="atl-chip pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-wider text-text-dim" role="status">
          Loading deep structures...
        </div>
      ) : !current && !indexError ? (
        <div className="atl-chip pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-wider text-text-dim" role="status">
          Loading...
        </div>
      ) : null}
      {(indexError || current?.error || missing) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-text-dim" role="alert">
          {missing ? "This structure has no 3D model in the atlas." : "The 3D atlas could not be loaded."}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center gap-1.5">
        {!quiz && <NavHint deselect={!!onDeselect} />}
        {clipEff.axis !== "off" && !cut && (
          <div className="atl-bar pointer-events-auto items-center gap-2 px-2">
            {sCutOn && sCut ? (
              // (interaction overhaul) "Show its cut": the slider moves the plane within the structure's own extent
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(Math.min(1, Math.max(0, (clipRange[0] + clip.t * (clipRange[1] - clipRange[0]) - sCut.lo) / Math.max(1e-6, sCut.hi - sCut.lo))) * 1000)}
                onChange={(e) => {
                  const pos = sCut.lo + (Number(e.target.value) / 1000) * (sCut.hi - sCut.lo);
                  setClip((c) => ({ ...c, t: (pos - clipRange[0]) / (clipRange[1] - clipRange[0]) }));
                }}
                aria-label={`Cut position through ${title}`}
                className="w-40 sm:w-56"
              />
            ) : (
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(clip.t * 1000)}
                onChange={(e) => setClip((c) => ({ ...c, t: Number(e.target.value) / 1000 }))}
                aria-label="Cut position"
                className="w-40 sm:w-56"
              />
            )}
            <IconBtn label="Flip the cut side" icon={<FlipHorizontal2 />} onClick={() => setClip((c) => ({ ...c, flip: !c.flip }))} />
          </div>
        )}
        <div ref={barRef} className={`atl-bar pointer-events-auto${narrow ? " atl-narrow" : ""}`} role="toolbar" aria-label="3D view controls">
          <IconBtn label={barOpen ? "Hide controls" : "Show controls"} icon={barOpen ? <ChevronDown /> : <ChevronUp />} onClick={() => setBarOpen((o) => !o)} />
          {barOpen && (
            <>
              <Divider />
              {!multi && (
                <Group label="View">
                  <Popover trigger={({ open, toggle }) => <IconBtn label="Camera view" keys="1-7" icon={<Orbit />} text={narrow ? undefined : VIEW_SHORT[view]} on={open} onClick={toggle} />}>
                    {(close) =>
                      VIEWS.filter((v) => !v.hidden).map((v) => (
                        <MenuItem
                          key={v.id}
                          label={v.label}
                          keys={VIEW_KEYS[v.id]}
                          on={view === v.id}
                          onClick={() => {
                            setViewUser(v.id);
                            close();
                          }}
                        />
                      ))
                    }
                  </Popover>
                  <IconBtn label="Frame the selection from this side" keys="F" icon={<Crosshair />} onClick={() => setFrameTick((n) => n + 1)} />
                  <IconBtn
                    label={lockView ? "View locked: choosing a structure will not move the camera" : "Lock the view (stop the camera following the selection)"}
                    on={lockView}
                    onClick={() => setLockView((l) => !l)}
                    icon={lockView ? <Lock /> : <LockOpen />}
                  />
                </Group>
              )}
              {!cut && (
                <>
                  {!multi && <Divider />}
                  <Group label="Cut">
                    {CLIP_AXES.map((a) => (
                      <IconBtn
                        key={a.id}
                        radio
                        label={a.label}
                        keys={a.key}
                        on={clip.axis === a.id}
                        onClick={() => pickAxis(a.id)}
                        icon={a.id === "off" ? <CutNoneIcon /> : a.id === "z" ? <CutCoronalIcon /> : a.id === "x" ? <CutSagittalIcon /> : <CutTransverseIcon />}
                      />
                    ))}
                  </Group>
                </>
              )}
              <Divider />
              <Group label="Look">
                {LOOKS.map((l) => (
                  <IconBtn key={l.id} radio label={l.label} keys={l.key} on={look === l.id} onClick={() => setLook(l.id)} icon={l.id === "brain" ? <Brain /> : l.id === "regions" ? <Palette /> : <ScanLine />} />
                ))}
                {look !== "xray" && (
                  <>
                    <span className="atl-div" aria-hidden="true" />
                    <IconBtn radio label="Solid cortex" keys="V" on={solid} onClick={() => setSolidPref(true)} icon={<SolidIcon />} />
                    <IconBtn radio label="See-through (find deep structures)" keys="V" on={!solid} onClick={() => setSolidPref(false)} icon={<SeeThroughIcon />} />
                  </>
                )}
              </Group>
              <Divider />
              <Group label="Toggles">
                {!quiz && !hideLabels && <IconBtn label={showLabels ? "Hide labels" : "Show labels"} keys="L" on={showLabels} onClick={() => setShowLabels((s) => !s)} icon={<Tag />} />}
                <IconBtn label={showCtx ? "Hide shell" : "Show shell"} keys="H" on={showCtx} onClick={() => setShowCtx((s) => !s)} icon={<ShellIcon />} />
                {onToggleNeighbors && <IconBtn label="Highlight neighbours" keys="G" on={neighbors} onClick={onToggleNeighbors} icon={<NeighborIcon />} />}
                {shortcuts && !layerMissing && <IconBtn label={layerOn ? "Hide the skull and spine layer" : "Show the skull and spine layer"} keys="K" on={layerOn} onClick={() => setLayerOv({ auto: layerAuto, v: !layerOn })} icon={<Bone />} />}
                {shortcuts && <IconBtn label={showNerves ? "Hide the cranial nerves" : "Show the cranial nerves (roots and course to the skull exits)"} keys="E" on={showNerves} onClick={() => setShowNerves(!showNerves)} icon={<Cable />} />}
                {shortcuts && showNerves && <IconBtn label={nervePeripheral ? "Hide the peripheral branches of the cranial nerves" : "Show the peripheral branches of the cranial nerves"} keys="Shift+E" on={nervePeripheral} onClick={() => setNervePeripheral(!nervePeripheral)} icon={<GitBranch />} />}
                {shortcuts && <IconBtn label={showBrainstem ? "Hide the brainstem" : "Show the brainstem"} keys="W" on={showBrainstem} onClick={() => setShowBrainstem(!showBrainstem)} icon={<Sprout />} />}
              </Group>
              <Divider />
              <Group label="Layout">
                {multiview && !cut && <IconBtn label="Multi-view (anterior, lateral, superior, free)" keys="M" on={multi} onClick={toggleMulti} icon={<LayoutGrid />} />}
                {canFs && <IconBtn label={fsOn ? "Exit full screen" : "Full screen"} keys="Z" on={fsOn} onClick={toggleFs} icon={fsOn ? <Minimize2 /> : <Maximize2 />} />}
                {toolbarExtra}
                <NavHelpButton deselect={!!onDeselect} />
              </Group>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
