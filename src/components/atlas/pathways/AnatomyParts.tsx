"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { Side } from "@/lib/atlas/pathways";
import ANCHORS from "@/data/part-anchors.json";
import { usePart, type PartFile } from "./PartModels";

/* Real anatomy at the ends of a pathway: the vertebral column with the cord, the thorax, the gut and the head targets,
 * extracted from Z-Anatomy (public/pathways/*.glb, positions in the atlas world frame, see parts.json). Each file is one
 * glTF with a node per object (bone_C7, organ_tongue ...). A spec picks which objects are drawn and which are lit. */

export type AnatFile = "spine" | "thorax" | "gut" | "head-targets";
export interface SceneAnatomy {
  key: string;
  file: AnatFile;
  /** Object-name fragments drawn at normal strength ("bone_" draws every bone). Everything else in the file is hidden. */
  show: string[];
  /** Object-name fragments drawn very faint (context, e.g. the vertebral column around the cord). */
  ghost?: string[];
  /** Objects lit in the accent colour once their beat is reached (hot: brighter). */
  hl?: { match: string; beat: number; color: string }[];
  /** The file only holds the left side: draw a mirrored copy for the right (head targets). The spine, thorax and gut are midline. */
  sided?: boolean;
  /** Beat ranges in which the file is the thing to look at; at other beats it is faint so it never hides the pathway. */
  focus?: [number, number][];
}

const TISSUE_COLOR: Record<string, string> = {
  bone: "#ece4cf",
  nerve: "#e8d27a",
  disc: "#6fb8b8",
  dura: "#8fa0e0",
  muscle: "#b9444c",
  vessel: "#c8453f",
  organ: "#d99a9a",
  gland: "#d9ab72",
  cartilage: "#a9c3d6",
};
/** Base opacity per tissue when the object is drawn at normal strength. */
const TISSUE_ALPHA: Record<string, number> = { bone: 0.3, nerve: 0.95, disc: 0.2, dura: 0.1, muscle: 0.9, vessel: 0.85, organ: 0.9, gland: 0.9, cartilage: 0.85 };
const FADE_ORGAN = /lung|trachea|bronch|heart|stomach|colon|intestine|esophagus|duodenum|eyeball|cornea/;

function tissueOf(name: string) {
  const k = name.split("_")[0];
  return k === "dura" ? "dura" : k;
}

/* Imperative material work lives outside the component (GPU objects are not React state). */
interface Mats {
  base: THREE.MeshStandardMaterial;
  hl: THREE.MeshStandardMaterial | null;
}
const MATS = new WeakMap<THREE.Object3D, Mats>();
/** Objects of the head file that already span the midline: the mirrored copy leaves them out. */
const MIDLINE = /tongue|thyroid|cricoid|epiglottis|soft_palate|mandible|nasal_cavity|olfactory_(epithelium|bulb)/;
function styleAnatomy(scene: THREE.Object3D, spec: SceneAnatomy, mirror: boolean, alpha: number, reveal: number, hot: number | null) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const nm = (m.name || o.parent?.name || "").replace(/\.\d+$/, "");
    const full = spec.show.some((s) => nm.includes(s));
    const ghost = !full && !!spec.ghost?.some((s) => nm.includes(s));
    m.visible = (full || ghost) && !(mirror && MIDLINE.test(nm));
    if (!m.visible) return;
    let mats = MATS.get(m);
    if (!mats) {
      const t = tissueOf(nm);
      const base = new THREE.MeshStandardMaterial({ color: TISSUE_COLOR[t] ?? "#cccccc", emissive: TISSUE_COLOR[t] ?? "#cccccc", emissiveIntensity: 0.14, roughness: 0.65, metalness: 0, transparent: true, side: THREE.DoubleSide, depthWrite: false });
      mats = { base, hl: null };
      MATS.set(m, mats);
      m.material = base;
    }
    const t = tissueOf(nm);
    const h = spec.hl?.find((x) => nm === x.match || nm.startsWith(`${x.match}_`));
    const lit = !!h && reveal >= h.beat;
    const mat = mats.base;
    const strong = lit ? (spec.file === "spine" ? (hot === h!.beat ? 0.55 : 0.32) : FADE_ORGAN.test(nm) || t === "bone" ? (hot === h!.beat ? 0.6 : 0.3) : hot === h!.beat ? 0.95 : 0.55) : full ? (TISSUE_ALPHA[t] ?? 0.8) * (FADE_ORGAN.test(nm) ? 0.55 : 1) : 0.07;
    if (lit) {
      mat.color.set(h!.color);
      mat.emissive.set(h!.color);
      mat.emissiveIntensity = hot === h!.beat ? 0.9 : 0.5;
    } else {
      const c = TISSUE_COLOR[t] ?? "#cccccc";
      mat.color.set(c);
      mat.emissive.set(c);
      mat.emissiveIntensity = 0.14;
    }
    const away = !!spec.focus && hot !== null && !spec.focus.some(([a, b]) => hot >= a && hot <= b);
    mat.opacity = Math.min(1, strong) * alpha * (away ? 0.1 : 1);
    mat.depthWrite = false;
    m.renderOrder = lit ? 3 : 1;
  });
}

export function offsetOf(file: AnatFile): [number, number, number] {
  const o = (ANCHORS as unknown as Record<string, Record<string, number[]>>)[file]._offset;
  return [o[0], o[1], o[2]];
}

function One({ spec, mirror, alpha, reveal, hot, part }: { spec: SceneAnatomy; mirror: boolean; alpha: number; reveal: number; hot: number | null; part: THREE.Group }) {
  const invalidate = useThree((s) => s.invalidate);
  const scene = useMemo(() => part.clone(true), [part]);
  useEffect(() => {
    styleAnatomy(scene, spec, mirror, alpha, reveal, hot);
    invalidate();
  }, [scene, spec, mirror, alpha, reveal, hot, invalidate]);
  const o = offsetOf(spec.file);
  return (
    <group position={[mirror ? -o[0] : o[0], o[1], o[2]]} scale={[mirror ? -1 : 1, 1, 1]} renderOrder={1}>
      <primitive object={scene} />
    </group>
  );
}

/** One anatomy file in the scene (both sides when it is sided). */
export function Anatomy({ spec, sideAlpha, reveal, hot }: { spec: SceneAnatomy; sideAlpha: { L: number; R: number }; reveal: number; hot: number | null }) {
  const part = usePart(spec.file as PartFile);
  if (!part) return null;
  if (!spec.sided) return <One spec={spec} mirror={false} alpha={1} reveal={reveal} hot={hot} part={part} />;
  return (
    <>
      {(["L", "R"] as Side[]).map((s) => (
        <One key={s} spec={spec} mirror={s === "R"} alpha={sideAlpha[s]} reveal={reveal} hot={hot} part={part} />
      ))}
    </>
  );
}
