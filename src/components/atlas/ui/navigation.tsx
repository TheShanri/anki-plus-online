"use client";

/*
 * One navigation scheme for every 3D atlas viewer (owner, 2026-11-15: "the zoom needs work, it's hard to navigate ...
 * maybe holding Ctrl for non-rotational movement?").
 *
 *   left-drag                    rotate around the pivot
 *   Ctrl/Cmd/Shift + left-drag   pan (screen space)      right-drag and middle-drag pan too
 *   wheel                        zoom toward the cursor  (Ctrl + wheel always zooms: trackpad pinch arrives that way)
 *   trackpad two-finger scroll   pan                     (pinch zooms)
 *   double-click / double-tap    the orbit pivot glides to the point under the pointer
 *   touch                        one finger rotates, two fingers pan and pinch
 *
 * OrbitControls already pans on Ctrl/Meta/Shift + left; `NAV_MOUSE` adds middle = pan. TrackballControls has no modifier pan
 * (and its middle button dollies), so with `modifierPan` `NavExtras` holds its key state on PAN for a modifier + left-drag or
 * a middle-drag (the same mechanism as its own keyboard keys).
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CircleHelp, X } from "lucide-react";
import { IconBtn, Popover } from "./Toolbar";

export const NAV_MOUSE = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
export const NAV_TOUCH = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

type Ctl = {
  target: THREE.Vector3;
  update: () => void;
  dispatchEvent?: (e: { type: string }) => void;
  enabled?: boolean;
  /** TrackballControls internals (a key-held state overrides the button's state for the whole drag) */
  _keyState?: number;
  STATE?: { NONE: number; PAN: number };
};

/** When the pivot last moved, per controls object (a camera move for a new selection right after a double-click must not undo it). */
const pivotAt = new WeakMap<object, number>();
export function pivotedRecently(controls: object | null | undefined, ms = 1500): boolean {
  if (!controls) return false;
  const t = pivotAt.get(controls);
  return t !== undefined && performance.now() - t < ms;
}

/** Trackpad two-finger scroll vs a mouse wheel. Sticky within one gesture (events closer than 140 ms). */
function wheelKind() {
  let last = { t: -1e9, pad: false };
  return (e: WheelEvent): boolean => {
    if (e.ctrlKey || e.metaKey) return false; // pinch (and Ctrl + wheel): always zoom
    const now = e.timeStamp || performance.now();
    if (now - last.t < 140) {
      last.t = now;
      return last.pad;
    }
    let pad = false;
    if (e.deltaMode === 0) {
      const wd = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
      if (e.deltaX !== 0) pad = true;
      else if (!Number.isInteger(e.deltaY)) pad = true;
      else if (typeof wd === "number" && wd !== 0 && Math.abs(wd) % 120 !== 0) pad = true;
    }
    last = { t: now, pad };
    return pad;
  };
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function shown(o: THREE.Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
/** The first visible, opaque-enough surface under a screen point, honouring each material's clipping planes. */
export function surfacePoint(scene: THREE.Object3D, camera: THREE.Camera, el: HTMLElement, cx: number, cy: number): THREE.Vector3 | null {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld();
  _ray.setFromCamera(_ndc, camera);
  const hits = _ray.intersectObject(scene, true);
  let faint: THREE.Vector3 | null = null;
  for (const h of hits) {
    const o = h.object as THREE.Mesh;
    if (!(o as THREE.Mesh).isMesh || o.userData.hull || !shown(o)) continue;
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material | undefined;
    if (!mat || !mat.visible || mat.colorWrite === false) continue;
    if (mat.clippingPlanes?.some((p) => p.distanceToPoint(h.point) < 0)) continue;
    if (mat.transparent && mat.opacity < 0.35) {
      faint ??= h.point.clone();
      continue;
    }
    return h.point.clone();
  }
  return faint;
}

/**
 * Inside a <Canvas> with `makeDefault` controls: trackpad pan, double-click / double-tap pivot, and (for TrackballControls)
 * Ctrl/Cmd/Shift + left-drag pan. `el` is the controls' DOM element; `wheelEl` an ancestor that sees the wheel first.
 */
export function NavExtras({
  el,
  wheelEl,
  modifierPan = false,
  pick,
}: {
  el?: HTMLElement | null;
  wheelEl?: HTMLElement | null;
  modifierPan?: boolean;
  /** Custom pick (e.g. one that skips clipped-away parts); defaults to the first visible surface in the scene. */
  pick?: (cx: number, cy: number) => THREE.Vector3 | null;
}) {
  const controls = useThree((s) => s.controls) as unknown as Ctl | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    const dom = el ?? gl.domElement;
    const outer = wheelEl ?? dom.parentElement ?? dom;
    if (!controls || !dom) return;
    let anim = 0;
    const stop = () => cancelAnimationFrame(anim);
    const notify = (t: string) => controls.dispatchEvent?.({ type: t });

    // trackpad two-finger scroll pans (screen space), at the depth of the pivot
    const isPad = wheelKind();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const onWheel = (e: WheelEvent) => {
      if (!dom.contains(e.target as Node) && e.target !== dom) return;
      if (controls.enabled === false || !isPad(e)) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      const dist = camera.position.distanceTo(controls.target);
      const k = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, dom.clientHeight);
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const off = right.multiplyScalar(e.deltaX * k).add(up.multiplyScalar(-e.deltaY * k));
      notify("start");
      camera.position.add(off);
      controls.target.add(off);
      controls.update();
      notify("change");
      notify("end");
      invalidate();
    };
    outer.addEventListener("wheel", onWheel, { passive: false, capture: true });

    // double-click (mouse) or double-tap (touch): glide the pivot to the point; the camera translates with it
    const glideTo = (p: THREE.Vector3) => {
      stop();
      notify("start");
      pivotAt.set(controls, performance.now());
      const t0 = controls.target.clone();
      const c0 = camera.position.clone();
      const d = p.clone().sub(t0);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const dur = reduce ? 0 : 380;
      const s0 = performance.now();
      const step = (now: number) => {
        const k = dur ? Math.min(1, (now - s0) / dur) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        controls.target.copy(t0).addScaledVector(d, e);
        camera.position.copy(c0).addScaledVector(d, e);
        controls.update();
        invalidate();
        if (k < 1) anim = requestAnimationFrame(step);
        else notify("end");
      };
      anim = requestAnimationFrame(step);
    };
    const pivotAtPoint = (cx: number, cy: number) => {
      const p = pickRef.current ? pickRef.current(cx, cy) : surfacePoint(scene, camera, dom, cx, cy);
      if (p) glideTo(p);
    };
    let lastTapPivot = 0;
    const onDbl = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.("button,input,a")) return;
      if (performance.now() - lastTapPivot < 500) return; // already done by the double-tap
      pivotAtPoint(e.clientX, e.clientY);
    };
    let tap: { x: number; y: number; t: number } | null = null;
    let down: { x: number; y: number; t: number } | null = null;
    let touches = 0;
    let heldPan = false;
    const onDown = (e: PointerEvent) => {
      stop(); // the user's hand always wins over a pivot glide
      if (e.pointerType === "touch") {
        touches++;
        down = touches === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      }
      if (modifierPan && controls.STATE && e.pointerType === "mouse" && ((e.button === 0 && (e.ctrlKey || e.metaKey || e.shiftKey)) || e.button === 1)) {
        controls._keyState = controls.STATE.PAN;
        heldPan = true;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (heldPan && controls.STATE) {
        heldPan = false;
        controls._keyState = controls.STATE.NONE;
      }
      if (e.pointerType !== "touch") return;
      touches = Math.max(0, touches - 1);
      const d0 = down;
      down = null;
      if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 10 || performance.now() - d0.t > 300) return;
      const now = performance.now();
      if (tap && now - tap.t < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) {
        tap = null;
        lastTapPivot = now;
        pivotAtPoint(e.clientX, e.clientY);
      } else tap = { x: e.clientX, y: e.clientY, t: now };
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerType === "touch") touches = Math.max(0, touches - 1);
    };
    // capture on the ancestor: runs before the controls' own pointerdown on `dom`
    outer.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    dom.addEventListener("dblclick", onDbl);
    return () => {
      stop();
      outer.removeEventListener("wheel", onWheel, { capture: true });
      outer.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      dom.removeEventListener("dblclick", onDbl);
    };
  }, [controls, camera, scene, gl, el, wheelEl, modifierPan, invalidate]);
  return null;
}

const HINT_KEY = "atlas.navHint.v1";
const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export const NAV_HELP: { k: string; v: string; touch?: boolean }[] = [
  { k: "Drag", v: "Rotate" },
  { k: "Ctrl / Shift + drag", v: "Pan (also right- or middle-drag)" },
  { k: "Scroll", v: "Zoom toward the cursor" },
  { k: "Trackpad", v: "Two fingers pan, pinch zooms" },
  { k: "Double-click", v: "Orbit around that point" },
  { k: "Click empty space / Esc", v: "Deselect" },
  { k: "F", v: "Frame the selection again" },
  { k: "One finger", v: "Rotate", touch: true },
  { k: "Two fingers", v: "Pan and pinch to zoom", touch: true },
  { k: "Double-tap", v: "Orbit around that point", touch: true },
];

/** "?" toolbar button with the controls. */
export function NavHelpButton({ deselect = true }: { deselect?: boolean }) {
  const touch = isTouch();
  const rows = NAV_HELP.filter((r) => (touch ? r.touch || r.k.startsWith("Click") : !r.touch)).filter((r) => deselect || (r.v !== "Deselect" && r.k !== "F"));
  return (
    <Popover align="right" trigger={({ open, toggle }) => <IconBtn label="How to move around" keys="?" on={open} onClick={toggle} icon={<CircleHelp />} />}>
      {() => (
        <div className="grid gap-1 p-1.5 text-xs" role="note" aria-label="3D controls">
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-faint">Moving around</p>
          {rows.map((r) => (
            <p key={r.k} className="flex items-baseline gap-3 whitespace-nowrap">
              <kbd className="atl-kbd !ml-0 min-w-[9.5rem] text-left">{r.k}</kbd>
              <span className="text-text-dim">{r.v}</span>
            </p>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** A one-time, dismissable hint (remembered on this device). */
export function NavHint({ deselect = true }: { deselect?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      /* storage blocked: show it */
    }
    if (seen) return;
    const a = window.setTimeout(() => setShow(true), 900);
    const b = window.setTimeout(() => dismiss(), 16000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* storage blocked */
    }
  }
  if (!show) return null;
  const text = isTouch()
    ? "One finger rotates · two fingers pan and pinch · double-tap to orbit around a point"
    : `Drag rotates · Ctrl/Shift-drag or right-drag pans · scroll zooms at the cursor · double-click to orbit there${deselect ? " · Esc deselects" : ""}`;
  return (
    <div className="atl-chip atl-card-in pointer-events-auto max-w-full text-[11px] text-text-dim" role="status" data-atl-obstacle="">
      <span className="min-w-0">{text}</span>
      <button type="button" aria-label="Dismiss the controls hint" className="flex-none text-text-faint hover:text-text" onClick={dismiss}>
        <X size={12} />
      </button>
    </div>
  );
}
