"use client";

import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadAtlasModel } from "../ui/modelCache";
import { COW_LABEL, SEG_LABEL, slugOf, type FlowFile, type FlowSegment } from "./vessel-data";

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
};

const GREY = "#9aa0a6";
const SPEED = 0.034; // metres per second along the vessel
const SPACING = 0.0125; // metres between arrows
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

function applyState(mesh: THREE.Mesh, st: VesselState, col: string, get: (key: string, color: string, opacity: number, solid: boolean) => THREE.MeshStandardMaterial) {
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
}

type Particle = { line: Line; seg: string; phase: number; dir: 1 | -1; r: number; artery: string; fwdStatic: number };

/** The real artery meshes (one node per segment) plus arrows that run proximal to distal along each selected one. */
export function VesselLayer({ flow, colors, stateOf, sig, animate, labelSlugs, onPick }: Props) {
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

  const segMeshes = useMemo(() => {
    const r: { mesh: THREE.Mesh; name: string }[] = [];
    root?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        // the glTF loader names the mesh node after the segment
        let n: THREE.Object3D | null = mesh;
        let name = mesh.name;
        while (n && !(flow && flow.segments[name])) {
          n = n.parent;
          name = n?.name ?? "";
        }
        r.push({ mesh, name: name || mesh.name });
      }
    });
    return r;
  }, [root, flow]);

  useEffect(() => {
    if (!flow) return;
    for (const { mesh, name } of segMeshes) {
      const seg = flow.segments[name];
      const st: VesselState = seg ? stateOf(name, seg) : "hidden";
      const col = (seg && colors.get(seg.artery)) || GREY;
      applyState(mesh, st, col, mats.get);
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segMeshes, flow, sig, colors, mats, invalidate]);

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
    const g = new THREE.ConeGeometry(1, 3.2, 8, 1);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), []);
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
      const r = Math.max(p.r * 1.25, 0.0006) * env;
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

  const labels = useMemo(() => {
    if (!flow || !labelSlugs) return [];
    const r: { key: string; text: string; pos: THREE.Vector3 }[] = [];
    for (const [name, seg] of Object.entries(flow.segments)) {
      const slug = slugOf(name);
      if (!labelSlugs.has(slug) || !COW_LABEL[slug] || seg.side === "r" || stateOf(name, seg) !== "selected") continue;
      const line = seg.lines.map(makeLine).sort((a, b) => b.len - a.len)[0];
      if (!line) continue;
      at(line, line.len * (slug === "aca" ? 0.25 : 0.5));
      r.push({ key: name, text: COW_LABEL[slug], pos: _p.clone() });
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, labelSlugs, sig]);

  return (
    <group>
      {root && (
        <primitive
          object={root}
          onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
            let n: THREE.Object3D | null = e.object;
            while (n && !(flow && flow.segments[n.name])) n = n.parent;
            const seg = n && flow?.segments[n.name];
            if (seg && n && stateOf(n.name, seg) !== "hidden") {
              e.stopPropagation();
              onPick(seg.artery, n.name);
            }
          }}
        />
      )}
      <instancedMesh ref={inst} args={[geo, mat, Math.max(1, particles.length)]} frustumCulled={false} renderOrder={9} raycast={() => null} key={particles.length} />
      {labels.map((l) => (
        <Html key={l.key} position={l.pos} center distanceFactor={undefined} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded-sm border border-panel-border bg-panel-solid px-1.5 py-0.5 font-mono text-[11px] text-text shadow" title={SEG_LABEL[slugOf(l.key)]}>
            {l.text}
          </span>
        </Html>
      ))}
    </group>
  );
}
