"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { clayMaterial, ghostMaterial, hostMaterial, hullMaterial, regionMaterial, setHullWidth } from "./materials";
import { worldPerPx } from "./fibres";

/* Mesh layers of the v3 scene. Each layer is one merged BufferGeometry (made in geometry.ts) drawn in one of the four styles:
 * clay (context), host (cutaway shell), region (stop) or ghost (rim silhouette). Outlines are inverted hulls whose width is
 * kept at about 1.3 px for the camera that renders them (every multi-view pane too). */

export type LayerStyle = "clay" | "host" | "region" | "ghost";

export interface LayerProps {
  geo: THREE.BufferGeometry;
  style: LayerStyle;
  color: string;
  ink: string;
  /** clipped by the section cut */
  planes: THREE.Plane[];
  /** only one half (patient's left = +x) */
  half?: "L" | "R";
  current?: boolean;
  hover?: boolean;
  dim?: number;
  accent: string;
  pickKey?: string;
  onPick?: (k: string) => void;
  onHover?: (k: string | null, name?: string, e?: ThreeEvent<PointerEvent>) => void;
  name?: string;
}

const HALF_L = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
const HALF_R = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

function applyStyle(mat: THREE.Material, o: { opacity: number; planes: THREE.Plane[] }) {
  mat.clippingPlanes = o.planes;
  mat.opacity = o.opacity;
  mat.transparent = o.opacity < 0.999 || mat.transparent;
  mat.needsUpdate = true;
}

export function Layer({ geo, style, color, ink, planes, half, current, hover, dim = 1, accent, pickKey, onPick, onHover, name }: LayerProps) {
  const invalidate = useThree((s) => s.invalidate);
  const clip = useMemo(() => [...planes, ...(half === "L" ? [HALF_L] : half === "R" ? [HALF_R] : [])], [planes, half]);
  const mats = useMemo(() => {
    const main =
      style === "ghost" ? ghostMaterial(color, 0.75) : style === "host" ? hostMaterial(color) : style === "region" ? regionMaterial(color) : clayMaterial(color, clip);
    const hull = style === "ghost" ? null : hullMaterial(ink, 0.0003);
    return { main, hull };
  }, [style, color, ink, clip]);
  useEffect(
    () => () => {
      mats.main.dispose();
      mats.hull?.dispose();
    },
    [mats],
  );
  useEffect(() => {
    const op = dim;
    if (style !== "ghost") applyStyle(mats.main, { opacity: op, planes: clip });
    else {
      mats.main.clippingPlanes = clip;
      (mats.main as THREE.ShaderMaterial).uniforms.uStrength.value = 0.75 * dim;
    }
    if (mats.hull) {
      applyStyle(mats.hull, { opacity: op, planes: clip });
      mats.hull.color.set(hover ? accent : current && style !== "clay" ? ink : ink);
    }
    if (style === "region") {
      const m = mats.main as THREE.MeshStandardMaterial;
      m.emissiveIntensity = current ? 0.42 : hover ? 0.3 : 0.12;
    }
    if (style === "host") {
      const m = mats.main as THREE.MeshStandardMaterial;
      m.emissiveIntensity = current ? 0.2 : 0.05;
    }
    invalidate();
  }, [mats, dim, clip, hover, current, accent, ink, style, invalidate]);
  const hullRef = useRef<THREE.Mesh>(null);
  const center = useMemo(() => {
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    return geo.boundingSphere!.center.clone();
  }, [geo]);
  useEffect(() => {
    const h = hullRef.current;
    if (!h || !mats.hull) return;
    const hull = mats.hull;
    const px = hover ? 2.6 : current && style === "region" ? 2 : style === "clay" ? 1.1 : 1.35;
    h.onBeforeRender = (renderer, _s, cam) => setHullWidth(hull, px * worldPerPx(cam, center, renderer));
  }, [mats, hover, current, style, center]);
  const handlers =
    pickKey && onPick
      ? {
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (e.delta > 6) return;
            e.stopPropagation();
            onPick(pickKey);
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover?.(pickKey, name, e);
          },
          onPointerOut: () => onHover?.(null),
        }
      : {};
  const ro = style === "ghost" ? 90 : style === "region" ? 12 : style === "host" ? 8 : 4;
  return (
    <group>
      <mesh geometry={geo} material={mats.main} renderOrder={ro} {...handlers} />
      {mats.hull && <mesh ref={hullRef} geometry={geo} material={mats.hull} renderOrder={ro - 1} raycast={() => undefined} />}
    </group>
  );
}

/** Loads a geometry promise into state (null until ready); reports completion once. */
export function useGeometry(p: Promise<THREE.BufferGeometry | null> | null, onDone?: () => void): THREE.BufferGeometry | null {
  const [g, setG] = useState<{ p: Promise<THREE.BufferGeometry | null>; g: THREE.BufferGeometry | null } | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!p) return;
    let alive = true;
    p.then((x) => {
      if (!alive) return;
      setG({ p, g: x });
      done.current?.();
      invalidate();
    }).catch(() => alive && done.current?.());
    return () => {
      alive = false;
    };
  }, [p, invalidate]);
  return g && g.p === p ? g.g : null;
}
