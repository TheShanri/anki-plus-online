"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { loadAtlasIndex, resolveStructureIds, unionBox } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { loadAtlasModel, releaseAtlasCache, retainAtlasCache } from "@/lib/atlas/loader";
import { readCssColor } from "@/lib/atlas/theme";

export type AtlasMode = "focus" | "context";

type ViewName = "anterior" | "posterior" | "left" | "right" | "superior" | "inferior" | "midsagittal";
const VIEWS: { id: ViewName; label: string; dir: [number, number, number] }[] = [
  { id: "anterior", label: "Anterior", dir: [0, 0, 1] },
  { id: "posterior", label: "Posterior", dir: [0, 0, -1] },
  { id: "left", label: "Lateral L", dir: [1, 0, 0] },
  { id: "right", label: "Lateral R", dir: [-1, 0, 0] },
  { id: "superior", label: "Superior", dir: [0, 1, 0.02] },
  { id: "inferior", label: "Inferior", dir: [0, -1, 0.02] },
  { id: "midsagittal", label: "Midsagittal", dir: [1, 0, 0] },
];
const DEFAULT_CTX_CENTER = new THREE.Vector3(0, 1.605, -0.01);

export type AtlasViewerProps = {
  /** Atlas ids to highlight (group ids are expanded to their members). */
  structureIds: string[];
  /** "focus": target bright, shell faded to ~15%. "context": whole shell faint, no emphasis. */
  mode?: AtlasMode;
  /** Shows the "approximate location" badge (set when the ids are a fallback parent). */
  approximate?: boolean;
  /** Overrides the label (e.g. the course's own name for the structure). */
  label?: string;
  className?: string;
  height?: number | string;
  /** Other structures shown at the same time, each in its own colour (extras and neighbours). */
  overlays?: AtlasOverlay[];
};

export type AtlasOverlay = { key: string; ids: string[]; color: string; opacity?: number };
type LoadedOverlay = { key: string; color: string; opacity: number; groups: THREE.Group[] };
type ClipAxis = "off" | "x" | "y" | "z";
type ClipState = { axis: ClipAxis; t: number; flip: boolean };
const CLIP_AXES: { id: ClipAxis; label: string }[] = [
  { id: "off", label: "No cut" },
  { id: "z", label: "Coronal cut" },
  { id: "x", label: "Sagittal cut" },
  { id: "y", label: "Transverse cut" },
];

type Loaded = { key: string; targets: THREE.Group[]; ctx: THREE.Group | null; ovl: LoadedOverlay[]; error?: string };

/* Imperative three.js helpers kept outside components so the immutability lint does not treat GPU objects as state. */
function enableLocalClipping(gl: THREE.WebGLRenderer) {
  gl.localClippingEnabled = true;
}

function setPlanes(m: THREE.MeshStandardMaterial, planes: THREE.Plane[], alwaysDouble = false) {
  m.clippingPlanes = planes;
  m.side = alwaysDouble || planes.length ? THREE.DoubleSide : THREE.FrontSide;
  m.needsUpdate = true;
}

function configureContextMaterial(m: THREE.MeshStandardMaterial, opacity: number, planes: THREE.Plane[]) {
  m.opacity = opacity;
  setPlanes(m, planes);
}

/** Plane for a cut along an anatomical axis (glTF Y-up: x = left-right, y = up, z = anterior). */
function cutPlane(axis: ClipAxis, pos: number, flip: boolean, into: THREE.Plane): boolean {
  if (axis === "off") return false;
  const e = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  if (flip) {
    into.normal.copy(e);
    into.constant = -pos;
  } else {
    into.normal.copy(e).negate();
    into.constant = pos;
  }
  return true;
}

/** Short emissive + scale pulse after a highlight appears (frameloop is on demand, so it asks for frames while active). */
class Pulse {
  private until = 0;
  private dur = 1;
  start(ms: number) {
    this.dur = Math.max(1, ms);
    this.until = ms > 0 ? performance.now() + ms : 0;
  }
  /** Returns true while another frame is needed. */
  step(mat: THREE.MeshStandardMaterial, pivots: THREE.Group[]): boolean {
    if (this.until === 0) return false;
    const left = this.until - performance.now();
    if (left > 0) {
      const t = 1 - left / this.dur;
      const fade = left / this.dur;
      mat.emissiveIntensity = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 3)) * fade;
      const k = 1 + 0.035 * Math.sin(t * Math.PI * 3) * fade;
      for (const p of pivots) p.scale.setScalar(k);
      return true;
    }
    this.until = 0;
    mat.emissiveIntensity = 0.55;
    for (const p of pivots) p.scale.setScalar(1);
    return true;
  }
}

function Rig({ box, view, nonce }: { box: THREE.Box3 | null; view: ViewName; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  useEffect(() => {
    const c = box && !box.isEmpty() ? box.getCenter(new THREE.Vector3()) : DEFAULT_CTX_CENTER.clone();
    const size = box && !box.isEmpty() ? box.getSize(new THREE.Vector3()).length() : 0.3;
    // Frame the whole brain around the target so students keep their bearings; they can zoom in.
    const dist = view === "midsagittal" ? 0.42 : Math.min(0.6, Math.max(0.36, size * 2.6));
    const v = VIEWS.find((x) => x.id === view) ?? VIEWS[2];
    const target = view === "midsagittal" ? DEFAULT_CTX_CENTER.clone().setX(0) : c;
    camera.position.copy(target).addScaledVector(new THREE.Vector3(...v.dir).normalize(), dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    invalidate();
  }, [box, view, nonce, camera, controls, invalidate]);
  return null;
}

function Scene({
  loaded,
  mode,
  showCtx,
  midsagittal,
  accent,
  dim,
  clip,
  clipRange,
}: {
  loaded: Loaded;
  mode: AtlasMode;
  showCtx: boolean;
  midsagittal: boolean;
  accent: THREE.Color;
  dim: THREE.Color;
  clip: ClipState;
  clipRange: [number, number];
}) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  const cutP = useMemo(() => new THREE.Plane(), []);

  useEffect(() => {
    enableLocalClipping(gl);
  }, [gl]);

  const hiMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.55,
        roughness: 0.55,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [accent],
  );
  const ctxMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: dim,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    [dim],
  );
  useEffect(
    () => () => {
      hiMat.dispose();
      ctxMat.dispose();
    },
    [hiMat, ctxMat],
  );

  const ovlMats = useMemo(
    () =>
      loaded.ovl.map(
        (o) =>
          new THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0, transparent: true, opacity: o.opacity, side: THREE.DoubleSide }),
      ),
    [loaded.ovl],
  );
  useEffect(() => () => ovlMats.forEach((m) => m.dispose()), [ovlMats]);

  useEffect(() => {
    const planes: THREE.Plane[] = [];
    if (midsagittal) planes.push(clipPlane);
    const pos = clipRange[0] + clip.t * (clipRange[1] - clipRange[0]);
    const cutting = cutPlane(clip.axis, pos, clip.flip, cutP);
    if (cutting) planes.push(cutP);
    configureContextMaterial(ctxMat, mode === "context" ? 0.4 : 0.15, planes);
    const own = cutting ? [cutP] : [];
    setPlanes(hiMat, own, true);
    ovlMats.forEach((m) => setPlanes(m, own, true));
    invalidate();
  }, [ctxMat, hiMat, ovlMats, mode, midsagittal, clipPlane, cutP, clip, clipRange, invalidate]);

  const ovlRoot = useMemo(() => {
    const root = new THREE.Group();
    loaded.ovl.forEach((o) => o.groups.forEach((g) => root.add(g.clone(true))));
    return root;
  }, [loaded.ovl]);
  useEffect(() => {
    let i = 0;
    loaded.ovl.forEach((o, k) => {
      for (let j = 0; j < o.groups.length; j++) {
        ovlRoot.children[i++]?.traverse((n) => {
          const m = n as THREE.Mesh;
          if (m.isMesh) m.material = ovlMats[k];
        });
      }
    });
    invalidate();
  }, [ovlRoot, ovlMats, loaded.ovl, invalidate]);

  // wrap each target in a pivot at its centroid so the pulse scales in place
  const { targetRoot, pivots } = useMemo(() => {
    const root = new THREE.Group();
    const list: THREE.Group[] = [];
    // Clone: the loaded scenes are cached and shared, and React may run this memo twice (Strict Mode),
    // so mutating the originals would shift the target off screen on every re-run.
    for (const src of loaded.targets) {
      const t = src.clone(true);
      t.position.set(0, 0, 0);
      t.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(c);
      t.position.sub(c);
      pivot.add(t);
      root.add(pivot);
      list.push(pivot);
    }
    return { targetRoot: root, pivots: list };
  }, [loaded.targets]);

  useEffect(() => {
    targetRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = hiMat;
    });
    loaded.ctx?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = ctxMat;
    });
    invalidate();
  }, [targetRoot, loaded.ctx, hiMat, ctxMat, invalidate]);

  const [pulse] = useState(() => new Pulse());
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pulse.start(reduce || mode === "context" ? 0 : 1800);
    invalidate();
  }, [loaded, mode, invalidate, pulse]);

  useFrame(() => {
    if (pulse.step(hiMat, pivots)) invalidate();
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[1, 2, 2]} intensity={1.6} />
      <directionalLight position={[-2, -1, -1.5]} intensity={0.7} />
      {loaded.ctx && showCtx && <primitive object={loaded.ctx} />}
      <primitive object={ovlRoot} />
      <primitive object={targetRoot} />
    </>
  );
}

export default function AtlasViewer({
  structureIds,
  mode = "focus",
  approximate = false,
  label,
  className,
  height = 480,
  overlays,
}: AtlasViewerProps) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [showCtx, setShowCtx] = useState(true);
  const [view, setView] = useState<ViewName>("left");
  const [nonce, setNonce] = useState(0);
  const [clip, setClip] = useState<ClipState>({ axis: "off", t: 0.5, flip: false });
  const [colors, setColors] = useState(() => ({ accent: readCssColor("--accent", "#ff2a6d"), dim: readCssColor("--text-dim", "#a996c9") }));

  // theme colours: read at mount (state initialiser), refresh when data-theme changes
  useEffect(() => {
    const read = () => setColors({ accent: readCssColor("--accent", "#ff2a6d"), dim: readCssColor("--text-dim", "#a996c9") });
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    retainAtlasCache();
    return () => releaseAtlasCache();
  }, []);

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setIndex(i))
      .catch((e) => alive && setIndexError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const resolved = useMemo(() => (index ? resolveStructureIds(index, structureIds) : []), [index, structureIds]);
  const key = resolved.join(",") + "|" + mode;
  const entries = useMemo(() => (index ? resolved.map((id) => index.structures[id]) : []), [index, resolved]);

  const ovlSig = (overlays ?? []).map((o) => `${o.key}:${o.ids.join("+")}:${o.color}:${o.opacity ?? ""}`).join("|");
  const ovlResolved = useMemo(
    () => (index ? (overlays ?? []).map((o) => ({ ...o, ids: resolveStructureIds(index, o.ids, 40).filter((id) => !resolved.includes(id)) })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, ovlSig, resolved],
  );
  const fullKey = key + "|" + ovlSig;

  useEffect(() => {
    if (!index) return;
    let alive = true;
    const ctxFile = index.context.file;
    Promise.all([
      loadAtlasModel(ctxFile).catch(() => null),
      Promise.all(resolved.map((id) => loadAtlasModel(index.structures[id].file!))),
      Promise.all(
        ovlResolved.map(async (o) => ({
          key: o.key,
          color: o.color,
          opacity: o.opacity ?? 0.9,
          groups: await Promise.all(o.ids.map((id) => loadAtlasModel(index.structures[id].file!))),
        })),
      ),
    ])
      .then(([ctx, targets, ovl]) => alive && setLoaded({ key: fullKey, ctx, targets, ovl }))
      .catch((e) => alive && setLoaded({ key: fullKey, ctx: null, targets: [], ovl: [], error: String(e?.message ?? e) }));
    return () => {
      alive = false;
    };
  }, [index, resolved, ovlResolved, fullKey]);

  const current = loaded && loaded.key === fullKey ? loaded : null;
  const currentCtx = current?.ctx ?? null;
  const ctxBox = useMemo(() => {
    const b = currentCtx ? new THREE.Box3().setFromObject(currentCtx) : null;
    return b && !b.isEmpty() ? b : null;
  }, [currentCtx]);
  const clipRange = useMemo<[number, number]>(() => {
    const ax = clip.axis === "off" ? "z" : clip.axis;
    if (!ctxBox) return ax === "x" ? [-0.08, 0.08] : ax === "y" ? [1.53, 1.68] : [-0.11, 0.1];
    return [ctxBox.min[ax], ctxBox.max[ax]];
  }, [ctxBox, clip.axis]);
  const box = useMemo(() => {
    const u = mode === "context" ? null : unionBox(entries);
    return u ? new THREE.Box3(new THREE.Vector3(...u.min), new THREE.Vector3(...u.max)) : null;
  }, [entries, mode]);

  function pickAxis(axis: ClipAxis) {
    if (axis === "off") return setClip((c) => ({ ...c, axis }));
    const lo = ctxBox ? ctxBox.min[axis] : axis === "x" ? -0.08 : axis === "y" ? 1.53 : -0.11;
    const hi = ctxBox ? ctxBox.max[axis] : axis === "x" ? 0.08 : axis === "y" ? 1.68 : 0.1;
    const c = box ? box.getCenter(new THREE.Vector3())[axis] : (lo + hi) / 2;
    setClip({ axis, t: Math.min(1, Math.max(0, (c - lo) / (hi - lo))), flip: false });
  }

  const title =
    label ??
    (entries.length === 0
      ? ""
      : entries.length <= 3
        ? entries.map((e) => e.name).join(", ")
        : `${entries[0].name} + ${entries.length - 1} more`);
  const latin = !label && entries.length === 1 ? entries[0].latin : null;
  const missing = index && structureIds.length > 0 && resolved.length === 0;

  return (
    <div className={`relative w-full overflow-hidden rounded-card border border-panel-border bg-bg-2 ${className ?? ""}`} style={{ height }}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 35, near: 0.01, far: 6, position: [0.5, 1.605, -0.01] }}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        {current && (
          <Scene loaded={current} mode={mode} showCtx={showCtx} midsagittal={view === "midsagittal"} accent={colors.accent} dim={colors.dim} clip={clip} clipRange={clipRange} />
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} screenSpacePanning minDistance={0.05} maxDistance={1.2} touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />
        <Rig box={box} view={view} nonce={nonce} />
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-col gap-1">
        {title && (
          <div className="rounded-sm border border-panel-border bg-panel px-2.5 py-1.5 text-sm backdrop-blur">
            <span className="font-display tracking-wide text-accent">{title}</span>
            {latin && <span className="ml-2 text-xs italic text-text-dim">{latin}</span>}
          </div>
        )}
        {approximate && (
          <div className="w-fit rounded-sm border border-hard px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-hard">
            Approximate location
          </div>
        )}
      </div>

      {(!current && !indexError) || (index && !current && resolved.length > 0) ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-dim" role="status">
          Loading 3D model...
        </div>
      ) : null}
      {(indexError || current?.error || missing) && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-text-dim" role="alert">
          {missing ? "This structure has no 3D model in the atlas." : "The 3D atlas could not be loaded."}
        </div>
      )}

      <div className="absolute right-2 top-2 flex max-w-[60%] flex-wrap items-center justify-end gap-1.5">
        {CLIP_AXES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pickAxis(a.id)}
            aria-pressed={clip.axis === a.id}
            className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider backdrop-blur ${
              clip.axis === a.id ? "border-accent-2 text-accent-2" : "border-panel-border text-text-dim hover:border-panel-border-hi"
            } bg-panel`}
          >
            {a.label}
          </button>
        ))}
        {clip.axis !== "off" && (
          <div className="flex w-full items-center justify-end gap-2 rounded-sm border border-panel-border bg-panel px-2 py-1 backdrop-blur">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(clip.t * 1000)}
              onChange={(e) => setClip((c) => ({ ...c, t: Number(e.target.value) / 1000 }))}
              aria-label="Cut position"
              className="w-40 accent-accent"
            />
            <button type="button" onClick={() => setClip((c) => ({ ...c, flip: !c.flip }))} className="font-mono text-[11px] uppercase tracking-wider text-text-dim hover:text-text">
              Flip side
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setView(v.id);
              setNonce((n) => n + 1);
            }}
            aria-pressed={view === v.id}
            className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider backdrop-blur ${
              view === v.id ? "border-accent-2 text-accent-2" : "border-panel-border text-text-dim hover:border-panel-border-hi"
            } bg-panel`}
          >
            {v.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCtx((s) => !s)}
          aria-pressed={showCtx}
          className="ml-auto rounded-sm border border-panel-border bg-panel px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-text-dim backdrop-blur hover:border-panel-border-hi"
        >
          {showCtx ? "Hide shell" : "Show shell"}
        </button>
      </div>
    </div>
  );
}
