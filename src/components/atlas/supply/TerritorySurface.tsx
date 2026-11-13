"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasIndex } from "@/lib/atlas";
import { loadAtlasModel } from "../ui/modelCache";
import { SUPPLY, unitArteries } from "./supply-data";

/**
 * One soft territory skin over the cortex. The cortical gyri of gross.glb are merged into a single mesh; every vertex is
 * assigned to ACA, MCA or PCA from the course's supply map (and, where a gyrus is shared between ACA and MCA, from which way
 * the surface faces), then the assignment is blurred over a few millimetres, so the edges are soft instead of following mesh
 * borders. Colour and opacity are per-vertex, so only one translucent layer is ever drawn (no stacked fog).
 *
 * Occlusion: the brain is translucent, so a skin drawn with plain depth testing shows the far side through it (the MCA's
 * lateral convexity painted over the medial wall). Before the skin is drawn, the whole brain surface of gross.glb (cerebrum,
 * cerebellum, brainstem; both faces of every triangle, so it does not depend on normals or winding; clipped like the viewer)
 * plus the deep structures that fill the hollow cortical shell (FILL) is rendered depth-only into a private depth texture
 * with the same camera. The skin's fragment shader discards every
 * fragment lying more than OCC_TOL behind that nearest surface, so a territory shows only where its own cortex is the brain
 * surface facing the camera. The private target leaves the main depth buffer alone: vessels and deep territories inside
 * the translucent brain stay visible exactly as before.
 */
export type TerritoryShow = { artery: string; alpha: number };
/** The viewer's controlled cut, same meaning as AtlasViewer's `cut` prop (removes the high side unless flipped). */
export type TerritoryCut = { axis: "x" | "y" | "z"; position: number; flip?: boolean };

const CORTICAL = ["aca", "mca", "pca"] as const;
const BLUR = 0.0065; // metres
const LIFT = 0.00035; // metres along the normal, so the skin sits just above the brain surface
/** How far (view depth, metres) a skin fragment may lie behind the nearest brain surface and still show: covers the lift and the gap between neighbouring gyral patches, far less than any fold or the far side of the brain. */
const OCC_TOL = 0.0015;
/** gross.glb is a hollow shell of cortical patches: through the gap in the medial wall (corpus callosum, diencephalon) or the
 * anterior perforated substance the next surface would be the inside of the far cortex (the insula, the opercula). These
 * fill the interior, as in the viewer's sections, so what lies behind them counts as hidden. */
const FILL = ["corpus-callosum", "fornix", "septum-pellucidum", "anterior-commissure", "mni-internal-capsule", "caudate-nucleus", "putamen", "globus-pallidus", "thalamus", "hypothalamus", "hippocampus", "amygdaloid-body", "optic-chiasm", "lateral-ventricle", "third-ventricle", "fourth-ventricle"];
/** Radius (CSS px) over which the nearest depth is taken: closes the cracks between gyral patches, through which the inside of the far cortex would otherwise show. */
const OCC_PX = 4;
/** Medial view: the model has no medial wall in places (the frontal and callosal region), so the far side of the hemisphere (the inner opercula, the insula, the lateral convexity) would show through and take the
 * MCA colour. The cut section of the closed brain solid (brainfill.glb) stands in for the missing wall in the depth pre-pass only: the back faces of the
 * clipped solid are drawn at the depth of the cut plane pushed CAP_DEPTH into the brain, deeper than any medial sulcus, shallower than the insula. */
/** Flat tone of the underlay (what the brain looks like over white). */
const UNDERLAY = "#d8c6c0";
const CAP_DEPTH = 0.022; // metres behind the cut plane

/** The viewer stops drawing the brainstem here (the open lower medulla); the occluder stops at the same plane. */
const MEDULLA_CUT = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.52);

type Built = { geo: THREE.BufferGeometry; w: Record<string, Float32Array>; n: number };

/** The whole brain surface (gross.glb and the interior fill) at its world transform, every mesh sharing one depth-only material. */
function buildOccluder(roots: THREE.Group[], mat: THREE.Material): THREE.Scene {
  const scene = new THREE.Scene();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const c = new THREE.Mesh(m.geometry, mat);
      c.matrixAutoUpdate = false;
      c.matrix.copy(m.matrixWorld);
      c.matrixWorldNeedsUpdate = true;
      scene.add(c);
    });
  }
  return scene;
}

/** Depth-only material: back faces of the clipped brain solid, written at the cut plane (+ CAP_DEPTH) along each view ray. */
function makeCapMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uPlane: { value: new THREE.Vector4(-1, 0, 0, 0) }, // keeps dot(n,p)+c >= 0
      uDepth: { value: CAP_DEPTH },
      uCam: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3() }, // ortho view direction
      uOrtho: { value: 0 },
      uVP: { value: new THREE.Matrix4() },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec4 uPlane; uniform float uDepth; uniform vec3 uCam; uniform vec3 uDir; uniform float uOrtho; uniform mat4 uVP;
      varying vec3 vW;
      void main(){
        if (dot(uPlane.xyz, vW) + uPlane.w < 0.0) discard;
        vec3 dir = uOrtho > 0.5 ? uDir : normalize(vW - uCam);
        float dn = dot(uPlane.xyz, dir);
        if (abs(dn) < 1e-4) discard;
        float t = (uDepth - uPlane.w - dot(uPlane.xyz, uOrtho > 0.5 ? vW : uCam)) / dn;
        vec3 q = (uOrtho > 0.5 ? vW : uCam) + dir * t;
        vec4 c = uVP * vec4(q, 1.0);
        gl_FragDepth = clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0);
      }`,
  });
}

function cutPlanes(cut: TerritoryCut | undefined): THREE.Plane[] {
  if (!cut) return [MEDULLA_CUT];
  const e = new THREE.Vector3(cut.axis === "x" ? 1 : 0, cut.axis === "y" ? 1 : 0, cut.axis === "z" ? 1 : 0);
  const p = cut.flip ? new THREE.Plane(e, -cut.position) : new THREE.Plane(e.negate(), cut.position);
  return [p, MEDULLA_CUT];
}

/** Uniforms of the occlusion test (shared by the skin material's shader). */
function occUniforms(depth: THREE.DepthTexture) {
  return {
    uOccDepth: { value: depth as THREE.Texture },
    uOccRes: { value: new THREE.Vector2(1, 1) },
    uOccNear: { value: 0.01 },
    uOccFar: { value: 6 },
    uOccOrtho: { value: 0 },
    uOccOn: { value: 0 },
    uOccTol: { value: OCC_TOL },
    uOccPx: { value: OCC_PX },
  };
}
type OccUniforms = ReturnType<typeof occUniforms>;

const OCC_GLSL = `
uniform sampler2D uOccDepth;
uniform vec2 uOccRes;
uniform float uOccNear;
uniform float uOccFar;
uniform float uOccOrtho;
uniform float uOccOn;
uniform float uOccTol;
uniform float uOccPx;
float occViewZ(const in float d) {
  return uOccOrtho > 0.5 ? d * (uOccNear - uOccFar) - uOccNear : (uOccNear * uOccFar) / ((uOccFar - uOccNear) * d - uOccFar);
}
void main() {
  float occHere = occViewZ(gl_FragCoord.z);
  float occSlope = fwidth(occHere);
  if (uOccOn > 0.5) {
    // nearest depth over a small disc (a crack between patches is a few pixels wide)
    float d = texture2D(uOccDepth, gl_FragCoord.xy / uOccRes).x;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 o = vec2(cos(a), sin(a)) * uOccPx;
      d = min(d, texture2D(uOccDepth, (gl_FragCoord.xy + o) / uOccRes).x);
      d = min(d, texture2D(uOccDepth, (gl_FragCoord.xy + 0.5 * o) / uOccRes).x);
    }
    float occFront = occViewZ(d);
    // view z is negative: further from the camera is more negative; the slope term keeps the skin's own tilted surface
    if (occHere < occFront - uOccTol - (uOccPx + 2.0) * occSlope) discard;
  }
`;

function buildSurface(root: THREE.Group, variant: string): Built | null {
  // cortical units are the first block of the supply map (up to the corpus callosum)
  const end = SUPPLY.units.findIndex((u) => u.name === "Corpus callosum");
  const units = SUPPLY.units.slice(0, end > 0 ? end : 24);
  const byName = new Map<string, THREE.Mesh>();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) byName.set(m.name, m);
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const arteryOf: number[] = []; // 0 aca 1 mca 2 pca, -1 none
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const u of units) {
    const arts = unitArteries(u, variant);
    const primary = arts[0];
    const shared = new Set(arts.slice(0, 2)).size === 2 && arts.includes("aca") && arts.includes("mca");
    for (const id of u.meshes) {
      for (const nodeName of [id, `${id}_m`]) {
        const mesh = byName.get(nodeName.replace(/[[\].:/]/g, ""));
        if (!mesh) continue;
        const g = mesh.geometry;
        const p = g.attributes.position as THREE.BufferAttribute;
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.normal as THREE.BufferAttribute;
        nm.getNormalMatrix(mesh.matrixWorld);
        const base = pos.length / 3;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
          pos.push(v.x + nv.x * LIFT, v.y + nv.y * LIFT, v.z + nv.z * LIFT);
          nor.push(nv.x, nv.y, nv.z);
          let a = primary;
          if (shared) {
            const medial = -Math.sign(v.x || 1) * nv.x; // facing the midline
            a = medial > 0.35 || Math.abs(v.x) < 0.012 ? "aca" : "mca";
          }
          arteryOf.push(CORTICAL.indexOf(a as (typeof CORTICAL)[number]));
        }
        // mirrored meshes (negative determinant) have flipped winding: swap two corners so FrontSide faces outward
        const flip = mesh.matrixWorld.determinant() < 0;
        const ix = g.index;
        const cnt = ix ? ix.count : p.count;
        const at = (i: number) => base + (ix ? ix.getX(i) : i);
        for (let i = 0; i + 2 < cnt; i += 3) {
          if (flip) idx.push(at(i), at(i + 2), at(i + 1));
          else idx.push(at(i), at(i + 1), at(i + 2));
        }
      }
    }
  }
  const n = pos.length / 3;
  if (!n) return null;
  // blur the one-hot assignment over a spatial hash
  const cell = BLUR;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < n; i++) {
    const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  const w: Record<string, Float32Array> = { aca: new Float32Array(n), mca: new Float32Array(n), pca: new Float32Array(n) };
  const sigma2 = (BLUR * 0.5) ** 2;
  const R2 = BLUR * BLUR;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    let sum = 0;
    const acc = [0, 0, 0];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!l) continue;
          for (const j of l) {
            const ex = pos[j * 3] - x;
            const ey = pos[j * 3 + 1] - y;
            const ez = pos[j * 3 + 2] - z;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 > R2) continue;
            // do not blur through the other side of a thin fold: weight down surfaces that face away
            const dot = nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2];
            if (dot < 0.1) continue;
            const k = Math.exp(-d2 / (2 * sigma2));
            sum += k;
            const a = arteryOf[j];
            if (a >= 0) acc[a] += k;
          }
        }
    if (sum > 0) {
      w.aca[i] = acc[0] / sum;
      w.mca[i] = acc[1] / sum;
      w.pca[i] = acc[2] / sum;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  geo.setIndex(idx);
  return { geo, w, n };
}

export function TerritorySurface({
  show,
  colors,
  variant,
  side,
  cut,
  opacity = 0.72,
}: {
  show: TerritoryShow[];
  colors: Map<string, string>;
  variant: string;
  /** Only this hemisphere (left = +x). */
  side?: "L" | "R";
  /** The viewer's cut, so the occluder is clipped the same way (the medial view sees past the removed hemisphere). */
  cut?: TerritoryCut;
  opacity?: number;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const needed = show.some((s) => (CORTICAL as readonly string[]).includes(s.artery));
  useEffect(() => {
    if (!needed || root) return;
    let alive = true;
    loadAtlasModel("gross.glb")
      .then((g) => alive && setRoot(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [needed, root]);
  const [fill, setFill] = useState<THREE.Group[] | null>(null);
  useEffect(() => {
    if (!needed || fill) return;
    let alive = true;
    loadAtlasIndex()
      .then((index) => Promise.all(FILL.flatMap((id) => (index.structures[id]?.file ? [loadAtlasModel(index.structures[id].file as string).catch(() => null)] : []))))
      .then((gs) => alive && setFill(gs.filter((g): g is THREE.Group => !!g)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [needed, fill]);
  // the closed brain solid, only for a cut view: its cut section stands in for the missing medial wall in the depth pre-pass
  const [solid, setSolid] = useState<THREE.Group | null>(null);
  useEffect(() => {
    if (solid) return;
    let alive = true;
    loadAtlasModel("brainfill.glb")
      .then((g) => alive && setSolid(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [solid]);
  const built = useMemo(() => (root ? buildSurface(root, variant) : null), [root, variant]);
  useEffect(() => () => built?.geo.dispose(), [built]);

  // ---- occlusion: a private depth target holding the nearest brain surface, refreshed when the camera or canvas changes
  const occ = useMemo(() => {
    const depth = new THREE.DepthTexture(1, 1);
    const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, depthTexture: depth });
    const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide });
    return { depth, rt, depthMat, u: occUniforms(depth), key: [] as number[], size: new THREE.Vector2(), vp: new THREE.Vector4() };
  }, []);
  useEffect(
    () => () => {
      occ.rt.dispose();
      occ.depth.dispose();
      occ.depthMat.dispose();
    },
    [occ],
  );
  const occScene = useMemo(() => (root ? buildOccluder([root, ...(fill ?? [])], occ.depthMat) : null), [root, fill, occ]);
  const capMat = useMemo(() => makeCapMaterial(), []);
  useEffect(() => () => capMat.dispose(), [capMat]);
  // underlay: the far inner wall of the same solid in a flat brain tone, drawn first, so a gap in the gyral model (the frontal window, the diencephalon) never shows the page behind the brain
  const underMat = useMemo(() => new THREE.MeshBasicMaterial({ color: UNDERLAY, side: THREE.BackSide, depthWrite: false, depthTest: false }), []);
  useEffect(() => () => underMat.dispose(), [underMat]);
  const underScene = useMemo(() => {
    if (!solid) return null;
    const sc = buildOccluder([solid], underMat);
    sc.traverse((o) => {
      o.renderOrder = -10;
      o.raycast = () => null;
    });
    return sc;
  }, [solid, underMat]);
  const capScene = useMemo(() => (solid ? buildOccluder([solid], capMat) : null), [solid, capMat]);
  const cutKey = cut ? `${cut.axis}:${cut.position}:${cut.flip ? 1 : 0}` : "";

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, roughness: 0.7, metalness: 0, side: THREE.FrontSide });
    const u: OccUniforms = occ.u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", OCC_GLSL);
    };
    m.customProgramCacheKey = () => "territory-occluded";
    return m;
  }, [occ]);
  useEffect(() => () => mat.dispose(), [mat]);
  const fade = useRef({ cur: 0, tgt: 0 });

  /* three.js objects are configured imperatively */
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const parts = cutKey ? cutKey.split(":") : null;
    const planes = cutPlanes(parts ? { axis: parts[0] as TerritoryCut["axis"], position: Number(parts[1]), flip: parts[2] === "1" } : undefined);
    occ.depthMat.clippingPlanes = planes;
    underMat.clippingPlanes = planes;
    capMat.uniforms.uPlane.value.set(planes[0].normal.x, planes[0].normal.y, planes[0].normal.z, planes[0].constant);
    occ.depthMat.needsUpdate = true;
    occ.key.length = 0; // the next frame redraws the depth
    invalidate();
  }, [cutKey, occ, capMat, underMat, invalidate]);

  /** Runs right before the skin is drawn, with the camera it is drawn with (also each multi-view pane). */
  const depthPass = useMemo(
    () => (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, cam: THREE.Camera) => {
      const u = occ.u;
      if (!occScene) {
        u.uOccOn.value = 0;
        return;
      }
      const prev = renderer.getRenderTarget();
      if (prev) occ.size.set(prev.width, prev.height);
      else renderer.getDrawingBufferSize(occ.size);
      renderer.getCurrentViewport(occ.vp);
      const w = Math.max(1, Math.floor(occ.size.x));
      const h = Math.max(1, Math.floor(occ.size.y));
      if (occ.rt.width !== w || occ.rt.height !== h) {
        occ.rt.setSize(w, h);
        occ.key.length = 0;
      }
      // same camera, projection, viewport and occluder as last time: the depth texture is still right
      const k = occ.key;
      const me = cam.matrixWorld.elements;
      const pe = cam.projectionMatrix.elements;
      const vp = occ.vp;
      let same = k.length === 36;
      for (let i = 0; same && i < 16; i++) same = k[i] === me[i] && k[16 + i] === pe[i];
      same = same && k[32] === vp.x && k[33] === vp.y && k[34] === vp.z && k[35] === vp.w;
      if (!same) {
        k.length = 0;
        k.push(...me, ...pe, vp.x, vp.y, vp.z, vp.w);
        occ.rt.viewport.copy(vp);
        occ.rt.scissor.copy(vp);
        occ.rt.scissorTest = true;
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(occ.rt);
        renderer.clear(false, true, false);
        renderer.render(occScene, cam);
        if (capScene && cutKey) {
          const cu = capMat.uniforms;
          (cu.uCam.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
          cu.uOrtho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
          cam.getWorldDirection(cu.uDir.value as THREE.Vector3);
          (cu.uVP.value as THREE.Matrix4).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          renderer.render(capScene, cam);
        }
        renderer.setRenderTarget(prev);
        renderer.autoClear = autoClear;
      }
      const pc = cam as THREE.PerspectiveCamera;
      u.uOccRes.value.set(w, h);
      u.uOccPx.value = OCC_PX * renderer.getPixelRatio();
      u.uOccNear.value = pc.near;
      u.uOccFar.value = pc.far;
      u.uOccOrtho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
      u.uOccOn.value = 1;
    },
    [occ, occScene, capScene, capMat, cutKey],
  );
  useEffect(() => {
    occ.key.length = 0;
    invalidate();
  }, [occScene, capScene, occ, invalidate]);

  useEffect(() => {
    if (!built) return;
    const col = built.geo.attributes.color as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const rgb = CORTICAL.map((a) => new THREE.Color(colors.get(a) ?? "#999999").lerp(new THREE.Color("#ffffff"), 0.16));
    const amt = CORTICAL.map((a) => show.find((s) => s.artery === a)?.alpha ?? 0);
    const posA = built.geo.attributes.position.array as Float32Array;
    for (let i = 0; i < built.n; i++) {
      if (side && (side === "L") !== posA[i * 3] > 0) {
        arr[i * 4 + 3] = 0;
        continue;
      }
      const wa = built.w.aca[i] * amt[0];
      const wm = built.w.mca[i] * amt[1];
      const wp = built.w.pca[i] * amt[2];
      const t = wa + wm + wp;
      if (t < 0.02) {
        arr[i * 4 + 3] = 0;
        continue;
      }
      arr[i * 4] = (rgb[0].r * wa + rgb[1].r * wm + rgb[2].r * wp) / t;
      arr[i * 4 + 1] = (rgb[0].g * wa + rgb[1].g * wm + rgb[2].g * wp) / t;
      arr[i * 4 + 2] = (rgb[0].b * wa + rgb[1].b * wm + rgb[2].b * wp) / t;
      // soft edge: alpha follows the blurred weight, smoothstepped
      const s = Math.min(1, t);
      arr[i * 4 + 3] = s * s * (3 - 2 * s);
    }
    col.needsUpdate = true;
    fade.current.tgt = show.some((s) => (CORTICAL as readonly string[]).includes(s.artery)) ? opacity : 0;
    invalidate();
  }, [built, show, colors, side, opacity, invalidate]);

  useFrame((_, dt) => {
    const f = fade.current;
    if (Math.abs(f.cur - f.tgt) > 0.004) {
      f.cur += (f.tgt - f.cur) * (1 - Math.exp(-Math.min(dt, 0.1) * 8));
      invalidate();
    } else f.cur = f.tgt;
    mat.opacity = f.cur;
  });
  const attach = (m: THREE.Mesh | null) => {
    if (m) m.onBeforeRender = depthPass as unknown as THREE.Mesh["onBeforeRender"];
  };
  /* eslint-enable react-hooks/immutability */
  return (
    <>
      {underScene && <primitive object={underScene} />}
      {built && <mesh ref={attach} geometry={built.geo} material={mat} renderOrder={5} raycast={() => null} />}
    </>
  );
}
