"use client";

import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { slugOf, type FlowFile, type FlowSegment } from "./vessel-data";
import { layoutLabels, type LabelBus, type RawLabel } from "./margin-labels";

/** How one segment is drawn. solid: selected, opaque. idle: nothing selected, soft. faint: context. blocked: occluded. starved: downstream of a block. */
export type SegMode = "solid" | "idle" | "faint" | "blocked" | "starved" | "hidden";
export type SegStyle = {
  mode: SegMode;
  /** pulses run along it */
  flow: boolean;
  /** pulse direction along the stored line */
  dir?: 1 | -1;
  /** brighter pulses (a rerouted vessel) */
  hot?: boolean;
};
type Props = {
  flow: FlowFile | null;
  colors: Map<string, string>;
  styleOf: (name: string, seg: FlowSegment) => SegStyle;
  /** A change of this key re-applies the styles. */
  sig: string;
  animate: boolean;
  /** Text of the margin label of a segment (null: none). */
  labelOf: (name: string, seg: FlowSegment) => string | null;
  bus: LabelBus;
  /** Circle view: only the top of the long carotids and vertebrals is drawn. */
  circle: boolean;
  onPick: (artery: string, name: string) => void;
  onHover: (artery: string | null) => void;
  frame: { n: number; dir: [number, number, number] | null };
  pad: number;
  /** Pixels kept clear at the top for a caption band. */
  topInset?: number;
};

const GREY = "#8a9099";
const SPEED = 0.03; // metres per second
const SPACING = 0.0085; // metres between pulses
const FPS = 30;
const RADIAL = 10;
/** Where along the longest line a segment's label anchors (0 start - 1 end). */
const ANCHOR_AT: Record<string, number> = { aca: 0.25, vertebral: 0.9, ica: 0.88, pericallosal: 0.45, callosomarginal: 0.5, pca: 0.55, sca: 0.55, aica: 0.6, pica: 0.4, "anterior-spinal": 0.5, "lenticulostriate-prox": 0.5 };
const CIRCLE_SLUGS = ["ica", "aca", "acom", "mca-m1", "pcom", "pca", "basilar", "vertebral"];

export type Line = { pts: THREE.Vector3[]; cum: number[]; len: number };
export function makeLine(flat: number[]): Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
/** Point and unit tangent at arc length s along a line. */
export function pointAt(l: Line, s: number, p: THREE.Vector3, t: THREE.Vector3) {
  at(l, s);
  p.copy(_p);
  t.copy(_t);
}
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

/** A smooth tube along each polyline that narrows from r0 to r1, with rounded ends. */
export function taperedTube(flats: number[][], r0: number, r1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const flat of flats) {
    const raw = makeLine(flat);
    if (raw.pts.length < 2 || raw.len < 0.0008) continue;
    const curve = new THREE.CatmullRomCurve3(raw.pts, false, "centripetal");
    const n = Math.min(90, Math.max(4, Math.round(raw.len / 0.0011)));
    const pts = curve.getSpacedPoints(n);
    const tan: THREE.Vector3[] = pts.map((p, i) => (i === 0 ? pts[1].clone().sub(p) : i === n ? p.clone().sub(pts[n - 1]) : pts[i + 1].clone().sub(pts[i - 1])).normalize());
    let nrm = new THREE.Vector3(1, 0, 0);
    if (Math.abs(tan[0].dot(nrm)) > 0.9) nrm = new THREE.Vector3(0, 0, 1);
    nrm = nrm.sub(tan[0].clone().multiplyScalar(nrm.dot(tan[0]))).normalize();
    const base = pos.length / 3;
    const bin = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      if (i > 0) nrm = nrm.sub(tan[i].clone().multiplyScalar(nrm.dot(tan[i]))).normalize(); // parallel transport
      bin.crossVectors(tan[i], nrm).normalize();
      const r = r0 + (r1 - r0) * (i / n);
      for (let k = 0; k < RADIAL; k++) {
        const a = (k / RADIAL) * Math.PI * 2;
        const c = Math.cos(a) * r;
        const s = Math.sin(a) * r;
        pos.push(pts[i].x + c * nrm.x + s * bin.x, pts[i].y + c * nrm.y + s * bin.y, pts[i].z + c * nrm.z + s * bin.z);
      }
    }
    for (let i = 0; i < n; i++)
      for (let k = 0; k < RADIAL; k++) {
        const a = base + i * RADIAL + k;
        const b = base + i * RADIAL + ((k + 1) % RADIAL);
        const c = a + RADIAL;
        const d = b + RADIAL;
        idx.push(a, c, b, b, c, d);
      }
    const cap = (ringStart: number, p: THREE.Vector3, t: THREE.Vector3, r: number, flip: boolean) => {
      const pole = pos.length / 3;
      pos.push(p.x + t.x * r * 0.7, p.y + t.y * r * 0.7, p.z + t.z * r * 0.7);
      for (let k = 0; k < RADIAL; k++) {
        const a = ringStart + k;
        const b = ringStart + ((k + 1) % RADIAL);
        if (flip) idx.push(a, b, pole);
        else idx.push(b, a, pole);
      }
    };
    cap(base, pts[0], tan[0].clone().negate(), r0, true);
    cap(base + n * RADIAL, pts[n], tan[n], r1, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The part of a polyline above y = yMin (the crossing point is interpolated), or null when none is left. */
function clipFlat(flat: number[], yMin: number): number[] | null {
  if (!Number.isFinite(yMin)) return flat;
  const out: number[] = [];
  const n = flat.length / 3;
  for (let i = 0; i < n; i++) {
    const y = flat[i * 3 + 1];
    if (y >= yMin) {
      if (i > 0 && flat[(i - 1) * 3 + 1] < yMin) {
        const y0 = flat[(i - 1) * 3 + 1];
        const u = (yMin - y0) / (y - y0);
        for (let k = 0; k < 3; k++) out.push(flat[(i - 1) * 3 + k] + (flat[i * 3 + k] - flat[(i - 1) * 3 + k]) * u);
      }
      out.push(flat[i * 3], y, flat[i * 3 + 2]);
    } else if (i > 0 && flat[(i - 1) * 3 + 1] >= yMin) {
      const y0 = flat[(i - 1) * 3 + 1];
      const u = (yMin - y0) / (y - y0);
      for (let k = 0; k < 3; k++) out.push(flat[(i - 1) * 3 + k] + (flat[i * 3 + k] - flat[(i - 1) * 3 + k]) * u);
    }
  }
  return out.length >= 6 ? out : null;
}

type Rec = {
  name: string;
  seg: FlowSegment;
  /** the lines actually drawn (circle view trims the long vessels) */
  lines: number[][];
  /** a few points along every line, for the label margins */
  samples: THREE.Vector3[];
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  outline: THREE.Mesh;
  cur: { op: number; col: THREE.Color; em: number };
  tgt: { op: number; col: THREE.Color; em: number; solid: boolean };
  style: SegStyle;
  anchor: THREE.Vector3 | null;
};
type Particle = { rec: Rec; line: Line; phase: number; r: number; fwdStatic: number; alt: 1 | -1 };

const BRAIN_BOX = new THREE.Box3(new THREE.Vector3(-0.066, 1.56, -0.088), new THREE.Vector3(0.066, 1.7, 0.086));
/** New instanced meshes start with identity matrices (a 1 m cone at the origin) until the first frame places them: hide them at once. */
function initInstances(ref: { current: THREE.InstancedMesh | null }) {
  return (m: THREE.InstancedMesh | null) => {
    // eslint-disable-next-line react-hooks/immutability
    ref.current = m;
    if (!m || m.userData.zeroed) return;
    m.userData.zeroed = true;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, z);
    m.instanceMatrix.needsUpdate = true;
  };
}

const TRUNKS = new Set(["ica", "vertebral", "basilar"]);

/** Tapered tube vessels (one per segment, calm cross-fades between states) with pulses along the flow and margin-label anchors. */
export function VesselLayer({ flow, colors, styleOf, sig, animate, labelOf, bus, circle, onPick, onHover, frame, pad, topInset = 18 }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  // circle view: only the top of the long vessels is drawn, so the ring is not buried under their length
  const yMin = useMemo(() => {
    if (!flow || !circle) return -Infinity;
    let top = -Infinity;
    for (const [name, seg] of Object.entries(flow.segments)) {
      if (!CIRCLE_SLUGS.includes(slugOf(name))) continue;
      for (const flat of seg.lines) for (let i = 1; i < flat.length; i += 3) top = Math.max(top, flat[i]);
    }
    return top - 0.075;
  }, [flow, circle]);

  // ---- geometry: built once per flow file
  const built = useMemo(() => {
    if (!flow) return null;
    const group = new THREE.Group();
    const recs = new Map<string, Rec>();
    for (const [name, seg] of Object.entries(flow.segments)) {
      const slug = slugOf(name);
      const r0 = Math.max(seg.radius * (seg.radius > 0.0012 ? 0.85 : 1.15), 0.00042);
      const r1 = r0 * (TRUNKS.has(slug) ? 0.88 : 0.62);
      const lines0 = seg.lines.map((l) => clipFlat(l, yMin)).filter((l): l is number[] => !!l);
      const geo = taperedTube(lines0, r0, r1);
      const mat = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.42, metalness: 0.04, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      const omat = new THREE.MeshBasicMaterial({ color: "#161a22", side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false });
      const outline = new THREE.Mesh(taperedTube(lines0, r0 * 1.12 + 0.00007, r1 * 1.12 + 0.00007), omat);
      outline.raycast = () => null;
      outline.visible = false;
      group.add(outline);
      mesh.name = name;
      mesh.visible = false;
      group.add(mesh);
      const lines = lines0.map(makeLine).sort((a, b) => b.len - a.len);
      const samples: THREE.Vector3[] = [];
      for (const l of lines0) for (let i = 0; i + 2 < l.length; i += 9) samples.push(new THREE.Vector3(l[i], l[i + 1], l[i + 2]));
      let anchor: THREE.Vector3 | null = null;
      if (lines[0]) {
        at(lines[0], lines[0].len * (ANCHOR_AT[slug] ?? 0.5));
        anchor = _p.clone();
      }
      recs.set(name, { name, seg, lines: lines0, samples, mesh, mat, outline, cur: { op: 0, col: new THREE.Color(GREY), em: 0 }, tgt: { op: 0, col: new THREE.Color(GREY), em: 0, solid: false }, style: { mode: "hidden", flow: false }, anchor });
    }
    return { group, recs };
  }, [flow, yMin]);
  useEffect(
    () => () => {
      built?.recs.forEach((r) => {
        r.mesh.geometry.dispose();
        r.mat.dispose();
        r.outline.geometry.dispose();
        (r.outline.material as THREE.Material).dispose();
      });
    },
    [built],
  );

  // ---- pulses: built once for every line; each frame only the active segments place theirs
  const particles = useMemo<Particle[]>(() => {
    if (!built) return [];
    const out: Particle[] = [];
    for (const rec of built.recs.values()) {
      for (const flat of rec.lines) {
        const line = makeLine(flat);
        if (line.len < 0.004) continue;
        const n = Math.max(1, Math.round(line.len / SPACING));
        for (let k = 0; k < n; k++) out.push({ rec, line, phase: (k / n) * line.len, r: rec.seg.radius, fwdStatic: (k + 0.5) / n, alt: k % 2 ? -1 : 1 });
      }
    }
    return out;
  }, [built]);
  const inst = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.ConeGeometry(1, 5, 7, 1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpC = useMemo(() => new THREE.Color(), []);
  const white = useMemo(() => new THREE.Color("#ffffff"), []);

  const needsPulses = useRef(false);
  const placeAll = (time: number) => {
    const im = inst.current;
    if (!im) return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const st = p.rec.style;
      const op = p.rec.cur.op;
      if (!st.flow || op < 0.2 || (st.mode !== "solid" && st.mode !== "idle")) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const L = p.line.len;
      const moving = animate && !reduced;
      const dir = st.dir ?? (p.rec.seg.flow === "both" ? p.alt : 1); // communicating arteries: two-way unless told
      let s = moving ? (((p.phase + time * SPEED * (0.75 + 0.25 * Math.min(1, p.r / 0.0016))) % L) + L) % L : p.fwdStatic * L;
      if (dir === -1) s = L - s;
      at(p.line, s);
      const u = s / L;
      const env = 0.5 + 0.5 * Math.sin(Math.PI * u);
      const r = Math.max(p.r * 0.3, 0.00022) * env * Math.min(1, (op - 0.2) / 0.5);
      dummy.position.copy(_p);
      dummy.quaternion.setFromUnitVectors(up, dir === 1 ? _t : _t.negate());
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      tmpC.set(colors.get(p.rec.seg.artery) ?? "#ffffff").lerp(white, st.hot ? 0.95 : 0.7);
      im.setColorAt(i, tmpC);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    if (!(animate && !reduced)) needsPulses.current = false;
  };

  // ---- margin labels: project the anchors, push the labels to the left and right margins, hand them to the DOM painter
  const v = useMemo(() => new THREE.Vector3(), []);
  const lastKey = useRef("");
  const projectLabels = () => {
    if (!built || !bus.ready()) return;
    const w = size.width;
    const h = size.height;
    const items: RawLabel[] = [];
    for (const rec of built.recs.values()) {
      if (!rec.anchor || rec.cur.op < 0.5 || (rec.style.mode !== "solid" && rec.style.mode !== "blocked")) continue;
      const text = labelOf(rec.name, rec.seg);
      if (!text) continue;
      v.copy(rec.anchor).project(camera);
      if (v.z > 1) continue;
      items.push({ id: rec.name, text, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, color: rec.style.mode === "blocked" ? "#d1495b" : (colors.get(rec.seg.artery) ?? GREY), mark: rec.style.mode === "blocked" });
    }
    let minX = Infinity;
    let maxX = -Infinity;
    for (const rec of built.recs.values()) {
      if (rec.cur.op < 0.3 || rec.style.mode === "faint" || rec.style.mode === "hidden") continue;
      for (const sp of rec.samples) {
        v.copy(sp).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    const out = layoutLabels(items, w, h, topInset, Number.isFinite(minX) ? { minX, maxX } : undefined);
    const key = out.map((o) => `${o.id}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.ly)}:${Math.round(o.lx)}`).join("|") + `|${w}x${h}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    bus.emit(out, w, h);
  };
  useEffect(
    () => () => {
      bus.emit([], 0, 0);
    },
    [bus],
  );

  // ---- targets from the styles (cheap: the frame loop eases every segment toward them)
  useEffect(() => {
    if (!built) return;
    const red = new THREE.Color("#d1495b");
    const grey = new THREE.Color(GREY);
    const starved = new THREE.Color("#6b7280");
    for (const rec of built.recs.values()) {
      const st = styleOf(rec.name, rec.seg);
      rec.style = st;
      const col = new THREE.Color(colors.get(rec.seg.artery) ?? GREY);
      let op = 0;
      let em = 0;
      let c = col;
      let solid = false;
      switch (st.mode) {
        case "solid":
          op = 1;
          em = 0.3;
          solid = true;
          break;
        case "idle":
          op = 0.62;
          break;
        case "faint":
          op = 0.3;
          c = grey;
          break;
        case "blocked":
          op = 1;
          em = 0.3;
          c = red;
          solid = true;
          break;
        case "starved":
          op = 0.3;
          c = starved;
          break;
        default:
          op = 0;
      }
      rec.tgt = { op, col: c, em, solid };
      rec.mesh.userData.pick = st.mode !== "hidden" && st.mode !== "faint";
    }
    needsPulses.current = true;
    lastKey.current = "";
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, sig, colors]);

  useFrame((_, dt) => {
    if (!built) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    let moving = false;
    for (const rec of built.recs.values()) {
      const c = rec.cur;
      const t = rec.tgt;
      if (Math.abs(c.op - t.op) > 0.004 || Math.abs(c.em - t.em) > 0.004 || Math.abs(c.col.r - t.col.r) + Math.abs(c.col.g - t.col.g) + Math.abs(c.col.b - t.col.b) > 0.006) {
        c.op += (t.op - c.op) * k;
        c.em += (t.em - c.em) * k;
        c.col.lerp(t.col, k);
        moving = true;
      } else {
        c.op = t.op;
        c.em = t.em;
        c.col.copy(t.col);
      }
      const m = rec.mat;
      m.color.copy(c.col);
      m.emissive.copy(c.col).multiplyScalar(c.em);
      m.opacity = c.op;
      // opaque once solid and settled (correct depth sorting for the selected vessels)
      const opaque = t.solid && c.op > 0.985;
      if (m.transparent === opaque) {
        m.transparent = !opaque;
        m.needsUpdate = true;
      }
      m.depthWrite = opaque || c.op > 0.55;
      rec.mesh.visible = c.op > 0.004;
      rec.mesh.renderOrder = t.solid ? 6 : t.op > 0.3 ? 4 : 3;
      const om = rec.outline.material as THREE.MeshBasicMaterial;
      om.opacity = rec.style.mode === "faint" || rec.style.mode === "hidden" ? 0 : c.op * 0.5;
      rec.outline.visible = om.opacity > 0.01 && rec.mesh.visible;
      rec.outline.renderOrder = rec.mesh.renderOrder - 0.5;
    }
    // latency probe (click-to-first-frame and click-to-settled); the page sets window.__supplyT0 on a click
    const w = window as unknown as { __supplyT0?: number; __supplyFirst?: number; __supplyMs?: number };
    if (w.__supplyT0) {
      const now = performance.now();
      if (w.__supplyFirst === undefined) w.__supplyFirst = now - w.__supplyT0;
      if (!moving) {
        w.__supplyMs = now - w.__supplyT0;
        w.__supplyT0 = 0;
      }
    }
    if (moving) invalidate();
    if (moving || (animate && !reduced) || needsPulses.current) placeAll(performance.now() / 1000);
    projectLabels();
  });

  // ticks the on-demand render loop while pulses are moving and the page is visible
  useEffect(() => {
    if (!animate || reduced) return;
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
  }, [animate, reduced, invalidate]);
  useEffect(() => {
    needsPulses.current = true;
    invalidate();
  }, [animate, invalidate]);

  // ---- camera: fit the visible vessels (from their centrelines); keep the viewing direction unless asked
  const moved = useRef(false);
  const lastN = useRef(-1);
  const framed = useRef(false);
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
    if (!flow || !controls || !built) return;
    const box = new THREE.Box3();
    let any = false;
    for (const name of Object.keys(flow.segments)) {
      const m = built.recs.get(name)?.style.mode;
      if (m !== "solid" && m !== "idle" && m !== "blocked" && m !== "starved") continue;
      for (const flat of built.recs.get(name)?.lines ?? [])
        for (let i = 0; i + 2 < flat.length; i += 3) {
          box.expandByPoint(_p.set(flat[i], flat[i + 1], flat[i + 2]));
          any = true;
        }
    }
    if (!any) return;
    box.expandByScalar((circle ? 0.022 : 0.008) + pad);
    box.union(BRAIN_BOX); // the whole brain always fits the canvas (the camera frames the brain, not the selection)
    const fresh = lastN.current !== frame.n;
    if (fresh) {
      dirRef.current = frame.dir ?? dirRef.current;
      moved.current = false;
    }
    lastN.current = frame.n;
    // The camera only moves on an explicit Frame (frame.n changes), never on a selection change.
    if (!fresh && framed.current) return;
    framed.current = true;
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
      const marginX = size.width > 700 ? 1.2 : 0.98; // leave the side margins to the labels
      let D = 0.03;
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        const a = corner.clone().sub(c).dot(dir);
        const vv = corner.applyMatrix4(inv);
        D = Math.max(D, (Math.abs(vv.x) / (tanV * aspect)) * marginX + a, (Math.abs(vv.y) / tanV) * 1.08 + a);
      }
      camera.position.copy(c).addScaledVector(dir, D);
      camera.up.set(0, 1, 0);
      camera.lookAt(c);
      controls.target.copy(c);
      controls.update();
      invalidate();
    };
    const ts = [0, 150, 500, 1000, 2000, 3500, 6000].map((ms) => window.setTimeout(apply, ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, controls, built, frame, sig, pad, size.width, size.height, yMin]);

  const hovered = useRef<string | null>(null);
  const pickOf = (o: THREE.Object3D) => {
    const rec = built?.recs.get(o.name);
    return rec && rec.mesh.userData.pick ? rec : null;
  };
  return (
    <group>
      {built && (
        <primitive
          object={built.group}
          onClick={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
            const rec = pickOf(e.object);
            if (rec) {
              e.stopPropagation();
              onPick(rec.seg.artery, rec.name);
            }
          }}
          onPointerOver={(e: { stopPropagation: () => void; object: THREE.Object3D }) => {
            const rec = pickOf(e.object);
            if (!rec) return;
            e.stopPropagation();
            if (hovered.current !== rec.seg.artery) {
              hovered.current = rec.seg.artery;
              onHover(rec.seg.artery);
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
      )}
      <instancedMesh ref={initInstances(inst)} args={[geo, mat, Math.max(1, particles.length)]} frustumCulled={false} renderOrder={9} raycast={() => null} key={particles.length} />
    </group>
  );
}
