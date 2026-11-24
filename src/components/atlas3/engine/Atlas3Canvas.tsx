"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NAV_MOUSE, NAV_TOUCH, NavExtras } from "@/components/atlas/ui/navigation";
import { LabelState, loadIndex3, loadPatches, type Index3, type Label3, type Prog } from "./data";
import { makePatchMaterial, makeStateTexture, makeUniforms, type PatchUniforms } from "./patchMaterial";
import { makeGhostMaterial, setGhostMode } from "./ghostMaterial";
import { readCssColor } from "@/lib/atlas/theme";
import { capColor, regionColor, surfaceColor, HOVER, SELECT } from "./palette";
import { cutSegments, patchArrays, type PatchArrays } from "./cutLines";

export type View3 = "left" | "right" | "anterior" | "posterior" | "superior" | "inferior" | "medial-left" | "medial-right";
export const VIEW_DIRS: Record<View3, [number, number, number]> = {
  left: [1, 0, 0],
  right: [-1, 0, 0],
  anterior: [0, 0, 1],
  posterior: [0, 0, -1],
  superior: [0, 1, 0.0001],
  inferior: [0, -1, 0.0001],
  "medial-left": [-1, 0, 0],
  "medial-right": [1, 0, 0],
};
export type Cut3 = { axis: "x" | "y" | "z"; pos: number; flip?: boolean };
export type Pin3 = { id: number; text: string };
/** a translucent sheet across the brain at a plane (world metres along the axis) */
export type Guide3 = { axis: "x" | "y" | "z"; pos: number; color: string };
export interface Atlas3Props {
  view?: View3;
  /** bump to re-aim the camera at `view` */
  viewNonce?: number;
  cut?: Cut3 | null;
  /** hemispheres hidden (patient's side): clipped away at the midline */
  hideSides?: ("L" | "R")[];
  hiddenIds?: number[];
  /** hidden, but drawn as a see-through veil (the brainstem around one of its nuclei); fluid spaces get their own veil */
  ghostIds?: number[];
  /** the see-through outside surface over whatever is visible (deep-structures mode) */
  ghost?: boolean;
  selected?: number[];
  /** tint the visible labels that are not selected toward grey */
  dimOthers?: boolean;
  look?: "natural" | "regions";
  /** a sulcus to light (its id; -1 every named sulcus) and functional areas (bit mask) on the outside surface */
  sulcus?: number;
  areaMask?: number;
  /** per-label colour overrides (surface and cut face) */
  colors?: Record<number, string>;
  /** pixels on the right covered by a panel (the structure card): a focused structure is framed in the free part */
  insetRight?: number;
  /** fly the camera to these labels (applied once per nonce) */
  focus?: { ids: number[]; nonce: number } | null;
  pins?: Pin3[];
  guides?: Guide3[];
  /** the standard views' distance, as a share of the one that frames the whole brain (below 1: closer) */
  zoom?: number;
  /** no names anywhere (quiz) */
  quiz?: boolean;
  onHover?: (l: Label3 | null, cap: boolean) => void;
  /** the hover name of a label (default: its name and side) */
  tipText?: (l: Label3) => string;
  onPick?: (l: Label3 | null) => void;
  onReady?: (index: Index3) => void;
  onProgress?: (p: Prog, what: "shell" | "inner") => void;
}

const DIM = "#8a8784";
/* Imperative three.js helpers live outside the components (the hooks lint treats objects from hooks as immutable). */
function applyCamRange(cam: THREE.PerspectiveCamera, d: number) {
  cam.near = d / 80;
  cam.far = d * 8;
  cam.up.set(0, 1, 0);
  cam.updateProjectionMatrix();
}
function setShown(o: THREE.Object3D, v: boolean) {
  o.visible = v;
}
/** sine of the half field of view that limits framing: the vertical one, or the horizontal one on a portrait screen */
function halfFovSin(cam: THREE.PerspectiveCamera) {
  const v = (cam.fov * Math.PI) / 360;
  return Math.sin(Math.atan(Math.tan(v) * Math.min(1, cam.aspect || 1)));
}
/** Is the page light? (the veils are drawn as ink there) */
function pageIsLight() {
  const c = readCssColor("--bg", "#101418");
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.45;
}
function setLightUniforms(us: PatchUniforms[], ghost: THREE.ShaderMaterial, light: boolean) {
  for (const u of us) u.uOnLight.value = light ? 1 : 0;
  setGhostMode(ghost, light);
}
function setRegionUniforms(u: PatchUniforms, sulcus: number, areaMask: number) {
  u.uSulc.value = sulcus;
  u.uAreaMask.value = areaMask;
}
function swapLines(ls: LineSegments2, g: LineSegmentsGeometry, v: boolean) {
  ls.geometry.dispose();
  ls.geometry = g;
  ls.visible = v;
}
const IN = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3);
type Geo = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
type Tip = { name: string; cap: boolean; x: number; y: number };

/* ------------------------------------------------------------------ the scene */
type PinDom = Map<string, HTMLDivElement>;
function Network({ index, props, setTip, setPins, pinDom }: { index: Index3; props: Atlas3Props; setTip: (t: Tip | null) => void; setPins: (p: { key: string; text: string }[]) => void; pinDom: React.RefObject<PinDom> }) {
  const { gl, camera, invalidate, controls, size } = useThree();
  const n = useMemo(() => Math.max(...index.labels.map((l) => l.id)) + 1, [index]);
  const state = useMemo(() => new LabelState(makeStateTexture(n)), [n]);
  const uniforms = useMemo(() => makeUniforms(state.tex), [state]);
  const pickUniforms = useMemo<PatchUniforms>(() => ({ ...makeUniforms(state.tex), uPick: { value: 1 } }), [state]);
  const plane = useMemo(() => IN.clone(), []);
  const midPlane = useMemo(() => IN.clone(), []);
  const planes = useMemo(() => [plane, midPlane], [plane, midPlane]);
  const [shell, setShell] = useState<Geo | null>(null);
  const [inner, setInner] = useState<Geo | null>(null);
  const [hull, setHull] = useState<Geo | null>(null);
  const byId = useMemo(() => new Map(index.labels.map((l) => [l.id, l])), [index]);
  const hideSides = useMemo(() => props.hideSides ?? [], [props.hideSides]);
  const hideKey = hideSides.join(",");
  const needInner = !!props.cut || hideSides.length > 0 || (props.hiddenIds?.length ?? 0) > 0;
  const ghosting = (props.ghostIds?.length ?? 0) > 0;
  const onProgress = props.onProgress;

  useEffect(() => {
    let alive = true;
    loadPatches("shell", (p) => onProgress?.(p, "shell")).then((g) => alive && setShell(g));
    return () => {
      alive = false;
    };
  }, [onProgress]);
  useEffect(() => {
    if (!props.ghost || hull) return;
    let alive = true;
    loadPatches("hull").then((g) => alive && setHull(g));
    return () => {
      alive = false;
    };
  }, [props.ghost, hull]);
  useEffect(() => {
    if (!needInner || inner) return;
    let alive = true;
    loadPatches("inner", (p) => onProgress?.(p, "inner")).then((g) => alive && setInner(g));
    return () => {
      alive = false;
    };
  }, [needInner, inner, onProgress]);

  const mats = useMemo(() => {
    const ms = makePatchMaterial(uniforms, true), mi = makePatchMaterial(uniforms, false);
    const ps = makePatchMaterial(pickUniforms, true), pi = makePatchMaterial(pickUniforms, false);
    const gs = makePatchMaterial(uniforms, true, true), gi = makePatchMaterial(uniforms, false, true);
    for (const m of [ms, mi, ps, pi, gs, gi]) m.clippingPlanes = planes;
    return { ms, mi, ps, pi, gs, gi, ghost: makeGhostMaterial(planes) };
  }, [uniforms, pickUniforms, planes]);
  const meshes = useMemo(() => {
    const out: { shell?: THREE.Mesh; inner?: THREE.Mesh; pShell?: THREE.Mesh; pInner?: THREE.Mesh; ghost?: THREE.Mesh; gShell?: THREE.Mesh; gInner?: THREE.Mesh } = {};
    const mk = (g: Geo, m: THREE.Material) => {
      const me = new THREE.Mesh(g.geometry, m);
      me.matrixAutoUpdate = false;
      me.matrix.copy(g.matrix);
      me.matrixWorldNeedsUpdate = true;
      me.frustumCulled = false;
      return me;
    };
    if (shell) {
      out.shell = mk(shell, mats.ms);
      out.pShell = mk(shell, mats.ps);
      out.gShell = mk(shell, mats.gs);
      out.gShell.renderOrder = 4;
    }
    if (hull) {
      out.ghost = mk(hull, mats.ghost);
      out.ghost.renderOrder = 5;
    }
    if (inner) {
      out.inner = mk(inner, mats.mi);
      out.pInner = mk(inner, mats.pi);
      out.gInner = mk(inner, mats.gi);
      out.gInner.renderOrder = 4;
    }
    return out;
  }, [shell, inner, hull, mats]);
  const pickScene = useMemo(() => new THREE.Scene(), []);
  useEffect(() => {
    pickScene.clear();
    if (meshes.pShell) pickScene.add(meshes.pShell);
    if (meshes.pInner && needInner) pickScene.add(meshes.pInner);
    pickScene.updateMatrixWorld(true);
  }, [meshes, pickScene, needInner]);

  // ---------------- label state: colours, visibility, tints
  const selected = useMemo(() => new Set(props.selected ?? []), [props.selected]);
  const hidden = useMemo(() => new Set(props.hiddenIds ?? []), [props.hiddenIds]);
  const ghosted = useMemo(() => new Set(props.ghostIds ?? []), [props.ghostIds]);
  const hoverRef = useRef<number | null>(null);
  const dim = !!props.dimOthers && selected.size > 0;
  const quiz = !!props.quiz;
  const tintOf = useCallback(
    (id: number): [string | null, number] => {
      if (id === hoverRef.current && !quiz) return [HOVER, selected.has(id) ? 0.5 : 0.32];
      if (selected.has(id)) return [SELECT, 0.55];
      if (dim) return [DIM, 0.5];
      return [null, 0];
    },
    [selected, dim, quiz],
  );
  useEffect(() => {
    for (const l of index.labels) {
      const over = props.colors?.[l.id];
      const reg = props.look === "regions" ? regionColor(l) : null;
      state.setSurface(l.id, over ?? reg ?? surfaceColor(l));
      state.setCap(l.id, over ?? capColor(l));
      const sideOff = l.side !== "M" && hideSides.includes(l.side);
      state.setVisible(l.id, !hidden.has(l.id) && !ghosted.has(l.id) && !sideOff);
      state.setGhost(l.id, ghosted.has(l.id) && !sideOff ? (l.tissue === "csf" ? 2 : 1) : 0);
      const [c, a] = tintOf(l.id);
      state.setTint(l.id, c, a);
    }
    state.commit();
    invalidate();
  }, [index, state, props.look, props.colors, hidden, ghosted, hideSides, tintOf, invalidate]);

  // the page's light or dark mode (followed live): the see-through veils change ink
  useEffect(() => {
    const update = () => {
      setLightUniforms([uniforms], mats.ghost, pageIsLight());
      invalidate();
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, [uniforms, mats, invalidate]);
  useEffect(() => {
    setRegionUniforms(uniforms, props.sulcus ?? 0, props.areaMask ?? 0);
    invalidate();
  }, [uniforms, props.sulcus, props.areaMask, invalidate]);

  // ---------------- clip planes: the cut keeps the side below pos (removes the high side), or the other side when flipped
  useEffect(() => {
    const c = props.cut;
    if (!c) plane.copy(IN);
    else {
      const nrm = new THREE.Vector3(c.axis === "x" ? 1 : 0, c.axis === "y" ? 1 : 0, c.axis === "z" ? 1 : 0);
      if (c.flip) plane.set(nrm, -c.pos);
      else plane.set(nrm.negate(), c.pos);
    }
    invalidate();
  }, [props.cut, plane, invalidate]);
  useEffect(() => {
    // a hidden hemisphere is clipped away at the midline: midline structures show their midsagittal cut faces
    if (hideSides.includes("R") && !hideSides.includes("L")) midPlane.set(new THREE.Vector3(1, 0, 0), 0);
    else if (hideSides.includes("L") && !hideSides.includes("R")) midPlane.set(new THREE.Vector3(-1, 0, 0), 0);
    else midPlane.copy(IN);
    invalidate();
  }, [hideKey, hideSides, midPlane, invalidate]);

  // ---------------- cut outlines, from the triangles the planes cross
  const arrays = useMemo(() => {
    const a: PatchArrays[] = [];
    if (shell) a.push(patchArrays(shell.geometry, shell.matrix));
    if (inner) a.push(patchArrays(inner.geometry, inner.matrix));
    return a;
  }, [shell, inner]);
  const lineMat = useMemo(() => new LineMaterial({ color: 0x2b2421, linewidth: 1.15, transparent: true, opacity: 0.8 }), []);
  const lines = useMemo(() => {
    const ls = new LineSegments2(new LineSegmentsGeometry(), lineMat);
    ls.frustumCulled = false;
    ls.renderOrder = 2;
    ls.visible = false;
    return ls;
  }, [lineMat]);
  useEffect(() => {
    lineMat.resolution.set(size.width, size.height);
  }, [lineMat, size]);
  useEffect(() => {
    const active = [props.cut ? plane : null, hideSides.length === 1 ? midPlane : null].filter((p): p is THREE.Plane => !!p);
    if (!active.length || !arrays.length) {
      if (lines.visible) {
        setShown(lines, false);
        invalidate();
      }
      return;
    }
    const t = window.setTimeout(() => {
      const parts = active.map((p) => {
        const seg = cutSegments(arrays, p, (id) => state.visible(id), (id) => byId.get(id)?.og ?? id);
        const others = active.filter((q) => q !== p);
        if (!others.length) return seg;
        const keep: number[] = [];
        for (let i = 0; i < seg.length; i += 6) {
          const ok = others.every((q) => q.normal.x * seg[i] + q.normal.y * seg[i + 1] + q.normal.z * seg[i + 2] + q.constant >= 0 && q.normal.x * seg[i + 3] + q.normal.y * seg[i + 4] + q.normal.z * seg[i + 5] + q.constant >= 0);
          if (ok) for (let k = 0; k < 6; k++) keep.push(seg[i + k]);
        }
        return new Float32Array(keep);
      });
      const seg = new Float32Array(parts.reduce((s, a) => s + a.length, 0));
      let off = 0;
      for (const a of parts) {
        seg.set(a, off);
        off += a.length;
      }
      const g = new LineSegmentsGeometry();
      if (seg.length) g.setPositions(seg);
      swapLines(lines, g, seg.length > 0);
      invalidate();
    }, 30);
    return () => window.clearTimeout(t);
  }, [props.cut, arrays, plane, midPlane, state, lines, invalidate, hidden, ghosted, hideSides, byId]);

  // ---------------- camera
  const box = useMemo(() => {
    if (!shell) return null;
    shell.geometry.computeBoundingBox();
    return shell.geometry.boundingBox!.clone().applyMatrix4(shell.matrix);
  }, [shell]);
  const anim = useRef(0);
  const flyTo = useCallback(
    (target: THREE.Vector3, dir: THREE.Vector3, dist: number, ms = 420) => {
      const cam = camera as THREE.PerspectiveCamera;
      const ctl = controls as unknown as OrbitControlsImpl | null;
      cancelAnimationFrame(anim.current);
      const t0 = ctl ? ctl.target.clone() : target.clone();
      const p0 = cam.position.clone();
      const p1 = target.clone().addScaledVector(dir.clone().normalize(), dist);
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const dur = reduce ? 0 : ms;
      const s0 = performance.now();
      const step = (now: number) => {
        const k = dur ? Math.min(1, (now - s0) / dur) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        cam.position.lerpVectors(p0, p1, e);
        if (ctl) {
          ctl.target.lerpVectors(t0, target, e);
          ctl.update();
        } else cam.lookAt(target);
        invalidate();
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [camera, controls, invalidate],
  );
  const homeDist = useCallback(() => {
    if (!box) return 0.5;
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    return (r / halfFovSin(camera as THREE.PerspectiveCamera)) * 0.9;
  }, [box, camera]);
  const firstView = useRef(true);
  // has the user turned the camera since the last view change? (then a new selection keeps their direction)
  const userMoved = useRef(false);
  useEffect(() => {
    const ctl = controls as unknown as (OrbitControlsImpl & { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }) | null;
    if (!ctl) return;
    const on = () => (userMoved.current = true);
    ctl.addEventListener("start", on);
    return () => ctl.removeEventListener("start", on);
  }, [controls]);
  useEffect(() => {
    if (!box) return;
    const cam = camera as THREE.PerspectiveCamera;
    const c = box.getCenter(new THREE.Vector3());
    const d = homeDist() * (props.zoom ?? 1);
    applyCamRange(cam, homeDist());
    flyTo(c, new THREE.Vector3(...VIEW_DIRS[props.view ?? "left"]), d, firstView.current ? 0 : 420);
    firstView.current = false;
    userMoved.current = false;
  }, [box, camera, props.view, props.viewNonce, props.zoom, homeDist, flyTo]);
  const focusNonce = props.focus?.nonce;
  useEffect(() => {
    if (!box || !props.focus || !props.focus.ids.length) return;
    const b = new THREE.Box3();
    for (const id of props.focus.ids) {
      const l = byId.get(id);
      if (l?.bbox) b.union(new THREE.Box3(new THREE.Vector3(...l.bbox[0]), new THREE.Vector3(...l.bbox[1])));
    }
    if (b.isEmpty()) return;
    const cam = camera as THREE.PerspectiveCamera;
    const ctl = controls as unknown as OrbitControlsImpl | null;
    const c = b.getCenter(new THREE.Vector3());
    // look at a cut face square on; else keep the user's direction, or the requested view's
    const dir = props.cut ? plane.normal.clone().negate() : userMoved.current ? cam.position.clone().sub(ctl ? ctl.target : c) : new THREE.Vector3(...VIEW_DIRS[props.view ?? "left"]);
    // what is drawn: the whole brain, or only a part of it (the brainstem view, one hemisphere)
    const drawn = new THREE.Box3();
    if (props.ghost) drawn.copy(box);
    for (const l of index.labels) {
      if (!l.bbox) continue;
      const sideOff = l.side !== "M" && hideSides.includes(l.side);
      if (!sideOff && (ghosted.has(l.id) || !hidden.has(l.id))) drawn.union(new THREE.Box3(new THREE.Vector3(...l.bbox[0]), new THREE.Vector3(...l.bbox[1])));
    }
    if (drawn.isEmpty()) drawn.copy(box);
    const sc = drawn.getCenter(new THREE.Vector3());
    const R = drawn.getSize(new THREE.Vector3()).length() / 2;
    const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.018);
    const home = Math.min(homeDist(), (R / halfFovSin(cam)) * 0.9);
    let dist = Math.min(home, Math.max((r / halfFovSin(cam)) * 1.35, home * 0.42));
    // never inside what is drawn: at least out to its bounding sphere along the view direction
    const d = dir.clone().normalize();
    const oc = c.clone().sub(sc);
    const bq = oc.dot(d), cq = oc.lengthSq() - R * R * 1.02;
    const tOut = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
    dist = Math.max(dist, tOut + 0.01);
    // a panel over the right of the stage: move the view so the structure sits in the middle of the free part
    const inset = Math.min(props.insetRight ?? 0, size.width * 0.5);
    const target = c.clone();
    if (inset > 0 && size.width > 0) {
      const right = new THREE.Vector3().crossVectors(d.clone().negate(), new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize();
      const halfW = dist * Math.tan((cam.fov * Math.PI) / 360) * (size.width / Math.max(1, size.height));
      target.addScaledVector(right, (inset / size.width) * halfW);
    }
    flyTo(target, d, dist);
  }, [focusNonce, box]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- GPU picking: the id render of one pixel (label + whether it is a cut face)
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }), []);
  const px = useMemo(() => new Uint8Array(4), []);
  const pick = useCallback(
    (cx: number, cy: number): { id: number; cap: boolean } | null => {
      const cam = camera as THREE.PerspectiveCamera;
      const el = gl.domElement;
      const r = el.getBoundingClientRect();
      const dpr = gl.getPixelRatio();
      const W = Math.floor(r.width * dpr), H = Math.floor(r.height * dpr);
      const x = Math.floor((cx - r.left) * dpr), y = Math.floor((cy - r.top) * dpr);
      if (x < 0 || y < 0 || x >= W || y >= H) return null;
      cam.setViewOffset(W, H, x, y, 1, 1);
      const prev = gl.getRenderTarget();
      const alpha = gl.getClearAlpha();
      gl.setRenderTarget(target);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(pickScene, cam);
      gl.readRenderTargetPixels(target, 0, 0, 1, 1, px);
      gl.setRenderTarget(prev);
      gl.setClearAlpha(alpha);
      cam.clearViewOffset();
      if (px[3] === 0) return null;
      return { id: px[0] + px[1] * 256, cap: px[2] > 127 };
    },
    [camera, gl, pickScene, px, target],
  );
  // the surface point under the pointer (double-click pivot): the nearest ray hit that survives the clip planes and
  // belongs to a drawn region
  const pointAt = useCallback(
    (cx: number, cy: number): THREE.Vector3 | null => {
      if (!pick(cx, cy)) return null;
      const el = gl.domElement;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const ms = [meshes.shell, needInner ? meshes.inner : undefined].filter((m): m is THREE.Mesh => !!m);
      const hits = ms.flatMap((m) => ray.intersectObject(m, false)).sort((a, b) => a.distance - b.distance);
      for (const hit of hits) {
        if (planes.some((p) => p.distanceToPoint(hit.point) < 0)) continue;
        const lab = (hit.object as THREE.Mesh).geometry.getAttribute("_labels");
        const v = hit.face?.a ?? 0;
        const a = lab.getX(v), b = lab.getY(v);
        if ((a > 0 && state.visible(a)) || (b > 0 && state.visible(b))) return hit.point.clone();
      }
      return null;
    },
    [pick, gl, camera, meshes, needInner, planes, state],
  );

  // ---------------- hover + click
  const onHover = props.onHover, onPick = props.onPick, tipText = props.tipText;
  useEffect(() => {
    const el = gl.domElement;
    let raf = 0;
    let last: PointerEvent | null = null;
    let down: { x: number; y: number } | null = null;
    const setHoverId = (id: number | null) => {
      const prev = hoverRef.current;
      hoverRef.current = id;
      for (const k of [prev, id]) {
        if (k === null) continue;
        const [c, a] = tintOf(k);
        state.setTint(k, c, a);
      }
      state.commit();
      invalidate();
    };
    const run = () => {
      raf = 0;
      if (!last) return;
      const h = pick(last.clientX, last.clientY);
      const id = h?.id ?? null;
      const r = el.getBoundingClientRect();
      if (id !== hoverRef.current) {
        setHoverId(id);
        onHover?.(id !== null ? (byId.get(id) ?? null) : null, !!h?.cap);
      }
      const l = id !== null ? byId.get(id) : undefined;
      setTip(l && !quiz ? { name: tipText ? tipText(l) : l.name + (l.side === "L" ? " (left)" : l.side === "R" ? " (right)" : ""), cap: !!h?.cap, x: last.clientX - r.left, y: last.clientY - r.top } : null);
    };
    const move = (e: PointerEvent) => {
      last = e;
      if (e.buttons) {
        setTip(null);
        return;
      }
      if (!raf) raf = requestAnimationFrame(run);
    };
    const leave = () => {
      last = null;
      setHoverId(null);
      setTip(null);
      onHover?.(null, false);
    };
    const pd = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const pu = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const h = pick(e.clientX, e.clientY);
      onPick?.(h ? (byId.get(h.id) ?? null) : null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointerup", pu);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointerup", pu);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [gl, pick, state, tintOf, invalidate, setTip, onHover, onPick, tipText, byId, quiz]);

  // ---------------- name pins
  const pins = useMemo(() => {
    const out: { key: string; text: string; pos: THREE.Vector3 }[] = [];
    for (const p of props.pins ?? []) {
      const l = byId.get(p.id);
      if (!l) continue;
      const deep = props.ghost || !l.exterior || needInner;
      const q = (deep ? l.centroid : l.anchor) ?? l.centroid;
      if (q) out.push({ key: `${p.id}`, text: p.text, pos: new THREE.Vector3(...q) });
    }
    return out;
  }, [props.pins, props.ghost, byId, needInner]);

  useEffect(() => {
    setPins(quiz ? [] : pins.map((p) => ({ key: p.key, text: p.text })));
    invalidate();
  }, [pins, quiz, setPins, invalidate]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const dom = pinDom.current;
    if (!dom || !dom.size) return;
    const placed: { x: number; y: number; z: number; w: number; el: HTMLDivElement; vis: boolean }[] = [];
    for (const p of pins) {
      const el = dom.get(p.key);
      if (!el) continue;
      v.copy(p.pos).project(camera);
      const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height;
      const w = el.offsetWidth || 100;
      let vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      // the two pins of a pair whose labels would overlap (seen edge-on, or side by side from behind): keep the nearer
      for (const q of placed) {
        if (!q.vis || !vis) continue;
        if (Math.abs(q.x - x) < (q.w + w) / 2 + 6 && Math.abs(q.y - y) < 26) {
          if (v.z < q.z) {
            q.el.style.opacity = "0";
            q.vis = false;
          } else vis = false;
        }
      }
      el.style.opacity = vis ? "1" : "0";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      placed.push({ x, y, z: v.z, w, el, vis });
    }
  });

  return (
    <>
      {meshes.shell && <primitive object={meshes.shell} />}
      {meshes.inner && needInner && <primitive object={meshes.inner} />}
      {meshes.ghost && props.ghost && <primitive object={meshes.ghost} />}
      {meshes.gShell && ghosting && <primitive object={meshes.gShell} />}
      {meshes.gInner && ghosting && needInner && <primitive object={meshes.gInner} />}
      <primitive object={lines} />
      {box &&
        (props.guides ?? []).map((g, i) => {
          const sz = box.getSize(new THREE.Vector3()).multiplyScalar(1.15);
          const c = box.getCenter(new THREE.Vector3());
          const pos: [number, number, number] = g.axis === "x" ? [g.pos, c.y, c.z] : g.axis === "y" ? [c.x, g.pos, c.z] : [c.x, c.y, g.pos];
          const rot: [number, number, number] = g.axis === "x" ? [0, Math.PI / 2, 0] : g.axis === "y" ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
          const wh: [number, number] = g.axis === "x" ? [sz.z, sz.y] : g.axis === "y" ? [sz.x, sz.z] : [sz.x, sz.y];
          return (
            <mesh key={i} position={pos} rotation={rot} renderOrder={6}>
              <planeGeometry args={wh} />
              <meshBasicMaterial color={g.color} transparent opacity={0.32} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          );
        })}
      <NavExtras pick={pointAt} />
    </>
  );
}

export function Atlas3Canvas(props: Atlas3Props) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [pins, setPins] = useState<{ key: string; text: string }[]>([]);
  const pinDom = useRef<PinDom>(new Map());
  const onReady = props.onReady;
  useEffect(() => {
    let alive = true;
    loadIndex3().then((ix) => {
      if (!alive) return;
      setIndex(ix);
      onReady?.(ix);
    });
    return () => {
      alive = false;
    };
  }, [onReady]);
  return (
    <div className="atl3-canvas" style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 30, position: [0.5, 0, 0], near: 0.005, far: 5 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.setClearColor(0x000000, 0);
        }}
      >
        {index && <Network index={index} props={props} setTip={setTip} setPins={setPins} pinDom={pinDom} />}
        <OrbitControls makeDefault enableDamping={false} rotateSpeed={0.9} zoomSpeed={1.1} zoomToCursor mouseButtons={NAV_MOUSE} touches={NAV_TOUCH} />
      </Canvas>
      <div className="atl3-pins" aria-hidden>
        {pins.map((p) => (
          <div
            key={p.key}
            className="atl3-pin"
            ref={(el) => {
              if (el) pinDom.current.set(p.key, el);
              else pinDom.current.delete(p.key);
            }}
          >
            {p.text}
          </div>
        ))}
      </div>
      {tip && (
        <div className="atl3-tip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          {tip.name}
          {tip.cap && <span className="atl3-tip-sub">cut face</span>}
        </div>
      )}
    </div>
  );
}
