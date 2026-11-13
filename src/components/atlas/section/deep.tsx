"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { planeSection } from "./geometry";
import { SEC, SEC_GLSL, SEC_VERT_DECL, SEC_VERT_MAIN } from "./shader";

/** What a structure is made of, so its cut reads in the same tissue language as the rest of the section. */
export type Tissue = "grey" | "white" | "csf";

/**
 * Deep structures drawn inside a cut or the midsagittal view (loaded on the first cut). `hue` is used only when
 * "colour structures" is on (and in the section key then); otherwise a cut shows tissue: nuclei as grey matter,
 * tracts as white matter, ventricles as dark CSF, each outlined by a hairline.
 */
export const DEEP: { id: string; tissue: Tissue; hue: string }[] = [
  { id: "corpus-callosum", tissue: "white", hue: "#e9dcc4" },
  { id: "fornix", tissue: "white", hue: "#e3cf9f" },
  { id: "septum-pellucidum", tissue: "grey", hue: "#cfc3d6" },
  { id: "anterior-commissure", tissue: "white", hue: "#ecd9a4" },
  { id: "mni-internal-capsule", tissue: "white", hue: "#efe4cc" },
  { id: "caudate-nucleus", tissue: "grey", hue: "#86a5c2" },
  { id: "putamen", tissue: "grey", hue: "#c4908c" },
  { id: "globus-pallidus", tissue: "grey", hue: "#d6b47c" },
  { id: "thalamus", tissue: "grey", hue: "#b79bc9" },
  { id: "hypothalamus", tissue: "grey", hue: "#d29a78" },
  { id: "hippocampus", tissue: "grey", hue: "#86b79b" },
  { id: "amygdaloid-body", tissue: "grey", hue: "#c98484" },
  { id: "lateral-ventricle", tissue: "csf", hue: "#4f5d77" },
  { id: "third-ventricle", tissue: "csf", hue: "#4f5d77" },
  { id: "fourth-ventricle", tissue: "csf", hue: "#4f5d77" },
];
export const DEEP_TISSUE: Record<string, Tissue> = Object.fromEntries(DEEP.map((d) => [d.id, d.tissue]));

/** Per-structure section paint uniforms: how far toward its tissue's clean tone, and a tint (hover, selection, colour mode). */
type PaintU = { uKind: { value: THREE.Vector3 }; uTint: { value: THREE.Color }; uTintAmt: { value: number } };

/**
 * The cut face of a deep structure: drawn on its back faces (what shows through the opening a cut makes in a closed mesh),
 * painted with the tissue at the point on the cutting plane, and clearing the stencil there so the section quad leaves it.
 * renderOrder 0.3: after the brain-solid stencil count (0.1, 0.2), before the section quads (0.5).
 */
export function makeSectionPaint(tissue: Tissue): THREE.MeshBasicMaterial & { userData: { sec: PaintU } } {
  const u: PaintU = {
    uKind: { value: new THREE.Vector3(tissue === "grey" ? 1 : 0, tissue === "white" ? 1 : 0, tissue === "csf" ? 1 : 0) },
    uTint: { value: new THREE.Color("#ffffff") },
    uTintAmt: { value: 0 },
  };
  const m = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    toneMapped: false,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  }) as THREE.MeshBasicMaterial & { userData: { sec: PaintU } };
  m.userData.sec = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SEC, u);
    s.vertexShader = SEC_VERT_DECL + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SEC_VERT_MAIN);
    s.fragmentShader =
      SEC_GLSL +
      /* glsl */ `
uniform vec3 uKind;
uniform vec3 uTint;
uniform float uTintAmt;
vec3 secPaint(vec3 w) {
  vec3 p = secOnPlane(w);
  vec3 tone = uHasTissue > 0.5 ? secTone(p) : uKind.x * uGM + uKind.y * uWM + uKind.z * uCSF;
  // pull toward the clean tone of its tissue: a nucleus reads as one grey mass, a tract as white, a ventricle as an empty dark space
  vec3 clean = uKind.x * uGM + uKind.y * uWM + uKind.z * uCSF;
  float t = uHasTissue > 0.5 ? secIntensity(p) : 0.5;
  clean *= 1.0 + 0.25 * (t - (uKind.x * 0.51 + uKind.y * 0.86 + uKind.z * 0.12));
  tone = mix(tone, clean, uKind.z > 0.5 ? 0.85 : 0.75);
  return mix(tone, uTint, uTintAmt);
}
` +
      s.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( secPaint( vSecW ), opacity );");
  };
  m.customProgramCacheKey = () => "atlas-section-paint";
  return m;
}

export function tintPaint(m: THREE.Material, color: THREE.ColorRepresentation | null, amount: number) {
  const u = (m.userData as { sec?: PaintU }).sec;
  if (!u) return;
  if (color !== null) u.uTint.value.set(color);
  u.uTintAmt.value = color === null ? 0 : amount;
}

/** Adds a back-face section paint child to every mesh under `root` (raycasts ignore it). Returns a remover. */
export function addSectionPaint(root: THREE.Object3D, mat: (m: THREE.Mesh) => THREE.Material | null): () => void {
  const added: THREE.Mesh[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.hull && !m.userData.secPaint) meshes.push(m);
  });
  for (const m of meshes) {
    const pm = mat(m);
    if (!pm) continue;
    const c = new THREE.Mesh(m.geometry, pm);
    c.userData.secPaint = true;
    c.userData.hull = true; // not a pickable/structure mesh
    c.raycast = () => undefined;
    c.renderOrder = 0.3;
    m.add(c);
    added.push(c);
  }
  return () => added.forEach((c) => c.removeFromParent());
}

/** Hairline outlines of every deep structure's cut (CPU plane intersection, recomputed when the planes move). */
export function SectionOutlines({ roots, planes, version, color, width = 1.1 }: { roots: THREE.Object3D[]; planes: THREE.Plane[]; version: string; color: string; width?: number }) {
  const line = useMemo(() => {
    const mat = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
    const l = new LineSegments2(new LineSegmentsGeometry(), mat);
    l.renderOrder = 0.7;
    l.frustumCulled = false;
    l.raycast = () => undefined;
    return l;
  }, [color, width]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as LineMaterial).dispose();
  }, [line]);
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    // the cutting planes are moved in place by the scene's own effect, which runs after this child's: read them a frame later
    const raf = requestAnimationFrame(() => {
      const out: number[] = [];
      for (const r of roots)
        r.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || m.userData.secPaint || m.userData.hull || !m.visible) return;
          planes.forEach((pl, i) => {
            const before = out.length;
            planeSection(m, pl, planes.filter((_, j) => j !== i), out);
            // lift the outline a hair toward the viewer side of the plane so it never sinks under the face
            for (let k = before; k < out.length; k += 3) {
              out[k] -= pl.normal.x * 0.0004;
              out[k + 1] -= pl.normal.y * 0.0004;
              out[k + 2] -= pl.normal.z * 0.0004;
            }
          });
        });
      const g = new LineSegmentsGeometry();
      if (out.length) g.setPositions(out);
      line.geometry.dispose();
      line.geometry = g;
      line.visible = out.length > 0;
      invalidate();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, roots, version, invalidate]);
  return <primitive object={line} />;
}
