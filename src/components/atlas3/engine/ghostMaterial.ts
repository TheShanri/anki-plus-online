import * as THREE from "three";

/* The see-through brain of the "deep structures" mode: the outside surface as a faint rim (fresnel), drawn after the
 * opaque structures with depth writes off, so the deep structures read inside a recognisable brain. */
/** The hull's colour and strength for the page's mode: light on a dark page, a darker ink on a light one. */
export function setGhostMode(m: THREE.ShaderMaterial, onLight: boolean) {
  (m.uniforms.uColor.value as THREE.Color).set(onLight ? "#6d5a52" : "#e7d3c9");
  m.uniforms.uStrength.value = onLight ? 0.5 : 0.42;
}
export function makeGhostMaterial(planes: THREE.Plane[]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#e7d3c9") }, uStrength: { value: 0.42 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vV = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        vec3 N = normalize(vN);
        vec3 V = normalize(vV);
        float f = pow(1.0 - abs(dot(N, V)), 2.2);
        gl_FragColor = vec4(uColor, clamp(0.035 + f * uStrength, 0.0, 0.6));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    clipping: true,
    clippingPlanes: planes,
    toneMapped: false,
  });
}
