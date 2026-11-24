import * as THREE from "three";

/* The one shader of the v3 atlas. Every triangle of the patch network separates two regions: `_labels` = (a, b), with
 * the normal pointing from a into b. Per fragment:
 *   viewer inside a visible region  -> this is that region's CUT FACE (flat cap colour)       (after a clip plane)
 *   else the region beyond is visible -> its SURFACE, lit with that region's own smooth normal
 *   else                              -> nothing (both sides hidden)
 * The per-label state lives in a small texture (rows: 0 surface rgb + visible, 1 cap rgb, 2 tint rgb + strength,
 * 3 selected (r), hollow (g), ghost class (a)), so showing, hiding, colouring or highlighting any structure is a texture
 * update, never a new mesh. The GHOST variant draws hidden-but-ghosted labels as a see-through veil (the brainstem around
 * a nucleus). HOLLOW spaces (the ventricles) are not solid: from outside the HOLLOW pass draws their cast see-through,
 * stronger at its rim, and from inside (through a cut, or through that cast) the main pass draws their lining, lit, so
 * a cut ventricle reads as an open cavity. SELGHOST draws the selection where a cut removes it, as a faint veil. */

export const STATE_ROWS = 4;

const vertex = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
attribute vec2 _labels;
#ifdef SHELL
attribute float _ao;
attribute float _sulc;
attribute float _areas;
varying float vAO;
flat varying int vSulc;
flat varying int vAreas;
#ifdef TERR
attribute float _terr;
varying float vTerr;
varying float vWX;
#endif
#else
attribute vec3 _normalb;
#endif
flat varying ivec2 vLab;
varying vec3 vNA;
varying vec3 vNB;
varying vec3 vView;
varying vec3 vWP;
void main() {
  vLab = ivec2(_labels + 0.5);
  vWP = (modelMatrix * vec4(position, 1.0)).xyz;
  vNA = normalize(normalMatrix * normal);
#ifdef SHELL
  vNB = -vNA;
  vAO = _ao;
  vSulc = int(_sulc + 0.5);
  vAreas = int(_areas + 0.5);
#ifdef TERR
  vTerr = _terr;
  vWX = (modelMatrix * vec4(position, 1.0)).x;
#endif
#else
  vNB = normalize(normalMatrix * _normalb);
#endif
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vView = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out highp vec4 outColor;
#include <clipping_planes_pars_fragment>
uniform sampler2D uState;
uniform int uPick;
uniform float uAO;
uniform vec3 uKey;
uniform vec3 uFill;
uniform float uCapShade;
uniform int uSulc;
uniform int uAreaMask;
uniform vec3 uRegionTint;
uniform vec4 uSkin;
uniform vec3 uCapN;
varying vec3 vWP;
// value noise in world space (metres), for the grain of a cut face
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
uniform float uOnLight;
#ifdef TERR
uniform sampler2D uTerr;
uniform float uGlass;
uniform float uTerrSide;
uniform float uGlassCap;
varying float vTerr;
varying float vWX;
#endif
flat varying ivec2 vLab;
varying vec3 vNA;
varying vec3 vNB;
varying vec3 vView;
#ifdef SHELL
varying float vAO;
flat varying int vSulc;
flat varying int vAreas;
#endif
vec4 st(int l, int row) { return texelFetch(uState, ivec2(l, row), 0); }
bool vis(int l) { return l > 0 && st(l, 0).a > 0.5; }
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
int gcls(int l) { return l > 0 ? int(st(l, 3).a * 255.0 + 0.5) : 0; }
bool sel(int l) { return l > 0 && st(l, 3).r > 0.5; }
bool hol(int l) { return l > 0 && st(l, 3).g > 0.5; }
void main() {
  #include <clipping_planes_fragment>
  bool front = gl_FrontFacing;
  int here = front ? vLab.y : vLab.x;
  int there = front ? vLab.x : vLab.y;
#ifdef SELGHOST
  // the part of the selection a cut removes: its outer surface as a faint veil in the selection's colour, stronger at
  // its silhouette, so the whole structure stays in view while its cut face is the solid part
  bool sa = sel(here), sb = sel(there);
  if (sa == sb) discard;
  int sl = sa ? here : there;
  vec3 sN = normalize(front ? vNA : vNB);
  vec3 sV = normalize(vView);
  if (dot(sN, sV) < 0.0) sN = -sN;
  float sf = pow(1.0 - max(dot(sN, sV), 0.0), 2.0);
  vec3 sc = st(sl, 2).rgb * (0.6 + 0.4 * max(dot(sN, uKey), 0.0));
  outColor = vec4(sc, 0.06 + 0.34 * sf);
  return;
#endif
#ifdef TERR
  // the glass brain (Blood supply): the outside surface whatever is hidden inside it. Through a cut, the inside of the
  // outside surface (the far wall) is drawn flat as the cut face, so the cut brain reads solid behind the deep structures
  // (which stay in front of it); it is not pickable.
  bool cap = uGlassCap > 0.5 && here > 0 && there == 0;
  if (!(here == 0 && there > 0) && !cap) discard;
  if (cap && uPick == 1) discard;
  int lab = cap ? here : there;
  here = 0;
#else
#ifdef GHOST
  // the see-through pass: a face is drawn, from the viewer's side, when the region beyond it is ghosted and the viewer's
  // region is not of the same ghost class. So the borders between ghosted divisions of one kind vanish (one veil for the
  // whole brainstem), while a ghosted ventricle still shows inside ghosted tissue.
  int gt = gcls(there);
  if (gt == 0 || gt == gcls(here) || vis(here)) discard;
  vec3 gN = normalize(front ? vNA : vNB);
  vec3 gV = normalize(vView);
  if (dot(gN, gV) < 0.0) gN = -gN;
  float f = pow(1.0 - max(dot(gN, gV), 0.0), 2.5);
  vec3 gc = st(there, 0).rgb * (0.6 + 0.4 * max(dot(gN, uKey), 0.0));
  // on a light page the veil is ink (darker than the page), on a dark page light
  gc = uOnLight > 0.5 ? gc * 0.5 : gc + 0.06;
  // the free surface of the group reads stronger than its borders with hidden neighbours (the peduncles' stumps where
  // the cerebellum was); fluid spaces always read
  float k = (here == 0 || gt == 2) ? 1.0 : 0.5;
  outColor = vec4(gc, clamp((0.045 + 0.45 * f) * k * (uOnLight > 0.5 ? 1.3 : 1.0), 0.0, 0.55));
  return;
#endif
#ifdef HOLLOW
  // a hollow space seen from outside: its cast, see-through (the lining inside shows through it)
  if (!(vis(there) && hol(there) && !vis(here))) discard;
  int lab = there;
  bool cap = false;
  bool lumen = false;
#else
  int lab;
  bool cap;
  if (vis(here)) { lab = here; cap = true; }
  else if (vis(there)) { lab = there; cap = false; }
  else discard;
  // a hollow space: its outside is the HOLLOW pass's; seen from inside it is its lining, not a flat cut face
  bool lumen = cap && hol(lab);
  if (uPick == 0 && !cap && hol(lab)) discard;
#endif
#endif
  if (uPick == 1) {
    outColor = vec4(float(lab & 255) / 255.0, float(lab >> 8) / 255.0, cap ? 1.0 : 0.0, 1.0);
    return;
  }
  vec3 col;
#ifdef TERR
  bool lumen = false;
#endif
  if (cap && !lumen) {
    col = st(lab, 1).rgb;
#ifdef TERR
    col = vec3(0.47, 0.45, 0.43);
#else
    // a cut face as tissue, not a flat fill: a fine grain (0.3 mm), soft mottling (1-3 mm) and a faint, wider
    // unevenness (1 cm), stronger in grey matter than in the paler white matter; and the moist sheen of a fresh cut
    // under the key light (the cut plane's normal, view space)
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float g = vnoise(vWP * 3300.0) * 0.45 + vnoise(vWP * 700.0) * 0.35 + vnoise(vWP * 95.0) * 0.2;
    float amp = mix(0.15, 0.08, smoothstep(0.55, 0.85, lum));
    col *= 1.0 - amp * 0.5 + amp * g;
    col = mix(col, col * vec3(1.04, 0.97, 0.96), vnoise(vWP * 240.0 + 7.3) * 0.5 * (1.0 - smoothstep(0.55, 0.85, lum)));
    vec3 Nc = normalize(uCapN);
    vec3 Vc = normalize(vView);
    if (dot(Nc, Vc) < 0.0) Nc = -Nc;
    float sheen = pow(max(dot(Nc, normalize(uKey + Vc)), 0.0), 18.0);
    col = col * (0.94 + 0.08 * max(dot(Nc, uKey), 0.0)) + vec3(0.05 * sheen);
#endif
    // a whisper of depth so stacked cut faces never look like a flat sticker
    col *= uCapShade;
  } else {
    vec3 N = normalize(front ? vNA : vNB);
    vec3 V = normalize(vView);
    if (dot(N, V) < 0.0) N = -N;
    vec3 base = toLin(st(lab, 0).rgb);
    float ao = 1.0;
#ifdef SHELL
    ao = mix(1.0, vAO, uAO);
#endif
    // the lining of a cavity, seen from inside: deeper and duller than the cast's outside, darker where it turns away
    if (lumen) {
      base *= 0.42;
      ao = 0.55 + 0.45 * max(dot(N, V), 0.0);
    }
    float dk = max(dot(N, uKey), 0.0);
    float df = max(dot(N, uFill), 0.0);
    vec3 H = normalize(uKey + V);
    float sp = pow(max(dot(N, H), 0.0), 36.0) * 0.12;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.16;
    vec3 lit = base * (0.30 * ao + 0.72 * dk * mix(0.55, 1.0, ao) + 0.20 * df * ao) + vec3(sp * ao + rim * 0.6);
    col = toSrgb(lit);
  }
  vec4 t = st(lab, 2);
  col = mix(col, t.rgb, t.a);
#ifdef SHELL
  // a selected sulcus (its walls) or functional area, drawn over the outside surface only
  if (!cap && ((uSulc > 0 && vSulc == uSulc) || (uSulc == -1 && vSulc > 0) || (uAreaMask != 0 && (vAreas & uAreaMask) != 0))) col = mix(col, uRegionTint, 0.62);
  // a skin over the whole outside surface, into every sulcus (the pia)
  if (!cap && uSkin.a > 0.0) col = mix(col, uSkin.rgb, uSkin.a);
#endif
#ifdef TERR
  // the arterial territory of this point of the outside surface: its colour and strength from a 16 x 1 texture (row: the
  // artery index, alpha: how strongly it shows now). The index is interpolated across a triangle: the nearest one wins.
  // (one side only when uTerrSide is +1, the patient's left = +x, or -1)
  if (!cap && (uTerrSide == 0.0 || sign(vWX) == uTerrSide)) {
    vec4 tc = texelFetch(uTerr, ivec2(int(vTerr + 0.5), 0), 0);
    col = mix(col, tc.rgb, tc.a);
  }
  outColor = vec4(col, uGlass);
  return;
#endif
#ifdef HOLLOW
  {
    vec3 hN = normalize(front ? vNA : vNB);
    vec3 hV = normalize(vView);
    if (dot(hN, hV) < 0.0) hN = -hN;
    float fr = pow(1.0 - max(dot(hN, hV), 0.0), 1.6);
    outColor = vec4(col, mix(0.34, 0.94, fr));
    return;
  }
#endif
  outColor = vec4(col, 1.0);
}
`;

export function makeStateTexture(n: number): THREE.DataTexture {
  const data = new Uint8Array(n * STATE_ROWS * 4);
  const tex = new THREE.DataTexture(data, n, STATE_ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export type PatchUniforms = {
  uState: { value: THREE.DataTexture };
  uPick: { value: number };
  uAO: { value: number };
  uKey: { value: THREE.Vector3 };
  uFill: { value: THREE.Vector3 };
  uCapShade: { value: number };
  uSulc: { value: number };
  uAreaMask: { value: number };
  uRegionTint: { value: THREE.Color };
  /** rgb + strength: a tint over the outside surface (0: none) */
  uSkin: { value: THREE.Vector4 };
  /** the cut plane's normal in view space (the sheen of the cut faces) */
  uCapN: { value: THREE.Vector3 };
  /** 1 on a light page: the see-through veils are drawn darker than the page */
  uOnLight: { value: number };
  /** Blood supply: the territory colours (16 x 1, rgb + strength) and the see-through brain's opacity */
  uTerr: { value: THREE.DataTexture | null };
  uGlass: { value: number };
  uTerrSide: { value: number };
  /** 1 when the glass brain is cut: its far wall is drawn as the cut face */
  uGlassCap: { value: number };
};

export function makeUniforms(state: THREE.DataTexture): PatchUniforms {
  return {
    uState: { value: state },
    uPick: { value: 0 },
    uAO: { value: 0.85 },
    // lights fixed to the camera: key from the upper left front, fill from the lower right
    uKey: { value: new THREE.Vector3(-0.45, 0.6, 0.66).normalize() },
    uFill: { value: new THREE.Vector3(0.6, -0.35, 0.72).normalize() },
    uCapShade: { value: 1.0 },
    uSulc: { value: 0 },
    uAreaMask: { value: 0 },
    uRegionTint: { value: new THREE.Color("#ffb347") },
    uSkin: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCapN: { value: new THREE.Vector3(0, 0, 1) },
    uOnLight: { value: 0 },
    uTerr: { value: null },
    uGlass: { value: 1 },
    uTerrSide: { value: 0 },
    uGlassCap: { value: 0 },
  };
}

/** The outside surface with territories, drawn as one see-through layer (Blood supply): after a depth-only pass of the same
 * surface, only its nearest fragments pass (depthFunc LessEqual against that pass), blended over what is inside. */
export function makeGlassMaterial(uniforms: PatchUniforms, pick = false): THREE.ShaderMaterial {
  const m = makePatchMaterial(uniforms, true);
  m.defines = { ...m.defines, TERR: 1 };
  if (pick) return m; // the pick pass: the same surface, opaque, every region pickable through the glass
  m.transparent = true;
  m.depthWrite = false;
  m.depthFunc = THREE.LessEqualDepth;
  return m;
}
/** The outside of the hollow spaces (see-through casts), drawn after the opaque network. */
export function makeHollowMaterial(uniforms: PatchUniforms, shell: boolean): THREE.ShaderMaterial {
  const m = makePatchMaterial(uniforms, shell);
  m.defines = { ...m.defines, HOLLOW: 1 };
  m.transparent = true;
  m.depthWrite = false;
  return m;
}
/** The selection where a cut removes it: a faint veil (its own clip planes keep the removed side). */
export function makeSelGhostMaterial(uniforms: PatchUniforms, shell: boolean): THREE.ShaderMaterial {
  const m = makePatchMaterial(uniforms, shell);
  m.defines = { ...m.defines, SELGHOST: 1 };
  m.transparent = true;
  m.depthWrite = false;
  return m;
}
export function makePatchMaterial(uniforms: PatchUniforms, shell: boolean, ghost = false): THREE.ShaderMaterial {
  const defines: Record<string, number> = {};
  if (shell) defines.SHELL = 1;
  if (ghost) defines.GHOST = 1;
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    glslVersion: THREE.GLSL3,
    side: THREE.DoubleSide,
    clipping: true,
    toneMapped: false,
    transparent: ghost,
    depthWrite: !ghost,
    defines,
  });
  return m;
}
