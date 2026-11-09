"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* Anatomical body parts from Z-Anatomy (CC BY-SA 4.0), decimated and meshopt-compressed in public/pathways/*.glb.
 * Loaded lazily, one fetch per file, shared by every use. Real size in metres, left side, anatomical position. */

export type PartFile = "hand" | "foot" | "leg" | "muscle" | "eye";
const URL_OF: Record<PartFile, string> = { hand: "/pathways/hand.glb", foot: "/pathways/foot.glb", leg: "/pathways/leg.glb", muscle: "/pathways/muscle.glb", eye: "/pathways/eye.glb" };

let loader: GLTFLoader | null = null;
const cache = new Map<PartFile, Promise<THREE.Group | null>>();
export function loadPart(f: PartFile): Promise<THREE.Group | null> {
  let p = cache.get(f);
  if (!p) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    p = loader
      .loadAsync(URL_OF[f])
      .then((g) => g.scene)
      .catch(() => null);
    cache.set(f, p);
  }
  return p;
}

/** The loaded part (null while loading or if the file is missing: callers fall back to a simple shape). */
export function usePart(f: PartFile | null): THREE.Group | null {
  const [g, setG] = useState<{ f: PartFile; g: THREE.Group } | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!f) return;
    let alive = true;
    loadPart(f).then((m) => {
      if (alive && m) {
        setG({ f, g: m });
        invalidate();
      }
    });
    return () => {
      alive = false;
    };
  }, [f, invalidate]);
  return f && g && g.f === f ? g.g : null;
}

function paint(root: THREE.Object3D, mats: Record<string, THREE.Material>) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const nm = `${m.name}|${m.parent?.name ?? ""}`.toLowerCase();
    const key = Object.keys(mats).find((k) => nm.startsWith(k) || nm.includes(`|${k}`));
    if (key) m.material = mats[key];
  });
}

export const TISSUE = {
  skin: { color: "#e4b49b", emissive: "#a8705a", opacity: 0.5 },
  bone: { color: "#ece4cf", emissive: "#6e6552", opacity: 0.95 },
  muscle: { color: "#b9444c", emissive: "#4a1318", opacity: 1 },
  tendon: { color: "#efe9d8", emissive: "#6e6552", opacity: 1 },
} as const;

/** A part with per-tissue materials. `flip` mirrors it (the file is the left side). `alpha` fades the whole thing. */
export function PartModel({
  part,
  flip,
  alpha,
  fitSize,
  rotation,
  onPick,
  onHover,
}: {
  part: THREE.Group;
  flip?: boolean;
  alpha: number;
  /** Scale so the longest side is this many metres. */
  fitSize?: number;
  rotation?: [number, number, number];
  onPick?: () => void;
  onHover?: (h: boolean) => void;
}) {
  const scene = useMemo(() => part.clone(true), [part]);
  const mats = useMemo(() => {
    const out: Record<string, THREE.Material> = {};
    for (const [k, t] of Object.entries(TISSUE)) {
      out[k] = new THREE.MeshStandardMaterial({ color: t.color, emissive: t.emissive, emissiveIntensity: 0.25, roughness: 0.7, metalness: 0, transparent: true, side: THREE.DoubleSide, depthWrite: k !== "skin" });
    }
    return out;
  }, []);
  const scale = useMemo(() => {
    if (!fitSize) return 1;
    const b = new THREE.Box3().setFromObject(part);
    const s = b.getSize(new THREE.Vector3());
    return fitSize / Math.max(s.x, s.y, s.z, 1e-6);
  }, [part, fitSize]);
  useEffect(() => {
    paint(scene, mats);
  }, [scene, mats]);
  useEffect(() => {
    for (const [k, m] of Object.entries(mats)) setOpacity(m, (TISSUE[k as keyof typeof TISSUE].opacity as number) * alpha);
  }, [mats, alpha]);
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );
  return (
    <group
      scale={[flip ? -scale : scale, scale, scale]}
      rotation={rotation}
      onClick={onPick ? (e: { stopPropagation: () => void; delta: number }) => { if (e.delta > 6) return; e.stopPropagation(); onPick(); } : undefined}
      onPointerOver={onHover ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(true); } : undefined}
      onPointerOut={onHover ? () => onHover(false) : undefined}
    >
      <primitive object={scene} />
    </group>
  );
}

function setOpacity(m: THREE.Material, v: number) {
  m.opacity = v;
}
