"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { lineMaterial } from "./materials";
import type { Side } from "./types";

/* Fibres, cell bodies, synapse cups, the crossing ring and the travelling pulses. Sizes are constant on screen (CSS px):
 * every object rescales itself in onBeforeRender for the camera actually rendering it (the multi-view panes too). */

const _v = new THREE.Vector3();
const _vp = new THREE.Vector4();
/** World size of one CSS pixel at point p for this camera and the current viewport. */
export function worldPerPx(cam: THREE.Camera, p: THREE.Vector3, renderer: THREE.WebGLRenderer): number {
  renderer.getCurrentViewport(_vp);
  const h = _vp.w / renderer.getPixelRatio();
  const pc = cam as THREE.PerspectiveCamera;
  const d = _v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
  return (2 * Math.abs(d) * Math.tan((pc.fov * Math.PI) / 360)) / Math.max(1, h) / (pc.zoom || 1);
}
function setRes(m: LineMaterial, renderer: THREE.WebGLRenderer) {
  renderer.getCurrentViewport(_vp);
  const r = renderer.getPixelRatio();
  m.resolution.set(_vp.z / r, _vp.w / r);
}

export interface FibreSpec {
  key: string;
  beat: number;
  info: string;
  side: Side;
  order: number;
  color: string;
  pts: THREE.Vector3[];
  /** cumulative length (0..1) of every point */
  u: number[];
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** One neuron line: a dark solid rim under a bright core; the core is dashed for the right side. Draws itself on reveal. */
export function FibreLine({
  f,
  revealed,
  current,
  alpha,
  hover,
  drawS,
  reduced,
  rim,
  onPick,
  onHover,
}: {
  f: FibreSpec;
  revealed: boolean;
  current: boolean;
  alpha: number;
  hover: boolean;
  drawS: number;
  reduced: boolean;
  rim: string;
  onPick?: (info: string) => void;
  onHover?: (info: string | null) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const prog = useRef(revealed ? 1 : 0);
  const built = useMemo(() => {
    const g = new LineGeometry();
    g.setPositions(f.pts.flatMap((p) => [p.x, p.y, p.z]));
    const core = new Line2(g, lineMaterial(f.color, { dashed: f.side === "R" }));
    core.computeLineDistances();
    const rimL = new Line2(g, lineMaterial(rim, { rim: true }));
    core.renderOrder = 41;
    rimL.renderOrder = 40;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, depthTest: false, transparent: true }));
    tip.renderOrder = 45;
    tip.visible = false;
    const len = f.pts.reduce((s, p, i) => (i ? s + p.distanceTo(f.pts[i - 1]) : 0), 0);
    return { g, core, rimL, tip, len };
  }, [f, rim]);
  useEffect(
    () => () => {
      built.g.dispose();
      (built.core.material as LineMaterial).dispose();
      (built.rimL.material as LineMaterial).dispose();
      built.tip.geometry.dispose();
      (built.tip.material as THREE.Material).dispose();
    },
    [built],
  );
  // per-camera: line resolution, dash length (about 9 px) and the tip size
  useEffect(() => {
    const { core, rimL, tip } = built;
    const cm = core.material as LineMaterial;
    const rm = rimL.material as LineMaterial;
    (core as THREE.Object3D).onBeforeRender = (renderer: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
      setRes(cm, renderer);
      if (cm.dashed) {
        const mid = f.pts[Math.floor(f.pts.length / 2)];
        const w = worldPerPx(cam, mid, renderer);
        cm.dashSize = 9 * w;
        cm.gapSize = 6 * w;
      }
    };
    rimL.onBeforeRender = (renderer) => setRes(rm, renderer);
    tip.onBeforeRender = (renderer, _s, cam) => {
      tip.scale.setScalar(4.5 * worldPerPx(cam, tip.position, renderer));
      tip.updateMatrixWorld();
    };
  }, [built, f.pts]);
  useEffect(() => {
    const cm = built.core.material as LineMaterial;
    const rm = built.rimL.material as LineMaterial;
    cm.linewidth = current || hover ? 4.2 : 3.2;
    rm.linewidth = current || hover ? 7.4 : 5.8;
    cm.opacity = alpha;
    rm.opacity = alpha * 0.92;
    rm.color.set(hover ? "#ffffff" : rim);
    invalidate();
  }, [built, current, hover, alpha, rim, invalidate]);
  useFrame((_, dt) => {
    const target = revealed ? 1 : 0;
    const segs = f.pts.length - 1;
    if (prog.current !== target) {
      prog.current = revealed ? Math.min(1, prog.current + dt / (reduced ? 0.15 : drawS)) : 0;
      const e = reduced ? prog.current : easeInOut(prog.current);
      // instanceCount = segments drawn; the last partial segment is the moving tip
      const k = e * segs;
      built.g.instanceCount = Math.max(0, Math.ceil(k));
      const i = Math.min(segs - 1, Math.floor(k));
      const a = f.pts[i], b = f.pts[Math.min(segs, i + 1)];
      built.tip.position.lerpVectors(a, b, k - i);
      built.tip.visible = !reduced && prog.current > 0 && prog.current < 1;
      (built.tip.material as THREE.MeshBasicMaterial).color.set(f.color);
      invalidate();
    } else {
      built.g.instanceCount = target ? segs : 0;
      built.tip.visible = false;
    }
    built.core.visible = built.rimL.visible = prog.current > 0;
  });
  const handlers = onPick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onPick(f.info);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.(f.info);
        },
        onPointerOut: () => onHover?.(null),
      }
    : {};
  return (
    <>
      <primitive object={built.rimL} {...handlers} />
      <primitive object={built.core} />
      <primitive object={built.tip} />
    </>
  );
}

/** Travelling light pulses along the current beat's fibres (direction of conduction), after the draw. */
export function Pulses({ fibres, active, reduced }: { fibres: FibreSpec[]; active: boolean; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const N = 3;
  const meshes = useMemo(
    () =>
      fibres.flatMap((f) =>
        Array.from({ length: N }, () => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color).lerp(new THREE.Color("#ffffff"), 0.55), toneMapped: false, depthTest: false, transparent: true }));
          m.renderOrder = 46;
          m.visible = false;
          m.onBeforeRender = (renderer, _s, cam) => {
            m.scale.setScalar(3.2 * worldPerPx(cam, m.position, renderer));
            m.updateMatrixWorld();
          };
          return { m, f };
        }),
      ),
    [fibres],
  );
  useEffect(
    () => () =>
      meshes.forEach(({ m }) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }),
    [meshes],
  );
  const t = useRef(-0.6);
  useEffect(() => {
    t.current = -0.6;
    invalidate();
  }, [active, fibres, invalidate]);
  useFrame((_, dt) => {
    if (!active || reduced) {
      meshes.forEach(({ m }) => (m.visible = false));
      return;
    }
    t.current += dt;
    meshes.forEach(({ m, f }, i) => {
      const len = f.pts.reduce((s, p, j) => (j ? s + p.distanceTo(f.pts[j - 1]) : 0), 0);
      const period = Math.min(3.2, Math.max(1.4, len * 12));
      const ph = ((t.current / period + (i % N) / N) % 1 + 1) % 1;
      const k = ph * (f.pts.length - 1);
      const j = Math.floor(k);
      m.position.lerpVectors(f.pts[j], f.pts[Math.min(f.pts.length - 1, j + 1)], k - j);
      m.visible = t.current > 0;
      (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(ph * Math.PI) * 0.95;
    });
    invalidate();
  });
  return (
    <>
      {meshes.map(({ m }, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

export type MarkKind = "soma" | "syn" | "start" | "cross";
/** A cell body (sphere), a synapse (cup facing the incoming fibre), a receptor start (diamond) or the crossing ring. Constant px size. */
export function Mark({
  kind,
  p,
  dir,
  color,
  rim,
  shown,
  current,
  alpha,
  reduced,
  info,
  onPick,
  onHover,
}: {
  kind: MarkKind;
  p: THREE.Vector3;
  dir?: THREE.Vector3;
  color: string;
  rim: string;
  shown: boolean;
  current: boolean;
  alpha: number;
  reduced: boolean;
  info: string;
  onPick?: (info: string) => void;
  onHover?: (info: string | null) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const sc = useRef(shown ? 1 : 0);
  const g = useMemo(() => {
    const grp = new THREE.Group();
    grp.position.copy(p);
    let body: THREE.BufferGeometry;
    if (kind === "syn") {
      // a cup: the outer half of a sphere shell, open toward the incoming fibre
      body = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
    } else if (kind === "start") body = new THREE.OctahedronGeometry(1.15, 0);
    else if (kind === "cross") body = new THREE.TorusGeometry(1.25, 0.28, 10, 40);
    else body = new THREE.SphereGeometry(1, 22, 14);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, depthTest: false, transparent: true, side: THREE.DoubleSide });
    const rimMat = new THREE.MeshBasicMaterial({ color: rim, toneMapped: false, depthTest: false, transparent: true, side: THREE.BackSide });
    const a = new THREE.Mesh(body, mat);
    const b = new THREE.Mesh(body, rimMat);
    b.scale.setScalar(1.28);
    a.renderOrder = 48;
    b.renderOrder = 47;
    grp.add(b, a);
    if (kind === "syn" && dir) grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    return { grp, body, mat, rimMat, a, b };
  }, [kind, p, dir, color, rim]);
  useEffect(
    () => () => {
      g.body.dispose();
      g.mat.dispose();
      g.rimMat.dispose();
    },
    [g],
  );
  const size = kind === "soma" ? 5.2 : kind === "syn" ? 5.6 : kind === "cross" ? 7 : 5;
  useEffect(() => {
    const { grp, a, b } = g;
    const resize = (renderer: THREE.WebGLRenderer, cam: THREE.Camera) => {
      const s = size * (current ? 1.18 : 1) * worldPerPx(cam, grp.position, renderer) * Math.max(0.001, sc.current);
      grp.scale.setScalar(s);
      if (kind === "cross") grp.quaternion.copy(cam.quaternion);
      grp.updateMatrixWorld(true);
    };
    a.onBeforeRender = (renderer, _s, cam) => resize(renderer, cam);
    b.onBeforeRender = (renderer, _s, cam) => resize(renderer, cam);
  }, [g, size, current, kind]);
  useEffect(() => {
    g.mat.opacity = alpha;
    g.rimMat.opacity = alpha;
    invalidate();
  }, [g, alpha, invalidate]);
  useFrame((_, dt) => {
    const target = shown ? 1 : 0;
    if (sc.current !== target) {
      sc.current = shown ? Math.min(1, sc.current + dt / (reduced ? 0.1 : 0.35)) : 0;
      invalidate();
    }
    g.grp.visible = sc.current > 0.01;
  });
  const handlers = onPick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onPick(info);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.(info);
        },
        onPointerOut: () => onHover?.(null),
      }
    : {};
  return <primitive object={g.grp} {...handlers} />;
}

/** A nerve drawn as a band of constant screen width (it stays readable at whole-limb scale); the fibres run on top of it. */
export function NerveBand({ pts, color, rim, width = 9 }: { pts: THREE.Vector3[]; color: string; rim: string; width?: number }) {
  const built = useMemo(() => {
    const g = new LineGeometry();
    g.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    const core = new Line2(g, lineMaterial(color, {}));
    const edge = new Line2(g, lineMaterial(rim, { rim: true }));
    const cm = core.material as LineMaterial;
    const em = edge.material as LineMaterial;
    cm.linewidth = width;
    em.linewidth = width + 2.4;
    cm.depthWrite = false;
    em.depthWrite = false;
    core.renderOrder = 37;
    edge.renderOrder = 36;
    core.onBeforeRender = (renderer) => setRes(cm, renderer);
    edge.onBeforeRender = (renderer) => setRes(em, renderer);
    core.raycast = () => undefined;
    edge.raycast = () => undefined;
    return { g, core, edge };
  }, [pts, color, rim, width]);
  useEffect(
    () => () => {
      built.g.dispose();
      (built.core.material as LineMaterial).dispose();
      (built.edge.material as LineMaterial).dispose();
    },
    [built],
  );
  return (
    <>
      <primitive object={built.edge} />
      <primitive object={built.core} />
    </>
  );
}
