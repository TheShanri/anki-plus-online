"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/* The beat camera. User input always wins: the first grab (pointer, wheel, touch or the controls' own start) cancels any tween
 * and locks the view; beats never move a locked camera again until Frame (F), a view button or another pathway. A tween moves
 * position, target and up together (0.8 s, ease-out) and ends exactly on the goal. Never a snap-back. */

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

export function Rig({ box, view, nonce, resetKey, onLock }: { box: THREE.Box3 | null; view: ViewDef; nonce: number; resetKey: string; onLock: (l: boolean) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const tween = useRef<{ t: number; fp: THREE.Vector3; ft: THREE.Vector3; fu: THREE.Vector3; pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null>(null);
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
    tween.current = { t: 0, fp: camera.position.clone(), ft: controls.target.clone(), fu: camera.up.clone(), pos: c.clone().addScaledVector(dir, d), target: c, up };
    invalidate();
  }, [box, view, nonce, resetKey, camera, controls, size.width, size.height, invalidate]);
  useFrame((_, dt) => {
    const g = tween.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + dt / 0.8);
    const e = 1 - Math.pow(1 - g.t, 3);
    camera.position.lerpVectors(g.fp, g.pos, e);
    controls.target.lerpVectors(g.ft, g.target, e);
    camera.up.lerpVectors(g.fu, g.up, e).normalize();
    if (g.t >= 1) {
      camera.position.copy(g.pos);
      controls.target.copy(g.target);
      camera.up.copy(g.up);
      tween.current = null;
    }
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
