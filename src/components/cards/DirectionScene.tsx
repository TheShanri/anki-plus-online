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

const FILE: Record<SceneSubject, string> = { animal: "directions/animal.glb?v=2", human: "directions/human.glb?v=2", brain: "gross.glb" };
const INK = "#e0a23a";

type V3 = THREE.Vector3;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Frame of a loaded subject: its box, and (brain) the brainstem's box. */
type Frame = { box: THREE.Box3; size: V3; c: V3; stem: THREE.Box3 | null };

function frameOf(g: THREE.Object3D, subject: SceneSubject): Frame {
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const stem = new THREE.Box3();
  g.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    box.union(b);
    const name = `${o.name} ${o.parent?.name ?? ""}`;
    if (subject === "brain" && /(pons|medulla-oblongata|midbrain)/.test(name)) stem.union(b);
  });
  return { box, size: box.getSize(new THREE.Vector3()), c: box.getCenter(new THREE.Vector3()), stem: stem.isEmpty() ? null : stem };
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
    const back = v(c.x, box.max.y - S.y * 0.18, c.z);
    const spineFront = v(c.x, box.max.y - S.y * 0.2, box.max.z - S.z * 0.18);
    const spineBack = v(c.x, box.max.y - S.y * 0.22, box.min.z + S.z * 0.12);
    if (kind === "axis") {
      out.curve = new THREE.CatmullRomCurve3([v(c.x, box.max.y - S.y * 0.08, box.max.z - S.z * 0.02), spineFront, back, spineBack]).getPoints(60);
      out.labelAt = back.clone().add(v(0, S.y * 0.18, 0));
      return out;
    }
    const d: Record<string, V3> = { rostral: v(0, 0, 1), anterior: v(0, 0, 1), cranial: v(0, 0, 1), caudal: v(0, 0, -1), posterior: v(0, 0, -1), dorsal: v(0, 1, 0), superior: v(0, 1, 0), ventral: v(0, -1, 0), inferior: v(0, -1, 0) };
    const from = /rostral|anterior|cranial/.test(term) ? spineFront : /caudal|posterior/.test(term) ? spineBack : /ventral|inferior/.test(term) ? v(c.x, c.y - S.y * 0.05, c.z) : back;
    arrow(from, d[term] ?? v(0, 0, 1), 0.3 * L);
    return out;
  }

  // human body (standing, anatomical position)
  const chest = v(c.x, box.min.y + S.y * 0.7, c.z);
  const armX = c.x + S.x * 0.36; // the subject's left arm
  out.view = v(0.35, 0.12, 1).normalize();
  if (kind === "median") {
    out.plane = { at: c.clone(), normal: v(1, 0, 0), w: S.z * 1.6, h: S.y * 1.05 };
    out.labelAt = c.clone().add(v(0, S.y * 0.56, 0));
    return out;
  }
  if (kind === "pair") {
    const handL = v(c.x + S.x * 0.42, box.min.y + S.y * 0.47, c.z);
    const footL = v(c.x + S.x * 0.12, box.min.y + S.y * 0.04, c.z + S.z * 0.1);
    const footR = v(c.x - S.x * 0.12, box.min.y + S.y * 0.04, c.z + S.z * 0.1);
    out.dots = [handL, term === "contralateral" ? footR : footL];
    out.labelAt = handL.clone().add(v(S.x * 0.15, 0, 0));
    return out;
  }
  if (/medial|lateral/.test(term)) {
    const elbow = v(armX, box.min.y + S.y * 0.6, c.z);
    arrow(elbow, term === "medial" ? v(-1, 0, 0) : v(1, 0, 0), 0.26 * L);
    return out;
  }
  if (/proximal|distal/.test(term)) {
    const arm = v(armX, box.min.y + S.y * 0.64, c.z);
    arrow(arm, term === "proximal" ? v(0, 1, 0) : v(0, -1, 0), 0.2 * L);
    return out;
  }
  if (/superficial|deep/.test(term)) {
    const thighSkin = v(c.x + S.x * 0.12, box.min.y + S.y * 0.36, c.z + S.z * 0.42);
    const inside = v(c.x + S.x * 0.12, box.min.y + S.y * 0.36, c.z);
    out.view = v(1, 0.15, 0.6).normalize();
    if (term === "deep") arrow(thighSkin.clone().add(v(0, 0, S.z * 0.45)), v(0, 0, -1), S.z * 0.85);
    else arrow(inside, v(0, 0, 1), S.z * 0.95);
    return out;
  }
  const d: Record<string, V3> = { superior: v(0, 1, 0), inferior: v(0, -1, 0), anterior: v(0, 0, 1), ventral: v(0, 0, 1), posterior: v(0, 0, -1), dorsal: v(0, 0, -1), rostral: v(0, 1, 0), caudal: v(0, -1, 0) };
  if (/anterior|ventral|posterior|dorsal/.test(term)) out.view = v(1, 0.15, 0.15).normalize();
  arrow(chest, d[term] ?? v(0, 1, 0), (/anterior|ventral|posterior|dorsal/.test(term) ? 0.32 : 0.3) * L);
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
        const tone = subject === "human" ? "#d9c3b0" : subject === "animal" ? "#c9b8a2" : "#d9b4a8";
        // the brain keeps its baked sulcal shading (vertex colours) under a warm brain tone, like the atlas
        m.material = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.8, flatShading: subject === "animal", vertexColors: subject === "brain" && !!m.geometry.getAttribute("color") });
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
  if (!obj || !f || !d) return null;
  const L = Math.max(f.size.x, f.size.y, f.size.z);
  const w = L * 0.017;
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
      {reveal && label && (
        <Html position={d.labelAt} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="dir-tag">{label}</span>
        </Html>
      )}
    </group>
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
      <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [1, 0.3, 0.3] }} gl={{ antialias: true }}>
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
