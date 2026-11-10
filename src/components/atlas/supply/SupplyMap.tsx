"use client";

import "@/components/study/study.css"; // help-line, kbd, chip, choice styles
import { useCallback, useEffect, useMemo, useState } from "react";
import { Focus, Layers, Lock, Orbit, Pause, PanelRight, Play } from "lucide-react";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import type { AtlasOverlay } from "../AtlasViewer";
import { VesselLayer, type VesselState } from "./VesselLayer";
import { COMM_NOTE, COW_SLUGS, SUPP_SLUGS, slugOf, type FlowFile, type FlowSegment } from "./vessel-data";
import { trackAtlas } from "@/lib/atlas/progress";
import { LazyAtlasViewer } from "./lazy";
import { IconBtn } from "../ui/Toolbar";
import { ARTERIES, ARTERY, ARTERY_KEYS, MESH_UNIT, SUPPLY, TERRITORY_ARTERIES, artShort, unitArteries, type SupplyUnit } from "./supply-data";

type Selected = { kind: "unit"; unit: SupplyUnit } | { kind: "artery"; id: string } | null;

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-3 w-3 flex-none rounded-sm border border-panel-border" style={{ background: color }} />;
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

const INFERIOR: [number, number, number] = [0, -1, 0.02];
const LATERAL: [number, number, number] = [1, 0, 0];
/** "If this vessel is blocked": slide-level deficits only (lecture 16 slides 19, 25-26; lab 16; lecture 18 slide 26). */
const DEFICIT: Record<string, string> = {
  aca: "Contralateral leg weakness and sensory loss (lower extremity), and behavioural change (medial frontal lobe, cingulate gyrus, basal forebrain).",
  mca: "Contralateral face and arm weakness and sensory loss, speech disturbance (Broca's area) and auditory deficits. Most ischemic strokes are here: 80 % of internal carotid flow goes to the MCA.",
  pca: "Loss of vision (occipital lobe), thalamic and posterior limb of the internal capsule deficits, and damage to the inferior temporal 'what' pathway.",
  lenti: "A lacunar infarct: motor, sensory and cognitive deficits from the basal ganglia and the anterior limb of the internal capsule.",
  ica: "Often shows up as an MCA-territory stroke, because most of the internal carotid flow goes to the MCA.",
  vert: "Brainstem and cerebellar damage; blockage of the basilar artery is often fatal.",
  pontine: "Small penetrating branches: a blockage can hit cranial nerve nuclei, the reticular formation or cortical efferents in that part of the pons.",
  asa: "A spinal cord lesion of the ventral half of the cord (both sides): both ventral horns, intermediate grey and part of each dorsal horn and lateral funiculus.",
  psa: "A spinal cord lesion of a dorsal wedge on one side: much of the dorsal horn and the whole dorsal column on that side.",
};
const ARTERY_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Anterior circulation (internal carotid)", ids: ["ica", "aca", "mca", "achor", "lenti"] },
  { label: "Posterior circulation (vertebrobasilar)", ids: ["vert", "pontine", "sca", "aica", "pica", "pca", "pcomm", "asa", "psa"] },
];
const POSTERIOR_ARTS = new Set(["pca", "pcomm", "pontine", "sca", "aica", "pica", "vert", "asa", "psa"]);
const DEFAULT_SEL = ["ica", "aca", "mca", "pca", "pcomm", "pontine", "vert"];
const colorMap = new Map(ARTERIES.map((a) => [a.id, a.color]));

export function SupplyMap() {
  const [sel, setSel] = useState<Set<string>>(() => new Set(DEFAULT_SEL));
  const [cow, setCow] = useState(true);
  const [territories, setTerritories] = useState(false);
  const [vessels, setVessels] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [variant, setVariant] = useState("lab16");
  const [selected, setSelected] = useState<Selected>(null);
  const [quizOn, setQuizOn] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [flow, setFlow] = useState<FlowFile | null>(null);
  const [frame, setFrame] = useState<{ n: number; dir: [number, number, number] | null }>({ n: 1, dir: INFERIOR });
  const gate = useSupplementaryGate("supply");

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

  const stateOf = useCallback(
    (name: string, seg: FlowSegment): VesselState => {
      const slug = slugOf(name);
      if (!vessels || (SUPP_SLUGS.has(slug) && !gate.open)) return "hidden";
      if (sel.size === 0) return "idle";
      if (sel.has(seg.artery) && (!cow || COW_SLUGS.has(slug))) return "selected";
      return "faint";
    },
    [vessels, sel, cow, gate.open],
  );
  const sig = `${[...sel].sort().join(",")}|${cow}|${vessels}|${gate.open}`;

  const overlays = useMemo<AtlasOverlay[]>(() => {
    if (!territories) return [];
    const groups = new Map<string, string[]>();
    for (const u of SUPPLY.units) {
      const a = unitArteries(u, variant)[0];
      if (!sel.has(a)) continue;
      const key = u.shell ? `${a}~s` : a;
      groups.set(key, [...(groups.get(key) ?? []), ...u.meshes]);
    }
    return [...groups].map(([key, ids]) => ({ key, ids, color: ARTERY.get(key.split("~")[0])?.color ?? "#999999", opacity: key.endsWith("~s") ? 0.28 : 0.45 }));
  }, [sel, territories, variant]);

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
  const onPickVessel = useCallback((artery: string) => setSelected({ kind: "artery", id: artery }), []);

  const toggleArtery = useCallback(
    (id: string) => {
      const n = new Set(cow ? [] : sel);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      setCow(false);
      setSel(n);
      setSelected({ kind: "artery", id });
    },
    [cow, sel],
  );
  const circle = useCallback(() => {
    setCow(true);
    setSel(new Set(DEFAULT_SEL));
    setTerritories(false);
    setVessels(true);
    setSelected(null);
  }, []);
  const clear = useCallback(() => {
    setCow(false);
    setSel(new Set());
    setSelected(null);
  }, []);
  const toggleTerritories = useCallback(() => {
    setTerritories((t) => !t);
  }, []);

  useEffect(() => {
    if (quizOn) return;
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const i = ARTERY_KEYS.indexOf(k);
      if (i >= 0 && i < ARTERIES.length) toggleArtery(ARTERIES[i].id);
      else if (e.key === "Escape") clear();
      else if (k === "v") setVessels((v) => !v);
      else if (k === "m") setQuizOn(true);
      else if (k === "c") circle();
      else if (k === "f") setFrame((f) => ({ n: f.n + 1, dir: null }));
      else if (k === "p") setAnimate((a) => !a);
      else if (k === "t") toggleTerritories();
      else if (k === "d") setDrawer((d) => !d);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [quizOn, toggleArtery, clear, circle, toggleTerritories]);

  if (quizOn)
    return (
      <div className="mx-auto max-w-[1040px]">
        <SupplyQuiz onExit={() => setQuizOn(false)} />
      </div>
    );

  const plic = SUPPLY.units.find((u) => u.variants);
  const showComm = cow || sel.has("pcomm");
  return (
    <div className="relative flex h-[calc(100dvh-148px)] min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-card border border-panel-border bg-bg-2">
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-panel-border bg-panel px-2 py-1.5">
        <button type="button" className={`btn ${cow ? "btn-primary" : ""}`} aria-pressed={cow} onClick={circle} title="Inferior view of the circle of Willis, flow on (C)">
          <Orbit size={14} aria-hidden /> Circle of Willis
        </button>
        <button type="button" className="btn" aria-pressed={animate} onClick={() => setAnimate((a) => !a)} title="Flow arrows on / off (P)">
          {animate ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} Flow
        </button>
        <button type="button" className="btn" aria-pressed={territories} onClick={toggleTerritories} title="Show the territory each selected artery supplies (T)">
          <Layers size={14} aria-hidden /> Territories {territories ? "on" : "off"}
        </button>
        <button type="button" className="btn" aria-pressed={vessels} onClick={() => setVessels((v) => !v)} title="Artery meshes (V)">
          Vessels {vessels ? "on" : "off"}
        </button>
        <button type="button" className="btn" onClick={clear} title="Clear the selection (Esc)">
          Clear
        </button>
        <span className="ml-auto" />
        <button type="button" className="btn" onClick={() => setQuizOn(true)} title="Quiz (M)">
          Quiz: which artery?
        </button>
        <button type="button" className="btn" aria-pressed={drawer} onClick={() => setDrawer((d) => !d)} title="Territory list (D)">
          <PanelRight size={14} aria-hidden /> Arteries
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
            toolbarExtra={<IconBtn label="Frame the selected vessels" icon={<Focus />} onClick={() => setFrame((f) => ({ n: f.n + 1, dir: null }))} keys="F" />}
            brainOpacity={cow && !territories ? 0.035 : sel.size === 0 ? 0.28 : territories ? 0.1 : 0.12}
            overlay={
              <div className="pointer-events-none absolute bottom-16 left-2 right-2 grid max-w-[420px] gap-1 text-[11px] leading-snug text-text-dim">
                {cow && (
                  <p className="rounded-sm border border-panel-border bg-panel-solid/90 px-2 py-1">
                    <strong className="text-text">Circle of Willis, seen from below.</strong> Arrows show blood flow: ICA to ACA and MCA; vertebral to basilar to PCA.
                  </p>
                )}
                {showComm && <p className="hidden rounded-sm border border-panel-border bg-panel-solid/90 px-2 py-1 xl:block">{COMM_NOTE}</p>}
              </div>
            }
          >
            <VesselLayer flow={flow} colors={colorMap} stateOf={stateOf} sig={sig} animate={animate} labelSlugs={cow ? COW_SLUGS : null} onPick={onPickVessel} frame={frame} pad={territories ? 0.03 : 0} />
          </LazyAtlasViewer>
        </div>

        <aside
          className={`${drawer ? "flex" : "hidden"} absolute inset-0 z-30 min-h-0 flex-col gap-3 overflow-y-auto bg-panel-solid p-3 lg:static lg:inset-auto lg:z-auto lg:w-[340px] lg:flex-none lg:border-l lg:border-panel-border`}
          aria-label="Arteries"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Arterial territories</h2>
            <button type="button" className="btn ml-auto lg:hidden" onClick={() => setDrawer(false)}>
              Close
            </button>
          </div>
          <div className="grid gap-1" aria-label="Arteries">
            {ARTERY_GROUPS.map((g) => (
              <div key={g.label} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-text-faint">{g.label}</p>
                {g.ids.map((id) => {
                  const a = ARTERY.get(id);
                  if (!a) return null;
                  const on = sel.has(a.id);
                  const i = ARTERIES.findIndex((x) => x.id === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleArtery(a.id)}
                      className={`flex w-full min-w-0 items-center gap-2 rounded-sm border px-2 py-1 text-left text-sm ${on ? "border-accent text-text" : "border-transparent text-text-dim hover:border-panel-border-hi"}`}
                    >
                      <Swatch color={a.color} />
                      <span className="truncate">{a.name}</span>
                      <span className="kbd ml-auto flex-none">{ARTERY_KEYS[i]}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCow(false);
                setSel(new Set(ARTERIES.map((a) => a.id)));
              }}
            >
              All on
            </button>
            <button type="button" className="btn" onClick={clear}>
              All off
            </button>
          </div>
          <p className="text-xs text-text-faint">
            Selected arteries are solid and carry moving arrows (proximal to distal). Turn on Territories to see what each supplies, see-through in the same colour; everything else fades back. The anterior choroidal artery has no mesh in the atlas; its territory is still coloured.
          </p>

          <div className="grid gap-1.5">
            {gate.asking ? (
              <SupplementaryHeadsUp what="Small cortical branches (orbitofrontal, temporal, parietal, central and precentral sulcus, frontal callosomarginal, PCA cortical)" onConfirm={gate.confirm} onCancel={gate.cancel} />
            ) : (
              <button type="button" className="btn justify-start" aria-pressed={gate.open} onClick={() => (gate.open ? gate.lock() : gate.request())}>
                <Lock size={14} aria-hidden /> {gate.open ? "Hide" : "Show"} small cortical branches (beyond the slides)
              </button>
            )}
          </div>

          {plic && (
            <div className="grid gap-2">
              <h2 className="font-display text-sm uppercase tracking-wider text-text-dim">Open question: {SUPPLY.decisions[0]?.title}</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Reading of the posterior limb of the internal capsule">
                {plic.variants!.map((v) => (
                  <button key={v.id} type="button" aria-pressed={variant === v.id} onClick={() => setVariant(v.id)} className={`btn ${variant === v.id ? "btn-primary" : ""}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-dim">{SUPPLY.decisions[0]?.text}</p>
            </div>
          )}

          <InfoPanel selected={selected} variant={variant} onUnit={(u) => setSelected({ kind: "unit", unit: u })} />
          <p className="help-line">
            <span>
              <span className="kbd">1</span>-<span className="kbd">r</span> toggle an artery
            </span>
            <span>
              <span className="kbd">c</span> circle
            </span>
            <span>
              <span className="kbd">p</span> flow, <span className="kbd">f</span> frame
            </span>
            <span>
              <span className="kbd">t</span> territories
            </span>
            <span>
              <span className="kbd">v</span> vessels
            </span>
            <span>
              <span className="kbd">m</span> quiz
            </span>
            <span>
              <span className="kbd">Esc</span> clear
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}

function InfoPanel({ selected, variant, onUnit }: { selected: Selected; variant: string; onUnit: (u: SupplyUnit) => void }) {
  if (!selected) {
    return (
      <div className="panel text-sm text-text-dim" aria-live="polite">
        Click a coloured structure or an artery in the 3D view, or an artery in the legend.
      </div>
    );
  }
  if (selected.kind === "artery") {
    const a = ARTERY.get(selected.id);
    if (!a) return null;
    const primary = SUPPLY.units.filter((u) => unitArteries(u, variant)[0] === a.id);
    const also = SUPPLY.units.filter((u) => unitArteries(u, variant).slice(1).includes(a.id));
    return (
      <div className="panel grid gap-2" aria-live="polite">
        <h2 className="flex items-center gap-2 font-display text-base text-accent">
          <Swatch color={a.color} />
          {a.name}
        </h2>
        <p className="text-sm">{a.territory}</p>
        {DEFICIT[a.id] && (
          <p className="rounded-sm border border-again/40 bg-again/5 px-2 py-1 text-sm">
            <span className="eyebrow text-again">If blocked </span>
            {DEFICIT[a.id]}
          </p>
        )}
        {FLOW_TEXT[a.id] && (
          <p className="text-sm text-text-dim">
            <span className="eyebrow">Blood flow </span>
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
          <span className="eyebrow">Course note </span>
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
    </div>
  );
}

/* ---------- quiz: which artery supplies this? ---------- */
type Q = { unit: SupplyUnit; picked: string | null };

function SupplyQuiz({ onExit }: { onExit: () => void }) {
  const pool = useMemo(() => SUPPLY.units.filter((u) => !u.variants && u.arteries[0] !== "ica" && !u.shell), []);
  const [order, setOrder] = useState(() => shuffle(pool));
  const [i, setI] = useState(0);
  const [q, setQ] = useState<Q>({ unit: order[0], picked: null });
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(0);

  const answer = useCallback(
    (id: string) => {
      if (q.picked) return;
      setQ({ ...q, picked: id });
      setDone((d) => d + 1);
      if (q.unit.arteries.includes(id)) setRight((r) => r + 1);
      trackAtlas({ type: "supply_answer", slug: q.unit.slug ?? "", correct: q.unit.arteries.includes(id), artery: id });
    },
    [q],
  );
  const next = useCallback(() => {
    let o = order;
    let n = i + 1;
    if (n >= o.length) {
      o = shuffle(pool);
      setOrder(o);
      n = 0;
    }
    setI(n);
    setQ({ unit: o[n], picked: null });
  }, [order, i, pool]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (q.picked) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          next();
        }
        return;
      }
      const k = ARTERY_KEYS.indexOf(e.key.toLowerCase());
      if (k >= 0 && k < TERRITORY_ARTERIES.length) answer(TERRITORY_ARTERIES[k].id);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [q.picked, answer, next, onExit]);

  const u = q.unit;
  const correct = q.picked ? u.arteries.includes(q.picked) : null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
        <span>question {done + (q.picked ? 0 : 1)}</span>
        <span className="text-good">
          {right} / {done} correct
        </span>
        <button type="button" className="btn ml-auto" onClick={onExit}>
          Back to the map
        </button>
      </div>
      <LazyAtlasViewer key={u.name} structureIds={u.meshes} mode="focus" label={q.picked ? u.name : ""} quiz={!q.picked} height={480} />
      <div className="panel grid gap-3">
        <p className="text-sm text-text-dim">Which artery supplies the highlighted structure?</p>
        <div className="choice-grid">
          {TERRITORY_ARTERIES.map((a, k) => {
            const isRight = !!q.picked && u.arteries.includes(a.id);
            const isPicked = q.picked === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={!!q.picked}
                onClick={() => answer(a.id)}
                className={`choice-btn flex items-center gap-2 ${isPicked ? "picked" : ""} ${isRight ? "border-good" : isPicked ? "border-again" : ""}`}
              >
                <span className="kbd flex-none">{ARTERY_KEYS[k]}</span>
                <span>{a.name}</span>
              </button>
            );
          })}
        </div>
        {q.picked && (
          <div className="grid gap-1.5" aria-live="polite">
            <p className={correct ? "text-good" : "text-again"}>
              {correct ? (u.arteries[0] === q.picked ? "Correct." : "Correct (a secondary supply).") : "Not quite."} {u.name}: {artShort(u.arteries)}.
            </p>
            {u.course && <p className="text-sm text-text-dim">Course note: {u.course}</p>}
            {u.note && <p className="text-sm text-text-dim">{u.note}</p>}
            <div>
              <button type="button" className="btn btn-primary" onClick={next}>
                Next <span className="kbd">Enter</span>
              </button>
            </div>
          </div>
        )}
        <p className="help-line">
          <span>
            <span className="kbd">1</span>-<span className="kbd">e</span> answer
          </span>
          <span>
            <span className="kbd">Enter</span> next
          </span>
          <span>
            <span className="kbd">Esc</span> back
          </span>
        </p>
      </div>
    </div>
  );
}
