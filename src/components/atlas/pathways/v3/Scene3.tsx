"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { TrackballControls } from "@react-three/drei";
import { ZoomToCursor } from "../zoomToCursor";
import { RotateCcw } from "lucide-react";
import { FIELD_COLORS, GUIDE_COLORS, ORDER_COLORS } from "@/lib/atlas/pathwayPalette";
import { atlasName, bodyGeometry, carvedGeometry, contextGeometry, fillGeometry, hostGeometry, partObjects } from "./geometry";
import { Layer, type LayerStyle } from "./layers";
import { FibreLine, Mark, NerveBand, Pulses, type FibreSpec } from "./fibres";
import { LabelUpdater, type LabelDom, type LabelItem } from "./labels";
import { FIXED_PANES, MultiRender, Rig, VIEW_DEFS, applyPaneCam, fitPanes, type Pane, type PaneBase, type PaneView, type ViewDef, type ViewName } from "./rig";
import { PALETTES } from "./materials";
import { BrainVeil } from "./veil";
import { hostParts, type HostKey, type Side, type V3Data, type V3Fibre, type V3SideBeat } from "./types";
import { shortName } from "./names";
import "@/components/atlas/ui/atlas-ui.css";

/* The v3 pathway scene: matte clay context with crisp silhouettes, cutaway host shells the fibres run inside, neutral regions
 * for the stops, one rim-only ghost layer, screen-space fibres coloured by neuron order (right side dashed), cell bodies,
 * synapse cups, travelling pulses, gutter labels, a midline guide, a section cut and the 2x2 multi-view. */

export type CutMode = "auto" | "off" | "x" | "y" | "z";
export interface CutState {
  mode: CutMode;
  t: number;
  flip: boolean;
}
export interface Scene3Props {
  data: V3Data;
  cur: number | null;
  reveal: number;
  sideAlpha: { L: number; R: number };
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  onPick: (k: string | null) => void;
  view: ViewName;
  frameNonce: number;
  resetKey: string;
  cut: CutState;
  multi: boolean;
  onMulti: (m: boolean) => void;
  onView: (v: ViewName) => void;
  reduced: boolean;
  dark: boolean;
  accent: string;
  labels: boolean;
  quiz: boolean;
  onReady: (ready: boolean) => void;
  onProgress: (done: number, total: number) => void;
  /** the cut the beat chose (auto mode), so the slider can show it */
  onAutoCut?: (c: { axis: "x" | "y" | "z" | null; pos: number; range: [number, number] }) => void;
}

const DRAW_S = 2.0;
const FORK_S = 2.8;
/** Hosts not drawn as shells (the corona radiata would fill the brain; the skin is the ghost layer). */
const NOT_DRAWN = new Set(["a:white-matter-of-telencephalon", "b:skin", "a:cerebellum"]);

const v3 = (a: number[], i = 0) => new THREE.Vector3(a[i], a[i + 1], a[i + 2]);
function fibreSpecs(data: V3Data, visual: boolean): FibreSpec[] {
  const out: FibreSpec[] = [];
  data.beats.forEach((b, bi) => {
    for (const side of ["L", "R"] as Side[]) {
      const x = b[side];
      if (!x) continue;
      x.f.forEach((f, fi) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < f.pts.length; i += 3) pts.push(v3(f.pts, i));
        if (pts.length < 2) return;
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
        const L = cum[cum.length - 1] || 1;
        const color = visual && f.tag ? (FIELD_COLORS as Record<string, string>)[f.tag] ?? ORDER_COLORS[1] : ORDER_COLORS[(Math.min(4, Math.max(1, f.order)) as 1 | 2 | 3 | 4)];
        out.push({ key: `${bi}:${side}:${fi}`, beat: bi, info: b.info, side, order: f.order, color, pts, u: cum.map((c) => c / L) });
      });
    }
  });
  return out;
}

interface Stage {
  box: THREE.Box3;
  view: ViewDef;
  cut: { axis: "x" | "y" | "z" | null; pos: number; flip: boolean; veil?: boolean };
}
/** The camera box, the canonical view and the auto cut of a beat. */
function stageOf(data: V3Data, fibres: FibreSpec[], bi: number | null, sideAlpha: { L: number; R: number }, prev: Stage | null): Stage {
  let sides = (["L", "R"] as Side[]).filter((s) => sideAlpha[s] > 0.5);
  const beats = bi === null ? data.beats.map((_, i) => i) : [bi];
  const node = bi !== null && data.beats[bi].kind === "node";
  const boxOf = (ss: Side[]) => {
    const b = new THREE.Box3();
    const marks: THREE.Vector3[] = [];
    for (const i of beats)
      for (const s of ss) {
        const x = data.beats[i]?.[s];
        for (const m of [x?.soma, x?.syn, x?.start, x?.cross]) if (m) marks.push(v3(m.p));
        // a stop drawn as a patch of a big mesh (a muscle, the skin) frames on that patch
        for (const st of x?.stops ?? []) if (st.carve) marks.push(v3(st.carve.p));
      }
    marks.forEach((p) => b.expandByPoint(p));
    for (const f of fibres) if (beats.includes(f.beat) && ss.includes(f.side)) f.pts.forEach((p) => b.expandByPoint(p));
    // a node frames its stop; the end of the incoming fibre near it stays in view (not the whole limb behind it)
    if (node && bi !== null && bi > 0 && marks.length)
      for (const f of fibres) if (f.beat === bi - 1 && ss.includes(f.side)) f.pts.forEach((p) => marks.some((m) => m.distanceTo(p) < 0.03) && b.expandByPoint(p));
    return b;
  };
  let box = boxOf(sides);
  // both sides drawn but far apart (two hands, two feet, two eyes' muscles): frame the left one; the right one mirrors it
  if (sides.length === 2 && bi !== null && !data.beats[bi].L?.cross) {
    const bl = boxOf(["L"]), br = boxOf(["R"]);
    if (!bl.isEmpty() && !br.isEmpty() && bl.getCenter(new THREE.Vector3()).distanceTo(br.getCenter(new THREE.Vector3())) > 0.12 && Math.min(bl.min.x, -br.max.x) > 0.04) {
      box = bl;
      sides = ["L"];
    }
  }
  if (box.isEmpty() && prev) return prev;
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.05, 1.55, -0.08), new THREE.Vector3(0.05, 1.7, 0.08));
  const size = box.getSize(new THREE.Vector3());
  // a receptor or a target muscle in the limb is framed with its surroundings (the digit, the thigh), not from inside it
  const bx = bi !== null ? data.beats[bi][sides[0]] : undefined;
  const limbEnd = node && !!bx && !bx.soma && (!!bx.start || bx.stops.some((st) => !!st.carve)) && (Math.abs(box.getCenter(new THREE.Vector3()).x) > 0.05 || box.max.y < 1.0);
  const minS = limbEnd ? 0.09 : node ? 0.032 : 0.028;
  const c = box.getCenter(new THREE.Vector3());
  for (const a of ["x", "y", "z"] as const) if (size[a] < minS) {
    box.min[a] = c[a] - minS / 2;
    box.max[a] = c[a] + minS / 2;
  }
  // keep both sides of the midline in the box when both sides are drawn (the crossing reads against the midline)
  if (sides.length === 2 && Math.abs(c.x) < 0.04) {
    const m = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    box.min.x = -m;
    box.max.x = m;
  }
  const s2 = box.getSize(new THREE.Vector3());
  const cross = bi !== null && !!(data.beats[bi].L?.cross || data.beats[bi].R?.cross);
  let view: ViewDef;
  const focus: Side | null = sides.length === 1 ? sides[0] : null;
  const want = bi !== null ? data.beats[bi].view : undefined;
  if (want && VIEW_DEFS[want]) view = VIEW_DEFS[want];
  else if (data.slug === "visual" || data.slug === "pupillary") view = VIEW_DEFS.superior;
  else if (cross) view = VIEW_DEFS.posterior;
  else if (node && prev) view = prev.view;
  else if (s2.y > 1.5 * Math.max(s2.x, s2.z)) {
    const sx = focus === "R" ? -1 : 1;
    view = { dir: [0.62 * sx, 0.22, -0.75], up: [0, 1, 0] };
  } else view = VIEW_DEFS.posterior;
  // the cut opens the vertebral column along the cord
  const cordBeat = box.min.y < 1.548 && box.max.y < 1.575 && Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) < 0.05;
  const wantCut = bi !== null ? data.beats[bi].cut : undefined;
  const headBeat = box.min.y > 1.536 && Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) < 0.08 && box.min.z > -0.11;
  const cc = box.getCenter(new THREE.Vector3());
  const cut: Stage["cut"] =
    wantCut === "off"
      ? { axis: null, pos: 0, flip: false }
      : wantCut
        ? { axis: wantCut, pos: wantCut === "x" ? 0.0006 * (view.dir[0] >= 0 ? 1 : -1) : cc[wantCut], flip: view.dir[wantCut === "x" ? 0 : wantCut === "y" ? 1 : 2] < 0 }
        : headBeat
          ? // inside the head: no cut and no flat section; the whole brain is a very faint translucent solid behind the fibres
            // (the veil), so the student sees where in the brain the beat is
            { axis: null, pos: 0, flip: false, veil: true }
          : cordBeat
          ? // open the vertebral column on the camera's side: a coronal cut through the cord for front / back views, sagittal
            // (just past the midline) for side views; the cord and roots are hosts and are never cut
            Math.abs(view.dir[2]) >= Math.abs(view.dir[0])
            ? { axis: "z", pos: cc.z, flip: view.dir[2] < 0 }
            : { axis: "x", pos: 0.0006 * (view.dir[0] >= 0 ? 1 : -1), flip: view.dir[0] < 0 }
          : { axis: null, pos: 0, flip: false };
  return { box: box.expandByScalar(Math.max(0.003, box.getSize(new THREE.Vector3()).length() * 0.06)), view, cut };
}

function zonesOf(fibres: FibreSpec[]) {
  let spine = false, arm = false, leg = false, head = false, trunk = false, brain = false;
  for (const f of fibres)
    for (const p of f.pts) {
      if (p.y < 1.548 && p.y > 0.86 && Math.abs(p.x) < 0.03) spine = true;
      if (Math.abs(p.x) > 0.075 && p.y > 0.65 && p.y < 1.45) arm = true;
      if (p.y < 0.75 && Math.abs(p.x) < 0.15) leg = true;
      if (p.y > 1.48 && (p.z > 0.035 || Math.abs(p.x) > 0.045)) head = true;
      if (p.y > 1.0 && p.y < 1.45 && p.z > 0) trunk = true;
      if (p.y > 1.538 && p.y < 1.62 && Math.abs(p.x) < 0.03) brain = true;
    }
  return { spine, arm, leg, head, trunk, brain };
}

type LayerSpec = { key: string; style: LayerStyle; geo: Promise<THREE.BufferGeometry | null>; half?: Side; name: string; pick?: string; beat?: number; stop?: boolean; carve?: boolean };

export default function Scene3(p: Scene3Props) {
  const pal = PALETTES[p.dark ? "dark" : "light"];
  const visual = p.data.slug === "visual";
  const fibres = useMemo(() => fibreSpecs(p.data, visual), [p.data, visual]);
  const zones = useMemo(() => zonesOf(fibres), [fibres]);

  /* ---------- what is drawn ---------- */
  const layers = useMemo<LayerSpec[]>(() => {
    const out: LayerSpec[] = [];
    const seen = new Set<string>();
    // hosts: every structure a fibre runs in, from the beat it is first used
    p.data.beats.forEach((b, bi) => {
      for (const side of ["L", "R"] as Side[]) {
        const x = b[side];
        if (!x) continue;
        for (const f of x.f)
          for (const [, h] of f.seg)
            for (const k of hostParts(h)) {
              const base = k.split("@")[0];
              const gk = p.data.geo[k];
              if (seen.has(k) || NOT_DRAWN.has(base) || k.startsWith("p:") || (gk?.kind === "tube" && gk.hidden)) continue;
              seen.add(k);
              out.push({ key: `h:${k}`, style: "host", geo: hostGeometry(base, p.data.geo), half: k.includes("@") ? (k.split("@")[1] as Side) : undefined, name: k, pick: `h:${k}`, beat: bi });
            }
      }
    });
    // stops: the regions of node beats (proxies, atlas structures, carved patches)
    p.data.beats.forEach((b, bi) => {
      for (const side of ["L", "R"] as Side[]) {
        const x: V3SideBeat | undefined = b[side];
        if (!x) continue;
        for (const s of x.stops) {
          const k = `r:${s.key}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const half = s.key.includes("@") ? (s.key.split("@").pop() as Side) : undefined;
          const g = s.carve ? carvedGeometry(s.carve.mesh, s.carve.p, s.carve.r, p.data.geo) : hostGeometry(s.key.split("@")[0], p.data.geo);
          out.push({ key: k, style: "region", geo: g, half: half === "L" || half === "R" ? half : undefined, name: s.name, pick: k, beat: bi, stop: true, carve: !!s.carve });
        }
      }
    });
    // proxies that are hosts but not stops: drawn as regions too (a nucleus is always a solid stop)
    for (const [k, g] of Object.entries(p.data.geo))
      if (g.kind === "proxy" && !seen.has(`r:${k}`)) {
        seen.add(`r:${k}`);
        const bi = p.data.beats.findIndex((b) => (["L", "R"] as Side[]).some((s) => b[s]?.f.some((f) => f.seg.some(([, h]) => hostParts(h).includes(k))) || b[s]?.syn?.host === k || b[s]?.soma?.host === k));
        out.push({ key: `r:${k}`, style: "region", geo: hostGeometry(k, p.data.geo), name: g.name, pick: `r:${k}`, beat: Math.max(0, bi), stop: true });
      }
    // context: clay bones, ghost skin and brain
    out.push({ key: "ctx:brain", style: "ghost", geo: contextGeometry(), name: "Brain" });
    if (zones.spine || zones.arm || zones.leg || zones.trunk) out.push({ key: "ctx:skin", style: "ghost", geo: bodyGeometry("skin"), name: "Body" });
    // the brainstem outline for orientation whenever the pathway passes it (drawn as host shells, never hiding a fibre)
    if (zones.brain)
      for (const id of ["medulla-oblongata", "pons", "midbrain"])
        if (!seen.has(`a:${id}`)) {
          seen.add(`a:${id}`);
          out.push({ key: `h:a:${id}`, style: "host", geo: hostGeometry(`a:${id}`, p.data.geo), name: `a:${id}`, pick: `h:a:${id}` });
        }
    if (zones.spine) out.push({ key: "ctx:spine", style: "clay", geo: partObjects("spine", (n) => /^bone_|^disc_/.test(n)), name: "Vertebral column" });
    if (zones.arm) for (const s of ["L", "R"]) out.push({ key: `ctx:arm${s}`, style: "clay", geo: bodyGeometry(`bones_arm_${s}`), name: "Bones of the upper limb" });
    if (zones.leg) {
      for (const s of ["L", "R"]) out.push({ key: `ctx:leg${s}`, style: "clay", geo: bodyGeometry(`bones_leg_${s}`), name: "Bones of the lower limb" }, { key: `ctx:hip${s}`, style: "clay", geo: bodyGeometry(`bones_hip_${s}`), name: "Hip bone" });
      out.push({ key: "ctx:sacrum", style: "clay", geo: bodyGeometry("bones_sacrum"), name: "Sacrum" });
    }
    return out;
  }, [p.data, zones]);

  /* ---------- loading (real progress; every geometry counted once) ---------- */
  const doneSet = useRef(new Set<string>());
  const [done, setDone] = useState(0);
  const total = layers.length;
  const markDone = useCallback((k: string) => {
    if (doneSet.current.has(k)) return;
    doneSet.current.add(k);
    setDone(doneSet.current.size);
  }, []);
  const [geos, setGeos] = useState<Record<string, THREE.BufferGeometry | null>>({});
  useEffect(() => {
    let alive = true;
    doneSet.current = new Set();
    setDone(0);
    setGeos({});
    for (const l of layers)
      l.geo
        .then((g) => {
          if (!alive) return;
          setGeos((m) => (m[l.key] === g ? m : { ...m, [l.key]: g }));
          markDone(l.key);
        })
        .catch(() => alive && markDone(l.key));
    return () => {
      alive = false;
    };
  }, [layers, markDone]);
  const ready = done >= total;
  const { onReady, onProgress } = p;
  useEffect(() => onReady(ready), [ready, onReady]);
  useEffect(() => onProgress(done, total), [done, total, onProgress]);

  /* ---------- names for hosts (atlas names are fetched once) ---------- */
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const keys = layers.filter((l) => l.style === "host" || l.style === "region").map((l) => l.key.replace(/^[hr]:/, ""));
    Promise.all(
      keys.map(async (k) => {
        const g = p.data.geo[k];
        if (g) return [k, g.name] as const;
        if (k.startsWith("a:")) return [k, await atlasName(k.slice(2).split("@")[0])] as const;
        return [k, k] as const;
      }),
    ).then((list) => alive && setNames(Object.fromEntries(list.map(([k, n]) => [k, shortName(n)]))));
    return () => {
      alive = false;
    };
  }, [layers, p.data.geo]);

  /* ---------- stage: camera box, view and cut of the current beat ---------- */
  const stages = useMemo(() => {
    const out: Stage[] = [];
    let prev: Stage | null = null;
    for (let i = 0; i < p.data.beats.length; i++) {
      prev = stageOf(p.data, fibres, i, p.sideAlpha, prev);
      out.push(prev);
    }
    return out;
  }, [p.data, fibres, p.sideAlpha]);
  const whole = useMemo(() => stageOf(p.data, fibres, null, p.sideAlpha, null), [p.data, fibres, p.sideAlpha]);
  const stage = p.cur === null ? whole : stages[p.cur] ?? whole;
  const viewDef = p.view === "beat" ? stage.view : VIEW_DEFS[p.view];
  const viewKey = JSON.stringify(viewDef);
  const stableView = useMemo(() => JSON.parse(viewKey) as ViewDef, [viewKey]);
  const boxKey = stage.box.min.toArray().concat(stage.box.max.toArray()).map((v) => v.toFixed(4)).join(",");
  const stableBox = useMemo(() => stage.box.clone(), [boxKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the cut ---------- */
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e3), []);
  const planes = useMemo(() => [plane], [plane]);
  const range = useMemo<[number, number]>(() => {
    const b = stableBox;
    const ax = p.cut.mode === "x" || p.cut.mode === "y" || p.cut.mode === "z" ? p.cut.mode : (stage.cut.axis ?? "z");
    const pad = 0.02;
    return [b.min[ax] - pad, b.max[ax] + pad];
  }, [stableBox, p.cut.mode, stage.cut.axis]);
  const cutAxis = p.cut.mode === "auto" ? (p.view === "coronal" ? "z" : stage.cut.axis) : p.cut.mode === "off" ? null : p.cut.mode;
  const cutPos = p.cut.mode === "auto" ? (p.view === "coronal" ? stableBox.getCenter(new THREE.Vector3()).z : stage.cut.pos) : range[0] + p.cut.t * (range[1] - range[0]);
  const cutFlip = p.cut.mode === "auto" ? stage.cut.flip : p.cut.flip;
  const invalidateRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!cutAxis) plane.set(new THREE.Vector3(1, 0, 0), 1e3);
    else {
      const n = new THREE.Vector3(cutAxis === "x" ? 1 : 0, cutAxis === "y" ? 1 : 0, cutAxis === "z" ? 1 : 0);
      // keep the side below the plane position (remove the high side), or the other side when flipped
      if (cutFlip) plane.set(n, -cutPos);
      else plane.set(n.negate(), cutPos);
    }
    invalidateRef.current();
  }, [plane, cutAxis, cutPos, cutFlip]);
  const { onAutoCut } = p;
  useEffect(() => {
    onAutoCut?.({ axis: stage.cut.axis, pos: stage.cut.pos, range });
  }, [onAutoCut, stage.cut.axis, stage.cut.pos, range]);

  /* ---------- hover tooltip ---------- */
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const onLayerHover = useCallback(
    (k: string | null, name?: string, e?: { nativeEvent: PointerEvent }) => {
      p.onHover(k);
      const r = rootRef.current?.getBoundingClientRect();
      setTip(k && name && e && r ? { name, x: e.nativeEvent.clientX - r.left, y: e.nativeEvent.clientY - r.top } : null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.onHover],
  );

  /* ---------- labels ---------- */
  const labelItems = useMemo<LabelItem[]>(() => {
    if (!p.labels) return [];
    const out: LabelItem[] = [];
    const sides = (["L", "R"] as Side[]).filter((s) => p.sideAlpha[s] > 0.5);
    const lastBeat = p.cur === null ? p.data.beats.length - 1 : p.reveal;
    const seen = new Map<string, THREE.Vector3[]>();
    p.data.beats.forEach((b, bi) => {
      if (bi > lastBeat) return;
      for (const s of sides.slice(0, 1)) {
        const x = b[s];
        if (!x) continue;
        for (const st of x.stops) {
          // one tag per displayed name ("GPi (inhibitory output)" and the GPi region both read "GPi")
          const text = shortName(st.name);
          // the key carries the name: two stops on the same patch ("Spindles in the masseter", "Masseter contracts") are two tags
          const key = `r:${st.key}|${text}`;
          // the stop's own mark: its carve, a cell body / start / synapse inside it (this beat or earlier), a proxy's centre,
          // else the beat's soma or synapse
          const g = p.data.geo[st.key];
          const own = (m?: { host: string; p: number[] }) => !!m && m.host === st.key.split("@")[0];
          let at = st.carve ? v3(st.carve.p) : own(x.soma) ? v3(x.soma!.p) : own(x.start) ? v3(x.start!.p) : g && g.kind === "proxy" ? v3(g.c) : null;
          for (let k = bi; !at && k >= 0; k--) {
            const y = p.data.beats[k]?.[s];
            const m = [y?.syn, y?.soma, y?.start].find((q) => own(q));
            if (m) at = v3(m.p);
          }
          if (!at) at = x.soma ? v3(x.soma.p) : x.syn ? v3(x.syn.p) : null;
          for (let k = bi - 1; !at && k >= 0 && k >= bi - 2; k--) {
            const y = p.data.beats[k]?.[s];
            if (y?.syn) at = v3(y.syn.p);
          }
          const pos = at ?? (g && g.kind === "proxy" ? v3(g.c) : null);
          if (!pos) continue;
          // a bilateral structure the pathway uses on both sides (pretectal nuclei) gets a second tag when the two stops are
          // well apart; a duplicate name at the same spot (GPi, GPi (inhibitory output)) stays one tag
          const prev = seen.get(text);
          if (prev && prev.some((q) => q.distanceTo(pos) < 0.008)) continue;
          if (prev) prev.push(pos);
          else seen.set(text, [pos]);
          out.push({ key, text, at: pos, prio: bi === p.cur ? 2 : 1 });
        }
        if (bi === p.cur && b.kind === "path") {
          const f = x.f[0];
          if (f) {
            const mid = Math.floor(f.pts.length / 6) * 3;
            const seg = [...f.seg].reverse().find(([i]) => i * 3 <= mid);
            const hk = seg ? hostParts(seg[1]).find((h) => !NOT_DRAWN.has(h.split("@")[0])) : null;
            const nm = hk ? names[hk] : null;
            if (nm && !seen.has(nm) && !seen.has(shortName(nm))) out.push({ key: `cur:${bi}`, text: nm, at: v3(f.pts, mid), prio: 2 });
          }
          if (x.cross) out.push({ key: `x:${bi}`, text: `Crosses here: ${x.cross.name.toLowerCase()}, ${x.cross.level}`, at: v3(x.cross.p), prio: 3, color: GUIDE_COLORS.crossing });
        }
      }
    });
    return out;
  }, [p.labels, p.data, p.sideAlpha, p.cur, p.reveal, names]);
  // the active beat's fibre samples: tags keep off them (a tag box laid over the lit fibre hides it)
  const avoidPts = useMemo(() => {
    const out: THREE.Vector3[] = [];
    if (p.cur === null) return out;
    for (const f of fibres) if (f.beat === p.cur && p.sideAlpha[f.side] > 0.5) for (let i = 0; i < f.pts.length; i++) out.push(f.pts[i]);
    return out;
  }, [fibres, p.cur, p.sideAlpha]);
  const labelDom = useRef<LabelDom>({ tags: new Map(), lines: new Map(), dots: new Map(), chipL: null, chipR: null, root: null });

  /* ---------- multi-view panes ---------- */
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mainEl, setMainEl] = useState<HTMLDivElement | null>(null);
  const fixedCams = useMemo(() => FIXED_PANES.map(() => new THREE.PerspectiveCamera(30, 1, 0.002, 6)), []);
  const panes = useRef<Pane[]>([]);
  const bases = useRef<(PaneBase | null)[]>(FIXED_PANES.map(() => null));
  const views = useRef<PaneView[]>(FIXED_PANES.map(() => ({ z: 1, ox: 0, oy: 0 })));
  useLayoutEffect(() => {
    panes.current = p.multi ? [...FIXED_PANES.map((_, i) => ({ el: cellRefs.current[i], cam: fixedCams[i] })), { el: mainEl, cam: null }] : [];
    if (p.multi) {
      fitPanes(fixedCams, cellRefs.current, stableBox, 30, bases.current, views.current);
      invalidateRef.current();
    }
  }, [p.multi, mainEl, fixedCams, stableBox]);
  useEffect(() => {
    if (!p.multi) return;
    const offs: (() => void)[] = [];
    FIXED_PANES.forEach((_, i) => {
      const el = cellRefs.current[i];
      if (!el) return;
      const cam = fixedCams[i];
      const ptrs = new Map<number, { x: number; y: number }>();
      let lastD = 0;
      const ppu = () => {
        const b = bases.current[i];
        return b ? el.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * b.dist) : 0;
      };
      const refresh = () => {
        const b = bases.current[i];
        if (b) applyPaneCam(cam, b, views.current[i]);
        invalidateRef.current();
      };
      const zoomAt = (cx: number, cy: number, f: number) => {
        const v = views.current[i];
        const k = ppu();
        if (!k) return;
        const r = el.getBoundingClientRect();
        const u = cx - r.left - r.width / 2, w = r.height / 2 - (cy - r.top);
        const nz = Math.min(14, Math.max(0.6, v.z * f));
        v.ox += u / (k * v.z) - u / (k * nz);
        v.oy += w / (k * v.z) - w / (k * nz);
        v.z = nz;
        refresh();
      };
      const d2 = () => {
        if (ptrs.size !== 2) return 0;
        const [a, b] = [...ptrs.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("button")) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        el.setPointerCapture?.(e.pointerId);
        lastD = d2();
      };
      const move = (e: PointerEvent) => {
        const q = ptrs.get(e.pointerId);
        if (!q) return;
        const dx = e.clientX - q.x, dy = e.clientY - q.y;
        q.x = e.clientX;
        q.y = e.clientY;
        if (ptrs.size === 1) {
          const k = ppu();
          if (!k) return;
          const v = views.current[i];
          v.ox -= dx / (k * v.z);
          v.oy += dy / (k * v.z);
          refresh();
        } else if (ptrs.size === 2) {
          const d = d2();
          const [a, b] = [...ptrs.values()];
          if (lastD > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastD);
          lastD = d;
        }
      };
      const up = (e: PointerEvent) => {
        ptrs.delete(e.pointerId);
        lastD = d2();
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.03 : 0.0015)));
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("wheel", wheel, { passive: false });
      offs.push(() => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.removeEventListener("wheel", wheel);
      });
    });
    return () => offs.forEach((f) => f());
  }, [p.multi, fixedCams]);
  const resetPane = (i: number) => {
    views.current[i] = { z: 1, ox: 0, oy: 0 };
    const b = bases.current[i];
    if (b) applyPaneCam(fixedCams[i], b, views.current[i]);
    invalidateRef.current();
  };

  const [locked, setLocked] = useState(false);
  // the closed brain solid for the section cap (small; loaded once, not part of the loader's count)
  const [fill, setFill] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let alive = true;
    fillGeometry().then((g) => alive && setFill(g));
    return () => {
      alive = false;
    };
  }, []);
  const curBeat = p.cur;
  const isHover = (k: string) => p.hoverKey === k;
  const revealedBeat = (bi: number | undefined) => bi === undefined || bi <= p.reveal + (p.quiz ? 0 : 1);
  const curStops = useMemo(() => {
    const s = new Set<string>();
    if (curBeat === null) return s;
    for (const side of ["L", "R"] as Side[]) p.data.beats[curBeat]?.[side]?.stops.forEach((x) => s.add(`r:${x.key}`));
    return s;
  }, [curBeat, p.data]);
  const curHosts = useMemo(() => {
    const s = new Set<string>();
    if (curBeat === null) return s;
    for (const side of ["L", "R"] as Side[]) p.data.beats[curBeat]?.[side]?.f.forEach((f) => f.seg.forEach(([, h]) => hostParts(h).forEach((k) => s.add(`h:${k}`))));
    return s;
  }, [curBeat, p.data]);
  // fibres of the current beat for the pulses
  const curFibres = useMemo(() => fibres.filter((f) => f.beat === curBeat && p.sideAlpha[f.side] > 0.5), [fibres, curBeat, p.sideAlpha]);
  const [pulseOn, setPulseOn] = useState(false);
  useEffect(() => {
    setPulseOn(false);
    if (curBeat === null) return;
    const fork = !!p.data.beats[curBeat] && p.data.beats[curBeat].kind === "path";
    const t = setTimeout(() => setPulseOn(true), (fork ? DRAW_S : 0.3) * 1000 + 100);
    return () => clearTimeout(t);
  }, [curBeat, p.data]);

  const marks = useMemo(() => {
    const out: { key: string; kind: "soma" | "syn" | "inh" | "start" | "cross"; p: THREE.Vector3; dir?: THREE.Vector3; color: string; beat: number; side: Side; info: string }[] = [];
    p.data.beats.forEach((b, bi) => {
      for (const side of ["L", "R"] as Side[]) {
        const x = b[side];
        if (!x) continue;
        const ord = (o: number) => ORDER_COLORS[(Math.min(4, Math.max(1, o)) as 1 | 2 | 3 | 4)];
        if (x.soma) out.push({ key: `s${bi}${side}`, kind: "soma", p: v3(x.soma.p), color: ord(x.soma.order), beat: bi, side, info: b.info });
        if (x.start) out.push({ key: `st${bi}${side}`, kind: "start", p: v3(x.start.p), color: ord(x.start.order), beat: bi, side, info: b.info });
        // the direction a fibre arrives at its end
        const endDir = (f: V3Fibre | undefined) => {
          if (!f || f.pts.length < 6) return undefined;
          const n = f.pts.length;
          return new THREE.Vector3(f.pts[n - 3] - f.pts[n - 6], f.pts[n - 2] - f.pts[n - 5], f.pts[n - 1] - f.pts[n - 4]).normalize();
        };
        // an inhibitory synapse: a bar across the fibre's end instead of the cup
        x.f.forEach((f, fi) => {
          if (f.inh && f.pts.length >= 6) out.push({ key: `i${bi}${side}${fi}`, kind: "inh", p: v3(f.pts, f.pts.length - 3), dir: endDir(f), color: ord(f.order), beat: bi, side, info: b.info });
        });
        const lastF = x.f[x.f.length - 1];
        if (x.syn && !lastF?.inh) {
          out.push({ key: `y${bi}${side}`, kind: "syn", p: v3(x.syn.p), dir: endDir(lastF), color: ord(x.syn.order), beat: bi, side, info: b.info });
        }
        if (x.cross && side === "L") out.push({ key: `x${bi}`, kind: "cross", p: v3(x.cross.p), color: GUIDE_COLORS.crossing, beat: bi, side, info: b.info });
      }
    });
    return out;
  }, [p.data]);

  const rim = p.dark ? "#0b0a09" : "#1c1a17";
  // nerves and synthetic connectors also get a constant-width band (the real calibre is too thin to read at limb scale)
  const bands = useMemo(() => {
    const out: { key: string; pts: THREE.Vector3[]; beat: number }[] = [];
    for (const l of layers) {
      const k = l.key.replace(/^h:/, "");
      const g = p.data.geo[k];
      if (!l.key.startsWith("h:") || !g || (g.kind !== "nerve" && g.kind !== "tube") || (g.kind === "tube" && g.hidden)) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < g.pts.length; i += 3) pts.push(v3(g.pts, i));
      out.push({ key: k, pts, beat: l.beat ?? 0 });
    }
    return out;
  }, [layers, p.data.geo]);

  return (
    <div ref={rootRef} className="relative h-full w-full" data-pw3-ready={ready ? "1" : "0"}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.002, far: 6, position: [0.3, 1.6, -0.5] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, invalidate }) => {
          gl.localClippingEnabled = true;
          gl.toneMapping = THREE.NeutralToneMapping;
          invalidateRef.current = invalidate;
        }}
        onPointerMissed={() => p.onPick(null)}
      >
        <Invalidator to={invalidateRef} />
        <hemisphereLight args={["#ffffff", p.dark ? "#3a3530" : "#b8b0a2", 1.1]} />
        <directionalLight position={[0.6, 2.4, 1.4]} intensity={1.7} />
        <directionalLight position={[-1.4, 1.2, -0.8]} intensity={0.75} />
        <directionalLight position={[0.2, 0.4, -2]} intensity={0.55} />
        <TrackballControls makeDefault staticMoving rotateSpeed={2.4} zoomSpeed={1.6} panSpeed={0.8} minDistance={0.015} maxDistance={3.5} keys={["F13", "F14", "F15"]} domElement={mainEl ?? undefined} />
        <ZoomToCursor el={mainEl} />
        <Rig box={stableBox} view={stableView} nonce={p.frameNonce} resetKey={p.resetKey} onLock={setLocked} />
        {p.multi && <MultiRender panes={panes} />}
        {layers.map((l) => {
          const g = geos[l.key];
          if (!g) return null;
          const style: LayerStyle = l.style;
          const shown = style === "ghost" || style === "clay" || revealedBeat(l.beat);
          if (!shown) return null;
          const half = l.half;
          const sideDim = half ? p.sideAlpha[half] : 1;
          const isCurStop = curStops.has(l.key);
          const isCurHost = curHosts.has(l.key);
          const color = style === "region" ? (isCurStop ? pal.regionCurrent : pal.regionFill) : style === "host" ? pal.host : style === "ghost" ? pal.ghost : pal.clay;
          return (
            <Layer
              key={l.key}
              geo={g}
              style={style}
              color={color}
              ink={style === "region" ? pal.regionOutline : pal.ink}
              planes={style === "clay" || style === "ghost" ? planes : []}
              half={half}
              current={isCurStop || isCurHost}
              hover={!!l.pick && isHover(l.pick)}
              dim={style === "ghost" ? 1 : sideDim < 0.5 ? 0.35 : 1}
              accent={p.accent}
              pickKey={l.pick}
              name={style === "region" ? shortName(l.name) : names[l.key.replace(/^h:/, "")]}
              onPick={(k) => p.onPick(k)}
              onHover={onLayerHover}
            />
          );
        })}
        {bands.map((b) => (revealedBeat(b.beat) ? <NerveBand key={b.key} pts={b.pts} color={pal.host} rim={rim} width={curHosts.has(`h:${b.key}`) ? 10 : 8} /> : null))}
        {/* no midline rectangle (owner: a thin red square on some beats): the L | R chips and the crossing marker say it */}
        {fibres.map((f) => (
          <FibreLine
            key={f.key}
            f={f}
            revealed={f.beat <= p.reveal}
            current={f.beat === curBeat}
            over={f.beat === curBeat || (!!cutAxis && zones.brain && !(zones.spine || zones.arm || zones.leg || zones.trunk))}
            alpha={p.sideAlpha[f.side] > 0.5 ? (curBeat === null || f.beat === curBeat ? 1 : 0.82) : 0.16}
            hover={p.hoverKey === f.info}
            drawS={p.data.beats[f.beat]?.L?.f.length && (p.data.beats[f.beat] as unknown as { fork?: unknown }).fork ? FORK_S : DRAW_S}
            reduced={p.reduced}
            rim={rim}
            onPick={(k) => p.onPick(k)}
            onHover={p.onHover}
          />
        ))}
        <Pulses fibres={curFibres} active={pulseOn} reduced={p.reduced} />
        {marks.map((m) => (
          <Mark
            key={m.key}
            kind={m.kind}
            p={m.p}
            dir={m.dir}
            color={m.color}
            rim={rim}
            shown={m.beat <= p.reveal}
            current={m.beat === curBeat}
            alpha={m.kind === "cross" ? 1 : p.sideAlpha[m.side] > 0.5 ? 1 : 0.18}
            reduced={p.reduced}
            info={m.info}
            onPick={(k) => p.onPick(k)}
            onHover={p.onHover}
          />
        ))}
        {fill && (stage.cut.veil || (zones.brain && !(zones.spine || zones.arm || zones.leg || zones.trunk))) && <BrainVeil geo={fill} color={pal.ghost} planes={planes} dark={p.dark} />}
        <LabelUpdater items={labelItems} dom={labelDom} enabled={p.labels && !p.multi} avoid={avoidPts} obstacleTop={92} obstacleBottom={64} />
      </Canvas>

      {/* interaction layer: one cell, or the 2x2 multi-view grid (anterior, lateral, superior, free orbit), as in Explore */}
      <div className={`absolute inset-0 ${p.multi ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-px" : ""}`}>
        {p.multi &&
          FIXED_PANES.map((pane, i) => (
            <div key={pane.id} ref={(el) => void (cellRefs.current[i] = el)} className="atl-multi-cell" style={{ touchAction: "none", cursor: "grab" }}>
              <span className="atl-ptitle-row">
                <button type="button" className="atl-ptitle" onClick={() => { p.onMulti(false); p.onView(pane.view); }} aria-label={`${pane.label} view, click to enlarge`} title="Click to enlarge">
                  {pane.label}
                </button>
                <button type="button" className="atl-ptitle" onClick={() => resetPane(i)} aria-label={`Reset ${pane.label} pan and zoom`} title="Reset pan and zoom">
                  <RotateCcw size={11} aria-hidden />
                </button>
              </span>
            </div>
          ))}
        <div ref={setMainEl} className={p.multi ? "atl-multi-cell" : "absolute inset-0"} style={{ touchAction: "none" }}>
          {p.multi && <span className="atl-ptitle pointer-events-none">Free orbit</span>}
        </div>
      </div>

      {/* gutter labels and leader lines */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <svg className="absolute inset-0 h-full w-full">
          {labelItems.map((it) => (
            <g key={it.key}>
              <line ref={(el) => void (el ? labelDom.current.lines.set(it.key, el) : labelDom.current.lines.delete(it.key))} stroke={it.color ?? "var(--text)"} strokeWidth={it.prio >= 2 ? 1.4 : 1} strokeOpacity={it.prio >= 2 ? 0.95 : 0.6} style={{ visibility: "hidden" }} />
              <circle ref={(el) => void (el ? labelDom.current.dots.set(it.key, el) : labelDom.current.dots.delete(it.key))} r={it.prio >= 2 ? 2.6 : 2} fill={it.color ?? "var(--text)"} style={{ visibility: "hidden" }} />
            </g>
          ))}
        </svg>
        {labelItems.map((it) => (
          <div
            key={it.key}
            ref={(el) => void (el ? labelDom.current.tags.set(it.key, el) : labelDom.current.tags.delete(it.key))}
            className="absolute left-0 top-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[12px] leading-tight"
            style={{
              visibility: "hidden",
              fontWeight: it.prio >= 2 ? 700 : 500,
              color: it.color ?? "var(--text)",
              background: "color-mix(in srgb, var(--bg-2, #111) 82%, transparent)",
              maxWidth: it.prio === 3 ? 260 : 180,
              // labels wrap (never truncated); the updater narrows them on small screens
              whiteSpace: "normal",
              width: "max-content",
            }}
          >
            {it.text}
          </div>
        ))}
        <div ref={(el) => void (labelDom.current.chipL = el)} className="absolute top-1/2 -translate-y-1/2 rounded-sm border border-panel-border bg-panel-solid px-1.5 py-0.5 font-mono text-[11px] font-bold text-text" style={{ left: 6 }}>
          L
        </div>
        <div ref={(el) => void (labelDom.current.chipR = el)} className="absolute top-1/2 -translate-y-1/2 rounded-sm border border-panel-border bg-panel-solid px-1.5 py-0.5 font-mono text-[11px] font-bold text-text" style={{ right: 6 }}>
          R
        </div>
      </div>
      {tip && (
        <div className="pointer-events-none absolute z-10 rounded-sm border border-panel-border bg-panel-solid px-2 py-0.5 text-xs text-text shadow-pop" style={{ left: tip.x + 12, top: tip.y + 10 }}>
          {tip.name}
        </div>
      )}
      {locked && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded-full border border-panel-border bg-panel-solid/85 px-3 py-1 font-mono text-[11px] text-text-dim" role="status">
          View locked: press Frame (F) to follow
        </div>
      )}
    </div>
  );
}

function Invalidator({ to }: { to: React.RefObject<() => void> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    (to as React.MutableRefObject<() => void>).current = invalidate;
  }, [invalidate, to]);
  return null;
}
export type { HostKey };
