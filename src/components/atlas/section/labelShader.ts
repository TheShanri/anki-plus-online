import * as THREE from "three";

/**
 * Uniforms and GLSL for the labelled interior (labels.ts). Spliced into SEC_GLSL (shader.ts) before secTone, so every section
 * material (cap quads, the gross meshes' inside) paints the same labels.
 *
 * Border reconstruction: each voxel stores its label and m = g_best - g_second of the Gaussian-smoothed label indicators. For
 * a candidate label c the signed value of a voxel is +m if it is c, -m otherwise; trilinear interpolation of the 8 nearest
 * voxels gives f_c, a smooth function that is 0 on the border. The label with the largest f_c wins; d = f_win - f_second is
 * the distance-like margin that anti-aliases the border (fwidth) and draws the hairline.
 */
export const LAB = {
  uLab: { value: null as THREE.Data3DTexture | null },
  uLabPal: { value: null as THREE.DataTexture | null },
  uHasLab: { value: 0 },
  uLabCorner: { value: new THREE.Vector3() },
  uLabSize: { value: new THREE.Vector3(1, 1, 1) },
  uLabDims: { value: new THREE.Vector3(1, 1, 1) },
  uLabLine: { value: new THREE.Color("#3b302c") },
  uLabPlexus: { value: new THREE.Color("#9d5a66") },
  uLabHover: { value: new THREE.Color("#ffffff") },
  uLabAccent: { value: new THREE.Color("#ff8800") },
  uLabColour: { value: 0 },
  /** 0 normal; 1 structure-only: labels in state 3 are discarded; 2 structure-only, the rest dimmed */
  uLabOnly: { value: 0 },
  /** group ids of the third ventricle and the lateral ventricle (the midsagittal face looks through them at their wall) */
  uLabGrpV3: { value: -1 },
  uLabGrpLV: { value: -1 },
};

export const LAB_GLSL = /* glsl */ `
uniform highp sampler3D uLab;
uniform highp sampler2D uLabPal;
uniform float uHasLab;
uniform vec3 uLabCorner;
uniform vec3 uLabSize;
uniform vec3 uLabDims;
uniform vec3 uLabLine;
uniform vec3 uLabPlexus;
uniform vec3 uLabHover;
uniform vec3 uLabAccent;
uniform float uLabColour;
uniform float uLabOnly;
uniform float uLabGrpV3;
uniform float uLabGrpLV;

/** set instead of discarding inside helpers (D3D/ANGLE rejects that); the material's main checks it */
bool secDiscard = false;
/** palette row 0: tone, class, group, sub-line; row 1: hue (colour mode), state (0 -, 1 hover, 2 selected, 3 not in the structure-only cut) */
vec4 labPal(int i, int row) { return texelFetch(uLabPal, ivec2(i, row), 0); }
int labClass(int i) { return int(labPal(i, 0).g * 255.0 + 0.5); }
bool labInBox(vec3 p) {
  vec3 u = (p - uLabCorner) / uLabSize;
  return all(greaterThanEqual(u, vec3(0.0))) && all(lessThanEqual(u, vec3(1.0)));
}
/** Nearest-voxel label (no border reconstruction): for marching. */
int labNearest(vec3 p) {
  ivec3 d = ivec3(uLabDims);
  ivec3 q = ivec3(floor((p - uLabCorner) / uLabSize * uLabDims));
  if (any(lessThan(q, ivec3(0))) || any(greaterThanEqual(q, d))) return 0;
  return int(texelFetch(uLab, q, 0).r * 255.0 + 0.5);
}
/** Winner and runner-up label at p with the margin d >= 0 between them (0 on the border). False outside the box. */
bool labSample(vec3 p, out int lw, out int ls, out float d) {
  vec3 g = (p - uLabCorner) / uLabSize * uLabDims - 0.5;
  if (any(lessThan(g, vec3(-0.5))) || any(greaterThan(g, uLabDims - 0.5))) return false;
  ivec3 i0 = ivec3(floor(g));
  vec3 f = g - vec3(i0);
  ivec3 dmax = ivec3(uLabDims) - 1;
  int L[8];
  float M[8];
  float Wt[8];
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    vec2 t = texelFetch(uLab, clamp(i0 + o, ivec3(0), dmax), 0).rg;
    L[k] = int(t.r * 255.0 + 0.5);
    M[k] = t.g;
    vec3 w3 = mix(1.0 - f, f, vec3(o));
    Wt[k] = w3.x * w3.y * w3.z;
  }
  float fb = -9.0, fs = -9.0;
  int lb = 0, l2 = -1;
  for (int c = 0; c < 8; c++) {
    int lc = L[c];
    bool dup = false;
    for (int j = 0; j < 8; j++) { if (j >= c) break; if (L[j] == lc) dup = true; }
    if (dup) continue;
    float fc = 0.0;
    for (int k = 0; k < 8; k++) fc += Wt[k] * (L[k] == lc ? M[k] : -M[k]);
    if (fc > fb) { fs = fb; l2 = lb; fb = fc; lb = lc; }
    else if (fc > fs) { fs = fc; l2 = lc; }
  }
  if (l2 < 0) { l2 = lb; fs = -fb; }
  lw = lb;
  ls = l2;
  d = max(fb - fs, 0.0);
  return true;
}
/* ---- tissue texture: a fixed-brain slice is not flat paint. Grey matter is finely granular with a soft density mottle;
 * white matter is fibrous, striated along its fibres where the tract's direction is known (palette row 2: direction, strength);
 * the choroid plexus is lobulated; the pigmented nigra is speckled. Every term fades out before it would alias (fp: world
 * size of one screen pixel), so zooming reveals texture rather than shimmer. */
float labHash(vec3 q) { q = fract(q * 0.3183099 + 0.1); q *= 17.0; return fract(q.x * q.y * q.z * (q.x + q.y + q.z)); }
float labNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(labHash(i), labHash(i + vec3(1, 0, 0)), f.x), mix(labHash(i + vec3(0, 1, 0)), labHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(labHash(i + vec3(0, 0, 1)), labHash(i + vec3(1, 0, 1)), f.x), mix(labHash(i + vec3(0, 1, 1)), labHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/** Signed noise of wavelength w (m) at p, faded where w approaches the pixel footprint fp. */
float labGrain(vec3 p, float w, float fp) { return (labNoise(p / w) - 0.5) * (1.0 - smoothstep(0.35 * w, 0.9 * w, fp)); }
/** Fibre striation: noise stretched along the unit direction t (long streaks), fine across it. */
float labFibre(vec3 p, vec3 t, float fp) {
  vec3 u = normalize(abs(t.y) < 0.9 ? cross(t, vec3(0, 1, 0)) : cross(t, vec3(1, 0, 0)));
  vec3 v = cross(t, u);
  vec3 q = vec3(dot(p, t) / 0.0022, dot(p, u) / 0.00018, dot(p, v) / 0.00018);
  float fade = 1.0 - smoothstep(0.00012, 0.00034, fp);
  return (labNoise(q) - 0.5) * fade + 0.35 * (labNoise(q * vec3(0.5, 0.45, 0.45) + 7.3) - 0.5) * (1.0 - smoothstep(0.0003, 0.0008, fp));
}
vec3 labTexture(int i, int cls, vec3 col, vec3 p, float fp, float greyness) {
  float m = 0.06 * labGrain(p, 0.0045, fp);                       // soft density mottle (all tissue)
  if (cls == 6) return col * (1.0 + 0.25 * m);                    // CSF: clean and dark
  if (cls == 7) {                                                 // choroid plexus: lobulated fronds
    float lob = labNoise(p / 0.0007) * 0.6 + labNoise(p / 0.00025) * 0.4;
    return col * (0.82 + 0.36 * smoothstep(0.3, 0.75, lob)) * (1.0 + m);
  }
  vec4 fd = labPal(i, 2);
  float g = 0.075 * labGrain(p, 0.00022, fp) + 0.04 * labGrain(p, 0.0009, fp); // neuropil grain
  float w = 0.0;
  if (fd.a > 0.0) w = fd.a * 0.11 * labFibre(p, normalize(fd.rgb * 2.0 - 1.0), fp);
  else w = 0.045 * labGrain(p * vec3(1.0, 1.0, 1.0), 0.00035, fp);   // white matter of unknown direction: faint fibrous grain
  float t = mix(w, g, greyness) + m;
  if (i > 0 && labPal(i, 0).r * 1.3 - 0.3 < -0.05 && cls == 4) t += 0.16 * smoothstep(0.62, 0.8, labNoise(p / 0.00028)) * -1.0; // melanin speckle
  return col * (1.0 + t);
}
/** The tone of a label at p: flat tissue tone (or the field's tissue for cortex / white matter / cerebellum and label 0), textured. */
vec3 labTone(int i, vec2 k, vec3 p, float fp) {
  vec4 a = labPal(i, 0);
  int cls = int(a.g * 255.0 + 0.5);
  vec3 col;
  float grey = 1.0;
  if (cls == 0 || cls == 1 || cls == 3) { col = mix(uCSF, mix(uGM, uWM, k.x), k.y); grey = 1.0 - k.x; }
  else if (cls == 2) { col = mix(uCSF, uWM, k.y); grey = 0.0; }
  else if (cls == 6) col = uCSF;
  else if (cls == 7) col = uLabPlexus;
  else {
    float t = a.r * 1.3 - 0.3;
    col = t < 0.0 ? mix(uGM, uCSF, -t * 1.6) : mix(uGM, uWM, t);
    grey = cls == 5 ? 0.0 : 1.0 - clamp(t, 0.0, 1.0) * 0.6;
  }
  col = labTexture(i, cls, col, p, fp, grey);
  vec4 b = labPal(i, 1);
  int st = int(b.a * 255.0 + 0.5);
  if (uLabColour > 0.5 && cls >= 4) col = mix(col, b.rgb, 0.62);
  if (st == 1) col = mix(col, uLabHover, 0.5);
  else if (st == 2) col = mix(col, uLabAccent, uLabOnly > 1.5 ? 0.85 : 0.58); // "Show its cut": the structure stands out
  else if (st == 3 && uLabOnly > 1.5) col = mix(col, uWM, 0.72);
  return col;
}
bool labHidden(int i) {
  int st = int(labPal(i, 1).a * 255.0 + 0.5);
  return st == 3 && uLabOnly > 0.5 && uLabOnly < 1.5;
}
/** Hairline strength between two labels: none inside the field (cortex, white matter), none between two white tracts, the
 * group's sub-line between parts of one structure (thalamic nuclei), full otherwise. */
float labLine(int a, int b) {
  if (a == b) return 0.0;
  vec4 pa = labPal(a, 0), pb = labPal(b, 0);
  int ca = int(pa.g * 255.0 + 0.5), cb = int(pb.g * 255.0 + 0.5);
  bool fa = ca <= 3, fb = cb <= 3;
  if (fa && fb) return 0.0;
  bool wa = ca == 2 || ca == 5, wb = cb == 2 || cb == 5;
  if (wa && wb) return 0.0;
  if (abs(pa.b - pb.b) < 0.5 / 255.0) return min(pa.a, pb.a);
  return 1.0;
}
/** The labelled section tone at p (rgb), or a negative red channel when p is outside the label box. */
vec4 labSection(vec3 p, vec2 k) {
  int lw, ls;
  float d;
  if (uHasLab < 0.5 || !labSample(p, lw, ls, d)) return vec4(-1.0);
  if (labHidden(lw)) { secDiscard = true; return vec4(0.0); }
  float aa = max(fwidth(d), 1e-4) * 0.75;
  float fp = length(fwidth(p));
  vec3 cw = labTone(lw, k, p, fp);
  vec3 cs = labHidden(ls) ? cw : labTone(ls, k, p, fp);
  vec3 col = mix(cs, cw, smoothstep(-aa, aa, d));
  // borders: crisp but quiet, a fine darker seam only where the tissue tone alone would not separate the two regions
  float ln = labLine(lw, ls) * (1.0 - smoothstep(0.06, 0.22, distance(cw, cs)));
  if (ln > 0.0) col = mix(col, uLabLine, ln * 0.42 * (1.0 - smoothstep(aa * 0.5, aa * 1.4, d)));
  return vec4(col, float(lw));
}
int labGroup(int i) { return int(labPal(i, 0).b * 255.0 + 0.5); }
/**
 * The midsagittal face (cap mode 2). Midline structures are cut (corpus callosum, fornix, septum, commissures, chiasm,
 * hypothalamus, pineal, tectum, brainstem, vermis). Where the plane runs down the third (or a lateral) ventricle the face
 * looks through the cavity at its wall (thalamus, hypothalamus) as a textbook midsagittal plate shows it, shaded by depth.
 * Cortex, hemispheric white matter and unlabelled CSF (the interhemispheric fissure) are left open (discard): the
 * hemisphere's medial surface behind shows there. Returns a negative red channel outside the label box.
 */
vec4 labMidline(vec3 p, vec3 n) {
  int lw, ls;
  float d;
  if (uHasLab < 0.5 || !labSample(p, lw, ls, d)) return vec4(-1.0);
  int grp = labGroup(lw);
  bool cavity = float(grp) == uLabGrpV3 || float(grp) == uLabGrpLV;
  if (cavity) {
    // march into the kept side to the cavity's wall (no derivatives inside the loop: the hit is shaded after it)
    float hit = -1.0;
    for (int s = 1; s <= 32; s++) {
      float t = float(s) * 0.0005;
      int l = labNearest(p + n * t);
      if (l == 0) break;
      int g = labGroup(l);
      if (float(g) == uLabGrpV3 || float(g) == uLabGrpLV) continue;
      int c = labClass(l);
      if (c != 1 && c != 2) hit = t;
      break;
    }
    if (hit < 0.0) { secDiscard = true; return vec4(0.0); }
    vec3 q = p + n * hit;
    vec4 w = labSection(q, secClass(q));
    if (w.r < 0.0) { secDiscard = true; return vec4(0.0); }
    return vec4(w.rgb * (1.0 - 0.32 * smoothstep(0.0, 0.012, hit)), w.a);
  }
  int c = labClass(lw);
  if (lw == 0 || c == 1 || c == 2) { secDiscard = true; return vec4(0.0); }
  return labSection(p, secClass(p));
}
`;
