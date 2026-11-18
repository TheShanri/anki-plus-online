"use client";

import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasModel } from "../ui/modelCache";
import { layoutLabels, type LabelBus, type RawLabel } from "./margin-labels";
import { fillWidthFor } from "./VesselLayer";
import { VEIN_NAME, VEIN_STEPS } from "./supply-guide";

/**
 * Drainage layer: the cerebral veins and dural venous sinuses of public/atlas/veins.json (tools/atlas/veins/build.py, adapted
 * from Z-Anatomy, CC BY-SA 4.0) as smooth swept tubes (the superior sagittal sinus triangular, the cavernous sinus oval),
 * the falx cerebri and tentorium cerebelli as faint context, and the internal carotid artery through the cavernous sinus.
 *
 * No lag on a step change: every geometry and material is built once (when the Blood supply page opens, not when Drainage is
 * entered) and the shaders are compiled right away; a step only changes uniforms (opacity, reveal, highlight) and visibility.
 * All vessel materials share one shader program. Flow is drawn in the shader as soft bands moving along each vessel; a new
 * step draws its vessels in along the flow.
 */
export type VeinEntry = { id: string; name: string; side: "l" | "r" | "m"; kind: string; profile: "round" | "tri" | "oval"; pts: number[]; r: number[]; w?: number[]; h?: number[]; n?: number[]; ry?: number };
export type VeinFile = { vessels: VeinEntry[]; granulations: number[][]; ica: { side: string; pts: number[]; r: number }[] };

let veinsP: Promise<VeinFile> | null = null;
/** Starts (once) the download of everything the drainage layer needs. */
export function preloadVeins(): Promise<VeinFile> {
  veinsP ??= fetch("/atlas/veins.json").then((r) => {
    if (!r.ok) throw new Error(`veins.json ${r.status}`);
    return r.json() as Promise<VeinFile>;
  });
  void loadAtlasModel("s/falx-cerebri.glb").catch(() => undefined);
  void loadAtlasModel("s/tentorium-cerebelli.glb").catch(() => undefined);
  return veinsP;
}

const MM = 0.001;
const VEIN = new THREE.Color("#4f7cc4");
const VEIN_DEEP = new THREE.Color("#3d63a8");
const CSF = new THREE.Color("#cfe3f2");
const ICA_RED = new THREE.Color("#c9505f");
const LABEL_BLUE = "#3f6fb8";
const REVEAL_S = 1.9; // seconds to draw a step's vessels in
const GLIDE_S = 1.6; // camera glide
const FLOW_SPEED = 0.014; // m/s of the flow bands
const FLOW_GAP = 0.024; // m between bands

/* ---------------- geometry ---------------- */

/** Rounded triangle (apex toward -n), as offsets in (lateral, outward) units of w and h. */
function triProfile(k: number): [number, number][] {
  const P: [number, number][] = [
    [0, -2 / 3],
    [1, 1 / 3],
    [-1, 1 / 3],
  ];
  let poly: [number, number][] = [];
  for (let e = 0; e < 3; e++) {
    const a = P[e];
    const b = P[(e + 1) % 3];
    for (let i = 0; i < k; i++) poly.push([a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]);
  }
  for (let it = 0; it < 3; it++) {
    const q: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    poly = q;
  }
  // resample to an even count around the perimeter
  const per: number[] = [0];
  for (let i = 1; i <= poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i % poly.length];
    per.push(per[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const out: [number, number][] = [];
  const N = 30;
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (per[per.length - 1] * i) / N;
    while (per[j + 1] < s) j++;
    const a = poly[j % poly.length];
    const b = poly[(j + 1) % poly.length];
    const u = (s - per[j]) / (per[j + 1] - per[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}
const TRI = triProfile(4);

/** A swept tube along a vessel centreline with per-point radius; attributes aS (arc length from the flow start) and aT (0-1). */
function sweep(e: { pts: number[]; r: number[]; profile: string; w?: number[]; h?: number[]; n?: number[]; ry?: number }, radial: number): THREE.BufferGeometry {
  const n = e.pts.length / 3;
  const P: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) P.push(new THREE.Vector3(e.pts[i * 3], e.pts[i * 3 + 1], e.pts[i * 3 + 2]));
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const L = cum[n - 1] || 1;
  const T = P.map((p, i) => (i === 0 ? P[1].clone().sub(p) : i === n - 1 ? p.clone().sub(P[n - 2]) : P[i + 1].clone().sub(P[i - 1])).normalize());
  const tri = e.profile === "tri";
  const oval = e.profile === "oval";
  const ring = tri ? TRI.length : radial;
  const pos: number[] = [];
  const aS: number[] = [];
  const aT: number[] = [];
  const idx: number[] = [];
  // frame: tri uses the stored outward normal, oval keeps "up" vertical, round uses parallel transport
  let N0 = new THREE.Vector3(0, 1, 0);
  if (Math.abs(T[0].dot(N0)) > 0.9) N0 = new THREE.Vector3(1, 0, 0);
  N0.sub(T[0].clone().multiplyScalar(N0.dot(T[0]))).normalize();
  const Nn = new THREE.Vector3();
  const B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    if (tri && e.n) Nn.set(e.n[i * 3], e.n[i * 3 + 1], e.n[i * 3 + 2]);
    else if (oval) Nn.copy(up);
    else if (i === 0) Nn.copy(N0);
    // (parallel transport: keep the previous normal)
    Nn.sub(T[i].clone().multiplyScalar(Nn.dot(T[i]))).normalize();
    B.crossVectors(T[i], Nn).normalize();
    const r = e.r[i] * MM;
    for (let k = 0; k < ring; k++) {
      let u: number;
      let v: number;
      if (tri) {
        const w = (e.w?.[i] ?? e.r[i]) * MM;
        const h = (e.h?.[i] ?? e.r[i] * 1.4) * MM;
        u = TRI[k][0] * w;
        v = TRI[k][1] * h;
      } else {
        const a = (k / ring) * Math.PI * 2;
        u = Math.cos(a) * r;
        v = Math.sin(a) * r * (oval ? (e.ry ?? 1) : 1);
      }
      pos.push(P[i].x + B.x * u + Nn.x * v, P[i].y + B.y * u + Nn.y * v, P[i].z + B.z * u + Nn.z * v);
      aS.push(cum[i]);
      aT.push(cum[i] / L);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      idx.push(a, a + ring, b, b, a + ring, b + ring);
    }
  // rounded end caps (a pole a little beyond each end)
  const cap = (i: number, dir: THREE.Vector3, flip: boolean) => {
    const pole = pos.length / 3;
    const r = e.r[i] * MM * 0.55;
    pos.push(P[i].x + dir.x * r, P[i].y + dir.y * r, P[i].z + dir.z * r);
    aS.push(cum[i]);
    aT.push(cum[i] / L);
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      if (flip) idx.push(b, a, pole);
      else idx.push(a, b, pole);
    }
  };
  cap(0, T[0].clone().negate(), false);
  cap(n - 1, T[n - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---------------- material: one shared program ---------------- */

type U = { uReveal: { value: number }; uTime: { value: number }; uPulse: { value: number }; uHi: { value: number } };
function veinMaterial(color: THREE.Color, opts: { rough?: number; flow?: boolean } = {}) {
  const u: U = { uReveal: { value: 1 }, uTime: { value: 0 }, uPulse: { value: 0 }, uHi: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.38, metalness: 0.02, transparent: true, opacity: 0, depthWrite: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aS;\nattribute float aT;\nvarying float vS;\nvarying float vT;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvS = aS;\nvT = aT;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uReveal;\nuniform float uTime;\nuniform float uPulse;\nuniform float uHi;\nvarying float vS;\nvarying float vT;")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vT > uReveal) discard;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
float edge = (1.0 - smoothstep(0.0, 0.07, uReveal - vT)) * step(uReveal, 0.999);
float ph = fract((vS - uTime * ${FLOW_SPEED.toFixed(4)}) / ${FLOW_GAP.toFixed(4)});
float band = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.18, 0.62, ph));
totalEmissiveRadiance += vec3(0.62, 0.74, 0.95) * (band * uPulse * 0.5 + edge * 0.85 + uHi * 0.32);`,
      );
  };
  m.customProgramCacheKey = () => "supply-vein-v1";
  return { m, u };
}

/* ---------------- camera fit ---------------- */

function fitPoints(pts: THREE.Vector3[], dir: THREE.Vector3, fov: number, aspect: number, fillW: number, fillH: number) {
  const probe = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const right = new THREE.Vector3().setFromMatrixColumn(probe, 0);
  const upv = new THREE.Vector3().setFromMatrixColumn(probe, 1);
  const c0 = new THREE.Vector3();
  pts.forEach((p) => c0.add(p));
  c0.multiplyScalar(1 / Math.max(1, pts.length));
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  const q = new THREE.Vector3();
  for (const p of pts) {
    q.copy(p).sub(c0);
    r0 = Math.min(r0, q.dot(right));
    r1 = Math.max(r1, q.dot(right));
    u0 = Math.min(u0, q.dot(upv));
    u1 = Math.max(u1, q.dot(upv));
  }
  const c = c0.clone().addScaledVector(right, (r0 + r1) / 2).addScaledVector(upv, (u0 + u1) / 2);
  const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const tanH = tanV * aspect;
  let D = 0.12;
  for (const p of pts) {
    q.copy(p).sub(c);
    const a = q.dot(dir);
    D = Math.max(D, a + Math.abs(q.dot(right)) / (tanH * fillW), a + Math.abs(q.dot(upv)) / (tanV * fillH));
  }
  return { c, D };
}

/* ---------------- the layer ---------------- */

type Item = { id: string; side: string; mesh: THREE.Mesh };
type Group = { id: string; mats: { m: THREE.MeshStandardMaterial; u: U }[]; items: Item[]; cur: { op: number; rev: number; hi: number }; tgt: { op: number; hi: number }; revealFrom: number; anchors: THREE.Vector3[]; samples: THREE.Vector3[] };

export function VeinLayer({
  on,
  step,
  focus,
  animate,
  bus,
  onHover,
  onPick,
  topInset = 18,
}: {
  on: boolean;
  step: number;
  /** a vessel id hovered in the schematic or the 3D view */
  focus: string | null;
  animate: boolean;
  bus: LabelBus;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  topInset?: number;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const [data, setData] = useState<VeinFile | null>(null);
  const [dura, setDura] = useState<THREE.Group[] | null>(null);

  // preload on mount (the page mounts this layer in every mode, so Drainage opens with everything ready)
  useEffect(() => {
    let alive = true;
    preloadVeins()
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    Promise.all([loadAtlasModel("s/falx-cerebri.glb"), loadAtlasModel("s/tentorium-cerebelli.glb")])
      .then((g) => alive && setDura(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // ---- build once
  const built = useMemo(() => {
    if (!data) return null;
    const root = new THREE.Group();
    root.name = "veins";
    const groups = new Map<string, Group>();
    const group = (id: string, color: THREE.Color, rough?: number) => {
      let g = groups.get(id);
      if (!g) {
        g = { id, mats: [], items: [], cur: { op: 0, rev: 1, hi: 0 }, tgt: { op: 0, hi: 0 }, revealFrom: -1, anchors: [], samples: [] };
        g.mats.push(veinMaterial(color, { rough }));
        groups.set(id, g);
      }
      return g;
    };
    for (const e of data.vessels) {
      const deep = e.id === "icv" || e.id === "gcv" || e.id === "basal";
      const g = group(e.id, deep ? VEIN_DEEP : VEIN, e.kind === "sinus" ? 0.34 : 0.45);
      const radial = Math.max(...e.r) > 2.5 ? 22 : 14;
      const mesh = new THREE.Mesh(sweep(e, radial), g.mats[0].m);
      mesh.userData.vid = e.id;
      mesh.renderOrder = 7;
      mesh.visible = false;
      root.add(mesh);
      g.items.push({ id: e.id, side: e.side, mesh });
      const n = e.pts.length / 3;
      const at = (f: number) => {
        const i = Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))));
        return new THREE.Vector3(e.pts[i * 3], e.pts[i * 3 + 1], e.pts[i * 3 + 2]);
      };
      for (let f = 0; f <= 1.0001; f += 0.1) g.samples.push(at(f));
      const anchorAt: Record<string, number> = { sss: 0.42, transverse: 0.55, sigmoid: 0.45, ijv: 0.6, scv: 0.45, bridging: 0.5, icv: 0.45, basal: 0.5, gcv: 0.5, straight: 0.5, iss: 0.45, occipital: 0.5, smcv: 0.3, labbe: 0.5, sps: 0.5, ips: 0.55, cavernous: 0.5, intercavernous: 0.5, confluence: 0.5 };
      // one anchor per vessel and side (for the many superior cerebral and bridging veins: the middle one)
      const nth = g.items.filter((it) => it.side === e.side).length; // 1-based index of this entry on its side
      const many = e.id === "scv" || e.id === "bridging";
      if ((many ? nth === 4 : nth === 1) && !(e.side === "m" && g.anchors.length)) g.anchors.push(at(anchorAt[e.id] ?? 0.5));
    }
    // arachnoid granulations: small knobs into the sinus
    {
      const g = group("granulations", CSF, 0.6);
      const sph = new THREE.SphereGeometry(1, 12, 8);
      const geos: THREE.BufferGeometry[] = [];
      for (const p of data.granulations) {
        const s = sph.clone();
        s.scale(1.0 * MM, 0.8 * MM, 1.2 * MM);
        s.translate(p[0], p[1], p[2]);
        const c = s.attributes.position.count;
        s.setAttribute("aS", new THREE.Float32BufferAttribute(new Array(c).fill(0), 1));
        s.setAttribute("aT", new THREE.Float32BufferAttribute(new Array(c).fill(0), 1));
        geos.push(s);
      }
      sph.dispose();
      const merged = mergeGeos(geos);
      geos.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(merged, g.mats[0].m);
      mesh.userData.vid = "granulations";
      mesh.renderOrder = 8;
      mesh.visible = false;
      root.add(mesh);
      g.items.push({ id: "granulations", side: "m", mesh });
      const p = data.granulations[Math.floor(data.granulations.length / 2)];
      if (p) g.anchors.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
    // the internal carotid through the cavernous sinus (context)
    {
      const g = group("ica", ICA_RED, 0.4);
      for (const c of data.ica) {
        const n = c.pts.length / 3;
        const mesh = new THREE.Mesh(sweep({ pts: c.pts, r: new Array(n).fill(c.r), profile: "round" }, 14), g.mats[0].m);
        mesh.userData.vid = "ica";
        mesh.renderOrder = 6;
        mesh.visible = false;
        root.add(mesh);
        g.items.push({ id: "ica", side: c.side, mesh });
        if (c.side === "l") g.anchors.push(new THREE.Vector3(c.pts[Math.floor(n * 0.75) * 3], c.pts[Math.floor(n * 0.75) * 3 + 1], c.pts[Math.floor(n * 0.75) * 3 + 2]));
      }
    }
    return { root, groups };
  }, [data]);

  // falx and tentorium: faint dura for context (one shared material)
  const duraObj = useMemo(() => {
    if (!dura) return null;
    const mat = new THREE.MeshStandardMaterial({ color: "#c9b8a6", roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    for (const d of dura) {
      const c = d.clone(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = mat;
          m.renderOrder = 5;
          m.raycast = () => undefined;
        }
      });
      g.add(c);
    }
    g.visible = false;
    return { g, mat, op: 0 };
  }, [dura]);

  useEffect(
    () => () => {
      built?.groups.forEach((g) => {
        g.items.forEach((it) => it.mesh.geometry.dispose());
        g.mats.forEach((x) => x.m.dispose());
      });
    },
    [built],
  );
  useEffect(() => () => duraObj?.mat.dispose(), [duraObj]);

  // ---- precompile every vein shader once (off screen), so the first step does not stall on a shader compile
  useEffect(() => {
    if (!built) return;
    let alive = true;
    const vis = built.root.children.map((c) => c.visible);
    built.root.children.forEach((c) => (c.visible = true));
    built.root.visible = true;
    const r = gl as THREE.WebGLRenderer & { compileAsync?: (o: THREE.Object3D, c: THREE.Camera, s?: THREE.Scene) => Promise<unknown> };
    const done = () => {
      if (!alive) return;
      built.root.children.forEach((c, i) => (c.visible = vis[i]));
      invalidate();
    };
    if (r.compileAsync) r.compileAsync(built.root, camera, scene).then(done, done);
    else {
      gl.compile(built.root, camera, scene);
      done();
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // ---- targets per step (cheap: uniforms and visibility only)
  const shownRef = useRef<{ cur: Set<string>; past: Set<string> }>({ cur: new Set(), past: new Set() });
  const lastStep = useRef(-1);
  useEffect(() => {
    if (!built) return;
    const s = VEIN_STEPS[step];
    const cur = new Set(on && s ? s.ids : []);
    const past = new Set(on ? VEIN_STEPS.slice(0, Math.max(0, step)).flatMap((x) => x.ids) : []);
    const fresh = on && step !== lastStep.current;
    lastStep.current = on ? step : -1;
    if (cur.has("cavernous")) cur.add("ica");
    shownRef.current = { cur, past };
    const now = performance.now() / 1000;
    for (const g of built.groups.values()) {
      const isCur = cur.has(g.id);
      const isPast = past.has(g.id);
      const isFocus = focus === g.id;
      g.tgt.op = !on ? 0 : isCur ? (g.id === "ica" ? 0.55 : g.id === "cavernous" ? 0.72 : 0.97) : isPast ? 0.42 : isFocus ? 0.6 : 0;
      g.tgt.hi = isFocus ? 1 : 0;
      // draw the step's own vessels in along the flow (only on entering a step; a vessel already on screen is not redrawn)
      if (fresh && isCur && g.id !== "ica" && g.id !== "granulations" && !(step === VEIN_STEPS.length - 1 && g.cur.op > 0.3)) {
        g.revealFrom = reduced ? -1 : now;
        g.cur.rev = reduced ? 1 : 0;
      }
      if (!isCur) {
        g.revealFrom = -1;
        g.cur.rev = 1;
      }
    }
    invalidate();
  }, [built, on, step, focus, reduced, invalidate]);

  // ---- camera: a calm glide to the step's view; any drag or wheel by the student stops it at once
  const glide = useRef<{ t0: number; p0: THREE.Vector3; c0: THREE.Vector3; p1: THREE.Vector3; c1: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!controls) return;
    const stop = () => (glide.current = null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);
  useEffect(() => {
    if (!built || !on || !controls) return;
    const s = VEIN_STEPS[step];
    if (!s) return;
    const pts: THREE.Vector3[] = [];
    for (const id of s.cam.frame) built.groups.get(id)?.samples.forEach((p) => pts.push(p));
    if (!pts.length) return;
    const dir = new THREE.Vector3(...s.cam.dir).normalize();
    const aspect = size.width > 4 && size.height > 4 ? size.width / size.height : 1.5;
    const fill = s.cam.fill ?? 0.85;
    const { c, D } = fitPoints(pts, dir, camera.fov, aspect, fillWidthFor(size.width) * fill, 0.86 * fill);
    const p1 = c.clone().addScaledVector(dir, D);
    if (reduced) {
      camera.position.copy(p1);
      controls.target.copy(c);
      camera.lookAt(c);
      controls.update();
      invalidate();
      return;
    }
    glide.current = { t0: performance.now(), p0: camera.position.clone(), c0: controls.target.clone(), p1, c1: c };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, on, step, controls]);

  // ---- per frame: ease uniforms, run the glide, place the labels
  const v = useMemo(() => new THREE.Vector3(), []);
  const lastKey = useRef("");
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (!built) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const now = performance.now() / 1000;
    let moving = false;
    built.root.visible = on || [...built.groups.values()].some((g) => g.cur.op > 0.004);
    for (const g of built.groups.values()) {
      const c = g.cur;
      if (Math.abs(c.op - g.tgt.op) > 0.003) {
        c.op += (g.tgt.op - c.op) * k;
        moving = true;
      } else c.op = g.tgt.op;
      if (Math.abs(c.hi - g.tgt.hi) > 0.01) {
        c.hi += (g.tgt.hi - c.hi) * k;
        moving = true;
      } else c.hi = g.tgt.hi;
      if (g.revealFrom >= 0) {
        const t = Math.min(1, (now - g.revealFrom) / REVEAL_S);
        c.rev = t < 1 ? 1 - Math.pow(1 - t, 2.2) : 1;
        if (t >= 1) g.revealFrom = -1;
        moving = true;
      }
      const flowing = animate && !reduced && shownRef.current.cur.has(g.id) && g.id !== "ica" && g.id !== "granulations";
      for (const { m, u } of g.mats) {
        m.opacity = c.op;
        m.depthWrite = c.op > 0.6;
        u.uReveal.value = c.rev;
        u.uHi.value = c.hi;
        u.uPulse.value = flowing ? Math.min(1, c.op) : 0;
        u.uTime.value = now;
      }
      for (const it of g.items) it.mesh.visible = c.op > 0.004;
      if (flowing && c.op > 0.05) moving = true;
    }
    if (duraObj) {
      const t = on ? 0.13 : 0;
      duraObj.op += (t - duraObj.op) * k;
      if (Math.abs(duraObj.op - t) < 0.002) duraObj.op = t;
      else moving = true;
      duraObj.mat.opacity = duraObj.op;
      duraObj.g.visible = duraObj.op > 0.003;
    }
    const gd = glide.current;
    if (gd && controls) {
      const t = Math.min(1, (performance.now() - gd.t0) / (GLIDE_S * 1000));
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // orbit-like: interpolate the target and the direction/distance around it, so the camera never cuts through the head
      const c = tmpA.copy(gd.c0).lerp(gd.c1, e);
      const d0 = gd.p0.clone().sub(gd.c0);
      const d1 = gd.p1.clone().sub(gd.c1);
      const len = THREE.MathUtils.lerp(d0.length(), d1.length(), e);
      const q = new THREE.Quaternion().setFromUnitVectors(d0.clone().normalize(), d1.clone().normalize());
      const dir = tmpB.copy(d0).normalize().applyQuaternion(new THREE.Quaternion().slerp(q, e));
      camera.position.copy(c).addScaledVector(dir, len);
      camera.up.set(0, 1, 0);
      camera.lookAt(c);
      controls.target.copy(c);
      controls.update();
      if (t >= 1) glide.current = null;
      moving = true;
    }
    if (moving) invalidate();

    // margin labels: the step's vessels (and a hovered one)
    if (!bus.ready()) return;
    const w = size.width;
    const h = size.height;
    const items: RawLabel[] = [];
    if (on) {
      const ids = new Set(shownRef.current.cur);
      if (focus) ids.add(focus);
      const many = ids.size > 8; // the whole path: label only the main channel
      const main = new Set(["sss", "straight", "confluence", "transverse", "sigmoid", "ijv", "gcv", "cavernous"]);
      for (const id of ids) {
        if (many && !main.has(id) && id !== focus) continue;
        const g = built.groups.get(id);
        if (!g || g.cur.op < 0.3 || g.cur.rev < 0.5) continue;
        for (const a of g.anchors) {
          v.copy(a).project(camera);
          if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
          items.push({ id: `${id}:${items.length}`, text: VEIN_NAME[id] ?? id, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, color: id === "ica" ? "#b8404f" : LABEL_BLUE, mark: id === focus });
        }
      }
    }
    let minX = Infinity;
    let maxX = -Infinity;
    if (on)
      for (const id of shownRef.current.cur)
        for (const sp of built.groups.get(id)?.samples ?? []) {
          v.copy(sp).project(camera);
          const x = (v.x * 0.5 + 0.5) * w;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
    const out = layoutLabels(items, w, h, topInset, Number.isFinite(minX) ? { minX, maxX } : undefined);
    const key = out.map((o) => `${o.id}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.ly)}:${Math.round(o.lx)}`).join("|") + `|${w}x${h}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      bus.emit(out, w, h);
    }
  });
  // keep frames coming while the flow bands run (on-demand canvas)
  useEffect(() => {
    if (!on || !animate || reduced) return;
    const t = window.setInterval(invalidate, 1000 / 30);
    return () => window.clearInterval(t);
  }, [on, animate, reduced, invalidate]);
  useEffect(
    () => () => {
      bus.emit([], 0, 0);
    },
    [bus],
  );

  const hovered = useRef<string | null>(null);
  if (!built) return null;
  const vidOf = (o: THREE.Object3D) => {
    const id = o.userData.vid as string | undefined;
    const g = id ? built.groups.get(id) : undefined;
    return on && g && g.cur.op > 0.3 ? id! : null;
  };
  return (
    <group>
      {duraObj && <primitive object={duraObj.g} />}
      <primitive
        object={built.root}
        onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
          const id = vidOf(e.object);
          if (!id) return;
          e.stopPropagation();
          onPick(id);
        }}
        onPointerOver={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
          const id = vidOf(e.object);
          if (!id) return;
          e.stopPropagation();
          if (hovered.current !== id) {
            hovered.current = id;
            onHover(id);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          if (hovered.current) {
            hovered.current = null;
            onHover(null);
            document.body.style.cursor = "";
          }
        }}
      />
    </group>
  );
}

/** Merges non-indexed/indexed geometries with the same attributes (position, normal, aS, aT). */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ["position", "normal", "aS", "aT"];
  const out = new THREE.BufferGeometry();
  const idx: number[] = [];
  let base = 0;
  const arrays: Record<string, number[]> = { position: [], normal: [], aS: [], aT: [] };
  for (const g of geos) {
    for (const nm of names) arrays[nm].push(...(g.getAttribute(nm).array as Float32Array));
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += g.getAttribute("position").count;
  }
  out.setAttribute("position", new THREE.Float32BufferAttribute(arrays.position, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(arrays.normal, 3));
  out.setAttribute("aS", new THREE.Float32BufferAttribute(arrays.aS, 1));
  out.setAttribute("aT", new THREE.Float32BufferAttribute(arrays.aT, 1));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
