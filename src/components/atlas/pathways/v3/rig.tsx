"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/* The beat camera. User input always wins: the first grab (pointer, wheel, touch or the controls' own start) cancels any tween
 * and locks the view; beats never move a locked camera again until Frame (F), a view button or another pathway. A move is a calm
 * glide (owner: "a nice calm mellow follow"): it orbits around the target (direction and up turned on the sphere, distance
 * changed geometrically, never a straight cut through the brain), eases in and out over 1.3-2.6 s depending on how far it
 * travels, and a new goal mid-glide carries on from the current motion instead of stopping first. Ends exactly on the goal. */

export type ViewName = "beat" | "anterior" | "posterior" | "left" | "right" | "superior" | "inferior" | "coronal" | "oblique" | "oblique-front";
export interface ViewDef {
  dir: [number, number, number];
  up: [number, number, number];
}
/** Patient's left = +x, anterior = +z, up = +y. Posterior and superior views put the patient's left on the viewer's left (as the diagrams do). */
export const VIEW_DEFS: Record<Exclude<ViewName, "beat">, ViewDef> = {
  anterior: { dir: [0, 0, 1], up: [0, 1, 0] },
  posterior: { dir: [0, 0, -1], up: [0, 1, 0] },
  left: { dir: [1, 0, 0], up: [0, 1, 0] },
  right: { dir: [-1, 0, 0], up: [0, 1, 0] },
  superior: { dir: [0, 1, 0], up: [0, 0, 1] },
  inferior: { dir: [0, -1, 0], up: [0, 0, 1] },
  coronal: { dir: [0, 0, 1], up: [0, 1, 0] },
  oblique: { dir: [0.62, 0.22, -0.75], up: [0, 1, 0] },
  // in front and to the left: the face, the cranial nerves and the brainstem side by side
  "oblique-front": { dir: [0.7, 0.12, 0.7], up: [0, 1, 0] },
};
export const VIEW_LABELS: [Exclude<ViewName, "beat">, string][] = [
  ["anterior", "Anterior"],
  ["posterior", "Posterior"],
  ["left", "Lateral L"],
  ["right", "Lateral R"],
  ["superior", "Superior"],
  ["inferior", "Inferior"],
  ["coronal", "Coronal (cut)"],
];

interface Controls {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (t: string, f: () => void) => void;
  removeEventListener: (t: string, f: () => void) => void;
}

/** Distance along `dir` that fits the box in a perspective view (per-corner, on the camera's own right/up axes). */
export function fitDist(box: THREE.Box3, dir: THREE.Vector3, up: THREE.Vector3, fov: number, aspect: number, margin = 1.14) {
  const c = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const u = new THREE.Vector3().crossVectors(dir, right).normalize();
  let rr = 0, uu = 0, dd = 0;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    rr = Math.max(rr, Math.abs(p.dot(right)));
    uu = Math.max(uu, Math.abs(p.dot(u)));
    dd = Math.max(dd, Math.abs(p.dot(dir)));
  }
  const tan = Math.tan((fov * Math.PI) / 360);
  return Math.max(uu / tan, rr / (tan * Math.max(0.2, aspect))) * margin + dd + 0.006;
}

/* ---------- the glide: orbit-style interpolation with gentle easing ---------- */
interface Glide {
  t: number;
  dur: number;
  /** true when it starts while the previous glide is still moving: ease out only, so the motion carries on */
  moving: boolean;
  ft: THREE.Vector3;
  tt: THREE.Vector3;
  fdir: THREE.Vector3;
  tdir: THREE.Vector3;
  q: THREE.Quaternion;
  fdist: number;
  tdist: number;
  fu: THREE.Vector3;
  tu: THREE.Vector3;
  qu: THREE.Quaternion;
}
const ID = new THREE.Quaternion();
/** Rotation taking unit vector a onto b; a half turn goes round `axis` (the camera's up), never through an arbitrary axis. */
function turn(a: THREE.Vector3, b: THREE.Vector3, axis: THREE.Vector3) {
  if (a.dot(b) < -0.9995) return new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), Math.PI);
  return new THREE.Quaternion().setFromUnitVectors(a, b);
}
function makeGlide(pos: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3, goalTarget: THREE.Vector3, goalDir: THREE.Vector3, goalDist: number, goalUp: THREE.Vector3, moving: boolean): Glide {
  const off = pos.clone().sub(target);
  const fdist = Math.max(1e-4, off.length());
  const fdir = off.divideScalar(fdist);
  const q = turn(fdir, goalDir, up);
  const fu = up.clone().normalize();
  const qu = turn(fu, goalUp, fdir);
  const angle = Math.max(fdir.angleTo(goalDir), fu.angleTo(goalUp));
  const zoom = Math.abs(Math.log(goalDist / fdist));
  const shift = target.distanceTo(goalTarget) / Math.max(fdist, goalDist);
  const dur = Math.min(2.6, 1.3 + (0.9 * angle) / Math.PI + 0.45 * Math.min(1, zoom) + 0.5 * Math.min(1, shift));
  return { t: 0, dur, moving, ft: target.clone(), tt: goalTarget.clone(), fdir, tdir: goalDir.clone().normalize(), q, fdist, tdist: goalDist, fu, tu: goalUp.clone(), qu };
}
const ease = (t: number, moving: boolean) => (moving ? Math.sin((t * Math.PI) / 2) : 0.5 - 0.5 * Math.cos(t * Math.PI));
function stepGlide(g: Glide, t: number, pos: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) {
  if (t >= 1) {
    target.copy(g.tt);
    pos.copy(g.tt).addScaledVector(g.tdir, g.tdist);
    up.copy(g.tu).normalize();
    return;
  }
  const e = ease(t, g.moving);
  target.lerpVectors(g.ft, g.tt, e);
  const dir = g.fdir.clone().applyQuaternion(ID.clone().slerp(g.q, e)).normalize();
  const dist = g.fdist * Math.pow(g.tdist / g.fdist, e);
  pos.copy(target).addScaledVector(dir, dist);
  up.copy(g.fu).applyQuaternion(ID.clone().slerp(g.qu, e)).normalize();
}

export function Rig({ box, view, nonce, resetKey, onLock }: { box: THREE.Box3 | null; view: ViewDef; nonce: number; resetKey: string; onLock: (l: boolean) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const tween = useRef<Glide | null>(null);
  const locked = useRef(false);
  const last = useRef({ nonce: -1, reset: "" });
  const lockCb = useRef(onLock);
  useEffect(() => {
    lockCb.current = onLock;
  });
  useEffect(() => {
    const w = window as unknown as { __pwCam?: THREE.Camera; __pwRig?: () => unknown };
    w.__pwCam = camera; // read by tools/pathways/camera-test.mjs
    w.__pwRig = () => ({ locked: locked.current, tweening: !!tween.current });
  }, [camera]);
  useEffect(() => {
    const grab = () => {
      tween.current = null;
      if (!locked.current) {
        locked.current = true;
        lockCb.current(true);
      }
    };
    const el = gl.domElement;
    el.addEventListener("pointerdown", grab, true);
    el.addEventListener("wheel", grab, { capture: true, passive: true });
    el.addEventListener("touchstart", grab, { capture: true, passive: true });
    controls?.addEventListener("start", grab);
    return () => {
      el.removeEventListener("pointerdown", grab, true);
      el.removeEventListener("wheel", grab, true);
      el.removeEventListener("touchstart", grab, true);
      controls?.removeEventListener("start", grab);
    };
  }, [controls, gl]);
  useEffect(() => {
    if (!box || !controls) return;
    const forced = last.current.nonce !== nonce || last.current.reset !== resetKey;
    last.current = { nonce, reset: resetKey };
    if (forced && locked.current) {
      locked.current = false;
      lockCb.current(false);
    }
    if (locked.current) return; // the user has the camera
    const dir = new THREE.Vector3(...view.dir).normalize();
    const up = new THREE.Vector3(...view.up).normalize();
    const c = box.getCenter(new THREE.Vector3());
    const d = fitDist(box, dir, up, camera.fov, size.width / Math.max(1, size.height));
    const g = makeGlide(camera.position, controls.target, camera.up, c, dir, d, up, !!tween.current && tween.current.t > 0.15 && tween.current.t < 0.85); // a retarget in the first frames (view, then box) still eases in
    tween.current = g;
    invalidate();
  }, [box, view, nonce, resetKey, camera, controls, size.width, size.height, invalidate]);
  useFrame((_, dt) => {
    const g = tween.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + Math.min(dt, 0.05) / g.dur);
    stepGlide(g, g.t, camera.position, controls.target, camera.up);
    if (g.t >= 1) tween.current = null;
    camera.lookAt(controls.target);
    controls.update();
    invalidate();
  });
  return null;
}

/* ---------- multi-view: one WebGL context, one scene, one scissored render per pane (as in the Explore viewer) ---------- */
export type Pane = { el: HTMLElement | null; cam: THREE.PerspectiveCamera | null };
export function MultiRender({ panes }: { panes: React.RefObject<Pane[]> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useFrame(({ gl, scene, camera: cam0, size: sz }) => {
    const root = gl.domElement.getBoundingClientRect();
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setScissorTest(true);
    for (const p of panes.current ?? []) {
      if (!p.el) continue;
      const r = p.el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w < 4 || h < 4) continue;
      const x = Math.floor(r.left - root.left);
      const y = Math.floor(root.bottom - r.bottom);
      const cam = p.cam ?? (cam0 as THREE.PerspectiveCamera);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
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
/** The three fixed panes of the multi-view (the fourth is the free orbit). */
export const FIXED_PANES: { id: string; view: Exclude<ViewName, "beat">; label: string }[] = [
  { id: "anterior", view: "anterior", label: "Anterior" },
  { id: "left", view: "left", label: "Lateral" },
  { id: "superior", view: "superior", label: "Superior" },
];
export type PaneView = { z: number; ox: number; oy: number };
export type PaneBase = { pos: THREE.Vector3; target: THREE.Vector3; dist: number };
const _pr = new THREE.Vector3();
const _pu = new THREE.Vector3();
export function applyPaneCam(cam: THREE.PerspectiveCamera, base: PaneBase, v: PaneView) {
  _pr.set(1, 0, 0).applyQuaternion(cam.quaternion);
  _pu.set(0, 1, 0).applyQuaternion(cam.quaternion);
  cam.position.copy(base.pos).addScaledVector(_pr, v.ox).addScaledVector(_pu, v.oy);
  cam.zoom = v.z;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
/** Frames the fixed pane cameras on the box (their pan / zoom resets with each new box). */
export function fitPanes(cams: THREE.PerspectiveCamera[], els: (HTMLElement | null)[], box: THREE.Box3, fov: number, bases: (PaneBase | null)[], views: PaneView[]) {
  const c = box.getCenter(new THREE.Vector3());
  FIXED_PANES.forEach((p, i) => {
    const cam = cams[i];
    const el = els[i];
    const aspect = el && el.clientHeight > 4 ? el.clientWidth / el.clientHeight : 1.4;
    const v = VIEW_DEFS[p.view];
    const dir = new THREE.Vector3(...v.dir).normalize();
    const up = new THREE.Vector3(...v.up);
    cam.fov = fov;
    cam.aspect = aspect;
    const d = fitDist(box, dir, up, fov, aspect);
    cam.position.copy(c).addScaledVector(dir, d);
    cam.up.copy(up);
    cam.lookAt(c);
    cam.zoom = 1;
    cam.near = 0.002;
    cam.far = 6;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    bases[i] = { pos: cam.position.clone(), target: c.clone(), dist: d };
    views[i] = { z: 1, ox: 0, oy: 0 };
  });
}
