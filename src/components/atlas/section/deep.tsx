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
export const DEEP: { id: string; tissue: Tissue; hue: string; shade?: number; under?: boolean; midSkip?: boolean }[] = [
  { id: "corpus-callosum", tissue: "white", hue: "#e9dcc4" },
  { id: "fornix", tissue: "white", hue: "#e3cf9f" },
  { id: "septum-pellucidum", tissue: "grey", hue: "#cfc3d6", shade: 0.2 },
  { id: "anterior-commissure", tissue: "white", hue: "#ecd9a4" },
  // MNI-derived, it overlaps the nuclei it runs between: drawn under them (no depth write, painted first)
  { id: "mni-internal-capsule", tissue: "white", hue: "#efe4cc", under: true },
  { id: "caudate-nucleus", tissue: "grey", hue: "#86a5c2" },
  { id: "putamen", tissue: "grey", hue: "#c4908c" },
  { id: "globus-pallidus", tissue: "grey", hue: "#d6b47c", shade: 0.45 },
  { id: "thalamus", tissue: "grey", hue: "#b79bc9", shade: 0.3 },
  { id: "hypothalamus", tissue: "grey", hue: "#d29a78", shade: 0.15 },
  { id: "hippocampus", tissue: "grey", hue: "#86b79b" },
  { id: "amygdaloid-body", tissue: "grey", hue: "#c98484" },
  { id: "lateral-ventricle", tissue: "csf", hue: "#4f5d77" },
  // a midsagittal cut runs down the third ventricle: there its lateral wall (the thalamus, hypothalamus) is what an atlas plate shows
  { id: "third-ventricle", tissue: "csf", hue: "#4f5d77", midSkip: true },
  { id: "fourth-ventricle", tissue: "csf", hue: "#4f5d77" },
  { id: "aqueduct-of-midbrain", tissue: "csf", hue: "#4f5d77" },
  // the midline landmarks of a midsagittal plate
  { id: "posterior-commissure", tissue: "white", hue: "#ecd9a4" },
  { id: "mamillary-body", tissue: "grey", hue: "#d29a78", shade: 0.1 },
  { id: "mni-pineal-gland", tissue: "grey", hue: "#c9a3b8", shade: 0.15 },
  { id: "habenula", tissue: "grey", hue: "#b79bc9" },
  { id: "optic-chiasm", tissue: "white", hue: "#e7dcc0" },
  { id: "superior-colliculus", tissue: "grey", hue: "#c6a98f", shade: 0.1 },
  { id: "inferior-colliculus", tissue: "grey", hue: "#c6a98f", shade: 0.1 },
  { id: "mni-periaqueductal-gray", tissue: "grey", hue: "#b9a49a" },
];
export const DEEP_TISSUE: Record<string, Tissue> = Object.fromEntries(DEEP.map((d) => [d.id, d.tissue]));
const DEEP_UNDER = new Set(DEEP.filter((d) => d.under).map((d) => d.id));

/** Even-odd test: is point (u, v) inside the closed outline given as 2D segments [u0, v0, u1, v1, ...]? */
function inside2(u: number, v: number, seg: number[]) {
  let c = false;
  for (let k = 0; k < seg.length; k += 4) {
    const v0 = seg[k + 1], v1 = seg[k + 3];
    if ((v0 > v) === (v1 > v)) continue;
    const x = seg[k] + ((v - v0) / (v1 - v0)) * (seg[k + 2] - seg[k]);
    if (x > u) c = !c;
  }
  return c;
}

/** Per-structure section paint uniforms: how far toward its tissue's clean tone, and a tint (hover, selection, colour mode). */
type PaintU = { uKind: { value: THREE.Vector3 }; uTint: { value: THREE.Color }; uTintAmt: { value: number } };

/**
 * The cut face of a deep structure: drawn on its back faces (what shows through the opening a cut makes in a closed mesh),
 * painted with the tissue at the point on the cutting plane, and clearing the stencil there so the section quad leaves it.
 * renderOrder 0.3: after the brain-solid stencil count (0.1, 0.2), before the section quads (0.5).
 */
/** `shade` (0..1) moves a grey structure toward white: the pallidum and thalamus are paler than cortex in a fixed brain (more myelin). */
export function makeSectionPaint(tissue: Tissue, shade = 0, opts: { under?: boolean; midSkip?: boolean } = {}): THREE.MeshBasicMaterial & { userData: { sec: PaintU } } {
  const u: PaintU = {
    uKind: { value: new THREE.Vector3(tissue === "grey" ? 1 - shade : 0, tissue === "white" ? 1 : tissue === "grey" ? shade : 0, tissue === "csf" ? 1 : 0) },
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
    depthWrite: !opts.under,
  }) as THREE.MeshBasicMaterial & { userData: { sec: PaintU } };
  if (opts.under) m.userData.under = true;
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
  ${opts.midSkip ? "if (uMidIdx >= 0 && secEntry(w) == uMidIdx) discard;" : ""}
  // a nucleus reads as one grey mass, a tract as white, a ventricle as an empty dark space: the flat tone of its tissue, as on
  // an atlas plate (the mesh outline gives the crisp edge); the pallidum and thalamus a shade paler (more myelin)
  vec3 tone = uKind.x * uGM + uKind.y * uWM + uKind.z * uCSF;
  return mix(tone, uTint, uTintAmt);
}
` +
      s.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( secPaint( vSecW ), opacity );");
  };
  m.customProgramCacheKey = () => (opts.midSkip ? "atlas-section-paint-midskip" : "atlas-section-paint");
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
    c.renderOrder = pm.userData.under ? 0.29 : 0.3; // a structure drawn "under" is painted first, the nuclei over it
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
      planes.forEach((pl, i) => {
        const others = planes.filter((_, j) => j !== i);
        // a 2D basis on the plane, for the "under" structures' outlines (internal capsule): no line inside a nucleus' cut
        const eu = new THREE.Vector3(1, 0, 0);
        if (Math.abs(pl.normal.x) > 0.9) eu.set(0, 1, 0);
        eu.addScaledVector(pl.normal, -eu.dot(pl.normal)).normalize();
        const ev = new THREE.Vector3().crossVectors(pl.normal, eu);
        const to2 = (a: number[], k: number) => [a[k] * eu.x + a[k + 1] * eu.y + a[k + 2] * eu.z, a[k] * ev.x + a[k + 1] * ev.y + a[k + 2] * ev.z];
        const nuclei: number[][] = [];
        const under: number[][] = [];
        const plain: number[] = [];
        for (const r of roots)
          r.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh || m.userData.secPaint || m.userData.hull || !m.visible) return;
            const gid = (m.userData.gid as string | undefined) ?? "";
            const seg: number[] = [];
            planeSection(m, pl, others, seg);
            if (!seg.length) return;
            if (DEEP_UNDER.has(gid)) return void under.push(seg);
            plain.push(...seg);
            if (DEEP_TISSUE[gid] === "grey") {
              const s2: number[] = [];
              for (let k = 0; k < seg.length; k += 6) s2.push(...to2(seg, k), ...to2(seg, k + 3));
              nuclei.push(s2);
            }
          });
        for (const seg of under)
          for (let k = 0; k < seg.length; k += 6) {
            const mid = [(seg[k] + seg[k + 3]) / 2, (seg[k + 1] + seg[k + 4]) / 2, (seg[k + 2] + seg[k + 5]) / 2];
            const [u, v] = to2(mid, 0);
            if (nuclei.some((n) => inside2(u, v, n))) continue;
            plain.push(seg[k], seg[k + 1], seg[k + 2], seg[k + 3], seg[k + 4], seg[k + 5]);
          }
        // lift the outline a hair toward the viewer side of the plane so it never sinks under the face
        for (let k = 0; k < plain.length; k += 3) out.push(plain[k] - pl.normal.x * 0.0004, plain[k + 1] - pl.normal.y * 0.0004, plain[k + 2] - pl.normal.z * 0.0004);
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
