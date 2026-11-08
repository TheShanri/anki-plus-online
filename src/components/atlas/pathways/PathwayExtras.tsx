"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Side } from "@/lib/atlas/pathways";
import { receptorGeometry } from "./receptors";
import { PartModel, usePart } from "./PartModels";
import { PATCH_H, PATCH_W, RECEPTORS, muscleSpot, patchLocal, type ReceptorId } from "./receptorInfo";

/* Where the signal comes from / goes to: stylised, low-poly body parts built from primitives (no assets).
 *  - hand / foot, with a magnified skin patch (the cutaneous endings the course names) and a muscle with its
 *    spindle and Golgi tendon organ,
 *  - the face with the three trigeminal divisions,
 *  - a limb muscle as the target of the motor neurons,
 *  - two eyes with each retina split into nasal / temporal halves and upper / lower quadrants. */

export type LimbPart = "hand" | "foot" | "face" | "muscle";
export interface LimbSpec {
  key: string;
  part: LimbPart;
  /** Side of the body this part belongs to. */
  body: Side;
  /** Cutaneous endings drawn in the magnified skin patch. */
  skin: ReceptorId[];
  /** Muscle endings (spindle, Golgi tendon organ) drawn in the muscle inset. */
  muscle: ReceptorId[];
  /** 0..1: how strongly the part is drawn (dimmed when the other side is in focus). */
  alpha: number;
  /** Motor target: draw the nerve terminals on the muscle. */
  motor?: boolean;
}
export interface EyeSpec {
  /** Which colour each retinal quadrant takes: the visual-field quadrant it receives. [L field up, L field low, R field up, R field low] */
  fieldColors: { L: [string, string]; R: [string, string] };
  /** 0..1 per field. */
  alpha: { L: number; R: number };
}

const SKIN = "#e8b9a0";
const SKIN_DARK = "#c9917a";

/* Material tweaks live outside the components so the immutability lint does not treat GPU objects as state. */
function setOp(m: THREE.Material, v: number) {
  m.opacity = v;
}

function rounded(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d, 1, 1, 1);
}
const cap = (r: number, len: number, x: number, y: number, z: number, rot: number) => {
  const g = new THREE.CapsuleGeometry(r, len, 3, 7);
  g.rotateZ(rot);
  g.translate(x, y, z);
  return g;
};
const strip = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
  return n;
};

/** Left hand, palm toward the viewer, fingers down, thumb lateral. Real size (~19 cm). */
function handGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [rounded(0.078, 0.09, 0.02)];
  const lens = [0.052, 0.062, 0.058, 0.044];
  [-0.027, -0.009, 0.009, 0.027].forEach((x, i) => parts.push(cap(0.0095, lens[i], x, -0.045 - lens[i] / 2 - 0.006, 0, 0)));
  parts.push(cap(0.0105, 0.04, 0.056, -0.028, 0, -0.9)); // thumb
  const g = mergeGeometries(parts.map(strip))!;
  g.computeVertexNormals();
  return g;
}
/** Left foot, sole toward the viewer, toes down, big toe medial (toward the midline). ~25 cm. */
function footGeometry(): THREE.BufferGeometry {
  const sole = new THREE.SphereGeometry(0.5, 12, 8);
  sole.scale(0.09, 0.17, 0.03);
  sole.translate(0, 0.02, 0);
  const heel = new THREE.SphereGeometry(0.5, 10, 7);
  heel.scale(0.075, 0.075, 0.03);
  heel.translate(0.004, 0.095, 0);
  const parts: THREE.BufferGeometry[] = [sole, heel];
  const toes: [number, number, number][] = [[-0.03, -0.098, 0.017], [-0.012, -0.108, 0.012], [0.006, -0.106, 0.011], [0.022, -0.1, 0.01], [0.036, -0.088, 0.009]];
  toes.forEach(([x, y, r]) => {
    const s = new THREE.SphereGeometry(r, 8, 6);
    s.translate(x, y, 0);
    parts.push(s);
  });
  const g = mergeGeometries(parts.map(strip))!;
  g.computeVertexNormals();
  return g;
}
function muscleGeometry(len: number, r: number): THREE.BufferGeometry {
  // fusiform belly with a ripple of fibre bundles, tapering to tendons
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    prof.push(new THREE.Vector2(Math.max(0.0015, r * Math.pow(Math.sin(t * Math.PI), 0.7) * (1 + 0.06 * Math.sin(t * 60))), (t - 0.5) * len));
  }
  const g = new THREE.LatheGeometry(prof, 10);
  g.rotateZ(Math.PI / 2);
  const n = strip(g);
  n.computeVertexNormals();
  return n;
}

/** Retina: the back hemisphere of the eyeball split into four quadrants (gaps along the nasal/temporal and upper/lower
 *  dividing lines). Local axes = world axes: -z is posterior, +x the patient's left. A patch at local (sx, sy) sees the
 *  visual field at (-sx, -sy): the lens inverts the image. */
function retinaGeometry(r: number, colorOf: (sx: number, sy: number) => THREE.Color): THREE.BufferGeometry {
  const base = new THREE.SphereGeometry(r, 36, 18).toNonIndexed();
  const pos = base.getAttribute("position");
  const keep: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(i + k);
      cy += pos.getY(i + k);
      cz += pos.getZ(i + k);
    }
    cx /= 3;
    cy /= 3;
    cz /= 3;
    if (cz > -0.18 * r) continue; // posterior cap only
    if (Math.abs(cx) < 0.045 * r || Math.abs(cy) < 0.045 * r) continue; // dividing lines stay open
    const c = colorOf(Math.sign(cx), Math.sign(cy));
    for (let k = 0; k < 3; k++) {
      keep.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function useDispose(...g: (THREE.BufferGeometry | THREE.Material)[]) {
  useEffect(() => () => g.forEach((x) => x.dispose()), [g]);
}

export const EYE_R = 0.0122;

function tintRetina(geo: THREE.BufferGeometry, side: Side, spec: EyeSpec, dimColor: string) {
  const pos = geo.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const dim = new THREE.Color(dimColor);
  const c = new THREE.Color();
  const k = EYE_R;
  for (let i = 0; i < pos.count; i++) {
    const x = side === "R" ? -pos.getX(i) : pos.getX(i);
    const y = pos.getY(i);
    const f: Side = x < 0 ? "L" : "R"; // the patient's right half of the retina sees the LEFT field
    const [up, low] = spec.fieldColors[f];
    c.set(y > 0 ? low : up).lerp(dim, 1 - spec.alpha[f]);
    // thin dark dividing lines along the nasal / temporal and upper / lower axes
    const edge = Math.min(Math.abs(x), Math.abs(y)) / (0.07 * k);
    if (edge < 1) c.lerp(new THREE.Color("#0b0d12"), 1 - edge);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** The Z-Anatomy eyeball (sclera, cornea, iris, lens, retina) with the retina tinted by the field quadrant it sees. */
function AnatomicalEye({ at, side, spec, dimColor, part }: { at: THREE.Vector3; side: Side; spec: EyeSpec; dimColor: string; part: THREE.Group }) {
  const invalidate = useThree((s) => s.invalidate);
  const built = useMemo(() => {
    const root = new THREE.Group();
    const mats: THREE.Material[] = [];
    const geos: THREE.BufferGeometry[] = [];
    part.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const nm = `${m.name}|${m.parent?.name ?? ""}`.toLowerCase();
      const g = m.geometry.clone();
      if (side === "R") g.scale(-1, 1, 1);
      geos.push(g);
      let mat: THREE.Material;
      if (nm.includes("retina")) {
        tintRetina(g, side, spec, dimColor);
        mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
      } else if (nm.includes("iris")) mat = new THREE.MeshStandardMaterial({ color: "#4a7aa8", roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
      else if (nm.includes("sclera")) mat = new THREE.MeshStandardMaterial({ color: "#efe9df", roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.2, depthWrite: false });
      else mat = new THREE.MeshStandardMaterial({ color: "#dfe9f2", roughness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.16, depthWrite: false });
      mats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = nm.includes("retina") ? 12 : 11;
      root.add(mesh);
    });
    return { root, mats, geos };
  }, [part, side, spec, dimColor]);
  useEffect(() => {
    invalidate();
    return () => {
      built.mats.forEach((m) => m.dispose());
      built.geos.forEach((g) => g.dispose());
    };
  }, [built, invalidate]);
  return (
    <group position={at}>
      <primitive object={built.root} />
    </group>
  );
}

export function EyeBall({ at, side, spec, dimColor }: { at: THREE.Vector3; side: Side; spec: EyeSpec; dimColor: string }) {
  const part = usePart("eye");
  if (part) return <AnatomicalEye at={at} side={side} spec={spec} dimColor={dimColor} part={part} />;
  return <ProceduralEye at={at} spec={spec} dimColor={dimColor} />;
}

function ProceduralEye({ at, spec, dimColor }: { at: THREE.Vector3; spec: EyeSpec; dimColor: string }) {
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => {
    const dim = new THREE.Color(dimColor);
    const colorOf = (sx: number, sy: number) => {
      const f: Side = sx < 0 ? "L" : "R"; // a patch on the patient's right half of the retina sees the LEFT field
      const [up, low] = spec.fieldColors[f];
      const c = new THREE.Color(sy > 0 ? low : up); // superior retina sees the inferior field
      return c.lerp(dim, 1 - spec.alpha[f]);
    };
    return retinaGeometry(EYE_R * 0.99, colorOf);
  }, [spec, dimColor]);
  const sclera = useMemo(() => new THREE.MeshStandardMaterial({ color: "#eee9e0", transparent: true, opacity: 0.13, roughness: 0.6, depthWrite: false }), []);
  const retinaMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }), []);
  const iris = useMemo(() => new THREE.MeshBasicMaterial({ color: "#4a7aa8", toneMapped: false, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), []);
  const macula = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff3b0", toneMapped: false, side: THREE.DoubleSide }), []);
  useDispose(geo, sclera, retinaMat, iris, macula);
  useEffect(() => invalidate(), [geo, invalidate]);
  return (
    <group position={at} renderOrder={12}>
      <mesh material={sclera} renderOrder={11}>
        <sphereGeometry args={[EYE_R, 28, 18]} />
      </mesh>
      {/* the retina: a bowl, so it reads from the front like a fundus view and from above like a cut eye */}
      <mesh geometry={geo} material={retinaMat} renderOrder={12} />
      <mesh position={[0, 0, EYE_R * 0.97]} material={iris} renderOrder={13}>
        <ringGeometry args={[EYE_R * 0.14, EYE_R * 0.34, 20]} />
      </mesh>
      {/* macula at the posterior pole: the centre of the retinal image */}
      <mesh position={[0, 0, -EYE_R * 0.99]} material={macula} renderOrder={13}>
        <circleGeometry args={[EYE_R * 0.1, 12]} />
      </mesh>
    </group>
  );
}

/* ---------- skin patch: a magnified slab of skin with the endings the course names ---------- */
export function patchPositions(center: THREE.Vector3, sgn: number, ids: ReceptorId[]) {
  return ids.map((id, i) => {
    const l = patchLocal(i, ids.length, id);
    return { id, p: new THREE.Vector3(center.x + sgn * l.dx, center.y + l.dy, center.z + 0.014) };
  });
}
const RSCALE = 0.034;

function ReceptorInstances({ id, items, alpha }: { id: ReceptorId; items: THREE.Vector3[]; alpha: number }) {
  const geo = receptorGeometry(id);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: RECEPTORS[id].color, emissive: RECEPTORS[id].color, emissiveIntensity: 0.3, roughness: 0.5, flatShading: true, transparent: true }), [id]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    setOp(mat, alpha);
  }, [mat, alpha]);
  return (
    <>
      {items.map((p, i) => (
        <mesh key={i} geometry={geo} material={mat} position={p} scale={RSCALE} renderOrder={14} />
      ))}
    </>
  );
}

export function SkinPatch({ center, sgn, ids, alpha, hot }: { center: THREE.Vector3; sgn: number; ids: ReceptorId[]; alpha: number; hot?: ReceptorId | null }) {
  const layers = useMemo(
    () => [
      { h: PATCH_H * 0.14, c: "#f1cdb8", y: 0.5 - 0.07 }, // epidermis
      { h: PATCH_H * 0.52, c: "#e6a78f", y: 0.5 - 0.14 - 0.26 }, // dermis
      { h: PATCH_H * 0.34, c: "#e9d2a0", y: 0.5 - 0.66 - 0.17 }, // subcutaneous fat
    ],
    [],
  );
  const mats = useMemo(() => layers.map((l) => new THREE.MeshStandardMaterial({ color: l.c, roughness: 0.8, transparent: true })), [layers]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    mats.forEach((m) => setOp(m, 0.9 * alpha));
  }, [mats, alpha]);
  const rec = patchPositions(center, sgn, ids);
  return (
    <group renderOrder={10}>
      {layers.map((l, i) => (
        <mesh key={i} material={mats[i]} position={[center.x, center.y + l.y * PATCH_H, center.z]}>
          <boxGeometry args={[PATCH_W, l.h, 0.022]} />
        </mesh>
      ))}
      {rec.map((r) => (
        <ReceptorInstances key={r.id} id={r.id} items={[r.p]} alpha={hot && hot !== r.id ? alpha * 0.55 : alpha} />
      ))}
    </group>
  );
}

export function MuscleInset({ center, sgn, ids, alpha, motor }: { center: THREE.Vector3; sgn: number; ids: ReceptorId[]; alpha: number; motor?: boolean }) {
  const mpart = usePart("muscle");
  const geo = useMemo(() => muscleGeometry(0.15, 0.026), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b8434a", roughness: 0.7, flatShading: true, transparent: true }), []);
  const tendon = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8e2d2", roughness: 0.6, transparent: true }), []);
  useDispose(geo, mat, tendon);
  useEffect(() => {
    setOp(mat, alpha);
    setOp(tendon, alpha);
  }, [mat, tendon, alpha]);
  const spots = ids.map((id, i) => {
    const m = muscleSpot(id, i);
    return { id, p: new THREE.Vector3(center.x + sgn * m.dx, center.y + m.dy, center.z + 0.02) };
  });
  return (
    <group renderOrder={10}>
      {mpart ? (
        <group position={center}>
          <PartModel part={mpart} flip={sgn < 0} alpha={alpha} fitSize={0.17} rotation={[0, 0, Math.PI / 2]} />
        </group>
      ) : (
        <>
          <mesh geometry={geo} material={mat} position={center} />
          <mesh material={tendon} position={[center.x + sgn * 0.09, center.y, center.z]}>
            <boxGeometry args={[0.04, 0.012, 0.012]} />
          </mesh>
        </>
      )}
      {motor && <MotorTerminals center={center} alpha={alpha} />}
      {spots.map((s) => (
        <ReceptorInstances key={s.id} id={s.id} items={[s.p]} alpha={alpha} />
      ))}
    </group>
  );
}

/** Nerve terminals on the muscle fibres (the lower motor neuron's last stretch). Unlabelled: the slides stop at "skeletal muscle". */
function MotorTerminals({ center, alpha }: { center: THREE.Vector3; alpha: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffe58a", transparent: true, toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    setOp(mat, alpha);
  }, [mat, alpha]);
  const pts = useMemo(() => [-0.045, -0.02, 0.005, 0.03, 0.05].map((x) => new THREE.Vector3(center.x + x, center.y + 0.022 - Math.abs(x) * 0.12, center.z + 0.02)), [center]);
  return (
    <>
      {pts.map((p, i) => (
        <mesh key={i} position={p} material={mat} renderOrder={15}>
          <sphereGeometry args={[0.0042, 8, 6]} />
        </mesh>
      ))}
    </>
  );
}

function TrigeminalFace({ alpha, colors, body }: { alpha: number; colors: string[]; body: Side }) {
  const head = useMemo(() => new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8, transparent: true, flatShading: true, side: THREE.DoubleSide }), []);
  const zones = useMemo(() => colors.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthTest: false })), [colors]);
  useEffect(
    () => () => {
      head.dispose();
      zones.forEach((z) => z.dispose());
    },
    [head, zones],
  );
  useEffect(() => {
    setOp(head, 0.9 * alpha);
    zones.forEach((z) => setOp(z, 0.8 * alpha));
  }, [head, zones, alpha]);
  const R = 0.075;
  // sphere phi: the front is pi/2, the patient's left half runs pi/2 -> 3pi/2, the right half -pi/2 -> pi/2
  const half = body === "L" ? Math.PI / 2 : -Math.PI / 2;
  const front = body === "L" ? Math.PI / 2 : Math.PI / 2 - 0.9;
  const bands: [number, number][] = [
    [0.2, 0.4],
    [0.46, 0.6],
    [0.64, 0.78],
  ];
  return (
    <group scale={[0.86, 1.12, 0.96]}>
      <mesh material={head}>
        <sphereGeometry args={[R, 16, 12, half, Math.PI]} />
      </mesh>
      {bands.map(([a, b], i) => (
        <mesh key={i} material={zones[i]} scale={1.02} renderOrder={13}>
          <sphereGeometry args={[R, 12, 5, front, 0.9, Math.PI * a, Math.PI * (b - a)]} />
        </mesh>
      ))}
    </group>
  );
}

export const TRIGEMINAL_ZONES = [
  { id: "v1", name: "V1 ophthalmic", theta: 0.3 },
  { id: "v2", name: "V2 maxillary", theta: 0.53 },
  { id: "v3", name: "V3 mandibular", theta: 0.71 },
];

/** A body part, drawn at `at` (the contact point). The patch / inset sit lateral to the part. */
export function Limb({ spec, at, colors, onPick, onHover, zoneColors }: { spec: LimbSpec; at: THREE.Vector3; colors: { side: string; dim: string }; onPick?: (s: Side) => void; onHover?: (h: boolean) => void; zoneColors: string[] }) {
  const sgn = spec.body === "L" ? 1 : -1;
  const hand = useMemo(() => (spec.part === "hand" ? handGeometry() : null), [spec.part]);
  const foot = useMemo(() => (spec.part === "foot" ? footGeometry() : null), [spec.part]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: SKIN, emissive: SKIN_DARK, emissiveIntensity: 0.18, roughness: 0.8, flatShading: true, transparent: true }), []);
  const rim = useMemo(() => new THREE.MeshBasicMaterial({ color: colors.side, transparent: true, toneMapped: false, depthTest: false, side: THREE.BackSide }), [colors.side]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => rim.dispose(), [rim]);
  useEffect(() => {
    setOp(mat, 0.35 + 0.65 * spec.alpha);
    setOp(rim, 0.9 * spec.alpha);
  }, [mat, rim, spec.alpha]);
  useDispose(...([hand, foot].filter(Boolean) as THREE.BufferGeometry[]));
  const handPart = usePart(spec.part === "hand" ? "hand" : null);
  const footPart = usePart(spec.part === "foot" ? "foot" : null);
  const geo = handPart || footPart ? null : hand ?? foot;
  const pickProps = {
    onClick: onPick ? (e: { stopPropagation: () => void; delta: number }) => { if (e.delta > 6) return; e.stopPropagation(); onPick(spec.body); } : undefined,
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover?.(true); },
    onPointerOut: () => onHover?.(false),
  };
  const patchC = new THREE.Vector3(at.x + sgn * (spec.part === "foot" ? 0.17 : 0.15), at.y + 0.08, at.z + 0.01);
  const muscleC = new THREE.Vector3(at.x + sgn * (spec.part === "foot" ? 0.17 : 0.15), at.y - 0.085, at.z + 0.01);
  return (
    <group renderOrder={10}>
      {geo && (
        <group position={at} scale={[sgn, 1, 1]} {...pickProps}>
          <mesh geometry={geo} material={mat} />
          {/* a thin rim in the side's colour so the part reads as the left or the right one */}
          <mesh geometry={geo} material={rim} scale={1.07} />
        </group>
      )}
      {(handPart || footPart) && (
        <group position={at}>
          <PartModel
            part={(handPart ?? footPart)!}
            flip={spec.body === "R"}
            alpha={spec.alpha}
            rotation={footPart ? [Math.PI / 2, 0, 0] : undefined}
            onPick={onPick ? () => onPick(spec.body) : undefined}
            onHover={onHover}
          />
        </group>
      )}
      {spec.part === "face" && (
        <group position={at} {...pickProps}>
          <TrigeminalFace alpha={spec.alpha} colors={zoneColors} body={spec.body} />
        </group>
      )}
      {spec.part === "muscle" && <MuscleInset center={at} sgn={sgn} ids={spec.muscle} alpha={spec.alpha} motor={spec.motor} />}
      {spec.skin.length > 0 && (
        <>
          <SkinPatch center={patchC} sgn={sgn} ids={spec.skin} alpha={spec.alpha} />
          <MagnifierLine a={at} b={patchC} alpha={spec.alpha} color={colors.dim} />
        </>
      )}
      {spec.part !== "muscle" && spec.muscle.length > 0 && <MuscleInset center={muscleC} sgn={sgn} ids={spec.muscle} alpha={spec.alpha} />}
    </group>
  );
}

function MagnifierLine({ a, b, alpha, color }: { a: THREE.Vector3; b: THREE.Vector3; alpha: number; color: string }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints([a, b]), [a, b]);
  useDispose(geo);
  return (
    <lineSegments geometry={geo} renderOrder={9}>
      <lineBasicMaterial color={color} transparent opacity={0.45 * alpha} depthTest={false} />
    </lineSegments>
  );
}
