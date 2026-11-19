"use client";
/*
 * Directional terms and planes in 3D (owner, 2026-11-18: "change the directional cards to a 3D model of the brain, an animal
 * and the human body and cover all the directionality terms"). One small scene per card: a subject (four-legged animal,
 * human body, human brain with its brainstem) and what the card asks about, drawn as a crisp arrow, a pair of points, a
 * plane or the neuraxis. On the prompt the drawing carries no name; on reveal the term is written beside it.
 *
 * Frames (glTF, metres / model units): x = the subject's left, y = up, z = the subject's front (the animal's nose).
 * The neuraxis rule the course teaches (Lab 1): in the cerebrum rostral = anterior and dorsal = superior; below the
 * midbrain (brainstem, cord) the axis bends ~90°, so rostral = superior and dorsal = posterior. In a four-legged animal the
 * axis stays straight: rostral = anterior (toward the nose), dorsal = toward the back.
 * Models: human skin from Z-Anatomy (CC BY-SA 4.0), horse from Quaternius "Farm Animals" (CC0 1.0), brain gross.glb.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { loadAtlasModel } from "@/lib/atlas/loader";
import "./direction-scene.css";

export type SceneSubject = "animal" | "human" | "brain";
export interface DirectionSceneProps {
  subject: SceneSubject;
  /** "dir:<term>", "dir:stem-<term>" (brainstem), "plane:<sagittal|parasagittal|coronal|horizontal>", "axis", "flexure",
   *  "pair:<ipsilateral|contralateral>", "median" */
  show: string;
  /** the answer is shown (labels on the drawing) */
  reveal: boolean;
  label?: string;
  compact?: boolean;
}

const FILE: Record<SceneSubject, string> = { animal: "directions/animal.glb?v=3", human: "directions/human.glb?v=3", brain: "gross.glb" };
const INK = "#e0a23a";

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Frame of a loaded subject: its box, and (brain) the brainstem's box. */
type Frame = { box: THREE.Box3; size: V3; c: V3; stem: THREE.Box3 | null; pts: V3[] };

function frameOf(g: THREE.Object3D, subject: SceneSubject): Frame {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const stem = new THREE.Box3();
  const pts: V3[] = [];
  g.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (subject === "animal" || subject === "human") {
      const pa = (o as THREE.Mesh).geometry.getAttribute("position");
      for (let i = 0; i < pa.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld));
    }
    const b = new THREE.Box3().setFromObject(o);
    box.union(b);
    const name = `${o.name} ${o.parent?.name ?? ""}`;
    if (subject === "brain" && /(pons|medulla-oblongata|midbrain)/.test(name)) stem.union(b);
  });
  return { box, size: box.getSize(new THREE.Vector3()), c: box.getCenter(new THREE.Vector3()), stem: stem.isEmpty() ? null : stem, pts };
}

/** What to draw for a card, in the subject's frame. */
type Drawing = {
  arrows: { from: V3; to: V3 }[];
  dots: V3[];
  plane: { at: V3; normal: V3; w: number; h: number } | null;
  curve: V3[] | null;
  mark: V3 | null;
  labelAt: V3;
  /** camera direction (from the subject toward the camera) */
  view: V3;
  /** arrow shaft radius as a fraction of the subject's size (default 0.017) */
  w?: number;
  /** the subject is drawn see-through (an arrow inside the body) */
  seeThrough?: boolean;
};

function drawing(subject: SceneSubject, show: string, f: Frame): Drawing {
  const { box, size: S, c } = f;
  const L = Math.max(S.x, S.y, S.z);
  const out: Drawing = { arrows: [], dots: [], plane: null, curve: null, mark: null, labelAt: c.clone(), view: v(1, 0.25, 0.35).normalize() };
  const arrow = (from: V3, dir: V3, len = 0.32 * L) => {
    out.arrows.push({ from, to: from.clone().addScaledVector(dir.clone().normalize(), len) });
    out.labelAt = from.clone().addScaledVector(dir.clone().normalize(), len * 1.4);
  };
  const [kind, raw = ""] = show.split(":");
  const stem = raw.startsWith("stem-");
  const term = raw.replace(/^stem-/, "");

  if (kind === "plane") {
    const n = term === "coronal" ? v(0, 0, 1) : term === "horizontal" ? v(0, 1, 0) : v(1, 0, 0);
    const at = c.clone();
    if (term === "parasagittal") at.x += S.x * 0.22;
    const w = n.x ? S.z * 1.25 : S.x * 1.25;
    const h = n.y ? S.z * 1.25 : S.y * 1.2;
    out.plane = { at, normal: n, w, h };
    out.labelAt = at.clone().add(v(0, S.y * 0.5, 0));
    out.view = term === "coronal" ? v(0.75, 0.35, 0.55).normalize() : term === "horizontal" ? v(0.6, 0.75, 0.4).normalize() : v(0.55, 0.3, 0.75).normalize();
    return out;
  }

  if (subject === "brain") {
    const st = f.stem ?? new THREE.Box3(v(c.x - S.x * 0.08, box.min.y, c.z - S.z * 0.25), v(c.x + S.x * 0.08, c.y - S.y * 0.1, c.z));
    const sc = st.getCenter(new THREE.Vector3());
    const flex = v(sc.x, st.max.y, sc.z); // midbrain: where the neuraxis bends
    out.view = v(1, 0.12, 0.05).normalize(); // a lateral view: the bend shows
    if (kind === "axis" || kind === "flexure") {
      const front = v(c.x, c.y + S.y * 0.12, box.max.z - S.z * 0.12);
      const mid = v(c.x, c.y + S.y * 0.1, flex.z + S.z * 0.12);
      const bottom = v(sc.x, st.min.y - S.y * 0.02, sc.z - (st.max.z - st.min.z) * 0.1);
      const curve = new THREE.CatmullRomCurve3([front, v(c.x, c.y + S.y * 0.14, c.z + S.z * 0.1), mid, flex, v(sc.x, sc.y, sc.z), bottom], false, "centripetal");
      out.curve = curve.getPoints(80);
      if (kind === "flexure") out.mark = flex.clone();
      out.labelAt = kind === "flexure" ? flex.clone().add(v(0, S.y * 0.08, -S.z * 0.12)) : front.clone().add(v(0, S.y * 0.08, 0));
      return out;
    }
    if (!stem) {
      const d: Record<string, V3> = { rostral: v(0, 0, 1), anterior: v(0, 0, 1), caudal: v(0, 0, -1), posterior: v(0, 0, -1), dorsal: v(0, 1, 0), superior: v(0, 1, 0), ventral: v(0, -1, 0), inferior: v(0, -1, 0) };
      // arrows start at the surface they point away from (frontal pole, occipital pole, vertex, base of the frontal lobe)
      const from = /rostral|anterior/.test(term) ? v(c.x, c.y + S.y * 0.12, box.max.z - S.z * 0.04)
        : /caudal|posterior/.test(term) ? v(c.x, c.y + S.y * 0.1, box.min.z + S.z * 0.04)
        : /dorsal|superior/.test(term) ? v(c.x, box.max.y - S.y * 0.03, c.z + S.z * 0.05)
        : v(c.x, c.y - S.y * 0.08, c.z + S.z * 0.28);
      arrow(from, d[term] ?? v(0, 0, 1), 0.3 * L);
    } else {
      // below the flexure: rostral = up the brainstem, dorsal = toward the back
      const d: Record<string, V3> = { rostral: v(0, 1, 0), superior: v(0, 1, 0), caudal: v(0, -1, 0), inferior: v(0, -1, 0), dorsal: v(0, 0, -1), posterior: v(0, 0, -1), ventral: v(0, 0, 1), anterior: v(0, 0, 1) };
      const sz = st.getSize(new THREE.Vector3());
      const from = /rostral|superior/.test(term) ? v(sc.x, st.max.y - sz.y * 0.15, sc.z) : /caudal|inferior/.test(term) ? v(sc.x, st.min.y + sz.y * 0.1, sc.z)
        : /dorsal|posterior/.test(term) ? v(sc.x, sc.y, st.min.z + sz.z * 0.2) : v(sc.x, sc.y, st.max.z - sz.z * 0.2);
      arrow(from, d[term] ?? v(0, -1, 0), 0.27 * L);
    }
    return out;
  }

  if (subject === "animal") {
    out.view = v(1, 0.18, 0.12).normalize();
    // the spinal cord runs just under the back: for each slice along the body, a point a little below the dorsal surface
    // (legs excluded), smoothed into one calm line from the back of the skull to the root of the tail
    const legTop = box.min.y + S.y * 0.45;
    const spine = (z: number) => {
      const sl = f.pts.filter((p) => Math.abs(p.z - z) < S.z * 0.03 && p.y > legTop && Math.abs(p.x - c.x) < S.x * 0.45);
      if (!sl.length) return null;
      const top = Math.max(...sl.map((p) => p.y));
      const bot = Math.min(...sl.map((p) => p.y));
      return v(c.x, top - (top - bot) * 0.22, z);
    };
    const zs = Array.from({ length: 24 }, (_, k) => box.max.z - S.z * (0.1 + (k / 23) * 0.74));
    const trace = zs.map(spine).filter((p): p is V3 => !!p);
    const sm = trace.map((p, k) => {
      const nb = trace.slice(Math.max(0, k - 2), k + 3);
      return v(c.x, nb.reduce((a, q) => a + q.y, 0) / nb.length, p.z);
    });
    const head = sm[0];
    const tail = sm[sm.length - 1];
    const mid = sm[Math.floor(sm.length / 2)];
    if (kind === "axis") {
      out.curve = sm;
      out.labelAt = mid.clone().add(v(0, S.y * 0.22, 0));
      return out;
    }
    const d: Record<string, V3> = { rostral: v(0, 0, 1), anterior: v(0, 0, 1), cranial: v(0, 0, 1), caudal: v(0, 0, -1), posterior: v(0, 0, -1), dorsal: v(0, 1, 0), superior: v(0, 1, 0), ventral: v(0, -1, 0), inferior: v(0, -1, 0) };
    // each arrow starts just off the body surface it points away from (tip of the nose, the rump, the back, the belly)
    const gap = L * 0.012;
    const body = f.pts.filter((p) => p.y > legTop);
    const near = (z: number) => body.filter((p) => Math.abs(p.z - z) < S.z * 0.03 && Math.abs(p.x - c.x) < S.x * 0.2);
    const nose = body.reduce((a, p) => (p.z > a.z ? p : a), body[0]);
    const rumpY = tail.y;
    const rump = body.filter((p) => Math.abs(p.y - rumpY) < S.y * 0.06).reduce((a, p) => (p.z < a.z ? p : a), tail);
    const slice = near(mid.z);
    const back = slice.length ? Math.max(...slice.map((p) => p.y)) : mid.y + S.y * 0.08;
    const belly = slice.length ? Math.min(...slice.map((p) => p.y)) : mid.y - S.y * 0.12;
    const from = /rostral|anterior|cranial/.test(term) ? v(c.x, nose.y, nose.z + gap)
      : /caudal|posterior/.test(term) ? v(c.x, rump.y, rump.z - gap)
      : /ventral|inferior/.test(term) ? v(c.x, belly - gap, mid.z)
      : v(c.x, back + gap, mid.z);
    arrow(from, d[term] ?? v(0, 0, 1), 0.22 * L);
    return out;
  }

  // human body (standing, anatomical position); the Z-Anatomy skin faces +z. Every arrow is thin and sits on the skin
  // it describes (owner 2026-11-18: "tighter and more specific"): it starts and ends on, or just off, the surface.
  const H = S.y;
  out.w = 0.0068;
  const fwd = v(0, 0, 1);
  const gap = H * 0.004;
  const Y = (t: number) => box.min.y + H * t;
  const near = (x: number, y: number, r = 0.012) => f.pts.filter((p) => Math.abs(p.x - x) < H * r && Math.abs(p.y - y) < H * r);
  const front = (x: number, y: number) => { const q = near(x, y, 0.007); return q.length ? Math.max(...q.map((p) => p.z)) : c.z + S.z * 0.3; };
  const back = (x: number, y: number) => { const q = near(x, y, 0.007); return q.length ? Math.min(...q.map((p) => p.z)) : c.z - S.z * 0.3; };
  // the trunk's edge on the +x side at height y: walk out from the midline to the first empty gap (the arm hangs beyond it)
  const trunkEdge = (y: number) => {
    const bin = H * 0.006;
    const occ = new Set(f.pts.filter((p) => Math.abs(p.y - y) < H * 0.01).map((p) => Math.round((p.x - c.x) / bin)));
    let k = 0;
    while (occ.has(k + 1) || occ.has(k + 2)) k++;
    return c.x + (k + 0.5) * bin;
  };
  const limb = (y: number) => {
    const e = trunkEdge(y);
    const q = f.pts.filter((p) => Math.abs(p.y - y) < H * 0.01 && p.x > e + H * 0.004);
    if (!q.length) return null;
    const xs = q.map((p) => p.x), zs = q.map((p) => p.z);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, x0: Math.min(...xs), x1: Math.max(...xs), zf: Math.max(...zs) };
  };
  const seg = (a: V3, b: V3) => {
    out.arrows.push({ from: a, to: b });
    out.labelAt = b.clone().add(b.clone().sub(a).normalize().multiplyScalar(H * 0.06));
  };
  out.view = v(0.3, 0.12, 1).normalize(); // from the front, a little to the arm's side
  if (kind === "median") {
    out.plane = { at: c.clone(), normal: v(1, 0, 0), w: S.z * 1.6, h: S.y * 1.05 };
    out.labelAt = c.clone().add(v(0, S.y * 0.56, 0));
    return out;
  }
  if (kind === "pair") {
    const hand = limb(Y(0.46));
    const handAt = hand ? v(hand.x, Y(0.46), hand.zf) : v(c.x + S.x * 0.42, Y(0.46), c.z);
    const foot = (sgn: number) => {
      const q = f.pts.filter((p) => p.y < Y(0.03) && (p.x - c.x) * sgn > 0);
      if (!q.length) return v(c.x + sgn * S.x * 0.12, Y(0.02), c.z);
      const top = q.reduce((m, p) => (p.z > m.z ? p : m));
      return v(top.x, Y(0.025), top.z - H * 0.03);
    };
    out.dots = [handAt, foot(term === "contralateral" ? -1 : 1)];
    out.labelAt = handAt.clone().add(v(S.x * 0.15, 0, 0));
    return out;
  }
  if (/medial|lateral/.test(term)) {
    // across the front of the chest, at the nipple line: toward the midline (medial) or away from it (lateral)
    const y = Y(0.72);
    const xin = c.x + H * 0.02, xout = c.x + H * 0.12;
    const z = Math.max(front(xin, y), front(xout, y), front((xin + xout) / 2, y)) + gap;
    if (term === "medial") seg(v(xout, y, z), v(xin, y, z));
    else seg(v(xin, y, z), v(xout, y, z));
    return out;
  }
  if (/proximal|distal/.test(term)) {
    // along the front of the arm, from the forearm to the upper arm (proximal) or back down (distal)
    const lo = limb(Y(0.52)), hi = limb(Y(0.66));
    const a = lo ? v(lo.x, Y(0.52), lo.zf + gap) : v(c.x + S.x * 0.36, Y(0.52), c.z + S.z * 0.25);
    const b = hi ? v(hi.x, Y(0.66), hi.zf + gap) : v(c.x + S.x * 0.33, Y(0.66), c.z + S.z * 0.25);
    if (term === "proximal") seg(a, b);
    else seg(b, a);
    return out;
  }
  if (/superficial|deep/.test(term)) {
    // the thigh, seen through the skin: from its core (the femur) out to the skin, or from the skin in to the core
    out.seeThrough = true;
    out.w = 0.008;
    const y = Y(0.345);
    const q = f.pts.filter((p) => Math.abs(p.y - y) < H * 0.008 && p.x > c.x + H * 0.01);
    const xs = q.map((p) => p.x), zs = q.map((p) => p.z);
    const cx = q.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : c.x + S.x * 0.12;
    const cz = q.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : c.z;
    const skin = front(cx, y);
    const core = v(cx, y, cz), surf = v(cx, y, skin);
    out.view = v(1, 0.1, 0.12).normalize(); // from the side: the arrow runs across the view
    if (term === "deep") seg(surf.clone().add(v(0, 0, gap * 4)), core);
    else seg(core, surf);
    return out;
  }
  if (/anterior|ventral|posterior|dorsal/.test(term)) {
    // straight off the chest wall (anterior) or the back (posterior), seen from the side
    const y = Y(0.7);
    const x = c.x + H * 0.04;
    out.view = v(1, 0.15, 0.15).normalize();
    if (/anterior|ventral/.test(term)) { const z = front(x, y) + gap; seg(v(x, y, z), v(x, y, z + H * 0.1)); }
    else { const z = back(x, y) - gap; seg(v(x, y, z), v(x, y, z - H * 0.1)); }
    return out;
  }
  // superior / inferior: along the front of the trunk, from the belly up toward the head, or down toward the feet
  const x = c.x + H * 0.04;
  const ya = Y(0.6), yb = Y(0.74);
  const za = front(x, ya) + gap, zb = front(x, yb) + gap;
  const z = Math.max(za, zb);
  void fwd;
  if (/inferior|caudal/.test(term)) seg(v(x, yb, z), v(x, ya, z));
  else seg(v(x, ya, z), v(x, yb, z));
  return out;
}

function Arrow({ from, to, w }: { from: V3; to: V3; w: number }) {
  const { pos, quat, len } = useMemo(() => {
    const d = to.clone().sub(from);
    return { pos: from.clone().add(to).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), d.clone().normalize()), len: d.length() };
  }, [from, to]);
  const head = Math.min(len * 0.32, w * 5);
  return (
    <group position={pos} quaternion={quat} renderOrder={10}>
      <mesh position={[0, -head / 2, 0]} renderOrder={10}>
        <cylinderGeometry args={[w, w, len - head, 16]} />
        <meshBasicMaterial color={INK} depthTest={false} transparent />
      </mesh>
      <mesh position={[0, len / 2 - head / 2, 0]} renderOrder={10}>
        <coneGeometry args={[w * 2.6, head, 24]} />
        <meshBasicMaterial color={INK} depthTest={false} transparent />
      </mesh>
    </group>
  );
}

function Tube({ pts, w }: { pts: V3[]; w: number }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, w, 10, false), [pts, w]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} renderOrder={10}>
      <meshBasicMaterial color={INK} depthTest={false} transparent opacity={0.95} />
    </mesh>
  );
}

function Subject({ subject, show, reveal, label, onFrame }: Omit<DirectionSceneProps, "compact"> & { onFrame: (f: Frame, d: Drawing) => void }) {
  const [obj, setObj] = useState<THREE.Group | null>(null);
  useEffect(() => {
    let alive = true;
    loadAtlasModel(FILE[subject]).then((g) => {
      if (!alive) return;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const tone = subject === "human" ? "#d9c3b0" : subject === "animal" ? "#a0704c" : "#d9b4a8"; // the horse: a chestnut coat
        // the brain keeps its baked sulcal shading (vertex colours) under a warm brain tone, like the atlas
        m.material = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.8, flatShading: false, vertexColors: subject === "brain" && !!m.geometry.getAttribute("color") });
        // brainstem cards and the neuraxis: the cerebrum turns see-through so the brainstem and the bend read
        const inStem = /(pons|medulla-oblongata|midbrain)/.test(`${o.name} ${o.parent?.name ?? ""}`);
        if (subject === "brain" && /stem-|axis|flexure/.test(show) && !inStem) Object.assign(m.material, { transparent: true, opacity: 0.32, depthWrite: false });
      });
      setObj(g);
    });
    return () => {
      alive = false;
    };
  }, [subject, show]);
  const f = useMemo(() => (obj ? frameOf(obj, subject) : null), [obj, subject]);
  const d = useMemo(() => (f ? drawing(subject, show, f) : null), [f, subject, show]);
  useEffect(() => {
    if (f && d) onFrame(f, d);
  }, [f, d, onFrame]);
  // an arrow inside the body (superficial / deep): the skin turns see-through around it
  useEffect(() => {
    if (!obj || subject === "brain") return;
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!(o as THREE.Mesh).isMesh || !m) return;
      Object.assign(m, d?.seeThrough ? { transparent: true, opacity: 0.5, depthWrite: false } : { transparent: false, opacity: 1, depthWrite: true });
      m.needsUpdate = true;
    });
  }, [obj, d, subject]);
  if (!obj || !f || !d) return null;
  const L = Math.max(f.size.x, f.size.y, f.size.z);
  const w = L * (d.w ?? 0.017);
  return (
    <group>
      <primitive object={obj} />
      {d.arrows.map((a, i) => (
        <Arrow key={i} from={a.from} to={a.to} w={w} />
      ))}
      {d.curve && <Tube pts={d.curve} w={w * 0.9} />}
      {[...d.dots, ...(d.mark ? [d.mark] : [])].map((p, i) => (
        <mesh key={i} position={p} renderOrder={11}>
          <sphereGeometry args={[w * 3.2, 20, 14]} />
          <meshBasicMaterial color={INK} depthTest={false} transparent />
        </mesh>
      ))}
      {d.plane && <PlaneSheet {...d.plane} />}
      {subject === "human" && <Shorts obj={obj} f={f} />}
      {subject === "human" && <Eyes f={f} tone="#b49a86" />}
      {subject === "animal" && <GradCap f={f} />}
      {subject === "animal" && <Sneakers f={f} />}
      {reveal && label && (
        <Html position={d.labelAt} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="dir-tag">{label}</span>
        </Html>
      )}
    </group>
  );
}

/** Shorts over the pelvis (owner 2026-11-18: an anatomy figure, not a nude; "wtf are these pants" to a plain cylinder):
 * the skin itself between the waist and mid-thigh, lifted a few millimetres along its normals, so the cloth follows the
 * hips, the buttocks and each thigh. The hands hanging beside the thighs are left out (only the trunk's span counts). */
function Shorts({ obj, f }: { obj: THREE.Object3D; f: Frame }) {
  const made = useMemo(() => {
    const H = f.size.y;
    const y0 = f.box.min.y + H * 0.39; // hem, mid-thigh
    const y1 = f.box.min.y + H * 0.565; // waistband
    // the trunk's half-width at the hips: walk out from the midline over a fine x-histogram to the first empty gap
    const band = f.pts.filter((p) => Math.abs(p.y - (f.box.min.y + H * 0.5)) < H * 0.02);
    const bin = H * 0.006;
    const occ = new Set(band.map((p) => Math.round((p.x - f.c.x) / bin)));
    let half = 0;
    while (occ.has(half + 1) || occ.has(half + 2)) half++;
    let halfL = 0;
    while (occ.has(-(halfL + 1)) || occ.has(-(halfL + 2))) halfL++;
    const xMax = f.c.x + (half + 0.5) * bin, xMin = f.c.x - (halfL + 0.5) * bin;
    const lift = H * 0.005;
    const pos: number[] = [];
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const P = m.geometry.getAttribute("position"), I = m.geometry.getIndex();
      const cnt = I ? I.count : P.count;
      const a = new THREE.Vector3();
      const tri: number[] = [];
      for (let t = 0; t < cnt; t += 3) {
        tri.length = 0;
        let ok = true;
        for (let k = 0; k < 3; k++) {
          a.fromBufferAttribute(P, I ? I.getX(t + k) : t + k).applyMatrix4(m.matrixWorld);
          // a margin past the hem and waist: the clipping planes cut the cloth to a clean straight edge
          if (a.y < y0 - H * 0.02 || a.y > y1 + H * 0.02 || a.x < xMin || a.x > xMax) { ok = false; break; }
          tri.push(a.x, a.y, a.z);
        }
        if (ok) pos.push(...tri);
      }
    });
    if (!pos.length) return null;
    // weld first, then smooth normals: the cloth is lifted along one continuous normal field (no shredding)
    const raw = new THREE.BufferGeometry();
    raw.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const g = mergeVertices(raw, H * 0.0005);
    g.computeVertexNormals();
    const P = g.getAttribute("position"), N = g.getAttribute("normal");
    for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) + N.getX(i) * lift, P.getY(i) + N.getY(i) * lift, P.getZ(i) + N.getZ(i) * lift);
    // a modest front: below the waist the cloth hangs straight across the groin (no shape shows through), easing into the
    // fitted cut toward the thighs and the hips
    // the groin's most forward point: the front panel hangs flat at that depth, so no shape shows through the cloth
    const groin = f.pts.filter((p) => p.y > f.box.min.y + H * 0.42 && p.y < y1 - H * 0.03 && Math.abs(p.x - f.c.x) < H * 0.05);
    const groinFront = groin.length ? Math.max(...groin.map((p) => p.z)) : f.c.z + H * 0.06;
    for (let i = 0; i < P.count; i++) {
      const dx = Math.abs(P.getX(i) - f.c.x) / (H * 0.075);
      const z = P.getZ(i);
      if (dx >= 1 || z <= f.c.z) continue;
      const yy = P.getY(i);
      if (yy > y1 - H * 0.035) continue; // the belly above the groin keeps its shape
      const k = (1 - dx * dx) ** 2; // 1 at the midline, 0 at the sides
      const cap = groinFront + lift * 2;
      if (z < cap) P.setZ(i, z + (cap - z) * k);
    }
    g.computeVertexNormals();
    const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0), new THREE.Plane(new THREE.Vector3(0, -1, 0), y1)];
    return { g, planes };
  }, [obj, f]);
  useEffect(() => () => made?.g.dispose(), [made]);
  if (!made) return null;
  return (
    <mesh geometry={made.g}>
      <meshStandardMaterial color="#3f5b74" roughness={0.9} side={THREE.DoubleSide} clippingPlanes={made.planes} />
    </mesh>
  );
}

/** Eyes: the Z-Anatomy skin has open eye slits (dark holes); a sculpture's eyeballs in the skin tone close them. */
function Eyes({ f, tone }: { f: Frame; tone: string }) {
  const eyes = useMemo(() => {
    const H = f.size.y;
    const top = f.box.max.y;
    const yE = top - H * 0.068;
    const out: V3[] = [];
    for (const s of [-1, 1]) {
      const xE = f.c.x + s * H * 0.018;
      const col = f.pts.filter((p) => Math.abs(p.x - xE) < H * 0.008 && Math.abs(p.y - yE) < H * 0.02);
      if (!col.length) continue;
      const zf = Math.max(...col.map((p) => p.z));
      out.push(v(xE, yE, zf - H * 0.011));
    }
    return out;
  }, [f]);
  const r = f.size.y * 0.0072;
  return (
    <>
      {eyes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[r, 24, 16]} />
          <meshStandardMaterial color={tone} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

/** A small graduation cap on the horse (a nod to the students who make it through Lab 1). */
function GradCap({ f }: { f: Frame }) {
  const at = useMemo(() => {
    const front = f.pts.filter((p) => p.z > f.box.max.z - f.size.z * 0.3);
    if (!front.length) return null;
    const top = front.reduce((a, p) => (p.y > a.y ? p : a));
    return top.clone();
  }, [f]);
  if (!at) return null;
  const u = f.size.y;
  return (
    <group position={at} rotation={[0, 0, -0.12]}>
      <mesh position={[0, u * 0.025, 0]}>
        <cylinderGeometry args={[u * 0.045, u * 0.05, u * 0.05, 24]} />
        <meshStandardMaterial color="#22304a" roughness={0.7} />
      </mesh>
      <mesh position={[0, u * 0.055, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[u * 0.15, u * 0.01, u * 0.15]} />
        <meshStandardMaterial color="#22304a" roughness={0.7} />
      </mesh>
      <mesh position={[u * 0.05, u * 0.02, u * 0.05]}>
        <cylinderGeometry args={[u * 0.004, u * 0.004, u * 0.07, 8]} />
        <meshStandardMaterial color="#e0a23a" roughness={0.6} />
      </mesh>
      <mesh position={[u * 0.05, -u * 0.018, u * 0.05]}>
        <sphereGeometry args={[u * 0.011, 12, 10]} />
        <meshStandardMaterial color="#e0a23a" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** Four red sneakers on the hooves: the hoof points (lowest 4 % of the model) split into front/back and left/right. */
function Sneakers({ f }: { f: Frame }) {
  const feet = useMemo(() => {
    const low = f.pts.filter((p) => p.y < f.box.min.y + f.size.y * 0.04);
    const groups: V3[][] = [[], [], [], []];
    for (const p of low) groups[(p.z > f.c.z ? 0 : 2) + (p.x > f.c.x ? 0 : 1)].push(p);
    return groups.filter((g) => g.length).map((g) => {
      const b = new THREE.Box3().setFromPoints(g);
      return { c: b.getCenter(new THREE.Vector3()), s: b.getSize(new THREE.Vector3()) };
    });
  }, [f]);
  const u = f.size.y;
  return (
    <>
      {feet.map(({ c, s }, i) => {
        const w = Math.max(s.x, u * 0.04) * 1.7;
        const l = Math.max(s.z, u * 0.05) * 2.1;
        return (
          <group key={i} position={[c.x, f.box.min.y, c.z + l * 0.12]}>
            <mesh position={[0, u * 0.012, 0]}>
              <boxGeometry args={[w * 1.05, u * 0.022, l]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.6} />
            </mesh>
            <mesh position={[0, u * 0.04, -l * 0.08]}>
              <boxGeometry args={[w, u * 0.04, l * 0.84]} />
              <meshStandardMaterial color="#d8312b" roughness={0.55} />
            </mesh>
            <mesh position={[0, u * 0.062, l * 0.12]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[u * 0.004, u * 0.004, w * 0.8, 8]} />
              <meshStandardMaterial color="#ffffff" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function PlaneSheet({ at, normal, w, h }: { at: V3; normal: V3; w: number; h: number }) {
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(v(0, 0, 1), normal.clone().normalize()), [normal]);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), [w, h]);
  return (
    <group position={at} quaternion={quat}>
      <mesh renderOrder={9}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={INK} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={10}>
        <lineBasicMaterial color={INK} />
      </lineSegments>
    </group>
  );
}

/** Frames the subject from the card's view, then sways gently until the student takes the camera. */
function Rig({ frame }: { frame: { f: Frame; d: Drawing } | null }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: V3; update: () => void; addEventListener: (t: string, fn: () => void) => void; removeEventListener: (t: string, fn: () => void) => void } | null;
  const held = useRef(false);
  const base = useMemo(() => {
    if (!frame) return null;
    const { f, d } = frame;
    // frame the subject AND what is drawn on it (arrow tips, the label) so nothing is cut off at the edge
    const all = f.box.clone();
    for (const a of d.arrows) all.expandByPoint(a.to);
    all.expandByPoint(d.labelAt);
    const sphere = all.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.02;
    return { target: sphere.center.clone(), dir: d.view.clone().normalize(), dist };
  }, [frame, camera.fov]);
  useEffect(() => {
    if (!controls) return;
    const grab = () => {
      held.current = true;
    };
    controls.addEventListener("start", grab);
    return () => controls.removeEventListener("start", grab);
  }, [controls]);
  useEffect(() => {
    held.current = false; // a new card frames afresh
  }, [base]);
  useFrame(({ clock }) => {
    if (!base || !controls || held.current) return;
    const a = Math.sin(clock.elapsedTime * 0.35) * 0.32; // a slow ±18° sway around the vertical
    const dir = base.dir.clone().applyAxisAngle(v(0, 1, 0), a);
    camera.position.copy(base.target).addScaledVector(dir, base.dist);
    controls.target.copy(base.target);
    camera.near = base.dist / 100;
    camera.far = base.dist * 10;
    camera.updateProjectionMatrix();
    controls.update();
  });
  return null;
}

export default function DirectionScene(p: DirectionSceneProps) {
  const [frame, setFrame] = useState<{ f: Frame; d: Drawing } | null>(null);
  const onFrame = useMemo(() => (f: Frame, d: Drawing) => setFrame({ f, d }), []);
  return (
    <div className={`dir-scene${p.compact ? " compact" : ""}`} aria-label={p.reveal && p.label ? `3D model: ${p.label}` : "3D model with a highlighted direction"}>
      <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [1, 0.3, 0.3] }} gl={{ antialias: true, localClippingEnabled: true }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <directionalLight position={[-2, 1, -1.5]} intensity={0.35} />
        <Subject subject={p.subject} show={p.show} reveal={p.reveal} label={p.label} onFrame={onFrame} />
        <OrbitControls makeDefault enablePan={false} zoomToCursor enableDamping dampingFactor={0.12} />
        <Rig frame={frame} />
      </Canvas>
    </div>
  );
}
