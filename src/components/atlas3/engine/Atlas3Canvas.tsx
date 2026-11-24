"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { NAV_MOUSE, NAV_TOUCH, NavExtras } from "@/components/atlas/ui/navigation";
import { LabelState, loadBody, loadIndex3, loadPatches, loadVessels, type Index3, type Label3, type Prog } from "./data";
import { makeGlassMaterial, makeHollowMaterial, makePatchMaterial, makeSelGhostMaterial, makeStateTexture, makeUniforms, type PatchUniforms } from "./patchMaterial";
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
  superior: [0, 1, -0.0001],
  inferior: [0, -1, 0.0001],
  "medial-left": [-1, 0, 0],
  "medial-right": [1, 0, 0],
};
export type Cut3 = { axis: "x" | "y" | "z"; pos: number; flip?: boolean };
/** a name pin on a label (id), or at a point (p, world metres) */
export type Pin3 = { id: number; text: string; p?: [number, number, number] };
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
  /** the veil group of each ghosted label (default: fluid 2, tissue 1): borders inside one group are not drawn */
  ghostCls?: Record<number, number>;
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
  focus?: { ids: number[]; box?: [[number, number, number], [number, number, number]]; nonce: number } | null;
  /** a tract drawn as fibres: polylines, world metres */
  fibres?: number[][] | null;
  /** the arteries and sinuses, these keys lit (null: no vessels) */
  vessels?: string[] | null;
  /** the body layer (skull, meninges, spine and cord, eye, ear, nose): parts shown, parts lit, and the meninges' cut
   * faces staggered by this many metres per layer (outer layers kept further toward the viewer, so they ring the cut) */
  body?: { show: string[]; lit: string[]; stagger?: number; glass?: boolean } | null;
  /** a tint over the brain's whole outside surface (the pia) */
  skin?: string | null;
  /** "tracer": the copy of the atlas in the Pathway tracer's frame (Blood supply draws its own vessels there) */
  frame?: "atlas" | "tracer";
  /** the outside surface as one see-through layer of this opacity, with the arterial territories (tracer frame only) */
  glass?: number | null;
  /** the territories: per artery index (1..), a colour and how strongly it shows (0 none) */
  territories?: { color: string; alpha: number }[] | null;
  /** the territories on one side only (the patient's side) */
  territorySide?: "L" | "R";
  /** extra three.js content drawn in the same scene (Blood supply's vessels and veins) */
  children?: React.ReactNode;
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
function setTerritories(u: PatchUniforms, pu: PatchUniforms, tex: THREE.DataTexture, terr: { color: string; alpha: number }[] | null, glass: number, side: number, cut: boolean) {
  const d = tex.image.data as Uint8Array;
  d.fill(0);
  (terr ?? []).forEach((t, i) => {
    if (i >= 16 || !t) return;
    const c = new THREE.Color(t.color);
    d[i * 4] = Math.round(c.r * 255);
    d[i * 4 + 1] = Math.round(c.g * 255);
    d[i * 4 + 2] = Math.round(c.b * 255);
    d[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, t.alpha)) * 255);
  });
  tex.needsUpdate = true;
  for (const x of [u, pu]) {
    x.uTerr.value = tex;
    x.uGlass.value = glass;
    x.uTerrSide.value = side;
    x.uGlassCap.value = cut ? 1 : 0;
  }
}
function setRegionUniforms(u: PatchUniforms, sulcus: number, areaMask: number) {
  u.uSulc.value = sulcus;
  u.uAreaMask.value = areaMask;
}
function setCapNormal(u: PatchUniforms, n: THREE.Vector3) {
  u.uCapN.value.copy(n);
}
/* outlines of the cut faces. Natural look: soft where the tissue changes (grey / white matter / fluid), as a real section
 * shows it, and a faint trace of every other structure's border; regions look: every border crisp. */
const TISSUE_CLASS: Record<string, number> = { ctx: 1, cbx: 1, gm: 1, wm: 2, tract: 2, bs: 2, csf: 3, plx: 4, nrv: 5 };
function setLineLook(m: LineMaterial, faint: LineMaterial, regions: boolean) {
  m.color.set(regions ? 0x2b2421 : 0x54453d);
  m.opacity = regions ? 0.8 : 0.45;
  m.linewidth = regions ? 1.15 : 0.95;
  m.needsUpdate = true;
  faint.opacity = regions ? 0 : 0.2;
  faint.needsUpdate = true;
}
function setSkin(u: PatchUniforms, skin: string | null | undefined) {
  if (!skin) u.uSkin.value.set(0, 0, 0, 0);
  else {
    const c = new THREE.Color(skin);
    u.uSkin.value.set(c.r, c.g, c.b, 0.5);
  }
}
/* the body layer's look, by kind: colour and (for see-through kinds) opacity; layer: the meninges' order outwards */
const BODY_STYLE: Record<string, { color: string; opacity?: number; layer?: number }> = {
  bone: { color: "#e3d8c2", layer: 4 },
  suture: { color: "#6e4a30", layer: 4 },
  region: { color: "#e3d8c2", layer: 4 },
  ring: { color: "#ffc14d" },
  dura: { color: "#c4ad86", opacity: 0.5, layer: 2 },
  disc: { color: "#9db6c6" },
  "cord-wm": { color: "#efe8dc", opacity: 0.2 },
  "cord-gm": { color: "#a8917c" },
  "xs-wm": { color: "#efe8da" },
  "xs-tract": { color: "#e2d8c6" },
  "xs-gm": { color: "#9d8a80" },
  "xs-nuc": { color: "#8c7a71" },
  tract: { color: "#d6c9b6", opacity: 0.45 },
  csf: { color: "#5f9fd6" },
  nerve: { color: "#d4c597" },
  ganglion: { color: "#c8b47e" },
  artery: { color: "#b8443c" },
  space: { color: "#7fb0d8", opacity: 0.28 },
  "space-subarachnoid": { color: "#5f9fd6", opacity: 0.5, layer: 1 },
  "space-subdural": { color: "#b9b2ee", opacity: 0.45, layer: 2 },
  "space-epidural": { color: "#efcf8a", opacity: 0.45, layer: 3 },
  arachnoid: { color: "#d8d4ea", opacity: 0.4, layer: 1 },
  pia: { color: "#e58a8a", opacity: 0.6 },
  "eye-sclera": { color: "#f2eee4", opacity: 0.5 },
  "eye-cornea": { color: "#cfe5ff", opacity: 0.35 },
  "eye-iris": { color: "#6b4a2b" },
  "eye-lens": { color: "#f1e4bf", opacity: 0.8 },
  "eye-retina": { color: "#cf604b" },
  "eye-choroid": { color: "#5e2b2b" },
  "eye-vitreous": { color: "#cfe0ff", opacity: 0.2 },
  "eye-aqueous": { color: "#cfe6ff", opacity: 0.28 },
  ear: { color: "#e6d3a3" },
  epith: { color: "#d88f78" },
  groove: { color: "#ffc14d" },
  nucleus: { color: "#c98a5a" },
};
const BODY_SEE = new Set(Object.entries(BODY_STYLE).filter(([, s]) => s.opacity !== undefined).map(([k]) => k));
/** bone kinds that the skull-and-spine layer can draw see-through */
const BONE_KINDS = new Set(["bone", "suture", "disc", "region"]);
function bodyMaterial(kind: string, lit: boolean, glass = false): THREE.MeshLambertMaterial {
  const st = BODY_STYLE[kind] ?? { color: "#cccccc" };
  if (glass && !lit) {
    // the skull and spine over the brain: their near surface only, faint, so the brain reads through them
    // (a suture is a seam in the bone: a faint line at most, never a dark stroke across the brain)
    const m = new THREE.MeshLambertMaterial({ color: kind === "suture" ? "#9c8466" : st.color, side: THREE.FrontSide, transparent: true, opacity: kind === "suture" ? 0.22 : 0.2, depthWrite: false });
    m.userData.layer = st.layer ?? 0;
    return m;
  }
  const see = st.opacity !== undefined;
  const m = new THREE.MeshLambertMaterial({
    color: lit ? "#ffc14d" : st.color,
    emissive: lit ? "#4a3200" : "#000000",
    side: THREE.DoubleSide,
    // a lit see-through part (a space, the vitreous ...) is all but solid, so it reads over the veils around it
    transparent: see,
    opacity: see ? (lit ? 0.88 : st.opacity!) : 1,
    depthWrite: !see || lit,
    // a lit region is a part of a bone or a section drawn again over it: it wins the depth test
    polygonOffset: lit,
    polygonOffsetFactor: lit ? -2 : 0,
    polygonOffsetUnits: lit ? -4 : 0,
  });
  m.userData.layer = st.layer ?? 0;
  return m;
}
function setBodyClip(mats: Map<string, THREE.MeshLambertMaterial>, planes: THREE.Plane[], plane: THREE.Plane, mid: THREE.Plane, stagger: number) {
  for (const m of mats.values()) {
    const k = stagger ? (m.userData.layer as number) : 0;
    m.clippingPlanes = k ? [new THREE.Plane(plane.normal.clone(), plane.constant + k * stagger), mid] : planes;
  }
}
function swapLines(ls: LineSegments2, g: LineSegmentsGeometry, v: boolean) {
  ls.geometry.dispose();
  ls.geometry = g;
  ls.visible = v;
}
const IN = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3);
type Geo = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
type Tip = { name: string; sub: string; x: number; y: number };

/* what the pointer is over, beyond its name: the kind of tissue a cut face shows and where the section is, measured from
 * the anterior commissure (the atlas's origin) */
const TISSUE_WORD: Record<string, string> = {
  ctx: "Cortex (grey matter)",
  cbx: "Cerebellar cortex (grey matter)",
  gm: "Grey matter (a nucleus)",
  wm: "White matter",
  tract: "White matter tract",
  bs: "Brainstem tissue",
  csf: "CSF-filled cavity, opened by the cut",
  plx: "Choroid plexus",
  nrv: "Nerve",
};
function sectionWhere(cut: Cut3 | null | undefined, midline: boolean): string {
  if (!cut) return midline ? "the midline (sagittal) cut face" : "";
  const mm = Math.round(cut.pos * 1000);
  const n = Math.abs(mm);
  if (cut.axis === "z") return `coronal section, ${n ? `${n} mm ${mm > 0 ? "anterior" : "posterior"} to` : "through"} the anterior commissure`;
  if (cut.axis === "y") return `horizontal section, ${n ? `${n} mm ${mm > 0 ? "above" : "below"}` : "at"} the level of the anterior commissure`;
  return `sagittal section, ${n ? `${n} mm ${mm > 0 ? "left" : "right"} of` : "at"} the midline`;
}

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
  // the side a cut removes (the selection is drawn there as a faint veil)
  const planeInv = useMemo(() => IN.clone(), []);
  const selPlanes = useMemo(() => [planeInv, midPlane], [planeInv, midPlane]);
  const [shell, setShell] = useState<Geo | null>(null);
  const [inner, setInner] = useState<Geo | null>(null);
  const [hull, setHull] = useState<Geo | null>(null);
  const byId = useMemo(() => new Map(index.labels.map((l) => [l.id, l])), [index]);
  const hideSides = useMemo(() => props.hideSides ?? [], [props.hideSides]);
  const hideKey = hideSides.join(",");
  const needInner = !!props.cut || hideSides.length > 0 || (props.hiddenIds?.length ?? 0) > 0 || props.glass != null;
  const fr = props.frame === "tracer" ? "_f" : "";
  const ghosting = (props.ghostIds?.length ?? 0) > 0;
  const onProgress = props.onProgress;

  useEffect(() => {
    let alive = true;
    loadPatches(`shell${fr}` as "shell", (p) => onProgress?.(p, "shell")).then((g) => alive && setShell(g));
    return () => {
      alive = false;
    };
  }, [onProgress, fr]);
  useEffect(() => {
    if (!props.ghost || hull) return;
    let alive = true;
    loadPatches(`hull${fr}` as "hull").then((g) => alive && setHull(g));
    return () => {
      alive = false;
    };
  }, [props.ghost, hull, fr]);
  useEffect(() => {
    if (!needInner || inner) return;
    let alive = true;
    loadPatches(`inner${fr}` as "inner", (p) => onProgress?.(p, "inner")).then((g) => alive && setInner(g));
    return () => {
      alive = false;
    };
  }, [needInner, inner, onProgress, fr]);

  const mats = useMemo(() => {
    const ms = makePatchMaterial(uniforms, true), mi = makePatchMaterial(uniforms, false);
    const ps = makePatchMaterial(pickUniforms, true), pi = makePatchMaterial(pickUniforms, false);
    const gs = makePatchMaterial(uniforms, true, true), gi = makePatchMaterial(uniforms, false, true);
    const glass = makeGlassMaterial(uniforms), pglass = makeGlassMaterial(pickUniforms, true);
    // the glass's depth pass sits a hair behind the surface (polygon offset), so the glass itself always passes its test
    // while every layer behind the nearest one fails it
    const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    const hs = makeHollowMaterial(uniforms, true), hi = makeHollowMaterial(uniforms, false);
    const ss = makeSelGhostMaterial(uniforms, true), si = makeSelGhostMaterial(uniforms, false);
    for (const m of [ms, mi, ps, pi, gs, gi, glass, pglass, depth, hs, hi]) m.clippingPlanes = planes;
    for (const m of [ss, si]) m.clippingPlanes = selPlanes;
    return { ms, mi, ps, pi, gs, gi, glass, pglass, depth, hs, hi, ss, si, ghost: makeGhostMaterial(planes) };
  }, [uniforms, pickUniforms, planes, selPlanes]);
  const meshes = useMemo(() => {
    const out: { shell?: THREE.Mesh; inner?: THREE.Mesh; pShell?: THREE.Mesh; pInner?: THREE.Mesh; ghost?: THREE.Mesh; gShell?: THREE.Mesh; gInner?: THREE.Mesh; glass?: THREE.Mesh; glassDepth?: THREE.Mesh; pGlass?: THREE.Mesh; hShell?: THREE.Mesh; hInner?: THREE.Mesh; sShell?: THREE.Mesh; sInner?: THREE.Mesh } = {};
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
      // the glass brain: the surface's depth after everything opaque inside it, then its colour over it, nearest layer only
      out.glassDepth = mk(shell, mats.depth);
      out.glassDepth.renderOrder = 10;
      out.glass = mk(shell, mats.glass);
      out.glass.renderOrder = 11;
      out.pGlass = mk(shell, mats.pglass);
      out.hShell = mk(shell, mats.hs);
      out.hShell.renderOrder = 3;
      out.sShell = mk(shell, mats.ss);
      out.sShell.renderOrder = 6;
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
      out.hInner = mk(inner, mats.hi);
      out.hInner.renderOrder = 3;
      out.sInner = mk(inner, mats.si);
      out.sInner.renderOrder = 6;
    }
    return out;
  }, [shell, inner, hull, mats]);
  const pickScene = useMemo(() => new THREE.Scene(), []);
  // through the glass brain the structures shown inside it are picked first (owner 2026-11-24: with the thalamus's
  // supply highlighted, the cortex in front of it must not take the click); the surface only where none is hit
  const deepPickScene = useMemo(() => new THREE.Scene(), []);
  const glassOn = props.glass != null;
  const glassSurface = glassOn && (props.glass ?? 0) > 0;
  useEffect(() => {
    pickScene.clear();
    deepPickScene.clear();
    if (glassOn) {
      if (glassSurface && meshes.pGlass) pickScene.add(meshes.pGlass);
      if (meshes.pInner && needInner) deepPickScene.add(meshes.pInner);
    } else {
      if (meshes.pShell) pickScene.add(meshes.pShell);
      if (meshes.pInner && needInner) pickScene.add(meshes.pInner);
    }
    pickScene.updateMatrixWorld(true);
    deepPickScene.updateMatrixWorld(true);
  }, [meshes, pickScene, deepPickScene, needInner, glassOn, glassSurface]);

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
      state.setGhost(l.id, ghosted.has(l.id) && !sideOff ? (props.ghostCls?.[l.id] ?? (l.tissue === "csf" ? 2 : 1)) : 0);
      state.setSel(l.id, selected.has(l.id));
      state.setHollow(l.id, l.tissue === "csf");
      const [c, a] = tintOf(l.id);
      state.setTint(l.id, c, a);
    }
    state.commit();
    invalidate();
  }, [index, state, props.look, props.colors, props.ghostCls, hidden, ghosted, selected, hideSides, tintOf, invalidate]);

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
  // ---------------- the territories (Blood supply): a 16 x 1 colour table, the glass's opacity
  const terrTex = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array(16 * 4), 16, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }, []);
  useEffect(() => {
    setTerritories(uniforms, pickUniforms, terrTex, props.territories ?? null, props.glass ?? 1, props.territorySide === "L" ? 1 : props.territorySide === "R" ? -1 : 0, !!props.cut);
    invalidate();
  }, [uniforms, pickUniforms, terrTex, props.territories, props.glass, props.territorySide, props.cut, invalidate]);
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
    planeInv.set(plane.normal.clone().negate(), -plane.constant);
    invalidate();
  }, [props.cut, plane, planeInv, invalidate]);
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
  const faintMat = useMemo(() => new LineMaterial({ color: 0x54453d, linewidth: 0.8, transparent: true, opacity: 0.2, depthWrite: false }), []);
  const faintLines = useMemo(() => {
    const ls = new LineSegments2(new LineSegmentsGeometry(), faintMat);
    ls.renderOrder = 4;
    ls.frustumCulled = false;
    ls.visible = false;
    return ls;
  }, [faintMat]);
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

  // ---------------- a tract's fibres: bright strokes with a dark edge under them, so they read over any surface
  const fibreMats = useMemo(
    () => ({
      // drawn in order, the dark edge then the bright core; the edge writes no depth, so the core is never hidden by it
      edge: new LineMaterial({ color: 0x241b12, linewidth: 4.4, depthWrite: false }),
      core: new LineMaterial({ color: 0xffc14d, linewidth: 2.4 }),
    }),
    [],
  );
  const fibreObj = useMemo(() => {
    // one continuous line per fibre (joined at its bends), each drawn twice: the dark edge, then the bright core
    const grp = new THREE.Group();
    const gs: LineGeometry[] = [];
    for (const l of props.fibres ?? []) {
      if (l.length < 6) continue;
      const g = new LineGeometry();
      g.setPositions(l);
      gs.push(g);
      const edge = new Line2(g, fibreMats.edge);
      const core = new Line2(g, fibreMats.core);
      for (const o of [edge, core]) o.frustumCulled = false;
      edge.renderOrder = 3;
      core.renderOrder = 3.5;
      grp.add(edge, core);
    }
    grp.visible = gs.length > 0;
    return { grp, gs };
  }, [props.fibres, fibreMats]);
  useEffect(() => {
    for (const m of [fibreMats.edge, fibreMats.core]) {
      m.resolution.set(size.width, size.height);
      m.clippingPlanes = planes;
    }
    invalidate();
  }, [fibreMats, size, planes, invalidate]);
  useEffect(() => () => fibreObj.gs.forEach((g) => g.dispose()), [fibreObj]);

  // ---------------- the vessels: arteries red, sinuses blue, the selected ones gold, lit by lights that ride the camera
  const [vessels, setVessels] = useState<Awaited<ReturnType<typeof loadVessels>> | null>(null);
  const wantVessels = !!props.vessels;
  useEffect(() => {
    if (!wantVessels || vessels) return;
    let alive = true;
    loadVessels().then((v) => alive && setVessels(v));
    return () => {
      alive = false;
    };
  }, [wantVessels, vessels]);
  const vesselMats = useMemo(
    () => ({
      artery: new THREE.MeshLambertMaterial({ color: "#b8443c" }),
      sinus: new THREE.MeshLambertMaterial({ color: "#4a6aa8" }),
      lit: new THREE.MeshLambertMaterial({ color: "#ffc14d", emissive: "#4a3200" }),
    }),
    [],
  );
  useEffect(() => {
    for (const m of Object.values(vesselMats)) m.clippingPlanes = planes;
  }, [vesselMats, planes]);
  const vesselGroup = useMemo(() => {
    const g = new THREE.Group();
    if (!vessels) return g;
    const lit = new Set(props.vessels ?? []);
    for (const v of vessels.meta) {
      const m = vessels.meshes.get(v.key);
      if (!m) continue;
      const me = new THREE.Mesh(m.geometry, lit.has(v.key) ? vesselMats.lit : v.kind === "sinus" ? vesselMats.sinus : vesselMats.artery);
      me.matrixAutoUpdate = false;
      me.matrix.copy(m.matrix);
      me.frustumCulled = false;
      me.renderOrder = 1;
      g.add(me);
    }
    return g;
  }, [vessels, props.vessels, vesselMats]);
  // ---------------- the body layer: each part by its kind, the lit ones gold; the meninges' cut faces staggered
  const [bodyData, setBodyData] = useState<Awaited<ReturnType<typeof loadBody>> | null>(null);
  const wantBody = !!props.body;
  useEffect(() => {
    if (!wantBody || bodyData) return;
    let alive = true;
    loadBody().then((b) => alive && setBodyData(b));
    return () => {
      alive = false;
    };
  }, [wantBody, bodyData]);
  const bodyMats = useMemo(
    () =>
      new Map<string, THREE.MeshLambertMaterial>(
        Object.keys(BODY_STYLE).flatMap((k) => [[k, bodyMaterial(k, false)] as const, [`${k}:lit`, bodyMaterial(k, true)] as const, ...(BONE_KINDS.has(k) ? [[`${k}:glass`, bodyMaterial(k, false, true)] as const] : [])]),
      ),
    [],
  );
  const bodyGroup = useMemo(() => {
    const g = new THREE.Group();
    if (!bodyData || !props.body) return g;
    const kindOf = new Map(bodyData.meta.map((p) => [p.key, p.kind]));
    const lit = new Set(props.body.lit);
    // "@bones": every bone, suture and disc of the skull and the spine (the skull-and-spine layer)
    const keys = new Set<string>();
    for (const k of [...props.body.show, ...props.body.lit]) {
      if (k === "@bones") for (const p of bodyData.meta) if ((p.group === "skull" || p.group === "spine") && (p.kind === "bone" || p.kind === "suture" || p.kind === "disc")) keys.add(p.key);
      else keys.add(k);
    }
    for (const key of keys) {
      const m = bodyData.meshes.get(key);
      const kind = kindOf.get(key);
      if (!m || !kind) continue;
      const lk = lit.has(key) ? ":lit" : props.body.glass && BONE_KINDS.has(kind) ? ":glass" : "";
      const mat = bodyMats.get(`${kind}${lk}`) ?? bodyMats.get(`bone${lk}`)!;
      const me = new THREE.Mesh(m.geometry, mat);
      me.matrixAutoUpdate = false;
      me.matrix.copy(m.matrix);
      me.frustumCulled = false;
      me.renderOrder = BODY_SEE.has(kind) || lk === ":glass" ? 7 : 1;
      me.raycast = () => {};
      g.add(me);
    }
    return g;
  }, [bodyData, props.body, bodyMats]);
  const stagger = props.cut ? (props.body?.stagger ?? 0) : 0;
  useEffect(() => {
    setBodyClip(bodyMats, planes, plane, midPlane, stagger);
    invalidate();
  }, [bodyMats, bodyGroup, planes, plane, midPlane, stagger, props.cut, invalidate]);
  useEffect(() => {
    setSkin(uniforms, props.skin);
    invalidate();
  }, [uniforms, props.skin, invalidate]);
  const camLight = useMemo(() => new THREE.DirectionalLight("#ffffff", 1.9), []);
  const wantLights = wantVessels || wantBody;
  useFrame(() => {
    if (!wantLights) return;
    camLight.position.copy(camera.position).add(new THREE.Vector3(-0.2, 0.3, 0).applyQuaternion(camera.quaternion));
    camLight.target.position.copy((controls as unknown as OrbitControlsImpl | null)?.target ?? new THREE.Vector3());
    camLight.target.updateMatrixWorld();
  });
  useEffect(() => {
    const active = [props.cut ? plane : null, hideSides.length === 1 ? midPlane : null].filter((p): p is THREE.Plane => !!p);
    if (!active.length || !arrays.length) {
      if (lines.visible || faintLines.visible) {
        setShown(lines, false);
        setShown(faintLines, false);
        invalidate();
      }
      return;
    }
    // at once (binned triangles: a millisecond or two), so the outline moves with the cut
    const regions = props.look === "regions";
    const og = (id: number) => byId.get(id)?.og ?? id;
    const tissue = (id: number) => 100000 + (TISSUE_CLASS[byId.get(id)?.tissue ?? ""] ?? id);
    const build = (group: (id: number) => number) => {
      const parts = active.map((p) => {
        const seg = cutSegments(arrays, p, (id) => state.visible(id), group);
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
      return seg;
    };
    const put = (ls: LineSegments2, seg: Float32Array | null) => {
      const g = new LineSegmentsGeometry();
      if (seg?.length) g.setPositions(seg);
      swapLines(ls, g, !!seg?.length);
    };
    put(lines, build(regions ? og : tissue));
    put(faintLines, regions ? null : build(og));
    invalidate();
  }, [props.cut, props.look, arrays, plane, midPlane, state, lines, faintLines, invalidate, hidden, ghosted, hideSides, byId]);
  useEffect(() => {
    setLineLook(lineMat, faintMat, props.look === "regions");
    invalidate();
  }, [lineMat, faintMat, props.look, invalidate]);
  useEffect(() => {
    faintMat.resolution.set(size.width, size.height);
  }, [faintMat, size]);
  // the cut plane's normal in view space, for the sheen of the cut faces
  const capN = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const p = props.cut ? plane : hideSides.length === 1 ? midPlane : null;
    if (!p) return;
    capN.copy(p.normal).transformDirection(camera.matrixWorldInverse);
    setCapNormal(uniforms, capN);
  });

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
    if (!box || !props.focus || (!props.focus.ids.length && !props.focus.box)) return;
    const b = new THREE.Box3();
    if (props.focus.box) b.union(new THREE.Box3(new THREE.Vector3(...props.focus.box[0]), new THREE.Vector3(...props.focus.box[1])));
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
    // the body layer (skull, spine, eye ...): what it draws counts too, and it frames closer and farther than the brain
    const brainDrawn = !drawn.isEmpty();
    const bodyBoxes = props.body && bodyData ? new Map(bodyData.meta.map((p) => [p.key, p.box])) : null;
    let bodyDrawn = false;
    for (const k of bodyBoxes ? [...props.body!.show, ...props.body!.lit].filter((x) => x !== "@bones") : []) {
      const bb = bodyBoxes!.get(k);
      if (!bb) continue;
      drawn.union(new THREE.Box3(new THREE.Vector3(...bb[0]), new THREE.Vector3(...bb[1])));
      bodyDrawn = true;
    }
    if (drawn.isEmpty()) drawn.copy(box);
    // what a cut removes is not drawn: the camera may come down to the cut face (a cord's section from above)
    if (props.cut && bodyDrawn) {
      const ax = props.cut.axis === "x" ? 0 : props.cut.axis === "y" ? 1 : 2;
      if (props.cut.flip) drawn.min.setComponent(ax, Math.max(drawn.min.getComponent(ax), props.cut.pos));
      else drawn.max.setComponent(ax, Math.min(drawn.max.getComponent(ax), props.cut.pos));
    }
    const sc = drawn.getCenter(new THREE.Vector3());
    const R = drawn.getSize(new THREE.Vector3()).length() / 2;
    const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, props.body ? 0.012 : 0.018);
    const home = Math.min(homeDist(), (R / halfFovSin(cam)) * 0.9);
    // (a part of the body layer by itself may come close; one shown with the brain keeps the brain's distance)
    let dist = props.body ? Math.max((r / halfFovSin(cam)) * 1.25, home * (brainDrawn ? 0.42 : 0.12)) : Math.min(home, Math.max((r / halfFovSin(cam)) * 1.35, home * 0.42));
    const d = dir.clone().normalize();
    // straight down or up (an axial cut): nudged as the superior and inferior views are, so the screen's axes are
    // settled (the front at the top)
    if (Math.abs(d.y) > 0.9999) d.set(0, Math.sign(d.y), d.y > 0 ? -0.0001 : 0.0001).normalize();
    if (bodyDrawn) {
      // never inside what is drawn: out of its box along the view direction (a sphere around a whole spine is too far)
      let tOut = Infinity;
      for (let k = 0; k < 3; k++) {
        const dk = d.getComponent(k);
        if (Math.abs(dk) < 1e-6) continue;
        const t = ((dk > 0 ? drawn.max.getComponent(k) : drawn.min.getComponent(k)) - c.getComponent(k)) / dk;
        tOut = Math.min(tOut, Math.max(0, t));
      }
      if (Number.isFinite(tOut)) dist = Math.max(dist, tOut + 0.012);
    } else {
      // never inside what is drawn: at least out to its bounding sphere along the view direction
      const oc = c.clone().sub(sc);
      const bq = oc.dot(d), cq = oc.lengthSq() - R * R * 1.02;
      const tOut = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
      dist = Math.max(dist, tOut + 0.01);
    }
    // a panel over the right of the stage: move the view so the structure sits in the middle of the free part
    const inset = Math.min(props.insetRight ?? 0, size.width * 0.5);
    const target = c.clone();
    if (inset > 0 && size.width > 0) {
      const right = new THREE.Vector3().crossVectors(d.clone().negate(), new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 1e-14) right.set(1, 0, 0); // (a nudged top-down view has a tiny but true right)
      right.normalize();
      const halfW = dist * Math.tan((cam.fov * Math.PI) / 360) * (size.width / Math.max(1, size.height));
      target.addScaledVector(right, (inset / size.width) * halfW);
    }
    flyTo(target, d, dist);
  }, [focusNonce, box, bodyData]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const order = deepPickScene.children.length ? [deepPickScene, pickScene] : [pickScene];
      for (const sc of order) {
        gl.clear();
        gl.render(sc, cam);
        gl.readRenderTargetPixels(target, 0, 0, 1, 1, px);
        if (px[3] !== 0) break;
      }
      gl.setRenderTarget(prev);
      gl.setClearAlpha(alpha);
      cam.clearViewOffset();
      if (px[3] === 0) return null;
      return { id: px[0] + px[1] * 256, cap: px[2] > 127 };
    },
    [camera, gl, pickScene, deepPickScene, px, target],
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
  const cutRef = useRef(props.cut);
  useEffect(() => {
    cutRef.current = props.cut;
  }, [props.cut]);
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
      // over a cut face: what tissue it is and where the section lies, not just "cut face"
      const sub = l && h?.cap ? [TISSUE_WORD[l.tissue] ?? "", sectionWhere(cutRef.current, hideSides.length === 1)].filter(Boolean).join(" · ") : "";
      setTip(l && !quiz ? { name: tipText ? tipText(l) : l.name + (l.side === "L" ? " (left)" : l.side === "R" ? " (right)" : ""), sub, x: last.clientX - r.left, y: last.clientY - r.top } : null);
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
  }, [gl, pick, state, tintOf, invalidate, setTip, onHover, onPick, tipText, byId, quiz, hideSides]);

  // ---------------- name pins
  const pins = useMemo(() => {
    const out: { key: string; text: string; pos: THREE.Vector3 }[] = [];
    for (const p of props.pins ?? []) {
      if (p.p) {
        out.push({ key: `p:${p.text}:${p.p.join(",")}`, text: p.text, pos: new THREE.Vector3(...p.p) });
        continue;
      }
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
      {meshes.shell && props.glass == null && <primitive object={meshes.shell} />}
      {meshes.glass && meshes.glassDepth && props.glass != null && props.glass > 0 && (
        <>
          <primitive object={meshes.glassDepth} />
          <primitive object={meshes.glass} />
        </>
      )}
      {meshes.inner && needInner && <primitive object={meshes.inner} />}
      {/* the hollow spaces' casts (see-through), wherever the inside of the brain is drawn */}
      {meshes.hInner && needInner && <primitive object={meshes.hInner} />}
      {meshes.hShell && needInner && <primitive object={meshes.hShell} />}
      {/* the selection where the cut removes it: a faint veil */}
      {meshes.sShell && props.cut && selected.size > 0 && <primitive object={meshes.sShell} />}
      {meshes.sInner && props.cut && selected.size > 0 && <primitive object={meshes.sInner} />}
      {meshes.ghost && props.ghost && <primitive object={meshes.ghost} />}
      {meshes.gShell && ghosting && <primitive object={meshes.gShell} />}
      {meshes.gInner && ghosting && needInner && <primitive object={meshes.gInner} />}
      <primitive object={faintLines} />
      <primitive object={lines} />
      <primitive object={fibreObj.grp} />
      {props.children}
      {wantLights && (
        <>
          <ambientLight intensity={0.55} />
          <primitive object={camLight} />
          <primitive object={camLight.target} />
        </>
      )}
      {wantVessels && <primitive object={vesselGroup} />}
      {wantBody && <primitive object={bodyGroup} />}
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
          {tip.sub && <span className="atl3-tip-note">{tip.sub}</span>}
        </div>
      )}
    </div>
  );
}
