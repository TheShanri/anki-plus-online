import * as THREE from "three";
import type { TissueVolume } from "./tissue";

/**
 * Shared uniforms of every section material (the cap quads and the deep-structure section paints): the tissue volume,
 * its placement in world space, the active cutting planes and the tissue palette.
 */
export const SEC = {
  uTissue: { value: null as THREE.Data3DTexture | null },
  uHasTissue: { value: 0 },
  uOrigin: { value: new THREE.Vector3() },
  uSize: { value: new THREE.Vector3(1, 1, 1) },
  /** kept side: dot(n, p) + w >= 0 (three.js clipping convention) */
  uPlanes: { value: [new THREE.Vector4(1, 0, 0, 1e3), new THREE.Vector4(1, 0, 0, 1e3)] },
  uNPlanes: { value: 0 },
  uGM: { value: new THREE.Color() },
  uWM: { value: new THREE.Color() },
  uCSF: { value: new THREE.Color() },
  /** 1 = the sulci and the interhemispheric fissure on the midsagittal plane let the medial surface show through */
  uOpenFissure: { value: 0 },
};

export function setTissue(t: TissueVolume | null) {
  SEC.uTissue.value = t?.texture ?? null;
  SEC.uHasTissue.value = t ? 1 : 0;
  if (t) {
    SEC.uOrigin.value.copy(t.origin);
    SEC.uSize.value.copy(t.size);
  }
}

export function setSectionPlanes(planes: THREE.Plane[]) {
  SEC.uNPlanes.value = Math.min(2, planes.length);
  planes.slice(0, 2).forEach((p, i) => SEC.uPlanes.value[i].set(p.normal.x, p.normal.y, p.normal.z, p.constant));
}

export type SectionPalette = { gm: string; wm: string; csf: string; line: string };
export function setPalette(p: SectionPalette) {
  SEC.uGM.value.set(p.gm);
  SEC.uWM.value.set(p.wm);
  SEC.uCSF.value.set(p.csf);
}

export const SEC_VERT_DECL = "varying vec3 vSecW;\n";
export const SEC_VERT_MAIN = "vSecW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n";

/**
 * Tissue tone at a world point. The volume holds a T1-like intensity: CSF ~0.12, grey matter ~0.51, white matter ~0.86.
 * Two anti-aliased steps (CSF|grey, grey|white) give a crisp ribbon; a little of the intensity is kept inside each class
 * so the tissue still reads as tissue (the pallidum paler than the putamen, the thalamus between grey and white).
 */
export const SEC_GLSL = /* glsl */ `
uniform highp sampler3D uTissue;
uniform float uHasTissue;
uniform vec3 uOrigin;
uniform vec3 uSize;
uniform vec4 uPlanes[2];
uniform int uNPlanes;
uniform vec3 uGM;
uniform vec3 uWM;
uniform vec3 uCSF;
uniform float uOpenFissure;
varying vec3 vSecW;

float secIntensity(vec3 p) {
  return texture(uTissue, (p - uOrigin) / uSize).r;
}
vec3 secTone(vec3 p) {
  float t = secIntensity(p);
  float aa = fwidth(t) * 0.6;
  float gw = smoothstep(0.655 - 0.025 - aa, 0.655 + 0.025 + aa, t);
  float cs = smoothstep(0.30 - 0.035 - aa, 0.30 + 0.035 + aa, t);
  float mid = mix(0.51, 0.86, gw);
  vec3 tis = mix(uGM, uWM, gw) * (1.0 + 0.45 * (t - mid));
  return mix(uCSF, tis, cs);
}
/** The section face: the tissue tone, or the flat colour while the volume is still loading. */
vec3 secCap(vec3 p, vec3 fallback, float medial) {
  if (uHasTissue < 0.5) return fallback;
  if (medial > 0.5) {
    float t = secIntensity(p);
    float aa = fwidth(t) * 0.6;
    float gw = smoothstep(0.655 - 0.025 - aa, 0.655 + 0.025 + aa, t);
    return mix(uGM * 0.9, uWM, gw);
  }
  return secTone(p);
}
/** Distance (m) to the nearest active cutting plane: a mesh face lying on the plane (a half-brainstem's medial face) is part of the section. */
float secPlaneDist(vec3 w) {
  float d = 1e3;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    d = min(d, abs(dot(uPlanes[i].xyz, w) + uPlanes[i].w));
  }
  return d;
}
/** Where the view ray through this fragment enters the kept side of the cut: the point on the section plane. */
vec3 secOnPlane(vec3 w) {
  vec3 ro = isOrthographic ? w : cameraPosition;
  vec3 rd = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(w - cameraPosition);
  float tf = isOrthographic ? 0.0 : length(w - cameraPosition);
  float best = -1e9;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    vec4 pl = uPlanes[i];
    float dn = dot(pl.xyz, rd);
    if (dn <= 1e-5) continue;
    float t = -(dot(pl.xyz, ro) + pl.w) / dn;
    best = max(best, t);
  }
  if (best < -1e8) return w;
  if (isOrthographic) return w + rd * best;
  return ro + rd * min(best, tf);
}
`;

/**
 * A lit mesh material whose inside shows through a cut (gross brainstem, cerebellum, gyri): its back faces paint the tissue
 * on the section plane instead of a flat colour, so a cut through the brainstem or the vermis reads like the rest of the
 * section (the arbor vitae in a midsagittal view). Call inside onBeforeCompile; `flat` is the existing back-face line.
 */
export function insideTissue(s: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }, flat: string, onPlane = false) {
  Object.assign(s.uniforms, SEC);
  s.vertexShader = SEC_VERT_DECL + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SEC_VERT_MAIN);
  s.fragmentShader =
    SEC_GLSL +
    s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `if (!gl_FrontFacing) { if (uHasTissue > 0.5 && uNPlanes > 0) outgoingLight = secTone(secOnPlane(vSecW)); else ${flat} }\n${onPlane ? "else if (uHasTissue > 0.5 && secPlaneDist(vSecW) < 0.0012) outgoingLight = secTone(vSecW);\n" : ""}#include <opaque_fragment>`,
    );
}
