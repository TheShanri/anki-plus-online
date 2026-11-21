import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/* The v3 visual language (docs/PATHWAY_V3.md):
 *  - context anatomy: opaque matte "clay" with a crisp dark silhouette (an inverted hull),
 *  - hosts (the nerves, roots, tracts and brainstem the fibres run in): the same clay drawn from the inside (back faces only),
 *    a cutaway shell, so the fibre inside is visible without any transparency,
 *  - regions (the stops): opaque neutral fill with a dark outline; the current one brighter; hover = outline glow,
 *  - one ghost layer (body skin and the brain's outer surface): a rim-only silhouette, rendered last, depthWrite off,
 *  - fibres: screen-space lines with a dark rim and a bright core in the neuron's order colour; right-side neurons dashed.
 * Materials are made here (outside components) so the immutability lint does not treat GPU objects as state. */

export interface Palette {
  clay: string;
  clayDark: string;
  host: string;
  ink: string;
  ghost: string;
  accent: string;
  regionFill: string;
  regionCurrent: string;
  regionOutline: string;
  /** the flat section face behind head beats */
  cap: string;
  bg: string;
  dark: boolean;
}

export function clayMaterial(color: string, planes: THREE.Plane[] = []): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, clippingPlanes: planes, side: planes.length ? THREE.DoubleSide : THREE.FrontSide });
}
/** A host shell seen from the inside: back faces only, lit with flipped normals (three's BackSide does that). */
export function hostMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, side: THREE.BackSide, emissive: new THREE.Color(color), emissiveIntensity: 0.06 });
}
export function regionMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
}
/** Inverted hull: back faces of the mesh pushed out along the normals, flat dark colour. `width` in metres. */
export function hullMaterial(color: string, width: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHull = { value: width };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uHull;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * uHull; // MeshBasic declares no objectNormal");
  };
  m.customProgramCacheKey = () => "pw3-hull";
  return m;
}
export function setHullWidth(m: THREE.MeshBasicMaterial, w: number) {
  const sh = m.userData.shader as { uniforms: { uHull: { value: number } } } | undefined;
  if (sh) sh.uniforms.uHull.value = w;
}
/** Rim-only silhouette (fresnel): transparent in the middle, a crisp line at the grazing edge. */
export function ghostMaterial(color: string, strength = 0.55): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_vertex>
      void main(){
        // named mvPosition: <clipping_planes_vertex> reads it (with a cut the shader failed to compile)
        vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = smoothstep(0.72, 0.93, f) * uStrength;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    clipping: true,
  });
}

/** A fibre line: core (order colour, dashed for the right side) or rim (dark, solid, a little wider). Widths in CSS px. */
export function lineMaterial(color: string, o: { dashed?: boolean; rim?: boolean }): LineMaterial {
  const m = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: o.rim ? 6 : 3.4,
    worldUnits: false,
    dashed: !!o.dashed,
    dashSize: 1,
    gapSize: 0.7,
    transparent: true,
    depthWrite: !o.rim,
    toneMapped: false,
  });
  return m;
}

export const PALETTES: Record<"light" | "dark", Omit<Palette, "accent" | "bg">> = {
  light: { clay: "#d8d1c4", clayDark: "#b9b0a1", host: "#e9e1d0", ink: "#1c1a17", ghost: "#6b6458", regionFill: "#ede6d6", regionCurrent: "#fff4c2", regionOutline: "#1c1a17", cap: "#c9c0ad", dark: false },
  dark: { clay: "#8d867b", clayDark: "#6d675e", host: "#a8a091", ink: "#0b0a09", ghost: "#cfc6b4", regionFill: "#ede6d6", regionCurrent: "#fff4c2", regionOutline: "#0b0a09", cap: "#57514a", dark: true },
};
