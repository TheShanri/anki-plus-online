"use client";

import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasModel } from "../ui/modelCache";
import { COW_LABEL, slugOf, type FlowFile, type FlowSegment } from "./vessel-data";

export type VesselState = "selected" | "faint" | "idle" | "hidden";

type Props = {
  flow: FlowFile | null;
  /** Colour of each artery id (supply-map). */
  colors: Map<string, string>;
  /** How each segment (node name) is drawn. */
  stateOf: (name: string, seg: FlowSegment) => VesselState;
  /** A change of this key re-applies the states. */
  sig: string;
  /** Moving arrows on the selected vessels (false: static arrows). */
  animate: boolean;
  /** Short labels at the middle of these slugs (Circle of Willis view). */
  labelSlugs: Set<string> | null;
  onPick: (artery: string, name: string) => void;
  /** Re-aims the camera at the selected vessels. `dir` (camera direction from the target) applies once per `n`; otherwise the current direction is kept. */
  frame: { n: number; dir: [number, number, number] | null };
  /** Extra room around the framed vessels (metres), e.g. when territories are shown. */
  pad: number;
};

/** three.js removes . [ ] : / from node names ("aca.l" becomes "acal"). */
const clean = (n: string) => n.replace(/[[\].:/]/g, "");
const GREY = "#9aa0a6";
const SPEED = 0.034; // metres per second along the vessel
const SPACING = 0.009; // metres between arrows
const FPS = 30;

type Line = { pts: THREE.Vector3[]; cum: number[]; len: number };
function makeLine(flat: number[]): Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
function at(l: Line, s: number) {
  let i = 1;
  while (i < l.cum.length - 1 && l.cum[i] < s) i++;
  const a = l.pts[i - 1];
  const b = l.pts[i];
  const seg = l.cum[i] - l.cum[i - 1] || 1;
  const u = Math.min(1, Math.max(0, (s - l.cum[i - 1]) / seg));
  _p.copy(a).lerp(b, u);
  _t.copy(b).sub(a).normalize();
}

function applyState(mesh: THREE.Mesh, st: VesselState, col: string, get: (key: string, color: string, opacity: number, solid: boolean) => THREE.MeshStandardMaterial, planes: THREE.Plane[]) {
  mesh.visible = st !== "hidden";
  if (st === "selected") {
    mesh.material = get("s" + col, col, 1, true);
    mesh.renderOrder = 6;
  } else if (st === "idle") {
    mesh.material = get("i" + col, col, 0.7, false);
    mesh.renderOrder = 4;
  } else {
    mesh.material = get("f", GREY, 0.2, false);
    mesh.renderOrder = 3;
  }
  (mesh.material as THREE.Material).clippingPlanes = planes;
}

type Particle = { line: Line; seg: string; phase: number; dir: 1 | -1; r: number; artery: string; fwdStatic: number };

/** The real artery meshes (one node per segment) plus arrows that run proximal to distal along each selected one. */
export function VesselLayer({ flow, colors, stateOf, sig, animate, labelSlugs, onPick, frame, pad }: Props) {
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    let alive = true;
    loadAtlasModel("arteries.glb")
      .then((g) => alive && setRoot(g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // one material per (artery, state); shared so a state change is a pointer swap
  const mats = useMemo(() => {
    const m = new Map<string, THREE.MeshStandardMaterial>();
    const get = (key: string, color: string, opacity: number, solid: boolean) => {
      let x = m.get(key);
      if (!x) {
        x = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.45,
          metalness: 0,
          emissive: solid ? new THREE.Color(color).multiplyScalar(0.28) : new THREE.Color(0),
          transparent: !solid,
          opacity,
          depthWrite: solid,
        });
        m.set(key, x);
      }
      return x;
    };
    return { get, all: m };
  }, []);
  useEffect(() => () => mats.all.forEach((x) => x.dispose()), [mats]);

  // circle view: only the top of the long vessels (carotids, vertebrals) is drawn, so the ring is not buried under their length
  const yMin = useMemo(() => {
    if (!flow || !labelSlugs) return -Infinity;
    let top = -Infinity;
    for (const [name, seg] of Object.entries(flow.segments)) {
      if (!labelSlugs.has(slugOf(name))) continue;
      for (const flat of seg.lines) for (let i = 1; i < flat.length; i += 3) top = Math.max(top, flat[i]);
    }
    return top - 0.075;
  }, [flow, labelSlugs]);
  const clipPlanes = useMemo(() => (Number.isFinite(yMin) ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMin)] : []), [yMin]);
  useEffect(() => {
    mats.all.forEach((m) => {
      m.clippingPlanes = clipPlanes;
      m.needsUpdate = true;
    });
    invalidate();
  }, [clipPlanes, mats, invalidate, root, sig]);
  const byClean = useMemo(() => new Map(Object.keys(flow?.segments ?? {}).map((k) => [clean(k), k])), [flow]);
  const segMeshes = useMemo(() => {
    const r: { mesh: THREE.Mesh; name: string }[] = [];
    root?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) r.push({ mesh, name: byClean.get(clean(mesh.name)) ?? "" });
    });
    return r;
  }, [root, byClean]);

  useEffect(() => {
    if (!flow) return;
    for (const { mesh, name } of segMeshes) {
      const seg = flow.segments[name];
      const st: VesselState = seg ? stateOf(name, seg) : "hidden";
      const col = (seg && colors.get(seg.artery)) || GREY;
      applyState(mesh, st, col, mats.get, clipPlanes);
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segMeshes, flow, sig, colors, mats, invalidate, clipPlanes]);

  // ---- arrows
  const particles = useMemo<Particle[]>(() => {
    if (!flow) return [];
    const out: Particle[] = [];
    for (const [name, seg] of Object.entries(flow.segments)) {
      if (stateOf(name, seg) !== "selected") continue;
      for (const flat of seg.lines) {
        const line = makeLine(flat);
        if (line.len < 0.002) continue;
        const n = Math.max(1, Math.round(line.len / SPACING));
        for (let k = 0; k < n; k++) {
          out.push({
            line,
            seg: name,
            phase: (k / n) * line.len,
            dir: seg.flow === "both" && k % 2 === 1 ? -1 : 1,
            r: seg.radius,
            artery: seg.artery,
            fwdStatic: (k + 0.5) / n,
          });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, sig]);

  const inst = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(1, 6, 6, 1);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, depthTest: false, transparent: true, opacity: 0.92 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const placeAll = (time: number) => {
    const im = inst.current;
    if (!im) return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const L = p.line.len;
      let s: number;
      if (animate && !reduced) s = (((p.phase + time * SPEED) % L) + L) % L;
      else s = p.fwdStatic * L;
      if (p.dir === -1 && animate && !reduced) s = L - s;
      at(p.line, s);
      const u = s / L;
      const env = 0.55 + 0.45 * Math.sin(Math.PI * u); // arrows swell mid-vessel and thin at the ends
      const r = (_p.y < yMin ? 0 : Math.max(p.r * 0.34, 0.00028)) * env; // a slim dash, about a third of the vessel radius
      dummy.position.copy(_p);
      dummy.quaternion.setFromUnitVectors(up, p.dir === 1 ? _t : _t.negate());
      dummy.scale.set(r, r, r);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => {
    const im = inst.current;
    if (!im) return;
    const c = new THREE.Color();
    particles.forEach((p, i) => {
      c.set(colors.get(p.artery) ?? "#ffffff").lerp(new THREE.Color("#ffffff"), 0.72);
      im.setColorAt(i, c);
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.count = particles.length;
    placeAll(performance.now() / 1000);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particles, colors, animate]);

  useFrame(() => {
    if (animate && !reduced && particles.length) placeAll(performance.now() / 1000);
  });

  // ticks the on-demand render loop while arrows are moving and the page is visible
  useEffect(() => {
    if (!animate || reduced || !particles.length) return;
    let timer = 0;
    const start = () => {
      if (!timer) timer = window.setInterval(invalidate, 1000 / FPS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const vis = () => (document.visibilityState === "visible" ? start() : stop());
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      stop();
    };
  }, [animate, reduced, particles.length, invalidate]);

  // one label per vessel per side, pushed outward from the circle on a short leader line
  const { labels, leaders } = useMemo(() => {
    const out: { key: string; text: string; pos: THREE.Vector3 }[] = [];
    const segs: number[] = [];
    if (!flow || !labelSlugs) return { labels: out, leaders: new Float32Array(0) };
    const mids: { name: string; slug: string; p: THREE.Vector3 }[] = [];
    for (const [name, seg] of Object.entries(flow.segments)) {
      const slug = slugOf(name);
      if (!labelSlugs.has(slug) || !COW_LABEL[slug] || stateOf(name, seg) !== "selected") continue;
      const line = seg.lines.map(makeLine).sort((a, b) => b.len - a.len)[0];
      if (!line) continue;
      at(line, line.len * (slug === "aca" ? 0.2 : slug === "vertebral" ? 0.93 : slug === "ica" ? 0.9 : 0.5));
      mids.push({ name, slug, p: _p.clone() });
    }
    const cx = mids.reduce((a, m) => a + m.p.x, 0) / (mids.length || 1);
    const cz = mids.reduce((a, m) => a + m.p.z, 0) / (mids.length || 1);
    // start outward from the circle, then push apart until no two labels are closer than a minimum gap
    const pts = mids.map((m) => {
      let dx = m.p.x - cx;
      let dz = m.p.z - cz;
      if (m.slug === "acom") [dx, dz] = [0, 1];
      else if (m.slug === "basilar") [dx, dz] = [-1, -0.2];
      const l = Math.hypot(dx, dz) || 1;
      const off = m.slug === "acom" ? 0.012 : 0.02;
      return { x: m.p.x + (dx / l) * off, z: m.p.z + (dz / l) * off };
    });
    const GX = 0.011;
    const GZ = 0.0065;
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const ox = GX - Math.abs(pts[i].x - pts[j].x);
          const oz = GZ - Math.abs(pts[i].z - pts[j].z);
          if (ox > 0 && oz > 0) {
            // separate along the axis that needs the smaller move
            if (oz / GZ < ox / GX) {
              const d = (pts[i].z >= pts[j].z ? 1 : -1) * (oz / 2 + 0.0002);
              pts[i].z += d;
              pts[j].z -= d;
            } else {
              const d = (pts[i].x >= pts[j].x ? 1 : -1) * (ox / 2 + 0.0002);
              pts[i].x += d;
              pts[j].x -= d;
            }
          }
        }
    }
    mids.forEach((m, i) => {
      const pos = new THREE.Vector3(pts[i].x, m.p.y, pts[i].z);
      out.push({ key: m.name, text: COW_LABEL[m.slug], pos });
      segs.push(m.p.x, m.p.y, m.p.z, pos.x, pos.y, pos.z);
    });
    return { labels: out, leaders: new Float32Array(segs) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, labelSlugs, sig]);
  const leaderGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(leaders, 3));
    return g;
  }, [leaders]);
  useEffect(() => () => leaderGeo.dispose(), [leaderGeo]);

  // ---- camera: fit the selected vessels (from their centrelines); keep the viewing direction unless asked
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  const moved = useRef(false);
  const lastN = useRef(-1);
  const dirRef = useRef<[number, number, number] | null>(null);
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      moved.current = true;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);
  useEffect(() => {
    if (!flow || !controls) return;
    const box = new THREE.Box3();
    let any = false;
    // the circle sits in a thin slab; the long vertebrals and carotids below it must not push the camera back
    for (const [name, seg] of Object.entries(flow.segments)) {
      const st = stateOf(name, seg);
      if (st !== "selected" && st !== "idle") continue;
      for (const flat of seg.lines)
        for (let i = 0; i + 2 < flat.length; i += 3) {
          if (flat[i + 1] < yMin) continue;
          box.expandByPoint(_p.set(flat[i], flat[i + 1], flat[i + 2]));
          any = true;
        }
    }
    if (!any) return;
    box.expandByScalar((labelSlugs ? 0.022 : 0.008) + pad);
    const fresh = lastN.current !== frame.n;
    if (fresh) {
      dirRef.current = frame.dir;
      moved.current = false;
    }
    lastN.current = frame.n;
    const apply = () => {
      if (moved.current) return;
      const c = box.getCenter(new THREE.Vector3());
      const dir = dirRef.current ? new THREE.Vector3(...dirRef.current).normalize() : camera.position.clone().sub(controls.target).normalize();
      const probe = new THREE.PerspectiveCamera();
      probe.position.copy(c).add(dir);
      probe.up.set(0, 1, 0);
      probe.lookAt(c);
      probe.updateMatrixWorld();
      const inv = probe.matrixWorld.clone().invert();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const aspect = size.width > 4 && size.height > 4 ? size.width / size.height : 1.5;
      let D = 0.03;
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        const a = corner.clone().sub(c).dot(dir);
        const v = corner.applyMatrix4(inv);
        D = Math.max(D, (Math.abs(v.x) / (tanV * aspect)) * 1.12 + a, (Math.abs(v.y) / tanV) * 1.12 + a);
      }
      camera.position.copy(c).addScaledVector(dir, D);
      camera.up.set(0, 1, 0);
      camera.lookAt(c);
      controls.target.copy(c);
      controls.update();
      invalidate();
    };
    // the viewer fits its own camera when it mounts and resizes; re-apply after it settles
    const ts = [0, 150, 500, 1000, 2000, 3500, 6000].map((ms) => window.setTimeout(apply, ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, controls, frame, sig, pad, size.width, size.height, yMin]);

  return (
    <group>
      {root && (
        <primitive
          object={root}
          onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
            const key = byClean.get(clean(e.object.name));
            const seg = key ? flow?.segments[key] : undefined;
            if (key && seg && stateOf(key, seg) !== "hidden") {
              e.stopPropagation();
              onPick(seg.artery, key);
            }
          }}
        />
      )}
      <instancedMesh ref={inst} args={[geo, mat, Math.max(1, particles.length)]} frustumCulled={false} renderOrder={9} raycast={() => null} key={particles.length} />
      {leaders.length > 0 && (
        <lineSegments geometry={leaderGeo} renderOrder={8} raycast={() => null}>
          <lineBasicMaterial color="#cbd5e1" transparent opacity={0.8} depthTest={false} />
        </lineSegments>
      )}
      {labels.map((l) => (
        <LabelSprite key={l.key} text={l.text} pos={l.pos} />
      ))}
    </group>
  );
}

/** A flat text label that keeps its on-screen size (a sprite, so no DOM is added or removed while the selection changes). */
function LabelSprite({ text, pos }: { text: string; pos: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const { tex, ratio } = useMemo(() => {
    const dpr = 2;
    const h = 22 * dpr;
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const font = `${11 * dpr}px ui-monospace, Menlo, Consolas, monospace`;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width + 14 * dpr);
    c.width = w;
    c.height = h;
    g.font = font;
    g.fillStyle = "rgba(255,255,255,0.94)";
    g.strokeStyle = "rgba(90,100,115,0.9)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(1, 1, w - 2, h - 2, 5 * dpr);
    g.fill();
    g.stroke();
    g.fillStyle = "#1f2937";
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText(text, w / 2, h / 2 + 1);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, ratio: w / h };
  }, [text]);
  useEffect(() => () => tex.dispose(), [tex]);
  const sy = (22 / Math.max(size.height, 1)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  return (
    <sprite position={pos} scale={[sy * ratio, sy, 1]} renderOrder={10} raycast={() => null}>
      <spriteMaterial map={tex} sizeAttenuation={false} depthTest={false} transparent toneMapped={false} />
    </sprite>
  );
}
