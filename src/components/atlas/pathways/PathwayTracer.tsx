"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Focus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Pause, Play, Route, Workflow, X } from "lucide-react";
import {
  ORDINAL,
  PATHWAY_MAP,
  SITES,
  autoKeys,
  checkTyped,
  neuronForCard,
  type CoursePathway,
  type MapPathway,
  type PathwayCard,
  type Side,
} from "@/lib/atlas/pathways";
import { trackAtlas } from "@/lib/atlas/progress";
import { PathwayViewer } from "./PathwayViewer";
import { VIEWS, type View } from "./PathwayScene";
import { useSceneColors } from "./sceneTheme";
import { BodyIcon, Collapsible, IconButton, Segmented } from "./controls";
import { PathwayPicker, type PickerGroup, type PickerHandle } from "./PathwayPicker";
import { DeficitIcons, DeficitLegend } from "./deficits";
import { Supplementary } from "@/components/supplementary/Supplementary";
import { CalcarineDiagram, FieldDiagram, fieldPalette } from "./visualField";
import { ORIGINS, alphaOf, buildBeatScene, primaryOf, type LimbChoice, type SideMode } from "./buildPathwayScene";
import { Schematic } from "./Schematic";
import { ReceptorLens } from "./ReceptorLens";
import { useFullscreen } from "./useFullscreen";
import { AtlasLoader, stagesFrom } from "@/components/atlas/ui/AtlasLoader";
import { shade } from "./visualField";

/* The pathway tracer: pick a pathway, see both sides in separate lanes (left solid, right dashed), step through the
 * 1st, 2nd and 3rd-order neurons or play an impulse along the whole route, with the body part (or the eyes) where the signal starts. */

const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Ascending (sensory)", slugs: ["dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain"] },
  { title: "Descending (motor)", slugs: ["lcst", "acst", "corticobulbar", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn"] },
  { title: "Special senses", slugs: ["visual", "cochlear", "vestibular", "solitary", "olfactory"] },
  { title: "Reflexes", slugs: ["stretch-reflex", "withdrawal-reflex", "jaw-jerk", "pupillary", "corneal", "gaze"] },
  { title: "Cerebellum and basal ganglia", slugs: ["corticopontocerebellar", "cerebellar", "basal-ganglia"] },
  { title: "Autonomic and limbic", slugs: ["sympathetic", "parasympathetic", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward"] },
];
/** What "left / right" means for each pathway (the segmented control reads "Left <noun>"). */
const SIDE_NOUN: Record<string, string> = {
  cochlear: "ear",
  vestibular: "ear",
  "stretch-reflex": "limb",
  "withdrawal-reflex": "limb",
  visual: "field",
  pupillary: "eye",
  cerebellar: "cerebellum",
  corticopontocerebellar: "cerebellum",
  "basal-ganglia": "body",
  lcst: "limb",
  acst: "limb",
  corticobulbar: "face",
  rubrospinal: "limb",
  tectospinal: "limb",
  "umn-lmn": "limb",
  vestibulospinal: "limb",
  reticulospinal: "limb",
  "trigeminal-discriminative": "face",
  "trigeminal-pain": "face",
};
const sideNoun = (slug: string) => SIDE_NOUN[slug] ?? "body";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Question {
  prompt: string;
  answer: string;
  keys: string[];
  options: string[];
}

function buildQuestion(slug: string, step: number, courses: CoursePathway[]): Question | null {
  const mp = PATHWAY_MAP[slug];
  const cp = courses.find((c) => c.slug === slug);
  if (!mp || !cp || step >= mp.neurons.length) return null;
  let prompt: string;
  let answer: string;
  let keys: string[];
  let pool: string[];
  if (step === 0) {
    const n = mp.neurons[0];
    prompt = "Where is the cell body of the 1st-order neuron?";
    answer = n.short;
    keys = [...autoKeys(cp.neurons[0].cell_body), ...autoKeys(n.short)];
    pool = Object.values(PATHWAY_MAP).map((p) => p.neurons[0]?.short);
  } else {
    const prev = mp.neurons[step - 1];
    prompt = `What comes next? Where do the ${ORDINAL[step]}-order axons synapse (the cell body of the next neuron)?`;
    answer = prev.syn ?? cp.neurons[step - 1].synapse;
    keys = prev.synKeys?.length ? prev.synKeys : autoKeys(cp.neurons[step - 1].synapse);
    pool = Object.values(PATHWAY_MAP).flatMap((p) => p.neurons.map((n) => n.syn ?? ""));
  }
  const bad = [...new Set(pool.filter((x) => x && x !== answer && !checkTyped(x, keys)))].sort((a, b) => hash(slug + step + a) - hash(slug + step + b)).slice(0, 3);
  const options = [answer, ...bad].sort((a, b) => hash(step + slug + a) - hash(step + slug + b));
  return { prompt, answer, keys, options };
}

/** The course says just "internal capsule"; "posterior limb" is the textbook detail, so it sits behind the Supplementary gate. */
function withGate(label: string) {
  // text between ‹ and › is beyond the slides (a named nerve for a receptor, a textbook level): it sits behind the gate
  if (label.includes("‹")) {
    return (
      <>
        {label.split(/(‹[^›]*›)/).map((part, i) =>
          part.startsWith("‹") ? (
            <Supplementary key={i} section="pathways" title="Textbook detail" inline>
              {part.slice(1, -1)}
            </Supplementary>
          ) : (
            part
          ),
        )}
      </>
    );
  }
  const i = label.indexOf(", posterior limb");
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <Supplementary section="pathways" title="Textbook detail" inline>
        , posterior limb
      </Supplementary>
      {label.slice(i + ", posterior limb".length)}
    </>
  );
}

/** Lesion sites named after a syndrome or eponym are beyond the slides: their names sit behind the gate. */
const NAMED_SITE = /syndrome|locked-in|wallenberg|weber|brown|parkinson|huntington|ballism|chorea|syrinx|pica\b|medial medullary|lateral medullary|brown-s/i;
const meaningful = (s?: string) => !!s && !/^\s*(n\/a|none|not stated|not taught|see specific)/i.test(s) && s.trim().length > 1;

type Answered = Record<string, "right" | "wrong">;

export function PathwayTracer({
  courses,
  cards,
  initial,
}: {
  courses: CoursePathway[];
  cards: PathwayCard[];
  initial: { p?: string; side?: string; step?: string };
}) {
  const bySlug = useMemo(() => new Map(courses.map((c) => [c.slug, c])), [courses]);
  const groups = useMemo<PickerGroup[]>(
    () =>
      GROUPS.map((g) => ({
        title: g.title,
        items: g.slugs.filter((s) => bySlug.has(s) && PATHWAY_MAP[s]).map((s) => ({ slug: s, name: bySlug.get(s)!.name, hint: PATHWAY_MAP[s].quality === "partial" ? "approximate" : undefined })),
      })).filter((g) => g.items.length),
    [bySlug],
  );
  const [slug, setSlug] = useState(initial.p && bySlug.has(initial.p) && PATHWAY_MAP[initial.p] ? initial.p : "dcml");
  const [sideMode, setSideMode] = useState<SideMode>(initial.side === "L" ? "L" : initial.side === "R" ? "R" : "both");
  const [step, setStep] = useState(Math.max(0, Number(initial.step) || 0));
  const [all, setAll] = useState(false);
  const [limbPart, setLimbPart] = useState<LimbChoice>("hand");
  const [quiz, setQuiz] = useState(false);
  const [answered, setAnswered] = useState<Answered>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; q: Question } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [userView, setUserView] = useState<View | null>(null);
  const [follow, setFollow] = useState(true);
  const [frameNonce, setFrameNonce] = useState(0);
  const [ready, setReady] = useState(false);
  const [load, setLoad] = useState({ done: 0, total: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [schemOpen, setSchemOpen] = useState(true);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const { attach: attachFs, fs: isFs, toggle: toggleFs, can: canFs } = useFullscreen(() => setFrameNonce((x) => x + 1));
  const [reduced, setReduced] = useState(false);
  const colors = useSceneColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<PickerHandle>(null);
  const visited = useRef(new Set<number>());
  const completed = useRef(new Set<string>());

  const cp = bySlug.get(slug)!;
  const mp: MapPathway = PATHWAY_MAP[slug];
  const n = mp.neurons.length;
  const noun = sideNoun(slug);
  const cfg = ORIGINS[slug];
  const isVisual = !!mp.visual;

  // everything for the pathway is built once, here, while the loader shows: a click only animates what exists
  const bs = useMemo(() => buildBeatScene({ mp, cp, slug, colors, limbPart }), [mp, cp, slug, colors, limbPart]);
  const B = bs.beats.length;
  useEffect(() => {
    // read by tools/pathways/vet.mjs
    (window as unknown as { __pwBeats?: unknown }).__pwBeats = { slug, beats: bs.beats.map(({ kind, neuron, caption, cross, info, phys, rel, branch }) => ({ kind, neuron, caption, cross: !!cross, info, phys, rel, branch: !!branch })) };
  }, [bs.beats, slug]);
  const cur = Math.max(0, Math.min(step, B - 1));
  const beat = bs.beats[cur];
  const curBeat: number | null = all ? null : cur;

  // quiz: "what comes next?" gates the arrival at each synapse (the last path of a neuron) and the first node
  const qMap = useMemo(() => {
    const m = new Map<number, number>();
    m.set(0, 0);
    for (let s = 1; s < n; s++) {
      let last = -1;
      bs.beats.forEach((b, i) => {
        if (b.kind === "path" && b.neuron === s - 1) last = i;
      });
      if (last >= 0) m.set(last, s);
    }
    return m;
  }, [bs.beats, n]);
  const qStep = qMap.get(cur);
  const qKey = `${slug}:${qStep}`;
  const question = useMemo(() => (quiz && !all && qStep !== undefined ? buildQuestion(slug, qStep, courses) : null), [quiz, all, qStep, slug, courses]);
  const gated = !!question && !answered[qKey];
  const reveal = all ? B - 1 : gated ? cur - 1 : cur;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReduced(mq.matches || document.documentElement.dataset.effects === "off");
    upd();
    mq.addEventListener("change", upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-effects"] });
    return () => {
      mq.removeEventListener("change", upd);
      mo.disconnect();
    };
  }, []);

  const resetStepUi = useCallback(() => {
    setPicked(null);
    setTyped("");
    setFeedback(null);
  }, []);
  const go = useCallback(
    (d: number) => {
      setAll(false);
      setStep((s) => Math.max(0, Math.min(B - 1, s + d)));
      resetStepUi();
    },
    [B, resetStepUi],
  );
  const goTo = useCallback(
    (i: number) => {
      setAll(false);
      setStep(Math.max(0, Math.min(B - 1, i)));
      resetStepUi();
    },
    [B, resetStepUi],
  );
  const choose = useCallback(
    (s: string) => {
      setSlug(s);
      setStep(0);
      setAll(false);
      setPlaying(false);
      setUserView(null);
      setOpenInfo(null);
      setHoverInfo(null);
      resetStepUi();
      setReady(false);
      setLoad({ done: 0, total: 0 });
      visited.current = new Set();
    },
    [resetStepUi],
  );

  useEffect(() => {
    // lets tools/pathways/vet.mjs switch pathway without reloading the page (the 3D parts stay cached)
    (window as unknown as { __pwChoose?: (s: string) => void }).__pwChoose = (s: string) => {
      (window as unknown as { __pwDebug?: unknown }).__pwDebug = null;
      choose(s);
    };
  }, [choose]);

  // url state
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("p", slug);
    u.searchParams.set("side", sideMode);
    u.searchParams.set("step", String(cur));
    window.history.replaceState(null, "", u);
  }, [slug, sideMode, cur]);

  /* ----- progress: a pathway counts as done when every beat was seen (stepped or played) ----- */
  useEffect(() => {
    if (all || !ready) return;
    visited.current.add(cur);
    if (cur === B - 1 && visited.current.size >= B && !completed.current.has(slug)) {
      completed.current.add(slug);
      const mine = Object.entries(answered).filter(([k]) => k.startsWith(slug + ":"));
      trackAtlas({
        type: "pathway_completed",
        pathway: slug,
        ...(mine.length ? { quizCorrect: mine.filter(([, v]) => v === "right").length, quizTotal: mine.length } : {}),
      });
    }
  }, [cur, B, slug, answered, all, ready]);

  /* ----- play: one beat after another ----- */
  const togglePlay = useCallback(() => {
    if (quiz) return;
    setPlaying((p) => {
      if (!p && (all || cur >= B - 1)) {
        setAll(false);
        setStep(0);
      }
      return !p;
    });
  }, [quiz, all, cur, B]);
  useEffect(() => {
    if (!playing || quiz) return;
    const t = setInterval(
      () => {
        setStep((s) => {
          if (s >= B - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      },
      reduced ? 1400 : 1700,
    );
    return () => clearInterval(t);
  }, [playing, quiz, B, reduced]);

  const submit = useCallback(
    (text: string, viaOption: boolean) => {
      if (!question || answered[qKey]) return;
      const ok = viaOption ? text === question.answer : checkTyped(text, question.keys);
      setAnswered((a) => ({ ...a, [qKey]: ok ? "right" : "wrong" }));
      setFeedback({ ok, q: question });
    },
    [question, answered, qKey],
  );

  const cycleSide = useCallback(() => setSideMode((m) => (m === "L" ? "R" : m === "R" ? "both" : "L")), []);
  const effView: View = userView ?? (all ? "top" : (beat?.view ?? "anterior"));

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!gated) go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === " " && !quiz) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "q" || e.key === "Q") setQuiz((v) => !v);
      else if (e.key === "v" || e.key === "V") setUserView(VIEWS[(VIEWS.findIndex((x) => x.id === effView) + 1) % VIEWS.length].id);
      else if (e.key === "f" || e.key === "F") setFrameNonce((x) => x + 1);
      else if (e.key === "s" || e.key === "S") cycleSide();
      else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        pickerRef.current?.open();
      } else if (e.key === "Escape") setOpenInfo(null);
      else if (gated && /^[1-4]$/.test(e.key) && question) {
        const o = question.options[Number(e.key) - 1];
        if (o) {
          setPicked(o);
          submit(o, true);
        }
      } else if (gated && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, gated, quiz, question, submit, togglePlay, cycleSide, effView]);

  /* ---------- scene props ---------- */
  const pal = useMemo(() => fieldPalette(colors.left, colors.right), [colors.left, colors.right]);
  const zoneColors = useMemo(() => [shade(colors.hi, 0.1), shade(colors.hi, -0.15), shade(colors.hi, -0.4)], [colors.hi]);
  const allFit = useMemo(() => bs.beats.flatMap((b) => b.fit), [bs.beats]);
  const fit = follow && !all && beat ? beat.fit : allFit;
  const sideAlpha = useMemo(() => ({ L: alphaOf(sideMode, "L"), R: alphaOf(sideMode, "R") }), [sideMode]);
  const onLimbPick = useCallback((s: Side) => {
    setSideMode(s);
    setAll(false);
    setStep(0);
    setPlaying(true);
  }, []);
  const onPickInfo = useCallback((k: string | null) => setOpenInfo(k), []);

  /* ---------- panel data ---------- */
  const ni = beat?.neuron ?? 0;
  const neuron = cp.neurons[ni];
  const mapN = mp.neurons[ni];
  const decIdx = cp.neurons.findIndex((x) => x.decussates);
  const stepCards = useMemo(() => cards.filter((c) => c.pathway === slug), [cards, slug]);
  const cardsFor = useCallback((neuronNo: number) => stepCards.filter((c) => neuronForCard(c, cp) === neuronNo), [stepCards, cp]);
  const lesionSites = useMemo(() => {
    const zones = new Set(mp.neurons.flatMap((x) => x.stretches.filter((s) => !s.noLesion).flatMap((s) => s.zones ?? [])));
    return SITES.filter((s) => s.zones.some((z) => zones.has(z))).slice(0, 6);
  }, [mp]);
  const primary = primaryOf(sideMode);
  const lossStretch = mapN?.stretches.find((s) => s.loss) ?? null;
  const loss = lossStretch?.loss ?? mp.loss;
  const topic = stepCards[0] ? (cards.find((c) => c.pathway === slug && c.topic)?.topic ?? null) : null;
  const caption = all ? `The whole route: ${B} beats, ${n} neurons${meaningful(cp.decussation) ? `. Crossing: ${cp.decussation}` : ""}.` : (beat?.caption ?? "");
  const stepOptions = [
    ...mp.neurons.map((_, i) => ({ id: String(i), label: `${ORDINAL[i + 1]}${answered[`${slug}:${i}`] === "right" ? " ✓" : ""}`, tip: `${ORDINAL[i + 1]}-order neuron: ${cp.neurons[i]?.cell_body ?? ""}` })),
    { id: "all", label: "All", tip: "The whole pathway" },
  ];
  const firstBeatOf = useCallback((neuronIdx: number) => Math.max(0, bs.beats.findIndex((b) => b.neuron === neuronIdx)), [bs.beats]);
  const sideWord = (s: Side) => `${s === "L" ? "Left" : "Right"} ${noun}`;
  const info = openInfo ? bs.infos[openInfo] : null;
  const infoCards = info ? cardsFor(info.neuron + 1) : [];

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-132px)] lg:min-h-[640px] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <PathwayPicker ref={pickerRef} groups={groups} value={slug} onChange={choose} />
          <Segmented
            big
            label={`Which side of the ${noun}`}
            value={sideMode}
            onChange={setSideMode}
            options={[
              { id: "L", label: sideWord("L"), tip: `${sideWord("L")}: the other side dims`, keys: "S", icon: <BodyIcon fill="L" />, color: colors.left },
              { id: "both", label: "Both", tip: "Both sides", keys: "S", icon: <BodyIcon fill="both" /> },
              { id: "R", label: sideWord("R"), tip: `${sideWord("R")}: the other side dims`, keys: "S", icon: <BodyIcon fill="R" />, color: colors.right },
            ]}
          />
        </div>
        {cfg?.parts && cfg.parts.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span>Signal starts in the</span>
            <Segmented
              label="Body part"
              value={limbPart}
              onChange={setLimbPart}
              options={[
                { id: "hand", label: "Hand (arm)", tip: "Arm: fasciculus cuneatus" },
                { id: "foot", label: "Foot (leg)", tip: "Leg: fasciculus gracilis" },
              ]}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          {/* the flowchart: collapses on phones */}
          <div className="flex-none lg:w-[236px]">
            <button type="button" aria-expanded={schemOpen} onClick={() => setSchemOpen((o) => !o)} className="mb-1 flex w-full items-center gap-1.5 rounded-sm border border-panel-border px-2 py-1 text-left text-xs font-semibold text-text lg:hidden">
              <Workflow size={14} aria-hidden />
              Schematic
              <span className="ml-auto text-text-dim">{schemOpen ? "hide" : "show"}</span>
            </button>
            <div className={`${schemOpen ? "block" : "hidden"} max-h-[34dvh] overflow-y-auto rounded-card border border-panel-border bg-bg-2 p-1.5 lg:block lg:h-full lg:max-h-none`}>
              <p className="mb-1 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-wider text-text-faint max-lg:hidden">
                <Workflow size={12} aria-hidden /> Schematic
              </p>
              <Schematic beats={bs.beats} cur={curBeat} reveal={reveal} hoverKey={hoverInfo} onHover={setHoverInfo} onPick={onPickInfo} reduced={reduced} sideAlpha={sideAlpha} />
            </div>
          </div>

          <div ref={attachFs} className="relative min-h-[380px] flex-1 overflow-hidden rounded-card border border-panel-border bg-bg-2 max-lg:h-[60dvh] max-lg:flex-none [&:fullscreen]:!h-screen [&:fullscreen]:!min-h-0 [&:fullscreen]:!w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
            <PathwayViewer
              layers={bs.layers}
              tubes={bs.tubes}
              marks={bs.marks}
              fit={fit}
              limbs={bs.limbs}
              eyes={bs.eyes}
              anatomy={bs.anatomy}
              zoneColors={zoneColors}
              reveal={reveal}
              hot={curBeat}
              sideAlpha={sideAlpha}
              reduced={reduced}
              hoverInfo={hoverInfo}
              onHoverInfo={setHoverInfo}
              onPickInfo={onPickInfo}
              onLimbPick={onLimbPick}
              tags
              view={effView}
              frameNonce={frameNonce}
              colors={colors}
              onReady={setReady}
              onLoad={(done, total) => setLoad({ done, total })}
            />
            {!ready && (
              <AtlasLoader
                label="Placing the pathway"
                progress={load.total ? load.done / load.total : undefined}
                stages={stagesFrom([
                  ["index", "Opening the atlas", load.total > 0, undefined],
                  ["structures", "Placing the structures and body parts", false, load.total ? `${load.done} / ${load.total}` : undefined],
                ])}
              />
            )}
            <Legend colors={colors} visual={isVisual} />
            <div data-label-obstacle className="absolute right-2 top-2 flex items-center gap-1.5">
              <Segmented label="View" value={effView} onChange={setUserView} options={VIEWS.map((v) => ({ id: v.id, label: v.label, tip: `${v.label} view`, keys: "V" }))} />
              <IconButton label="Re-frame" keys="F" icon={<Focus size={16} />} onClick={() => setFrameNonce((x) => x + 1)} tip="bottom" />
              {canFs && <IconButton label={isFs ? "Leave full screen" : "Full screen"} icon={isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />} pressed={isFs} onClick={toggleFs} tip="bottom" />}
              <IconButton label={panelOpen ? "Hide the side panel" : "Show the side panel"} icon={panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} pressed={panelOpen} onClick={() => setPanelOpen((o) => !o)} tip="bottom" />
            </div>
            {info && openInfo && (
              <div data-label-obstacle className="absolute left-2 top-2 z-10 max-h-[70%] w-[min(330px,calc(100%-16px))] overflow-y-auto rounded-card border border-panel-border bg-panel-solid/95 p-3 text-sm shadow-lg" role="dialog" aria-label={info.title}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">{info.kind === "node" ? "Structure" : "Tract"}</p>
                    <h3 className="font-display text-base leading-tight">{withGate(info.title)}</h3>
                  </div>
                  <IconButton label="Close" keys="Esc" icon={<X size={15} />} onClick={() => setOpenInfo(null)} size={28} />
                </div>
                <dl className="mt-2 grid gap-1.5">
                  {info.lines.filter(([, v]) => meaningful(v)).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-xs text-text-faint">{k}</dt>
                      <dd className="min-w-0 text-[13px]">{withGate(v)}</dd>
                    </div>
                  ))}
                </dl>
                {meaningful(info.crossing) && (
                  <p className="mt-2 rounded-sm border px-2 py-1 text-[13px]" style={{ borderColor: colors.hi }}>
                    <span className="text-xs text-text-faint">Crossing </span>
                    {info.crossing}
                  </p>
                )}
                {info.loss && (
                  <p className="mt-2 flex items-start gap-2 text-[13px]">
                    <DeficitIcons text={info.loss} size={15} />
                    <span>
                      <span className="text-xs text-text-faint">If damaged </span>loss of {info.loss.replace(/\s*\([^)]*\)/g, "")}
                    </span>
                  </p>
                )}
                {infoCards.length > 0 && (
                  <div className="mt-2 grid gap-1">
                    {infoCards.slice(0, 3).map((c) => (
                      <details key={c.slug} className="rounded-sm border border-panel-border px-2 py-1 text-[13px]">
                        <summary className="cursor-pointer">{c.prompt}</summary>
                        <p className="mt-1 text-text-dim">{c.answer}</p>
                      </details>
                    ))}
                  </div>
                )}
                {topic && (
                  <Link href={`/study/run?scope=topic:${topic}`} className="btn mt-2 no-underline" style={{ justifySelf: "start" }}>
                    Study these cards
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="Previous beat" keys="←" icon={<ChevronLeft size={18} />} onClick={() => go(-1)} disabled={cur === 0 && !all} />
            <IconButton label={playing ? "Pause" : "Play: beat after beat"} keys="Space" icon={playing ? <Pause size={17} /> : <Play size={17} />} onClick={togglePlay} disabled={quiz} pressed={playing} tone="primary" />
            <IconButton label="Next beat" keys="→" icon={<ChevronRight size={18} />} onClick={() => go(1)} disabled={all || gated || cur >= B - 1} />
          </div>
          <Segmented
            label="Neuron"
            value={all ? "all" : String(ni)}
            onChange={(v) => {
              if (v === "all") {
                setAll(true);
                setPlaying(false);
              } else goTo(firstBeatOf(Number(v)));
            }}
            options={stepOptions}
          />
          <span className="font-mono text-[11px] text-text-faint" aria-live="off">{all ? "all" : `${cur + 1} / ${B}`}</span>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Camera follows the beat" icon={<Route size={16} />} pressed={follow} onClick={() => setFollow((f) => !f)} />
            <IconButton
              label="Quiz: what comes next?"
              keys="Q"
              icon={<CircleHelp size={16} />}
              pressed={quiz}
              onClick={() => {
                setQuiz((v) => !v);
                setPlaying(false);
              }}
            />
          </div>
        </div>
        <p className="rounded-sm border border-panel-border bg-panel-solid/60 px-3 py-2 text-sm leading-snug" aria-live="polite">
          <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-text-faint">{all ? "Whole" : beat?.kind === "node" ? "Structure" : "Tract"}</span>
          {caption}
        </p>
        <p className="help-line flex flex-wrap items-center gap-x-4 gap-y-1 pb-12 text-xs text-text-dim sm:pb-0 sm:pl-36 [&_.kbd]:mr-1 [&_.kbd]:rounded [&_.kbd]:border [&_.kbd]:border-panel-border [&_.kbd]:bg-bg-3 [&_.kbd]:px-1.5 [&_.kbd]:py-px [&_.kbd]:font-mono [&_.kbd]:text-[11px] [&_.kbd]:text-text">
          <span><span className="kbd">←</span> <span className="kbd">→</span> beat</span>
          <span><span className="kbd">Space</span> play</span>
          <span><span className="kbd">S</span> side</span>
          <span><span className="kbd">P</span> pathways</span>
          <span><span className="kbd">V</span> view</span>
          <span>click any part for its notes; drag to rotate freely</span>
        </p>
      </div>

      {panelOpen && (
        <aside className="panel grid min-w-0 content-start gap-3 lg:w-[360px] lg:flex-none lg:overflow-y-auto" aria-live="polite">
          <div>
            <p className="eyebrow">{cp.name}</p>
            <p className="text-xs text-text-dim">{cp.modality}</p>
          </div>

          {gated && question ? (
            <div className="grid gap-3">
              <p className="eyebrow">Quiz · beat {cur + 1} of {B}</p>
              <h2 className="font-display text-xl">{question.prompt}</h2>
              <p className="text-sm text-text-dim">The next part of the pathway is hidden. Type it, or pick one.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(typed, false);
                }}
                className="flex gap-2"
              >
                <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type the structure…" className="min-w-0 flex-1 rounded-sm border border-panel-border bg-panel-solid px-2 py-1.5 text-text" autoComplete="off" spellCheck={false} />
                <button className="btn btn-primary" type="submit" disabled={typed.trim().length < 2}>
                  Check
                </button>
              </form>
              <div className="grid gap-2">
                {question.options.map((o, i) => (
                  <button
                    key={o}
                    type="button"
                    className={`btn text-left ${picked === o ? "btn-primary" : ""}`}
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => {
                      setPicked(o);
                      submit(o, true);
                    }}
                  >
                    <span className="kbd mr-2">{i + 1}</span>
                    {o}
                  </button>
                ))}
              </div>
              <p className="help-line"><span><span className="kbd">1</span> to <span className="kbd">4</span> pick</span><span><span className="kbd">/</span> type</span></p>
            </div>
          ) : (
            <>
              {feedback && !all && (
                <p className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: feedback.ok ? "var(--good)" : "var(--again)" }}>
                  {feedback.ok ? "Correct." : "Not quite."} <strong>{feedback.q.answer}</strong>
                </p>
              )}
              {!all && neuron ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl">{ORDINAL[neuron.order]}-order neuron</h2>
                    {neuron.decussates ? <span className="chip boss">decussates</span> : <span className="chip follow">no crossing</span>}
                  </div>
                  <p className="flex items-start gap-2 text-sm">
                    <DeficitIcons text={loss} size={17} />
                    <span><span className="text-text-faint">If damaged here: </span>loss of {loss.replace(/\s*\([^)]*\)/g, "")}</span>
                  </p>
                  <Collapsible title="This neuron in detail" defaultOpen={false}>
                    <dl className="grid gap-2 text-sm">
                      <div><dt className="label">Cell body</dt><dd>{neuron.cell_body}</dd></div>
                      <div><dt className="label">Tract</dt><dd>{neuron.tract}</dd></div>
                      <div><dt className="label">Synapse</dt><dd>{neuron.synapse}</dd></div>
                      {meaningful(neuron.level) && <div><dt className="label">Level</dt><dd>{neuron.level}</dd></div>}
                    </dl>
                    {mp.quality === "partial" && <p className="mt-2 text-xs text-text-faint">Approximate map: the exact fibre course is simplified.</p>}
                  </Collapsible>
                </div>
              ) : (
                <div className="grid gap-2">
                  <h2 className="font-display text-xl">The whole pathway</h2>
                  {meaningful(cp.decussation) && (
                    <p className="text-sm">
                      <span className="label">Decussation</span> {cp.decussation}
                      {decIdx >= 0 && <span className="text-text-dim"> (the {ORDINAL[decIdx + 1]}-order neuron)</span>}
                    </p>
                  )}
                  {(meaningful(cp.lesion.below_decussation) || meaningful(cp.lesion.above)) && (
                    <div className="grid gap-1 text-sm">
                      <p className="label">Lesion rule</p>
                      {meaningful(cp.lesion.below_decussation) && <p><span className="text-text-dim">Below the crossing:</span> {cp.lesion.below_decussation}</p>}
                      {meaningful(cp.lesion.above) && <p><span className="text-text-dim">Above the crossing:</span> {cp.lesion.above}</p>}
                    </div>
                  )}
                  <p className="flex items-start gap-2 text-sm">
                    <DeficitIcons text={mp.loss} size={17} />
                    <span><span className="label">Loss</span> {mp.loss.replace(/\s*\([^)]*\)/g, "")}</span>
                  </p>
                  {Object.keys(answered).some((k) => k.startsWith(slug + ":")) && (
                    <p className="text-sm text-text-dim">
                      Quiz: {Object.entries(answered).filter(([k, v]) => k.startsWith(slug + ":") && v === "right").length} of {Object.keys(answered).filter((k) => k.startsWith(slug + ":")).length} right this session.
                    </p>
                  )}
                </div>
              )}

              {lesionSites.length > 0 && (
                <div>
                  <p className="label">Try a lesion</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lesionSites.map((s) => {
                      const chip = (
                        <Link className="chip follow no-underline" href={`/atlas/lesion?site=${s.id}&side=${primary}${s.cord ? `&cord=${s.cord.includes("T") ? "T" : s.cord[0]}` : ""}`}>
                          {s.name.length > 38 ? s.name.slice(0, 36) + "…" : s.name}
                        </Link>
                      );
                      return NAMED_SITE.test(s.name) ? (
                        <Supplementary key={s.id} section="pathways" title="Named lesion" inline>
                          {chip}
                        </Supplementary>
                      ) : (
                        <span key={s.id}>{chip}</span>
                      );
                    })}
                  </div>
                </div>
              )}

              {isVisual && (
                <Collapsible title="Visual field" defaultOpen={beat?.neuron === 0 || all}>
                  <div className="grid gap-2">
                    <FieldDiagram palette={pal} width={250} dim={{ L: sideMode === "R" ? 0.2 : 1, R: sideMode === "L" ? 0.2 : 1 }} />
                    <p className="text-xs text-text-dim">
                      Colour follows the field from retina to cortex: left field <span style={{ color: colors.left }}>blue</span>, right field <span style={{ color: colors.right }}>orange</span>; upper quadrants lighter, lower darker. Solid line = fibres on the left of the head, dashed = right.
                    </p>
                    {(cur >= B - 2 || all) && (
                      <>
                        <CalcarineDiagram palette={pal} field={primary} width={230} />
                        <p className="text-xs text-text-dim">The calcarine fissure splits V1: the upper field lands on the lingual gyrus below it, the lower field on the cuneus above it.</p>
                      </>
                    )}
                  </div>
                </Collapsible>
              )}

              {cfg && (cfg.skin.length > 0 || cfg.muscle.length > 0) && (
                <Collapsible title="The endings" defaultOpen={cur <= 2}>
                  <div className="grid gap-2 text-sm">
                    <ReceptorLens skin={cfg.skin} muscle={cfg.muscle} />
                    <p className="text-xs text-text-faint">{cfg.source} Schematic, not to scale.</p>
                  </div>
                </Collapsible>
              )}

              <Collapsible title="Cards for this pathway" defaultOpen={false} badge={<span className="chip">{stepCards.length}</span>}>
                <div className="grid gap-2">
                  {stepCards.length === 0 && <p className="text-sm text-text-dim">No cards for this pathway.</p>}
                  {stepCards.slice(0, 12).map((c) => (
                    <details key={c.slug} className="rounded-sm border border-panel-border px-3 py-2 text-sm">
                      <summary className="cursor-pointer">{c.prompt}</summary>
                      <p className="mt-1 text-text-dim">{c.answer}</p>
                    </details>
                  ))}
                  {topic && (
                    <Link href={`/study/run?scope=topic:${topic}`} className="btn no-underline" style={{ justifySelf: "start" }}>
                      Study the pathway cards
                    </Link>
                  )}
                </div>
              </Collapsible>
              <Collapsible title="Icon key" defaultOpen={false}>
                <DeficitLegend />
              </Collapsible>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

function Legend({ colors, visual }: { colors: { left: string; right: string; hi: string }; visual: boolean }) {
  const ink = "var(--text)";
  return (
    <div data-label-obstacle className="pointer-events-none absolute bottom-2 left-2 grid gap-1 rounded-sm bg-panel-solid/90 px-2 py-1.5 text-[11px] leading-none text-text">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden style={{ color: visual ? ink : colors.left }}><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2.6" /></svg>
        Left side (solid)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="6" aria-hidden style={{ color: visual ? ink : colors.right }}><line x1="0" y1="3" x2="22" y2="3" stroke="currentColor" strokeWidth="2.6" strokeDasharray="5 3" /></svg>
        Right side (dashed)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden style={{ color: colors.hi }}><path d="M3 1 L19 9 M19 1 L3 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        Crossing (decussation)
      </span>
    </div>
  );
}
