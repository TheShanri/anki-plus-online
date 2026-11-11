"use client";

import "@/components/study/study.css"; // help-line, kbd, chip, choice styles
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Focus, Lock, PanelRight, Pause, Play, RotateCcw } from "lucide-react";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import type { AtlasOverlay } from "../AtlasViewer";
import { VesselLayer, type SegStyle } from "./VesselLayer";
import { TerritorySurface, type TerritoryShow } from "./TerritorySurface";
import { VeinLayer } from "./VeinLayer";
import { MarginLabels, createLabelBus, type LabelBus } from "./margin-labels";
import { COMM_NOTE, COW_SLUGS, SEG_SHORT, SUPP_SLUGS, slugOf, type FlowFile, type FlowSegment } from "./vessel-data";
import { trackAtlas } from "@/lib/atlas/progress";
import { LazyAtlasViewer } from "./lazy";
import { IconBtn } from "../ui/Toolbar";
import { DeficitIcons } from "../pathways/deficits";
import { SupplyQuiz } from "./SupplyQuiz";
import { ARTERY_STRUCTURE, BLEEDS, BLOCKABLE, BLOCK_LIST, OCCLUSION, OCCLUSION_NAME, TOUR, VEIN_STEPS, type Occlusion } from "./supply-guide";
import { ARTERIES, ARTERY, ARTERY_KEYS, MESH_UNIT, SUPPLY, artShort, unitArteries, type SupplyUnit } from "./supply-data";

type Mode = "explore" | "tour" | "block" | "veins" | "bleeds";
const MODES: { id: Mode; label: string; short: string }[] = [
  { id: "explore", label: "Explore", short: "Explore" },
  { id: "tour", label: "Follow the blood", short: "Follow" },
  { id: "block", label: "Block a vessel", short: "Block" },
  { id: "veins", label: "Drainage", short: "Drain" },
  { id: "bleeds", label: "Bleeds", short: "Bleeds" },
];
type Selected = { kind: "unit"; unit: SupplyUnit } | { kind: "artery"; id: string } | null;
type ViewId = "inferior" | "left" | "midsagittal";

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-3 w-3 flex-none rounded-full border border-panel-border" style={{ background: color }} />;
}

const FLOW_TEXT: Record<string, string> = {
  ica: "Blood runs up the neck and through the carotid canal to the carotid terminus, where it feeds the ACA and MCA (and, by the PComm, can reach the PCA).",
  vert: "Both vertebrals run up the neck and join at the pontomedullary junction to form the basilar artery.",
  pontine: "Vertebral to basilar to PCA. The pontine branches leave the basilar on the way up.",
  aca: "ICA to ACA (A1), across the AComm junction, then up and back along the corpus callosum as the pericallosal artery (A2).",
  mca: "ICA to MCA (M1), out through the lateral fissure, then insular (M2) and cortical (M3) branches fan over the convexity.",
  pca: "The basilar divides into the two PCAs (P1, P2), which curve back around the midbrain to the occipital lobe.",
  pcomm: COMM_NOTE,
  lenti: "Small penetrating branches leave the MCA (M1) and run up through the anterior perforated substance.",
  sca: "Basilar to SCA, around the upper pons to the top of the cerebellum.",
  aica: "Basilar to AICA, to the anterior inferior cerebellum.",
  pica: "Vertebral to PICA, around the medulla to the inferior cerebellum.",
  asa: "Both vertebrals give a branch that joins into one anterior spinal artery running down the cord.",
};

const ARTERY_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Anterior circulation", ids: ["ica", "aca", "mca", "achor", "lenti"] },
  { label: "Posterior circulation", ids: ["vert", "pontine", "sca", "aica", "pica", "pca", "pcomm", "asa", "psa"] },
];
const DEFAULT_SEL = ["ica", "aca", "mca", "pca", "pcomm", "pontine", "vert"];
const colorMap = new Map(ARTERIES.map((a) => [a.id, a.color]));
/** What a selected artery supplies, for the territory layers (the ICA feeds the ACA and MCA). */
const terrOf = (a: string) => (a === "ica" ? ["aca", "mca"] : [a]);
const HIDDEN: SegStyle = { mode: "hidden", flow: false };
const FAINT: SegStyle = { mode: "faint", flow: false };
const BLOCK_RED = "#d1495b";
const VEIN_BLUE = "#4f7cc4";
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "inferior", label: "Inferior" },
  { id: "left", label: "Lateral" },
  { id: "midsagittal", label: "Medial" },
];
/** Mesh ids of the dural sinuses drawn in the drainage layer, by step id. */
const SINUS_MESH: Record<string, string[]> = {
  sss: ["superior-sagittal-sinus"],
  straight: ["straight-sinus"],
  transverse: ["transverse-sinus"],
  sigmoid: ["sigmoid-sinus"],
};
const SLUG_ARTERY = (() => {
  const m = new Map<string, string>(Object.entries(BLOCKABLE));
  m.set("acom", "aca");
  m.set("pcom", "pcomm");
  m.set("basilar", "pontine");
  return m;
})();

/** Groups the units supplied by the given arteries into overlays (one per artery; shells fainter). */
const CORTEX_END = SUPPLY.units.findIndex((u) => u.name === "Corpus callosum");
/** Cortical units are drawn by the soft territory skin; the viewer overlays only draw the deep structures. */
function territoryOverlays(arteries: Set<string>, variant: string, opts: { opacity: number; shell: number; color?: string; side?: "L" | "R"; keyPrefix: string }): AtlasOverlay[] {
  const groups = new Map<string, string[]>();
  for (const [ui, u] of SUPPLY.units.entries()) {
    if (ui < CORTEX_END) continue;
    const a = unitArteries(u, variant)[0];
    if (!arteries.has(a)) continue;
    const key = u.shell ? `${a}~s` : a;
    groups.set(key, [...(groups.get(key) ?? []), ...u.meshes]);
  }
  return [...groups].map(([key, ids]) => ({
    key: `${opts.keyPrefix}${key}`,
    ids,
    color: opts.color ?? ARTERY.get(key.split("~")[0])?.color ?? "#999999",
    opacity: key.endsWith("~s") ? opts.shell : opts.opacity,
    side: opts.side,
  }));
}

function stamp() {
  const w = window as unknown as { __supplyT0?: number; __supplyFirst?: number };
  w.__supplyT0 = performance.now();
  w.__supplyFirst = undefined;
}

export function SupplyMap() {
  const [mode, setMode] = useState<Mode>("explore");
  const [sel, setSel] = useState<Set<string>>(() => new Set(DEFAULT_SEL));
  const [cow, setCow] = useState(true);
  const [territories, setTerritories] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [variant, setVariant] = useState("lab16");
  const [selected, setSelected] = useState<Selected>(null);
  const [quizOn, setQuizOn] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [flow, setFlow] = useState<FlowFile | null>(null);
  const [frame, setFrame] = useState<{ n: number; dir: [number, number, number] | null }>({ n: 1, dir: [0, -1, 0.02] });
  const [request, setRequest] = useState<{ n: number; view?: ViewId } | null>(null);
  const [step, setStep] = useState(0);
  const [vstep, setVstep] = useState(0);
  const [blocked, setBlocked] = useState<string | null>(null); // segment name, e.g. "ica.l"
  const [hover, setHover] = useState<string | null>(null);
  /** Medial view: the left hemisphere is cut away (viewer cut at the midline) and seen from the left. */
  const [medial, setMedial] = useState(false);
  const gate = useSupplementaryGate("supply");
  const noMesh = useMemo(() => {
    if (!flow) return new Set<string>();
    const has = new Set(Object.values(flow.segments).map((x) => x.artery));
    return new Set(ARTERIES.map((a) => a.id).filter((id) => !has.has(id)));
  }, [flow]);
  const bus = useMemo<LabelBus>(() => createLabelBus(), []);
  const veinBus = useMemo<LabelBus>(() => createLabelBus(), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.matchMedia("(max-width: 1023px)").matches) setDrawer(false);
    let alive = true;
    fetch("/atlas/arteries-flow.json")
      .then((r) => r.json())
      .then((j: FlowFile) => alive && setFlow(j))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // ---- what is drawn, per mode
  const tourSlugs = useMemo(() => {
    const cur = new Set(TOUR[step].slugs);
    const past = new Set(TOUR.slice(0, step).flatMap((s) => s.slugs));
    return { cur, past };
  }, [step]);

  const blockInfo = useMemo(() => {
    if (!blocked || !flow) return null;
    const seg = flow.segments[blocked];
    if (!seg) return null;
    const artery = BLOCKABLE[slugOf(blocked)];
    const occ = artery ? OCCLUSION[artery] : undefined;
    if (!occ) return null;
    return { name: blocked, seg, artery, occ, reroute: occ.reroute?.(seg.side) ?? [] };
  }, [blocked, flow]);

  const starved = useMemo(() => {
    const out = new Set<string>();
    if (!blockInfo || !flow) return out;
    for (const [n, s] of Object.entries(flow.segments)) {
      let p = s.parent;
      let guard = 0;
      while (p && guard++ < 12) {
        if (p === blockInfo.name) {
          out.add(n);
          break;
        }
        p = flow.segments[p]?.parent ?? null;
      }
    }
    return out;
  }, [blockInfo, flow]);

  const styleOf = useCallback(
    (name: string, seg: FlowSegment): SegStyle => {
      const slug = slugOf(name);
      if (SUPP_SLUGS.has(slug) && !gate.open) return HIDDEN;
      if (medial && seg.side === "l") return HIDDEN;
      switch (mode) {
        case "explore": {
          if (sel.size === 0) return { mode: "idle", flow: false };
          const on = sel.has(seg.artery) && (!cow || COW_SLUGS.has(slug));
          return on ? { mode: "solid", flow: true } : FAINT;
        }
        case "tour":
          return tourSlugs.cur.has(slug) || tourSlugs.past.has(slug) ? { mode: "solid", flow: true } : FAINT;
        case "block": {
          if (name === blocked) return { mode: "blocked", flow: false };
          if (starved.has(name)) return { mode: "starved", flow: false };
          const rr = blockInfo?.reroute.find((r) => r.slug === slug && (r.side === seg.side || r.side === "m"));
          if (rr) return { mode: "solid", flow: true, dir: rr.dir, hot: true };
          // communicating arteries carry little flow while the pressures are equal: no pulses until a vessel is blocked
          if (seg.flow === "both") return { mode: "idle", flow: false };
          return { mode: "idle", flow: true };
        }
        default:
          return HIDDEN;
      }
    },
    [mode, sel, cow, gate.open, tourSlugs, blocked, starved, blockInfo, medial],
  );
  const labelOf = useCallback(
    (name: string, seg: FlowSegment): string | null => {
      const slug = slugOf(name);
      const t = SEG_SHORT[slug];
      if (!t) return null;
      if (mode === "block") {
        if (name === blocked) return `${t} (blocked)`;
        return blockInfo?.reroute.some((r) => r.slug === slug && (r.side === seg.side || r.side === "m")) ? t : null;
      }
      if (mode === "tour") return tourSlugs.cur.has(slug) ? t : null;
      return t;
    },
    [mode, blocked, blockInfo, tourSlugs],
  );
  const sig = `${medial ? "m" : ""}|${mode}|${[...sel].sort().join(",")}|${cow}|${gate.open}|${step}|${blocked ?? ""}`;
  const circle = (mode === "explore" && cow) || mode === "tour" || mode === "block";

  // ---- territories as overlays
  const overlays = useMemo<AtlasOverlay[]>(() => {
    if (mode === "explore" || mode === "tour") {
      const show = new Set<string>();
      if (mode === "explore" && territories && !cow) sel.forEach((a) => terrOf(a).forEach((t) => show.add(t)));
      if (mode === "tour") (TOUR[step].territory ?? []).forEach((a) => show.add(a));
      const out = territoryOverlays(show, variant, { opacity: 0.42, shell: 0.26, keyPrefix: "t:" });
      if (hover && !show.has(hover) && hover !== "ica") out.push(...territoryOverlays(new Set([hover]), variant, { opacity: 0.3, shell: 0.18, keyPrefix: "h:" }));
      return out;
    }
    if (mode === "block" && blockInfo) {
      const side = blockInfo.seg.side === "l" ? "L" : blockInfo.seg.side === "r" ? "R" : undefined;
      return territoryOverlays(new Set(blockInfo.occ.territory), variant, { opacity: 0.4, shell: 0.25, color: BLOCK_RED, side, keyPrefix: "b:" });
    }
    if (mode === "veins") {
      const ids = new Set(VEIN_STEPS.slice(0, vstep + 1).flatMap((s) => s.ids));
      const out: AtlasOverlay[] = [];
      for (const [id, meshes] of Object.entries(SINUS_MESH)) if (ids.has(id)) out.push({ key: `v:${id}`, ids: meshes, color: VEIN_BLUE, opacity: VEIN_STEPS[vstep].ids.includes(id) ? 0.95 : 0.7 });
      return out;
    }
    return [];
  }, [mode, sel, territories, cow, variant, step, hover, blockInfo, vstep]);

  // cortical territories (soft skin): which arteries, how strongly, and in which colours
  const { terr, terrColors, terrSide } = useMemo(() => {
    const show: TerritoryShow[] = [];
    let cols = colorMap;
    let side: "L" | "R" | undefined;
    if (mode === "explore" && territories && !cow) sel.forEach((a) => terrOf(a).forEach((t) => show.push({ artery: t, alpha: 1 })));
    if (mode === "tour") (TOUR[step].territory ?? []).forEach((a) => show.push({ artery: a, alpha: 1 }));
    if ((mode === "explore" || mode === "tour") && hover && !show.some((s) => s.artery === hover)) show.push({ artery: hover, alpha: 0.5 });
    if (mode === "block" && blockInfo) {
      blockInfo.occ.territory.forEach((a) => show.push({ artery: a, alpha: 1 }));
      cols = new Map(["aca", "mca", "pca"].map((a) => [a, BLOCK_RED]));
      side = blockInfo.seg.side === "l" ? "L" : blockInfo.seg.side === "r" ? "R" : undefined;
    }
    if (medial) side = "R";
    return { terr: show, terrColors: cols, terrSide: side };
  }, [mode, sel, territories, cow, step, hover, blockInfo, medial]);

  const veinIds = useMemo(() => (mode === "veins" ? new Set(VEIN_STEPS.slice(0, vstep + 1).flatMap((x) => x.ids)) : new Set<string>()), [mode, vstep]);
  const veinCurrent = useMemo(() => (mode === "veins" ? VEIN_STEPS[vstep].ids : []), [mode, vstep]);

  const boOverride = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("bo")) : 0;
  // a matte brain with visible gyri and a crisp edge (about 0.55), so the territory skin and the vessels read on it; the sinuses sit outside it
  const brainOpacity = boOverride > 0 ? boOverride : mode === "veins" ? 0.32 : 0.55;

  const tipText = useCallback(
    (id: string, name: string) => {
      const u = MESH_UNIT.get(id);
      return u ? `${name}: ${artShort(unitArteries(u, variant))}` : name;
    },
    [variant],
  );
  const onPick = useCallback((id: string) => {
    const u = MESH_UNIT.get(id);
    if (u) setSelected({ kind: "unit", unit: u });
  }, []);

  const track = useCallback((slug: string) => trackAtlas({ type: "structure_viewed", slug, via: "3d" }), []);
  const onPickVessel = useCallback(
    (artery: string, name: string) => {
      stamp();
      if (mode === "block") {
        if (BLOCKABLE[slugOf(name)]) {
          setBlocked(name);
          trackAtlas({ type: "supply_occlusion", artery: BLOCKABLE[slugOf(name)] });
        }
        return;
      }
      setSelected({ kind: "artery", id: artery });
      if (ARTERY_STRUCTURE[artery]) track(ARTERY_STRUCTURE[artery]);
    },
    [mode, track],
  );

  const blockSeg = useCallback((name: string) => {
    stamp();
    setBlocked(name);
    trackAtlas({ type: "supply_occlusion", artery: BLOCKABLE[slugOf(name)] ?? name });
  }, []);

  const toggleArtery = useCallback(
    (id: string) => {
      stamp();
      const n = new Set(cow ? [] : sel);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      setCow(false);
      setSel(n);
      setSelected({ kind: "artery", id });
      if (ARTERY_STRUCTURE[id]) track(ARTERY_STRUCTURE[id]);
    },
    [cow, sel, track],
  );
  const circleView = useCallback(() => {
    stamp();
    setMode("explore");
    setCow(true);
    setSel(new Set(DEFAULT_SEL));
    setTerritories(false);
    setSelected(null);
    setFrame((f) => ({ n: f.n + 1, dir: [0, -1, 0.02] }));
  }, []);
  const clear = useCallback(() => {
    if (mode === "block") {
      setBlocked(null);
      return;
    }
    stamp();
    setMode("explore");
    setCow(false);
    setSel(new Set());
    setSelected(null);
  }, [mode]);
  const goMode = useCallback((m: Mode) => {
    stamp();
    setMode(m);
    if (m === "tour") {
      setStep(0);
      trackAtlas({ type: "supply_tour_step", step: 1 });
    }
    if (m === "veins") {
      setVstep(0);
      trackAtlas({ type: "supply_drainage_step", step: 1 });
    }
    if (m === "bleeds") trackAtlas({ type: "supply_bleeds_opened" });
    if (m === "block") setBlocked(null);
    // switching mode is a deliberate change of scene: fit the new content once (selections never move the camera)
    setFrame((f) => ({ n: f.n + 1, dir: m === "explore" ? [0, -1, 0.02] : null }));
  }, []);
  const gotoStep = useCallback((i: number) => {
    stamp();
    const n = Math.max(0, Math.min(TOUR.length - 1, i));
    setStep(n);
    trackAtlas({ type: "supply_tour_step", step: n + 1 });
  }, []);
  const gotoV = useCallback((i: number) => {
    stamp();
    const n = Math.max(0, Math.min(VEIN_STEPS.length - 1, i));
    setVstep(n);
    trackAtlas({ type: "supply_drainage_step", step: n + 1 });
  }, []);
  const askView = useCallback((view: ViewId) => {
    setMedial(view === "midsagittal");
    setRequest((r) => ({ n: (r?.n ?? 0) + 1, view: view === "midsagittal" ? "left" : view }));
  }, []);

  useEffect(() => {
    if (quizOn) return;
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (mode === "tour" && (e.key === "ArrowRight" || e.key === "Enter")) return gotoStep(step + 1);
      if (mode === "tour" && e.key === "ArrowLeft") return gotoStep(step - 1);
      if (mode === "veins" && (e.key === "ArrowRight" || e.key === "Enter")) return gotoV(vstep + 1);
      if (mode === "veins" && e.key === "ArrowLeft") return gotoV(vstep - 1);
      const i = ARTERY_KEYS.indexOf(k);
      if (mode === "explore" && i >= 0 && i < ARTERIES.length) toggleArtery(ARTERIES[i].id);
      else if (e.key === "Escape") clear();
      else if (k === "m") setQuizOn(true);
      else if (k === "c") circleView();
      else if (k === "f") setFrame((f) => ({ n: f.n + 1, dir: null }));
      else if (k === "p") setAnimate((a) => !a);
      else if (k === "t" && mode === "explore") setTerritories((t) => !t);
      else if (k === "d") setDrawer((d) => !d);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [quizOn, mode, step, vstep, toggleArtery, clear, circleView, gotoStep, gotoV]);

  if (quizOn)
    return (
      <div className="mx-auto max-w-[1040px]">
        <SupplyQuiz onExit={() => setQuizOn(false)} />
      </div>
    );

  const showComm = mode === "explore" && (cow || sel.has("pcomm"));
  const caption = mode === "tour" ? TOUR[step] : mode === "veins" ? VEIN_STEPS[vstep] : null;
  return (
    <div className="relative flex h-[calc(100dvh-148px)] min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-card border border-panel-border bg-bg-2">
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-panel-border bg-panel px-2 py-1.5">
        <div role="tablist" aria-label="Blood supply modes" className="flex flex-none gap-1 max-sm:gap-0.5">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={`btn flex-none max-sm:!px-2.5 ${mode === m.id ? "btn-primary" : ""}`} onClick={() => goMode(m.id)}>
              <span className="sm:hidden">{m.short}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto" />
        <button type="button" className="btn flex-none" aria-pressed={animate} onClick={() => setAnimate((a) => !a)} title="Blood flow on / off (P)">
          {animate ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} Flow
        </button>
        <button type="button" className="btn flex-none" onClick={() => setQuizOn(true)} title="Quiz (M)">
          Quiz
        </button>
        <button type="button" className="btn flex-none" aria-pressed={drawer} onClick={() => setDrawer((d) => !d)} title="Panel (D)">
          <PanelRight size={14} aria-hidden /> Panel
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <LazyAtlasViewer
            structureIds={[]}
            mode="context"
            label=""
            height="100%"
            className="!rounded-none !border-0"
            overlays={overlays}
            hideLabels
            pickMode="mesh"
            tipText={tipText}
            onPickMesh={onPick}
            view="inferior"
            request={request}
            cut={medial ? { axis: "x", position: 0 } : undefined}
            toolbarExtra={<IconBtn label="Frame the shown vessels" icon={<Focus />} onClick={() => setFrame((f) => ({ n: f.n + 1, dir: null }))} keys="F" />}
            brainOpacity={brainOpacity}
            overlay={
              <div className="pointer-events-none absolute inset-0">
                <MarginLabels bus={bus} />
                <MarginLabels bus={veinBus} />
                {caption && (
                  <div className="pointer-events-auto absolute left-2 right-2 top-2 rounded-card border border-panel-border bg-panel-solid/95 px-3 py-2 text-[13px] leading-snug shadow-sm lg:hidden">
                    <strong className="text-text">{caption.title}.</strong> <span className="text-text-dim">{caption.text}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <button type="button" className="btn" onClick={() => (mode === "tour" ? gotoStep(step - 1) : gotoV(vstep - 1))} aria-label="Previous step">
                        <ChevronLeft size={14} aria-hidden />
                      </button>
                      <span className="font-mono text-xs text-text-dim">
                        {(mode === "tour" ? step : vstep) + 1} / {mode === "tour" ? TOUR.length : VEIN_STEPS.length}
                      </span>
                      <button type="button" className="btn btn-primary" onClick={() => (mode === "tour" ? gotoStep(step + 1) : gotoV(vstep + 1))}>
                        Next <ChevronRight size={14} aria-hidden />
                      </button>
                    </span>
                  </div>
                )}
                <div className="pointer-events-auto absolute bottom-16 left-2 flex gap-1" role="group" aria-label="Camera view">
                  {VIEWS.map((v) => (
                    <button key={v.id} type="button" className="btn !px-2 !py-1 text-xs" onClick={() => askView(v.id)}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            <TerritorySurface show={terr} colors={terrColors} variant={variant} side={terrSide} />
            <VeinLayer ids={veinIds} current={veinCurrent} animate={animate} bus={veinBus} />
            <VesselLayer
              flow={flow}
              colors={colorMap}
              styleOf={styleOf}
              sig={sig}
              animate={animate}
              labelOf={labelOf}
              bus={bus}
              circle={circle}
              onPick={onPickVessel}
              onHover={setHover}
              frame={frame}
              pad={territories || mode === "tour" ? 0.03 : 0}
              topInset={caption ? 104 : 18}
            />
          </LazyAtlasViewer>
        </div>

        <aside
          className={`${drawer ? "flex" : "hidden"} absolute inset-0 z-30 min-h-0 flex-col gap-3 overflow-y-auto bg-panel-solid p-3 lg:static lg:inset-auto lg:z-auto lg:w-[350px] lg:flex-none lg:border-l lg:border-panel-border`}
          aria-label="Blood supply panel"
        >
          <div className="flex items-center gap-2 lg:hidden">
            <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">{MODES.find((m) => m.id === mode)?.label}</h2>
            <button type="button" className="btn ml-auto" onClick={() => setDrawer(false)}>
              Close
            </button>
          </div>

          {mode === "explore" && (
            <ExplorePanel
              sel={sel}
              cow={cow}
              territories={territories}
              onToggle={toggleArtery}
              onCircle={circleView}
              onClear={clear}
              onAll={() => {
                stamp();
                setCow(false);
                setSel(new Set(ARTERIES.map((a) => a.id)));
              }}
              onTerritories={() => setTerritories((t) => !t)}
              gate={gate}
              variant={variant}
              setVariant={setVariant}
              selected={selected}
              onUnit={(u) => setSelected({ kind: "unit", unit: u })}
              showComm={showComm}
              noMesh={noMesh}
              onHover={setHover}
            />
          )}
          {mode === "tour" && <TourPanel step={step} goto={gotoStep} askView={askView} />}
          {mode === "block" && <BlockPanel info={blockInfo} blocked={blocked} onClear={() => setBlocked(null)} onBlock={blockSeg} />}
          {mode === "veins" && <VeinPanel step={vstep} goto={gotoV} />}
          {mode === "bleeds" && <BleedsPanel />}

          <p className="help-line mt-auto">
            <span>
              <span className="kbd">f</span> frame
            </span>
            <span>
              <span className="kbd">p</span> flow
            </span>
            {mode === "explore" && (
              <>
                <span>
                  <span className="kbd">1</span>-<span className="kbd">r</span> artery
                </span>
                <span>
                  <span className="kbd">t</span> territories
                </span>
                <span>
                  <span className="kbd">c</span> circle
                </span>
              </>
            )}
            {(mode === "tour" || mode === "veins") && (
              <span>
                <span className="kbd">&larr;</span> <span className="kbd">&rarr;</span> step
              </span>
            )}
            <span>
              <span className="kbd">Esc</span> clear
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- panels ---------------- */

function StudyLink({ artery }: { artery: string }) {
  const slug = ARTERY_STRUCTURE[artery];
  if (!slug) return null;
  return (
    <Link className="btn" href={`/study/run?scope=${encodeURIComponent(`structure:${slug}`)}`}>
      Study these cards
    </Link>
  );
}

function ExplorePanel(p: {
  sel: Set<string>;
  cow: boolean;
  territories: boolean;
  onToggle: (id: string) => void;
  onCircle: () => void;
  onClear: () => void;
  onAll: () => void;
  onTerritories: () => void;
  gate: ReturnType<typeof useSupplementaryGate>;
  variant: string;
  setVariant: (v: string) => void;
  selected: Selected;
  onUnit: (u: SupplyUnit) => void;
  showComm: boolean;
  noMesh: Set<string>;
  onHover: (id: string | null) => void;
}) {
  const plic = SUPPLY.units.find((u) => u.variants);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={`btn ${p.cow ? "btn-primary" : ""}`} aria-pressed={p.cow} onClick={p.onCircle} title="Inferior view of the circle of Willis (C)">
          Circle of Willis
        </button>
        <button type="button" className="btn" aria-pressed={p.territories} onClick={p.onTerritories} title="Show the territory each selected artery supplies (T)">
          Territories {p.territories ? "on" : "off"}
        </button>
        <button type="button" className="btn" onClick={p.onAll}>
          All
        </button>
        <button type="button" className="btn" onClick={p.onClear} title="Clear (Esc)">
          None
        </button>
      </div>
      <div className="grid gap-0.5" aria-label="Arteries">
        {ARTERY_GROUPS.map((g) => (
          <div key={g.label} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-text-faint">{g.label}</p>
            {g.ids.map((id) => {
              const a = ARTERY.get(id);
              if (!a) return null;
              const on = p.sel.has(a.id);
              const i = ARTERIES.findIndex((x) => x.id === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => p.onToggle(a.id)}
                  onMouseEnter={() => p.onHover(a.id)}
                  onMouseLeave={() => p.onHover(null)}
                  onFocus={() => p.onHover(a.id)}
                  onBlur={() => p.onHover(null)}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-sm border px-2 py-1 text-left text-[13px] ${on ? "border-accent text-text" : "border-transparent text-text-dim hover:border-panel-border-hi"}`}
                >
                  <Swatch color={a.color} />
                  <span className="truncate">{a.name}</span>
                  {p.noMesh.has(a.id) && <span className="flex-none rounded-sm border border-panel-border px-1 text-[10px] text-text-faint" title="The model has no vessel mesh for this artery; its territory is still shown">no 3D vessel</span>}
                  <span className="kbd ml-auto flex-none">{ARTERY_KEYS[i]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-text-faint">
        Selected arteries are solid with pulses running the way the blood flows. Turn on Territories to see what each supplies; everything else fades back. Arteries marked &ldquo;no 3D vessel&rdquo; have no mesh in the model; their territory is still coloured.
      </p>
      {p.showComm && <p className="rounded-sm border border-panel-border px-2 py-1.5 text-xs text-text-dim">{COMM_NOTE}</p>}

      <InfoPanel selected={p.selected} variant={p.variant} onUnit={p.onUnit} />

      <div className="grid gap-1.5">
        {p.gate.asking ? (
          <SupplementaryHeadsUp what="Small cortical branches (orbitofrontal, temporal, parietal, central and precentral sulcus, frontal callosomarginal, PCA cortical)" onConfirm={p.gate.confirm} onCancel={p.gate.cancel} />
        ) : (
          <button type="button" className="btn justify-start" aria-pressed={p.gate.open} onClick={() => (p.gate.open ? p.gate.lock() : p.gate.request())}>
            <Lock size={14} aria-hidden /> {p.gate.open ? "Hide" : "Show"} small cortical branches (beyond the slides)
          </button>
        )}
      </div>

      {plic && (
        <div className="grid gap-2">
          <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Open question: {SUPPLY.decisions[0]?.title}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reading of the posterior limb of the internal capsule">
            {plic.variants!.map((v) => (
              <button key={v.id} type="button" aria-pressed={p.variant === v.id} onClick={() => p.setVariant(v.id)} className={`btn ${p.variant === v.id ? "btn-primary" : ""}`}>
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-dim">{SUPPLY.decisions[0]?.text}</p>
        </div>
      )}
    </>
  );
}

function StepCard({ n, total, title, text, src, onPrev, onNext, extra }: { n: number; total: number; title: string; text: string; src: string; onPrev: () => void; onNext: () => void; extra?: React.ReactNode }) {
  return (
    <div className="panel grid gap-2" aria-live="polite">
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < n ? "bg-accent" : "bg-panel-border"}`} />
        ))}
      </div>
      <p className="eyebrow">
        Step {n} of {total}
      </p>
      <h2 className="font-display text-base text-accent">{title}</h2>
      <p className="text-sm">{text}</p>
      {extra}
      <p className="text-xs text-text-faint">{src}</p>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={onPrev} disabled={n <= 1}>
          <ChevronLeft size={14} aria-hidden /> Back
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={n >= total}>
          Next <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TourPanel({ step, goto, askView }: { step: number; goto: (i: number) => void; askView: (v: ViewId) => void }) {
  const s = TOUR[step];
  const shown = useMemo(() => {
    const ids = new Set<string>();
    for (const t of TOUR.slice(0, step + 1)) for (const sl of t.slugs) {
      const a = SLUG_ARTERY.get(sl);
      if (a) ids.add(a);
    }
    return [...ids];
  }, [step]);
  const viewLabel = s.view === "lateral" ? "lateral" : s.view === "medial" ? "medial" : "inferior";
  const viewId: ViewId = s.view === "lateral" ? "left" : s.view === "medial" ? "midsagittal" : "inferior";
  return (
    <>
      <StepCard
        n={step + 1}
        total={TOUR.length}
        title={s.title}
        text={s.text}
        src={s.src}
        onPrev={() => goto(step - 1)}
        onNext={() => goto(step + 1)}
        extra={
          s.view ? (
            <button type="button" className="btn justify-self-start" onClick={() => askView(viewId)}>
              Show the {viewLabel} view
            </button>
          ) : null
        }
      />
      <ColourKey ids={shown} />
      {step === TOUR.length - 1 && (
        <button type="button" className="btn justify-self-start" onClick={() => goto(0)}>
          <RotateCcw size={14} aria-hidden /> Start again
        </button>
      )}
    </>
  );
}

function ColourKey({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-dim" aria-label="Colour key">
      {ids.map((id) => {
        const a = ARTERY.get(id);
        return a ? (
          <li key={id} className="flex items-center gap-1.5">
            <Swatch color={a.color} />
            {a.short}
          </li>
        ) : null;
      })}
    </ul>
  );
}

function BlockPicker({ blocked, onBlock }: { blocked: string | null; onBlock: (name: string) => void }) {
  return (
    <div className="grid gap-1" role="group" aria-label="Choose a vessel to block">
      {BLOCK_LIST.map((v) => (
        <div key={v.seg} className="flex items-center gap-1.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate text-text-dim">{v.label}</span>
          {(v.sided ? ["l", "r"] : [""]).map((sd) => {
            const name = sd ? `${v.seg}.${sd}` : v.seg;
            const on = blocked === name;
            return (
              <button key={name} type="button" aria-pressed={on} className={`btn !px-2 !py-0.5 text-xs ${on ? "btn-primary" : ""}`} onClick={() => onBlock(name)}>
                {sd ? sd.toUpperCase() : "Block"}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BlockPanel({ info, blocked, onClear, onBlock }: { info: { name: string; seg: FlowSegment; artery: string; occ: Occlusion } | null; blocked: string | null; onClear: () => void; onBlock: (name: string) => void }) {
  if (!info) {
    return (
      <div className="panel grid gap-2" aria-live="polite">
        <h2 className="font-display text-base text-accent">Block a vessel</h2>
        <p className="text-sm">{blocked ? "That vessel is not one the slides teach as a site of blockage." : "Click an artery in the 3D view to block it. Its territory dims, and the slides' consequences appear here."}</p>
        <BlockPicker blocked={blocked} onBlock={onBlock} />
        <p className="text-xs text-text-faint">The anterior and posterior communicating arteries carry little flow while the pressures are equal; they light up when a main vessel is blocked.</p>
      </div>
    );
  }
  const a = ARTERY.get(info.artery);
  const side = info.seg.side === "l" ? "Left " : info.seg.side === "r" ? "Right " : "";
  return (
    <div className="panel grid gap-2.5" aria-live="polite">
      <h2 className="flex items-center gap-2 font-display text-base text-accent">
        <Swatch color={BLOCK_RED} />
        {side}
        {OCCLUSION_NAME[info.artery] ?? a?.name ?? info.name} blocked
      </h2>
      <div className="rounded-sm border border-again/40 bg-again/5 px-2 py-1.5 text-sm">
        <strong className="block font-semibold text-again">What the slides predict.</strong> 
        <span className="mt-1 flex items-start gap-2">
          <DeficitIcons text={info.occ.deficit} />
          <span>{info.occ.deficit}</span>
        </span>
      </div>
      <p className="text-sm text-text-dim">
        <strong className="font-semibold text-text">Collateral flow.</strong> 
        {info.occ.collateral}
      </p>
      <div className="flex flex-wrap gap-2">
        <StudyLink artery={info.artery === "basilar" ? "pontine" : info.artery} />
        <button type="button" className="btn" onClick={onClear}>
          Unblock
        </button>
      </div>
      <BlockPicker blocked={blocked} onBlock={onBlock} />
      <p className="text-xs text-text-faint">Or click a vessel in the 3D view. Pulses on the communicating arteries show the direction the blood would take.</p>
    </div>
  );
}

function VeinPanel({ step, goto }: { step: number; goto: (i: number) => void }) {
  const s = VEIN_STEPS[step];
  return (
    <>
      <StepCard n={step + 1} total={VEIN_STEPS.length} title={s.title} text={s.text} src={s.src} onPrev={() => goto(step - 1)} onNext={() => goto(step + 1)} />
      <div className="text-xs text-text-dim">
        <p className="flex items-center gap-1.5">
          <Swatch color={VEIN_BLUE} /> Dural sinuses, between the meningeal and periosteal layers of the dura.
        </p>
        <p className="mt-1">Path: deep and superficial cerebral veins, dural sinuses, internal jugular vein, heart.</p>
      </div>
      <Link className="btn justify-self-start" href={`/study/run?scope=${encodeURIComponent("structure:dural-venous-sinuses")}`}>
        Study these cards
      </Link>
    </>
  );
}

const BLEED_VIEW: Record<string, string> = { Epidural: "epidural-space", Subdural: "subdural-space", Subarachnoid: "subarachnoid-space" };
function BleedsPanel() {
  return (
    <div className="panel grid gap-2.5">
      <h2 className="font-display text-base text-accent">Where each bleed sits</h2>
      <p className="text-sm text-text-dim">From the skull inwards: skull, dura (the epidural space lies outside it), the subdural space, arachnoid, the subarachnoid space (CSF and the cerebral vessels), then the brain.</p>
      <ul className="grid gap-2">
        {BLEEDS.map((b) => (
          <li key={b.name} className="rounded-sm border border-panel-border px-2 py-1.5 text-sm">
            <p className="flex flex-wrap items-baseline gap-2">
              <strong>{b.name}</strong>
              <span className={`text-[11px] uppercase tracking-wider ${b.stroke ? "text-again" : "text-text-faint"}`}>{b.stroke ? "stroke" : "not a stroke"}</span>
              {BLEED_VIEW[b.name] && (
                <Link className="ml-auto text-xs text-accent underline-offset-2 hover:underline" href={`/atlas?s=${BLEED_VIEW[b.name]}`}>
                  See it in Explore
                </Link>
              )}
            </p>
            <p className="text-text-dim">
              {b.vessel}. {b.where}. {b.shape}.
            </p>
            <p className="text-xs text-text-faint">{b.note}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-faint">Lecture 18, slides 8-19. The meningeal layers are drawn in the Explore atlas.</p>
    </div>
  );
}

function InfoPanel({ selected, variant, onUnit }: { selected: Selected; variant: string; onUnit: (u: SupplyUnit) => void }) {
  if (!selected) {
    return (
      <div className="panel text-sm text-text-dim" aria-live="polite">
        Click a vessel or a coloured structure in the 3D view, or an artery in the list.
      </div>
    );
  }
  if (selected.kind === "artery") {
    const a = ARTERY.get(selected.id);
    if (!a) return null;
    const primary = SUPPLY.units.filter((u) => unitArteries(u, variant)[0] === a.id);
    const also = SUPPLY.units.filter((u) => unitArteries(u, variant).slice(1).includes(a.id));
    const occ = OCCLUSION[a.id];
    return (
      <div className="panel grid gap-2" aria-live="polite">
        <h2 className="flex items-center gap-2 font-display text-base text-accent">
          <Swatch color={a.color} />
          {a.name}
        </h2>
        <p className="text-sm">{a.territory}</p>
        {occ && (
          <p className="flex items-start gap-2 rounded-sm border border-again/40 bg-again/5 px-2 py-1 text-sm">
            <DeficitIcons text={occ.deficit} />
            <span>
              <strong className="font-semibold text-again">If blocked.</strong> 
              {occ.deficit}
            </span>
          </p>
        )}
        {FLOW_TEXT[a.id] && (
          <p className="text-sm text-text-dim">
            <strong className="font-semibold text-text">Blood flow.</strong> 
            {FLOW_TEXT[a.id]}
          </p>
        )}
        {primary.length > 0 && (
          <div>
            <p className="eyebrow">Main supply of</p>
            <p className="flex flex-wrap gap-1.5 pt-1">
              {primary.map((u) => (
                <button key={u.name} type="button" className="chip hover:border-panel-border-hi" onClick={() => onUnit(u)}>
                  {u.name}
                </button>
              ))}
            </p>
          </div>
        )}
        {also.length > 0 && (
          <div>
            <p className="eyebrow">Also contributes to</p>
            <p className="flex flex-wrap gap-1.5 pt-1">
              {also.map((u) => (
                <button key={u.name} type="button" className="chip hover:border-panel-border-hi" onClick={() => onUnit(u)}>
                  {u.name}
                </button>
              ))}
            </p>
          </div>
        )}
        <StudyLink artery={a.id} />
      </div>
    );
  }
  const u = selected.unit;
  const arts = unitArteries(u, variant);
  return (
    <div className="panel grid gap-2" aria-live="polite">
      <h2 className="font-display text-base text-accent">{u.name}</h2>
      <p className="flex flex-wrap gap-1.5">
        {arts.map((id, i) => {
          const a = ARTERY.get(id)!;
          return (
            <span key={id} className="chip flex items-center gap-1.5" style={{ color: "var(--text)" }}>
              <Swatch color={a.color} />
              {a.name}
              {i === 0 && arts.length > 1 ? " (main)" : ""}
            </span>
          );
        })}
      </p>
      {u.course && (
        <p className="text-sm">
          <strong className="font-semibold text-text">Course note.</strong> 
          {u.course}
        </p>
      )}
      {u.note && <p className="text-sm text-text-dim">{u.note}</p>}
      {u.variants && (
        <ul className="grid gap-1 text-sm">
          {u.variants.map((v) => (
            <li key={v.id} className={v.id === variant ? "text-text" : "text-text-dim"}>
              <strong>{v.label}</strong>: {artShort(v.arteries)}
            </li>
          ))}
        </ul>
      )}
      {u.slug && (
        <Link className="btn justify-self-start" href={`/study/run?scope=${encodeURIComponent(`structure:${u.slug}`)}`}>
          Study these cards
        </Link>
      )}
    </div>
  );
}
