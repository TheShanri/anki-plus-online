"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { hostGeometry } from "./geometry";
import { clayMaterial } from "./materials";
import type { V3Geo } from "./types";

/* The two eyeballs of the gaze pathway (owner audit 2026-11-22: "the eyes don't visibly turn"). They sit in the orbits as
 * context and, once the last beat (the lateral and medial recti) is reached, turn together toward the gaze side: the eye on
 * the gaze side abducts, the other adducts. With both sides shown they look to one side, then the other (each FEF in turn).
 * World frame: Y up, anterior +Z, patient's left +X; a positive turn about +Y swings the front of the eye toward +X. */

const KEYS = ["part:head-targets/organ_eyeball", "part:head-targets/organ_cornea", "pr:head-targets/organ_eyeball", "pr:head-targets/organ_cornea"];
const TURN = 0.42; // rad, about 24 degrees: a clear, natural horizontal gaze

export type GazeDir = 1 | -1 | "swing";

export function GazeEyes({ geo, dir, active, reduced, color, planes }: { geo: Record<string, V3Geo>; dir: GazeDir; active: boolean; reduced: boolean; color: string; planes: THREE.Plane[] }) {
  const [g, setG] = useState<(THREE.BufferGeometry | null)[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(KEYS.map((k) => hostGeometry(k, geo))).then((r) => alive && setG(r));
    return () => {
      alive = false;
    };
  }, [geo]);
  const mats = useMemo(
    () => ({
      ball: clayMaterial(color, planes),
      cornea: new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.2, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, clippingPlanes: planes }),
      iris: new THREE.MeshStandardMaterial({ color: "#5b7f8c", roughness: 0.5, metalness: 0, clippingPlanes: planes }),
      pupil: new THREE.MeshBasicMaterial({ color: "#0b0b0b", clippingPlanes: planes }),
    }),
    [color, planes],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const eyes = useMemo(() => {
    if (!g) return [];
    return [0, 2].flatMap((i) => {
      const ball = g[i];
      if (!ball) return [];
      ball.computeBoundingBox();
      const bb = ball.boundingBox!;
      const c = bb.getCenter(new THREE.Vector3());
      const r = Math.max(bb.max.z - c.z, 0.004);
      return [{ c, r, ball, cornea: g[i + 1] }];
    });
  }, [g]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const angle = useRef(0);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const target = !active ? 0 : dir === "swing" ? (reduced ? 0 : TURN * Math.tanh(3 * Math.sin(t * 0.8))) : dir * TURN;
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    angle.current += (target - angle.current) * k;
    for (const grp of groups.current) if (grp) grp.rotation.y = angle.current;
    // frameloop is "demand": keep drawing while the eyes move (and through the whole swing)
    if (Math.abs(target - angle.current) > 0.0005 || (active && dir === "swing" && !reduced)) state.invalidate();
  });
  return (
    <>
      {eyes.map((e, i) => (
        <group key={i} position={e.c} ref={(el) => void (groups.current[i] = el)}>
          <group position={[-e.c.x, -e.c.y, -e.c.z]}>
            <mesh geometry={e.ball} material={mats.ball} />
            {e.cornea && <mesh geometry={e.cornea} material={mats.cornea} />}
          </group>
          {/* iris and pupil on the front of the globe, so the direction of gaze reads at a glance */}
          <mesh position={[0, 0, e.r * 0.97]} scale={[1, 1, 0.25]} material={mats.iris}>
            <sphereGeometry args={[e.r * 0.42, 24, 12]} />
          </mesh>
          <mesh position={[0, 0, e.r * 1.0]} scale={[1, 1, 0.25]} material={mats.pupil}>
            <sphereGeometry args={[e.r * 0.18, 20, 10]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
