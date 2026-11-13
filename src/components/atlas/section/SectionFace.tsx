"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { bakeGeometry } from "./geometry";
import { SEC, SEC_GLSL, SEC_VERT_DECL, SEC_VERT_MAIN } from "./shader";

const CAP_SCALE = 0.985;

/**
 * The cut face of the brain. The watertight brain solid (brainfill.glb) is stencil-counted once (odd = inside the brain
 * along that pixel's ray), deep-structure section paints (renderOrder 0.3, see makeSectionPaint) then clear the stencil where
 * a nucleus/tract/ventricle is cut, and one quad per cutting plane paints the remaining section with the tissue volume
 * (grey ribbon, white matter, sulci, ventricles). `ghost` is the X-ray look: a flat dark, almost opaque face.
 * `depth` pushes a plane's face behind the plane (midsagittal: the medial surface stays in front of it).
 */
export function SectionFace({
  fill,
  planes,
  centre,
  color,
  ghost = false,
  depth,
}: {
  fill: THREE.Group;
  planes: THREE.Plane[];
  centre: THREE.Vector3;
  color: string;
  ghost?: boolean;
  depth?: (pl: THREE.Plane, i: number) => number;
}) {
  const geo = useMemo(() => bakeGeometry(fill), [fill]);
  const quads = useRef<(THREE.Mesh | null)[]>([]);
  const counts = useMemo(() => {
    const base = { colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: planes } as const;
    const back = new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
    const front = new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
    return { back, front };
  }, [planes]);
  const caps = useMemo(
    () =>
      planes.map((pl, i) => {
        const others = planes.filter((_, j) => j !== i);
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
        if (!ghost) tissueCap(cap, !!depth && depth(pl, i) > 0.005);
        return { pl, cap };
      }),
    [planes, color, ghost, depth],
  );
  useEffect(() => () => [counts.back, counts.front].forEach((m) => m.dispose()), [counts]);
  useEffect(() => () => caps.forEach((c) => c.cap.dispose()), [caps]);
  useFrame(() => {
    caps.forEach((c, i) => {
      const q = quads.current[i];
      if (!q) return;
      c.pl.projectPoint(centre, q.position);
      q.position.addScaledVector(c.pl.normal, depth ? depth(c.pl, i) : 0.00005);
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
 * The cap quad paints the tissue volume on its plane. `medial` (the midsagittal face, which sits behind the medial surface):
 * the interhemispheric fissure there would read as a dark hole, so CSF is shown as the medial grey matter it lies against.
 */
function tissueCap(m: THREE.MeshBasicMaterial, medial: boolean) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SEC);
    s.vertexShader = SEC_VERT_DECL + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SEC_VERT_MAIN);
    s.fragmentShader = SEC_GLSL + s.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 diffuseColor = vec4( secCap( secOnPlane( vSecW ), diffuse, ${medial ? "1.0" : "0.0"} ), opacity );`);
  };
  m.customProgramCacheKey = () => (medial ? "atlas-section-cap-medial" : "atlas-section-cap");
}
