"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/* Wheel zoom toward the point under the cursor (owner, 2026-11-13: "allow the zoom to go where the cursor is, not just the
 * centre"). Replaces TrackballControls' own centre zoom: camera and target both move toward the cursor's point on the plane
 * through the target, so what is under the pointer stays under it. */
interface Ctl {
  target: THREE.Vector3;
  noZoom: boolean;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  dispatchEvent?: (e: { type: string }) => void;
}

export function ZoomToCursor({ el, speed = 0.0016 }: { el: HTMLElement | null; speed?: number }) {
  const controls = useThree((s) => s.controls) as unknown as Ctl | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const dom = el ?? gl.domElement;
    if (!controls) return;
    controls.noZoom = true;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      camera.getWorldDirection(dir);
      plane.setFromNormalAndCoplanarPoint(dir, controls.target);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) hit.copy(controls.target);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      let f = Math.exp(Math.max(-0.5, Math.min(0.5, dy * speed)));
      const dist = camera.position.distanceTo(controls.target);
      const next = dist * f;
      if (next < controls.minDistance) f = controls.minDistance / dist;
      if (next > controls.maxDistance) f = controls.maxDistance / dist;
      camera.position.sub(hit).multiplyScalar(f).add(hit);
      controls.target.sub(hit).multiplyScalar(f).add(hit);
      controls.update();
      controls.dispatchEvent?.({ type: "change" });
      invalidate();
    };
    dom.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dom.removeEventListener("wheel", onWheel);
      controls.noZoom = false;
    };
  }, [controls, camera, gl, el, speed, invalidate]);
  return null;
}
