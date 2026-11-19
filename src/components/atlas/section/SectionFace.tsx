"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bakeGeometry } from "./geometry";
import { SEC, SEC_CAP_GLSL, SEC_GLSL, SEC_VERT_DECL, SEC_VERT_MAIN } from "./shader";

const CAP_SCALE = 0.985;
/** The face sits a hair in front of its plane, so the cut edges of the meshes behind it never show through. */
const ON_PLANE = -0.0002;
/** Midsagittal fill layer: this far behind the midline, under the medial surface, it only shows through gaps in the gyral meshes. */
export const MID_DEPTH = 0.012;

type Kind = "plain" | "midline" | "medial" | "ghost";

/**
 * The cut face of the brain. The watertight brain solid (brainfill.glb) is stencil-counted once (odd = inside the brain
 * along that pixel's ray), deep-structure section paints (renderOrder 0.3, see makeSectionPaint) then clear the stencil where
 * a nucleus/tract/ventricle is cut, and quads per cutting plane paint the remaining section with the tissue volume
 * (grey ribbon, white matter, sulci, ventricles).
 * The midsagittal plane (`medial`) gets two layers: on the plane, the true section of the brainstem and cerebellum (the
 * volume's midline mask; elsewhere the interhemispheric fissure lets the medial surface show), then a fill 12 mm behind for
 * gaps in the medial surface. `ghost` is the X-ray look: a flat dark, almost opaque face 12 mm behind each plane.
 */
export function SectionFace({
  fill,
  planes,
  centre,
  color,
  ghost = false,
  medial = null,
}: {
  fill: THREE.Group;
  planes: THREE.Plane[];
  centre: THREE.Vector3;
  color: string;
  ghost?: boolean;
  medial?: THREE.Plane | null;
}) {
  const geo = useMemo(() => bakeGeometry(fill), [fill]);
  const quads = useRef<(THREE.Mesh | null)[]>([]);
  const counts = useMemo(() => {
    const base = { colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: planes } as const;
    const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    return { back, front };
  }, [planes]);
  const caps = useMemo(() => {
    const out: { pl: THREE.Plane; cap: THREE.MeshBasicMaterial; depth: number }[] = [];
    planes.forEach((pl, i) => {
      const others = planes.filter((_, j) => j !== i);
      const kinds: Kind[] = ghost ? ["ghost"] : pl === medial ? ["midline", "medial"] : ["plain"];
      for (const kind of kinds) {
        const cap = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes: others,
          transparent: ghost,
          opacity: ghost ? 0.93 : 1,
          toneMapped: false,
          stencilWrite: true,
          stencilRef: 0,
          stencilFunc: THREE.NotEqualStencilFunc,
          stencilFail: THREE.KeepStencilOp,
          stencilZFail: THREE.ReplaceStencilOp,
          stencilZPass: THREE.ReplaceStencilOp,
        });
        if (kind !== "ghost") tissueCap(cap, kind);
        out.push({ pl, cap, depth: kind === "plain" || kind === "midline" ? ON_PLANE : MID_DEPTH });
      }
    });
    return out;
  }, [planes, color, ghost, medial]);
  useEffect(() => () => [counts.back, counts.front].forEach((m) => m.dispose()), [counts]);
  useEffect(() => () => caps.forEach((c) => c.cap.dispose()), [caps]);
  useFrame(() => {
    caps.forEach((c, i) => {
      const q = quads.current[i];
      if (!q) return;
      c.pl.projectPoint(centre, q.position);
      q.position.addScaledVector(c.pl.normal, c.depth);
      q.lookAt(q.position.clone().add(c.pl.normal));
    });
  });
  if (!geo) return null;
  const S = CAP_SCALE;
  const off = centre.clone().multiplyScalar(1 - S);
  return (
    <>
      <mesh geometry={geo} material={counts.back} renderOrder={0.1} scale={S} position={off} raycast={() => undefined} />
      <mesh geometry={geo} material={counts.front} renderOrder={0.2} scale={S} position={off} raycast={() => undefined} />
      {caps.map((c, i) => (
        <mesh key={i} ref={(m) => { quads.current[i] = m; }} material={c.cap} renderOrder={0.5 + i * 0.01} raycast={() => undefined}>
          <planeGeometry args={[0.6, 0.6]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * The cap quad paints the tissue volume on its plane. "midline": only inside the volume's midline-section mask (brainstem,
 * cerebellum), discarded elsewhere. "medial": the fill behind the medial surface, where the fissure would read as a dark hole,
 * so CSF is shown as the medial grey matter it lies against.
 */
function tissueCap(m: THREE.MeshBasicMaterial, kind: Kind) {
  // each kind compiles only its own branch (#if): the three in one shader took seconds to compile on Windows
  const mode = kind === "midline" ? 2 : kind === "medial" ? 1 : 0;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SEC);
    s.vertexShader = SEC_VERT_DECL + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SEC_VERT_MAIN);
    s.fragmentShader = `#define SEC_CAP_MODE ${mode}\n` + SEC_GLSL + SEC_CAP_GLSL + s.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 diffuseColor = vec4( secCap( secOnPlane( vSecW ), diffuse ), opacity );
  if (secDiscard) discard;`);
  };
  m.customProgramCacheKey = () => "atlas-section-cap-" + kind;
}

/**
 * Compile the cap shaders before the first cut (they carry the whole section shader, ~0.5 s to compile): materials built
 * like SectionFace's, on a throwaway quad, compiled with the renderer's parallel compile against the live scene's lights.
 */
export async function prewarmSectionCaps(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene) {
  const sc = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(0.001, 0.001);
  const mats: THREE.MeshBasicMaterial[] = [];
  for (const kind of ["plain", "midline", "medial"] as Kind[]) {
    const m = new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [], toneMapped: false, stencilWrite: true });
    tissueCap(m, kind);
    mats.push(m);
    sc.add(new THREE.Mesh(geo, m));
  }
  await gl.compileAsync(sc, camera, scene);
  // kept alive: three.js releases a program when the last material using it is disposed
  warm.push(...mats);
}
const warm: THREE.Material[] = [];
