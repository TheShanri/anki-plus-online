"use client";
// The 3D brainstem with its external landmarks (public/atlas/brainstem3d.glb, Z-Anatomy CC BY-SA 4.0): every course
// landmark and cranial nerve is a named part (hover names it, click selects it), and every plate level is a thin plane
// at its calibrated level (hover previews, click opens that level). Lazy-loaded; the frame loop runs on demand.
// Wheel zoom goes toward the cursor (OrbitControls zoomToCursor); the camera only moves when the reader asks.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadAtlasModel } from "@/components/atlas/ui/modelCache";
import { NAV_MOUSE, NAV_TOUCH, NavExtras } from "@/components/atlas/ui/navigation";
import { readCssColor } from "@/lib/atlas/theme";
import { brainstemPulse, pulseDisabled } from "../plate/pulse";
import "./bs3d.css";
import { BS3D, LEVEL_NAME, PART_BY_ID, PLANE_LEVELS, partsFor, type Level3D, type Part3D } from "./model";

export type View3D = "anterior" | "posterior" | "left" | "right" | "oblique";
export interface Brainstem3DProps {
  /** the plate level whose plane is highlighted */
  level?: string | null;
  /** the selected course structure (lit and breathing) */
  selected?: string | null;
  /** a structure lit from outside (e.g. hovered on the plate) */
  hover?: string | null;
  onSelect?: (slug: string) => void;
  onLevel?: (level: string) => void;
  /** "all": every plane faintly + the current one; "current": only the current plane */
  planes?: "all" | "current" | "none";
  compact?: boolean;
  /** the camera's starting side */
  view?: View3D;
  /** the level list beside the model (default: on unless compact) */
  levelList?: boolean;
  className?: string;
  height?: number | string;
  ariaLabel?: string;
}

const CENTRE = new THREE.Vector3(0, 1.5785, -0.012);
const DIRS: Record<View3D, THREE.Vector3> = {
  anterior: new THREE.Vector3(0, 0.05, 1),
  posterior: new THREE.Vector3(0, 0.12, -1),
  left: new THREE.Vector3(1, 0.05, 0.08),
  right: new THREE.Vector3(-1, 0.05, 0.08),
  oblique: new THREE.Vector3(0.8, 0.18, -0.62),
};
const VIEW_LABEL: Record<View3D, string> = { anterior: "Anterior", posterior: "Posterior", left: "Left", right: "Right", oblique: "Oblique" };

// quiet tissue tones (fixed, like a printed atlas; the accent comes from the theme)
const GREY = new Set(["superior-colliculus", "inferior-colliculus", "olives", "gracile-tubercle", "cuneate-tubercle", "facial-colliculus", "area-postrema", "pulvinar", "medial-geniculate-nucleus", "lateral-geniculate-nucleus", "mammillary-bodies", "pineal-gland"]);
const SPACE = new Set(["fourth-ventricle", "interpeduncular-fossa", "obex"]);
function tone(p: Part3D): string {
  if (p.kind === "nerve") return "#f1e4bd";
  if (p.kind === "context") return p.slug === "thalamus" ? "#e9e3dc" : "#ddd6ce";
  if (p.kind === "body") return "#ddcfbc";
  if (p.slug === "fourth-ventricle") return "#b8a695";
  if (p.slug === "facial-colliculus" || p.slug === "area-postrema") return "#e0bf9f";
  if (GREY.has(p.slug)) return "#cfa98d";
  if (SPACE.has(p.slug)) return "#b7a597";
  if (p.slug.endsWith("cerebellar-peduncle")) return "#e4d8c6";
  if (p.slug.startsWith("optic-")) return "#e6dccb";
  return "#efe8dc";
}
/** Context drawn see-through so the brainstem stays the subject (the pulvinar patch stays solid). */
const GHOST = new Set(["thalamus"]);
const GHOST_OPACITY = 0.32;

function cameraDistance(aspect: number, fov: number) {
  const t = Math.tan(((fov / 2) * Math.PI) / 180);
  return Math.max(0.06 / t, 0.032 / (t * Math.max(0.3, aspect))) * 1.04;
}

// GLTFLoader sanitises node names (drops ".", ":", "/", "[", "]"): look parts up by the sanitised id
const BY_NODE = new Map([...PART_BY_ID.values()].map((p) => [p.id.replace(/[[\].:/]/g, ""), p]));

type Tip = { x: number; y: number; title: string; sub?: string } | null;

function useThemeAccent(): THREE.Color {
  const [c, setC] = useState(() => new THREE.Color("#ff2a6d"));
  useEffect(() => {
    const read = () => setC(readCssColor("--accent", "#ff2a6d"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);
  return c;
}

/** Outline of a patch: its boundary edges (edges used by one triangle once vertices are welded), midline seams skipped. */
function boundaryLines(mesh: THREE.Mesh, mat: THREE.LineBasicMaterial): THREE.LineSegments | null {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position").clone());
  if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone());
  const w = mergeVertices(g, 1e-6);
  const idx = w.index;
  if (!idx) return null;
  const pos = w.getAttribute("position");
  const count = new Map<string, number>();
  const a = idx.array;
  for (let i = 0; i < a.length; i += 3)
    for (const [u, v] of [
      [a[i], a[i + 1]],
      [a[i + 1], a[i + 2]],
      [a[i + 2], a[i]],
    ]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  const m = mesh.matrixWorld;
  const p = new THREE.Vector3();
  const out: number[] = [];
  for (const [k, n] of count) {
    if (n !== 1) continue;
    const [u, v] = k.split("_").map(Number);
    const xu = p.fromBufferAttribute(pos, u).applyMatrix4(m).x;
    const xv = p.fromBufferAttribute(pos, v).applyMatrix4(m).x;
    if (Math.abs(xu) < 2e-4 && Math.abs(xv) < 2e-4) continue; // the seam between the two halves
    for (const j of [u, v]) {
      p.fromBufferAttribute(pos, j);
      out.push(p.x, p.y, p.z);
    }
  }
  g.dispose();
  w.dispose();
  if (!out.length) return null;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  const ls = new THREE.LineSegments(lg, mat);
  ls.raycast = () => undefined;
  return ls;
}

/** A copy of a geometry pushed out along its normals by `d` (local units), as plain floats. */
function inflated(src: THREE.BufferGeometry, d: number): THREE.BufferGeometry {
  const pos = src.getAttribute("position");
  const nrm = src.getAttribute("normal");
  const out = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nrm) n.fromBufferAttribute(nrm, i).normalize();
    out[i * 3] = p.x + n.x * d;
    out[i * 3 + 1] = p.y + n.y * d;
    out[i * 3 + 2] = p.z + n.z * d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  if (src.index) g.setIndex(src.index.clone());
  g.computeBoundingSphere();
  return g;
}

interface Loaded {
  root: THREE.Group;
  meshes: Map<string, THREE.Mesh>;
  mats: Map<string, THREE.MeshStandardMaterial>;
}

function useBrainstemModel(): { model: Loaded | null; error: boolean } {
  const [model, setModel] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAtlasModel(`${BS3D.file}?v=${BS3D.bytes}`)
      .then((root) => {
        if (!alive) return;
        root.updateMatrixWorld(true);
        const meshes = new Map<string, THREE.Mesh>();
        const mats = new Map<string, THREE.MeshStandardMaterial>();
        const lineMat = new THREE.LineBasicMaterial({ color: "#5b4636", transparent: true, opacity: 0.5, depthWrite: false });
        const hullMat = new THREE.MeshBasicMaterial({ color: "#8a7350", side: THREE.BackSide });
        const pickMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
        const found: [THREE.Mesh, Part3D][] = [];
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const part = BY_NODE.get(mesh.name) ?? BY_NODE.get(mesh.parent?.name ?? "");
          if (!part) {
            mesh.visible = false;
            return;
          }
          found.push([mesh, part]);
        });
        for (const [mesh, part] of found) {
          const ghost = GHOST.has(part.slug);
          const mat = new THREE.MeshStandardMaterial({
            color: tone(part),
            vertexColors: !!mesh.geometry.getAttribute("color"),
            roughness: 0.82,
            metalness: 0,
            emissive: new THREE.Color(0, 0, 0),
            side: THREE.DoubleSide,
            transparent: ghost,
            opacity: ghost ? GHOST_OPACITY : 1,
            depthWrite: !ghost,
          });
          if (ghost) mesh.renderOrder = 1;
          if (part.kind === "patch") {
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -1;
            mat.polygonOffsetUnits = -1;
          }
          mesh.material = mat;
          mesh.userData.part = part.id;
          meshes.set(part.id, mesh);
          mats.set(part.id, mat);
          if (part.kind === "patch") {
            const l = boundaryLines(mesh, lineMat);
            if (l) mesh.add(l);
          }
          if (part.kind === "nerve") {
            // a fine darker outline (inverted hull) and a fat invisible twin that catches the pointer
            const scale = mesh.getWorldScale(new THREE.Vector3()).x || 1;
            const hull = new THREE.Mesh(inflated(mesh.geometry, 0.00009 / scale), hullMat);
            hull.raycast = () => undefined;
            mesh.add(hull);
            const pick = new THREE.Mesh(inflated(mesh.geometry, 0.0011 / scale), pickMat);
            pick.userData.part = part.id;
            mesh.add(pick);
          }
        }
        setModel({ root, meshes, mats });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { model, error };
}

function LevelPlane({ slug, rec, state, accent, onHover, onPick, pickable, compact }: { slug: string; rec: Level3D; state: "idle" | "hover" | "current"; accent: THREE.Color; onHover: (s: string | null, e?: ThreeEvent<PointerEvent>) => void; onPick: (s: string) => void; pickable: boolean; compact?: boolean }) {
  const mid = slug === "midsagittal";
  const { geo, ring, quat } = useMemo(() => {
    const n = new THREE.Vector3(...rec.n).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const geo = mid ? new THREE.PlaneGeometry(0.07, 0.135) : new THREE.CircleGeometry(rec.radius, 72);
    const pts: THREE.Vector3[] = [];
    if (mid) {
      for (const [x, y] of [
        [-0.035, -0.0675],
        [0.035, -0.0675],
        [0.035, 0.0675],
        [-0.035, 0.0675],
      ])
        pts.push(new THREE.Vector3(x, y, 0));
    } else for (let i = 0; i < 96; i++) pts.push(new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * rec.radius, Math.sin((i / 96) * Math.PI * 2) * rec.radius, 0));
    const ring = new THREE.BufferGeometry().setFromPoints(pts);
    return { geo, ring, quat };
  }, [rec, mid]);
  useEffect(
    () => () => {
      geo.dispose();
      ring.dispose();
    },
    [geo, ring],
  );
  const fill = state === "current" ? (compact ? 0.3 : 0.07) : state === "hover" ? 0.1 : 0;
  const line = state === "current" ? 0.9 : state === "hover" ? 0.6 : compact ? 0.1 : 0.13;
  const pos = mid ? new THREE.Vector3(rec.p[0], 1.575, -0.008) : new THREE.Vector3(...rec.p);
  return (
    <group position={pos} quaternion={quat}>
      <mesh
        geometry={geo}
        renderOrder={4}
        raycast={pickable && (!mid || state !== "idle") ? THREE.Mesh.prototype.raycast : () => undefined}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(slug, e);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onPick(slug);
        }}
      >
        <meshBasicMaterial color={accent} transparent opacity={fill} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineLoop geometry={ring} renderOrder={5} raycast={() => undefined}>
        <lineBasicMaterial color={accent} transparent opacity={line} depthWrite={false} />
      </lineLoop>
    </group>
  );
}

function placeCamera(cam: THREE.PerspectiveCamera, ctl: { target: THREE.Vector3; update: () => void }, view: View3D, aspect: number, compact: boolean) {
  const d = cameraDistance(aspect, cam.fov) * (compact ? 1.12 : 1);
  cam.position.copy(CENTRE).addScaledVector(DIRS[view].clone().normalize(), d);
  ctl.target.copy(CENTRE);
  cam.near = 0.005;
  cam.far = 2;
  cam.updateProjectionMatrix();
}
const BLACK = new THREE.Color(0, 0, 0);
function paintMats(mats: Map<string, THREE.MeshStandardMaterial>, lit: Set<string>, hoverPart: string | null, accent: THREE.Color) {
  for (const [id, mat] of mats) {
    const part = PART_BY_ID.get(id)!;
    const on = lit.has(id);
    const hov = hoverPart === id;
    mat.color.set(tone(part));
    if (on) mat.color.lerp(accent, 0.82);
    else if (hov) mat.color.lerp(accent, 0.5);
    mat.emissive.copy(on || hov ? accent : BLACK);
    mat.emissiveIntensity = on ? 0.35 : hov ? 0.3 : 0;
  }
}
function breatheMats(mats: Map<string, THREE.MeshStandardMaterial>, lit: Set<string>, k: number) {
  for (const id of lit) {
    const m = mats.get(id);
    if (m) m.emissiveIntensity = 0.25 + 0.45 * k;
  }
}

function Scene({
  model,
  lit,
  hoverPart,
  setHoverPart,
  level,
  hoverLevel,
  setHoverLevel,
  planes,
  onSelect,
  onLevel,
  setTip,
  accent,
  viewReq,
  compact,
}: {
  model: Loaded;
  lit: Set<string>;
  hoverPart: string | null;
  setHoverPart: (id: string | null) => void;
  level: string | null;
  hoverLevel: string | null;
  setHoverLevel: (l: string | null) => void;
  planes: "all" | "current" | "none";
  onSelect?: (slug: string) => void;
  onLevel?: (level: string) => void;
  setTip: (t: Tip) => void;
  accent: THREE.Color;
  viewReq: { view: View3D; n: number };
  compact?: boolean;
}) {
  const { camera, invalidate, size, controls, gl } = useThree();
  const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null;

  // the camera goes to a side only when asked (first frame and the view buttons); the reader's own moves always win
  const lastReq = useRef(-1);
  useEffect(() => {
    if (!ctl || viewReq.n === lastReq.current) return;
    lastReq.current = viewReq.n;
    placeCamera(camera as THREE.PerspectiveCamera, ctl, viewReq.view, size.width / Math.max(1, size.height), !!compact);
    ctl.update();
    invalidate();
  }, [viewReq, ctl, camera, size, invalidate, compact]);

  // materials follow hover / selection; the selection breathes on the shared brainstem clock
  useEffect(() => {
    paintMats(model.mats, lit, hoverPart, accent);
    invalidate();
  }, [model, lit, hoverPart, accent, invalidate]);
  const breathe = lit.size > 0 && !pulseDisabled();
  useFrame(() => {
    if (!breathe) return;
    breatheMats(model.mats, lit, brainstemPulse(performance.now()));
    invalidate();
  });

  const tipAt = useCallback(
    (e: ThreeEvent<PointerEvent>, title: string, sub?: string) => {
      const r = gl.domElement.getBoundingClientRect();
      setTip({ x: e.nativeEvent.clientX - r.left, y: e.nativeEvent.clientY - r.top, title, sub });
    },
    [gl, setTip],
  );

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = (e.object.userData.part as string | undefined) ?? (e.object.parent?.userData.part as string | undefined);
    const part = id ? PART_BY_ID.get(id) : undefined;
    if (!part) return;
    if (hoverPart !== part.id) setHoverPart(part.id);
    setHoverLevel(null);
    const side = part.side === "L" ? "left" : part.side === "R" ? "right" : "";
    tipAt(e, part.name, [side, part.approx ? "approximate" : ""].filter(Boolean).join(" · ") || undefined);
  };
  const onOut = () => {
    setHoverPart(null);
    setTip(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    e.stopPropagation();
    const id = e.object.userData.part as string | undefined;
    const part = id ? PART_BY_ID.get(id) : undefined;
    if (part && part.slug !== "brachium-of-the-superior-colliculus" && onSelect) onSelect(part.slug);
  };

  return (
    <>
      <hemisphereLight args={["#fffaf3", "#6d6157", 0.62]} />
      <Headlight />
      <primitive object={model.root} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      {planes !== "none" &&
        PLANE_LEVELS.map((lv) => {
          const st = lv === level ? "current" : lv === hoverLevel ? "hover" : "idle";
          if (st === "idle" && (planes === "current" || lv === "midsagittal")) return null;
          return (
            <LevelPlane
              key={lv}
              slug={lv}
              rec={BS3D.levels[lv]}
              state={st}
              accent={accent}
              pickable={!!onLevel}
              compact={compact}
              onHover={(s, e) => {
                setHoverLevel(s);
                if (s && e) {
                  setHoverPart(null);
                  tipAt(e, LEVEL_NAME(s), lv === level ? "this plate" : "click to open the plate");
                } else setTip(null);
              }}
              onPick={(s) => onLevel?.(s)}
            />
          );
        })}
    </>
  );
}

export default function Brainstem3D({ level = null, selected = null, hover = null, onSelect, onLevel, planes = "all", compact, view = "anterior", levelList, className, height, ariaLabel }: Brainstem3DProps) {
  const { model, error } = useBrainstemModel();
  const accent = useThemeAccent();
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const [hoverLevel, setHoverLevel] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [viewReq, setViewReq] = useState({ view, n: 0 });
  const lit = useMemo(() => new Set([...partsFor(selected), ...partsFor(hover)]), [selected, hover]);
  const list = levelList ?? !compact;

  return (
    <div className={`bs3d${compact ? " bs3d-compact" : ""} ${className ?? ""}`} style={height !== undefined ? { height } : undefined} role="figure" aria-label={ariaLabel ?? "3D brainstem with its external landmarks"}>
      <Canvas
        frameloop="demand"
        flat
        dpr={[1, 1.5]}
        camera={{ fov: 30, near: 0.005, far: 2, position: [0, 1.58, 0.3] }}
        gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
        onPointerMissed={() => setTip(null)}
      >
        {model && (
          <Scene
            model={model}
            lit={lit}
            hoverPart={hoverPart}
            setHoverPart={setHoverPart}
            level={level}
            hoverLevel={hoverLevel}
            setHoverLevel={setHoverLevel}
            planes={planes}
            onSelect={onSelect}
            onLevel={onLevel}
            setTip={setTip}
            accent={accent}
            viewReq={viewReq}
            compact={compact}
          />
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} screenSpacePanning zoomToCursor minDistance={0.03} maxDistance={0.6} mouseButtons={NAV_MOUSE} touches={NAV_TOUCH} />
        {/* the atlas-wide navigation: trackpad pan, double-click / double-tap pivot (ui/navigation.tsx) */}
        <NavExtras />
      </Canvas>
      {!model && !error && <div className="bs3d-msg">Loading the 3D brainstem…</div>}
      {error && <div className="bs3d-msg">The 3D brainstem could not be loaded.</div>}
      {tip && (
        <div className="bs3d-tip" style={{ left: tip.x, top: tip.y }} role="status">
          <span className="bs3d-tip-t">{tip.title}</span>
          {tip.sub && <span className="bs3d-tip-s">{tip.sub}</span>}
        </div>
      )}
      <div className="bs3d-views" role="group" aria-label="Camera">
        {(compact ? (["anterior", "posterior", "left"] as View3D[]) : (["anterior", "posterior", "left", "right"] as View3D[])).map((v) => (
          <button key={v} type="button" className="bs3d-vb" onClick={() => setViewReq((r) => ({ view: v, n: r.n + 1 }))} title={`${VIEW_LABEL[v]} view`} aria-label={`${VIEW_LABEL[v]} view`}>
            {compact ? VIEW_LABEL[v][0] : VIEW_LABEL[v]}
          </button>
        ))}
      </div>
      {list && onLevel && (
        <ol className="bs3d-levels" aria-label="Section levels">
          {PLANE_LEVELS.map((lv) => (
            <li key={lv}>
              <button
                type="button"
                aria-current={lv === level ? "true" : undefined}
                onPointerEnter={() => setHoverLevel(lv)}
                onPointerLeave={() => setHoverLevel(null)}
                onFocus={() => setHoverLevel(lv)}
                onBlur={() => setHoverLevel(null)}
                onClick={() => onLevel(lv)}
              >
                {LEVEL_NAME(lv)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A key light that rides with the camera (up and to the left of it), so every side is lit like a specimen on a desk. */
function Headlight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const { camera, scene } = useThree();
  const off = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.target.position.copy(CENTRE);
    scene.add(l.target);
    return () => void scene.remove(l.target);
  }, [scene]);
  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    off.set(-0.2, 0.26, 0.04).applyQuaternion(camera.quaternion);
    l.position.copy(camera.position).add(off);
    const f = fill.current;
    if (f) f.position.copy(camera.position).add(off.set(0.22, -0.05, 0).applyQuaternion(camera.quaternion));
  });
  return (
    <>
      <directionalLight ref={ref} intensity={2.3} />
      <directionalLight ref={fill} color="#e8eef5" intensity={0.55} />
    </>
  );
}
