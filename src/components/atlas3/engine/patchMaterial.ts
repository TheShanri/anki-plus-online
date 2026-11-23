import * as THREE from "three";

/* The one shader of the v3 atlas. Every triangle of the patch network separates two regions: `_labels` = (a, b), with
 * the normal pointing from a into b. Per fragment:
 *   viewer inside a visible region  -> this is that region's CUT FACE (flat cap colour)       (after a clip plane)
 *   else the region beyond is visible -> its SURFACE, lit with that region's own smooth normal
 *   else                              -> nothing (both sides hidden)
 * The per-label state lives in a small texture (rows: 0 surface rgb + visible, 1 cap rgb, 2 tint rgb + strength), so
 * showing, hiding, colouring or highlighting any structure is a texture update, never a new mesh. */

export const STATE_ROWS = 3;

const vertex = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
attribute vec2 _labels;
#ifdef SHELL
attribute float _ao;
varying float vAO;
#else
attribute vec3 _normalb;
#endif
flat varying ivec2 vLab;
varying vec3 vNA;
varying vec3 vNB;
varying vec3 vView;
void main() {
  vLab = ivec2(_labels + 0.5);
  vNA = normalize(normalMatrix * normal);
#ifdef SHELL
  vNB = -vNA;
  vAO = _ao;
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
flat varying ivec2 vLab;
varying vec3 vNA;
varying vec3 vNB;
varying vec3 vView;
#ifdef SHELL
varying float vAO;
#endif
vec4 st(int l, int row) { return texelFetch(uState, ivec2(l, row), 0); }
bool vis(int l) { return l > 0 && st(l, 0).a > 0.5; }
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
void main() {
  #include <clipping_planes_fragment>
  bool front = gl_FrontFacing;
  int here = front ? vLab.y : vLab.x;
  int there = front ? vLab.x : vLab.y;
  int lab;
  bool cap;
  if (vis(here)) { lab = here; cap = true; }
  else if (vis(there)) { lab = there; cap = false; }
  else discard;
  if (uPick == 1) {
    outColor = vec4(float(lab & 255) / 255.0, float(lab >> 8) / 255.0, cap ? 1.0 : 0.0, 1.0);
    return;
  }
  vec3 col;
  if (cap) {
    col = st(lab, 1).rgb;
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
  };
}

export function makePatchMaterial(uniforms: PatchUniforms, shell: boolean): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    glslVersion: THREE.GLSL3,
    side: THREE.DoubleSide,
    clipping: true,
    toneMapped: false,
    defines: shell ? { SHELL: 1 } : {},
  });
  return m;
}
