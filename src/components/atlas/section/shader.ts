import * as THREE from "three";
import type { TissueVolume } from "./tissue";
import type { Interior } from "./labels";
import { LAB, LAB_GLSL } from "./labelShader";

/**
 * Shared uniforms of every section material (the cap quads and the deep-structure section paints): the tissue volume,
 * its placement in world space, the active cutting planes and the tissue palette.
 */
export const SEC = {
  uTissue: { value: null as THREE.Data3DTexture | null },
  uAux: { value: null as THREE.Data3DTexture | null },
  uHasTissue: { value: 0 },
  uOrigin: { value: new THREE.Vector3() },
  uSize: { value: new THREE.Vector3(1, 1, 1) },
  uDims: { value: new THREE.Vector3(1, 1, 1) },
  /** kept side: dot(n, p) + w >= 0 (three.js clipping convention) */
  uPlanes: { value: [new THREE.Vector4(1, 0, 0, 1e3), new THREE.Vector4(1, 0, 0, 1e3)] },
  uNPlanes: { value: 0 },
  uGM: { value: new THREE.Color() },
  uWM: { value: new THREE.Color() },
  uCSF: { value: new THREE.Color() },
  /** which of uPlanes is the midsagittal plane (-1: none) */
  uMidIdx: { value: -1 },
  /** 1 while the medial-wall mesh is drawn (midsagittal): the flat medial fill steps aside */
  uMedialWall: { value: 0 },
  // the labelled interior (labels.ts, labelShader.ts)
  ...LAB,
};

/** The labelled interior volume: every section face paints its labels once it is in. */
export function setInterior(I: Interior | null) {
  SEC.uLab.value = I?.vol ?? null;
  SEC.uLabPal.value = I?.pal ?? null;
  SEC.uHasLab.value = I ? 1 : 0;
  if (!I) return;
  SEC.uLabCorner.value.copy(I.corner);
  SEC.uLabSize.value.copy(I.size);
  SEC.uLabDims.value.set(...I.dims);
  SEC.uLabGrpV3.value = I.rows.find((r) => r.key === "3V")?.grp ?? -1;
  SEC.uLabGrpLV.value = I.rows.find((r) => r.key === "bLV")?.grp ?? -1;
  SEC.uLabMoTg.value = I.rows.find((r) => r.key === "MoTg")?.i ?? -1;
  SEC.uLabCec.value = I.rows.find((r) => r.key === "cec")?.i ?? -1;
}

export function setTissue(t: TissueVolume | null) {
  SEC.uTissue.value = t?.field ?? null;
  SEC.uAux.value = t?.aux ?? null;
  SEC.uHasTissue.value = t ? 1 : 0;
  if (t) {
    SEC.uOrigin.value.copy(t.origin);
    SEC.uSize.value.copy(t.size);
    SEC.uDims.value.copy(t.dims);
  }
}

export function setSectionPlanes(planes: THREE.Plane[], mid: THREE.Plane | null = null) {
  SEC.uNPlanes.value = Math.min(2, planes.length);
  SEC.uMidIdx.value = mid ? planes.indexOf(mid) : -1;
  planes.slice(0, 2).forEach((p, i) => SEC.uPlanes.value[i].set(p.normal.x, p.normal.y, p.normal.z, p.constant));
}

export type SectionPalette = { gm: string; wm: string; csf: string; line: string };
export function setPalette(p: SectionPalette) {
  SEC.uGM.value.set(p.gm);
  SEC.uWM.value.set(p.wm);
  SEC.uCSF.value.set(p.csf);
  SEC.uLabLine.value.set(p.line).lerp(SEC.uGM.value, 0.25);
  // choroid plexus: a dull vascular rose between grey matter and CSF, as on a fixed-brain plate
  SEC.uLabPlexus.value.set("#a05a63").lerp(SEC.uGM.value, 0.35);
}

export const SEC_VERT_DECL = "varying vec3 vSecW;\n";
export const SEC_VERT_MAIN = "vSecW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n";

/**
 * Tissue tone at a world point, drawn like an atlas plate: flat grey matter, white matter and CSF, separated by sharp,
 * anti-aliased borders at any zoom. The 0.5 mm class field is sampled with a tricubic B-spline (8 trilinear fetches), so its
 * 0.25 (CSF|grey) and 0.75 (grey|white) contours are smooth curves, not voxel steps; fwidth() sets the edge width to one
 * screen pixel. Brainstem and diencephalon parts the template barely contrasts (tegmentum, basilar pons, pyramids, nigra,
 * colliculi, hypothalamus) take their fixed-brain tone from the 1 mm aux volume, inside the tissue only.
 */
export const SEC_GLSL = /* glsl */ `
uniform highp sampler3D uTissue;
uniform highp sampler3D uAux;
uniform float uHasTissue;
uniform vec3 uOrigin;
uniform vec3 uSize;
uniform vec3 uDims;
uniform vec4 uPlanes[2];
uniform int uNPlanes;
uniform vec3 uGM;
uniform vec3 uWM;
uniform int uMidIdx;
uniform float uMedialWall;
uniform vec3 uCSF;
varying vec3 vSecW;

vec3 secUVW(vec3 p) { return (p - uOrigin) / uSize; }
/** Tricubic B-spline sample (Sigg and Hadwiger: 8 trilinear taps) of a 3D texture with \`dims\` voxels. */
vec4 secCubic(highp sampler3D tex, vec3 uvw, vec3 dims) {
  vec3 c = uvw * dims - 0.5;
  vec3 i = floor(c);
  vec3 f = c - i;
  vec3 f2 = f * f;
  vec3 f3 = f2 * f;
  vec3 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec3 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec3 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec3 w3 = f3 / 6.0;
  vec3 g0 = w0 + w1;
  vec3 g1 = w2 + w3;
  vec3 h0 = (i - 0.5 + w1 / g0) / dims;
  vec3 h1 = (i + 1.5 + w3 / g1) / dims;
  vec4 z0 = g0.y * (g0.x * texture(tex, vec3(h0.x, h0.y, h0.z)) + g1.x * texture(tex, vec3(h1.x, h0.y, h0.z)))
          + g1.y * (g0.x * texture(tex, vec3(h0.x, h1.y, h0.z)) + g1.x * texture(tex, vec3(h1.x, h1.y, h0.z)));
  vec4 z1 = g0.y * (g0.x * texture(tex, vec3(h0.x, h0.y, h1.z)) + g1.x * texture(tex, vec3(h1.x, h0.y, h1.z)))
          + g1.y * (g0.x * texture(tex, vec3(h0.x, h1.y, h1.z)) + g1.x * texture(tex, vec3(h1.x, h1.y, h1.z)));
  return g0.z * z0 + g1.z * z1;
}
/** The 0.5 mm class field, tricubic: its contours are smooth curves, not voxel steps. */
float secField(vec3 p) { return secCubic(uTissue, secUVW(p), uDims).r; }
/** The 1 mm aux volume (half the field's voxel count per axis), tricubic. */
vec4 secAuxAt(vec3 p) { return secCubic(uAux, secUVW(p), uDims * 0.5); }
/** Anti-aliased step of the field s at threshold k: one screen pixel wide, whatever the zoom. */
float secStep(float s, float k, float aa) { return smoothstep(k - aa, k + aa, s); }
/** Grey (0) .. white (1) mix and tissue coverage (0 CSF .. 1 tissue) at p. */
vec2 secClass(vec3 p) {
  float s = secField(p);
  float aa = max(fwidth(s), 1e-4) * 0.7;
  return vec2(secStep(s, 0.75, aa), secStep(s, 0.25, aa));
}
${LAB_GLSL}
/** Brainstem and diencephalon parts named by the Allen atlas (tegmentum, basilar pons, pyramids, nigra, colliculi,
 * hypothalamus) override the template's weak grey/white contrast there: each part is drawn as grey-ish or white-ish
 * (a fixed-brain plate's two tones, a shade toward each other), with crisp anti-aliased borders like the rest. */
/** The tone outside the labelled interior (or before it is in): the tissue field, with the aux volume's parts. */
vec3 secToneOutsideK(vec3 p, vec2 k) {
  vec4 ax = secAuxAt(p);
  vec3 tis = mix(uGM, uWM, k.x);
  float wq = secStep(ax.g, 0.5, max(fwidth(ax.g), 1e-4) * 0.7);
  float uq = secStep(ax.r, 0.5, max(fwidth(ax.r), 1e-4) * 0.7);
  tis = mix(tis, mix(uGM, uWM, mix(0.12, 0.9, uq)), wq);
  // the same tissue texture as the labelled interior (no seam at the label box)
  return labTexture(0, 1, mix(uCSF, tis, k.y), p, length(fwidth(p)), 1.0 - k.x);
}
vec3 secToneOutside(vec3 p) { return secToneOutsideK(p, secClass(p)); }
/**
 * Relief: a cut slab is not flat paint. The grey ribbon stands a hair proud of the white matter and the sulci are recessed,
 * so the face catches the light at every border (owner 2026-11-19: the sagittal face looked "low res and 2D"). The height is
 * the class field itself (CSF 0, grey 0.5, white 1, inverted toward grey: grey highest); its gradient, from six trilinear
 * taps 0.35 mm apart (a fixed physical width at any zoom), tilts the face's normal in view space, lit from the upper left.
 */
float secHeight(vec3 p) {
  float s = textureLod(uTissue, secUVW(p), 0.0).r;
  return s < 0.5 ? s * 2.0 : 1.0 - (s - 0.5) * 0.6; // CSF 0 (deepest), grey 1, white 0.7
}
vec3 secRelief(vec3 p, vec3 col) {
  const float e = 0.00035;
  vec3 g = vec3(secHeight(p + vec3(e, 0, 0)) - secHeight(p - vec3(e, 0, 0)),
                secHeight(p + vec3(0, e, 0)) - secHeight(p - vec3(0, e, 0)),
                secHeight(p + vec3(0, 0, e)) - secHeight(p - vec3(0, 0, e))) / (2.0 * e);
  vec2 gv = (viewMatrix * vec4(g, 0.0)).xy;      // the height's slope across the screen
  vec3 n = normalize(vec3(-gv * 0.00055, 1.0));   // relief depth: ~0.5 mm over a border
  vec3 L = normalize(vec3(-0.45, 0.6, 1.0));
  float lit = dot(n, L) / L.z;                    // 1 on the flat face
  float sh = clamp(1.0 + (lit - 1.0) * 0.8, 0.62, 1.22);
  return col * sh + vec3(0.06) * pow(max(lit - 1.0, 0.0), 1.5); // a faint wet sheen on the lit bevels
}
vec3 secTone(vec3 p) {
  // both tones computed, then chosen: derivatives never sit behind a branch (labelShader.ts, the Windows rule)
  vec2 k = secClass(p);
  vec4 lb = labSection(p, k); // inside the labelled interior: every structure as its own region
  vec3 out3 = secToneOutsideK(p, k);
  return secRelief(p, lb.r >= 0.0 ? lb.rgb : out3);
}
/** Plane i's normal (dynamic index). */
vec3 secNormal(int i) { return i == 0 ? uPlanes[0].xyz : uPlanes[1].xyz; }
/** Distance (m) to the nearest active cutting plane: a mesh face lying on the plane (a half-brainstem's medial face) is part of the section. */
float secPlaneDist(vec3 w) {
  float d = 1e3;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    d = min(d, abs(dot(uPlanes[i].xyz, w) + uPlanes[i].w));
  }
  return d;
}
/** The nearest active plane's foot point of w. */
vec3 secFoot(vec3 w) {
  float d = 1e3;
  vec3 f = w;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    float s = dot(uPlanes[i].xyz, w) + uPlanes[i].w;
    if (abs(s) < d) { d = abs(s); f = w - uPlanes[i].xyz * s; }
  }
  return f;
}
/** Which plane the view ray through w enters the kept side by (-1: none). */
int secEntry(vec3 w) {
  vec3 ro = isOrthographic ? w : cameraPosition;
  vec3 rd = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(w - cameraPosition);
  float best = -1e9;
  int idx = -1;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    float dn = dot(uPlanes[i].xyz, rd);
    if (dn <= 1e-5) continue;
    float t = -(dot(uPlanes[i].xyz, ro) + uPlanes[i].w) / dn;
    if (t > best) { best = t; idx = i; }
  }
  return idx;
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
/** 1 when the view ray reaches w through the cut (the camera is on a removed side), 0 when the camera is inside the kept
 * region: a back face seen then is the far wall behind a gap in the gyral meshes, not the inside of a cut mesh. */
float secThroughCut(vec3 w) {
  vec3 ro = isOrthographic ? w : cameraPosition;
  vec3 rd = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(w - cameraPosition);
  float best = -1e9;
  for (int i = 0; i < 2; i++) {
    if (i >= uNPlanes) break;
    vec4 pl = uPlanes[i];
    float dn = dot(pl.xyz, rd);
    if (dn <= 1e-5) continue;
    best = max(best, -(dot(pl.xyz, ro) + pl.w) / dn);
  }
  return isOrthographic ? step(-1e8, best) : step(0.0, best);
}
`;

/** Placed after SEC_GLSL and the ray helpers. */
export const SEC_CAP_GLSL = /* glsl */ `
/** The section face: the tissue tone, or the flat colour while the volume is still loading.
 * mode 0: plain; 1: midsagittal fill behind the medial surface (CSF shown as medial grey); 2: midsagittal true section, only
 * inside the volume's midline mask (brainstem, cerebellum), discarded elsewhere so the medial surface shows.
 * A near-sagittal plane passes through the interhemispheric fissure without cutting tissue: there the face is left open, so
 * the medial surface beyond it shows, as in a real parasagittal slice. */
vec3 secCap(vec3 p, vec3 fallback) {
  // every branch's tone is computed before any decision (derivatives in uniform control flow: labelShader.ts)
#if SEC_CAP_MODE == 2
  vec4 m = labMidline(p, secNormal(max(uMidIdx, 0)));
  vec3 o = secToneOutside(p);
  if (uHasTissue < 0.5) discard;
  if (uMidIdx >= 0 && m.r >= 0.0) return m.rgb; // (or discarded through secDiscard)
  secDiscard = false;
  if (secAuxAt(p).b < 0.5) discard;
  return o;
#elif SEC_CAP_MODE == 1
  if (uHasTissue < 0.5) return fallback;
  {
    // behind the midsagittal plane: the medial-wall mesh (Allen labels) shows the real medial surface when it is loaded
    if (uMedialWall > 0.5 && labInBox(p)) {
      // the wall exists where the labelled tissue starts within ~12 mm of the plane; elsewhere the fill stays (no hole)
      vec3 n = uMidIdx >= 0 ? secNormal(uMidIdx) : vec3(-1.0, 0.0, 0.0);
      bool wall = false;
      for (int s = 0; s < 24; s++) {
        int l = labNearest(p + n * (float(s) * 0.0005));
        if (l == 0) continue;
        int c = labClass(l);
        if (c != 6 && c != 7) { wall = true; break; }
      }
      if (wall) discard;
    }
    return mix(uCSF, uGM, 0.45); // a gap in the gyral shell reads as the shadow of a sulcus
  }
#elif SEC_CAP_MODE == 0
  vec3 t = secTone(p);
  vec2 k = secClass(p);
  if (uHasTissue < 0.5) { secDiscard = false; return fallback; }
  int e = secEntry(vSecW);
  if (e >= 0 && abs(secNormal(e).x) > 0.85 && k.y < 0.5 && secAuxAt(p).a > 0.5) discard;
  return t;
#endif
}
`;

/**
 * A lit mesh material whose inside shows through a cut (gross brainstem, cerebellum, gyri): its back faces paint the tissue
 * on the section plane instead of a flat colour, so a cut through the brainstem or the vermis reads like the rest of the
 * section (the arbor vitae in a midsagittal view). Call inside onBeforeCompile; `flat` is the existing back-face line.
 */
export function insideTissue(
  s: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string },
  flat: string,
  onPlane: { value: number },
) {
  Object.assign(s.uniforms, SEC, { uSecOnPlane: onPlane });
  s.vertexShader = SEC_VERT_DECL + s.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n" + SEC_VERT_MAIN);
  // one program for every gross material (onPlane is a uniform, not a variant): each variant of this shader costs seconds
  // to compile on a cold Windows (D3D) shader cache. secTone is called once, on the point the branch picks.
  s.fragmentShader =
    SEC_GLSL +
    "uniform float uSecOnPlane;\n" +
    s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `bool secBack = !gl_FrontFacing;
// the tone first, the choice after: derivatives never behind a branch (labelShader.ts, the Windows rule)
vec3 secT = secTone(secBack ? secOnPlane(vSecW) : secFoot(vSecW));
bool secCutIn = secThroughCut(vSecW) > 0.5;
if (uHasTissue > 0.5 && uNPlanes > 0) {
  if ((secBack && secCutIn) || (uSecOnPlane > 0.5 && secPlaneDist(vSecW) < 0.003)) outgoingLight = secT;
  else { secDiscard = false; if (secBack) { ${flat} } }
} else { secDiscard = false; if (secBack) { ${flat} } }
if (secDiscard) discard;
#include <opaque_fragment>`,
    );
}
