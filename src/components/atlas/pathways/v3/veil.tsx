"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

/* The brain veil: the closed whole-brain solid as a very faint translucent body behind the beat, so the student sees where in
 * the brain the fibres are (it replaced the flat grey section cap). Depth-sorted and never written to the depth buffer, drawn
 * before the fibres, so it can never hide one. */
export function BrainVeil({ geo, color, planes, dark }: { geo: THREE.BufferGeometry; color: string; planes: THREE.Plane[]; dark: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: dark ? 0.1 : 0.09,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
        side: THREE.FrontSide,
        clippingPlanes: planes,
      }),
    [color, planes, dark],
  );
  useEffect(() => {
    invalidate();
    return () => mat.dispose();
  }, [mat, invalidate]);
  return <mesh geometry={geo} material={mat} renderOrder={3} raycast={() => undefined} />;
}
