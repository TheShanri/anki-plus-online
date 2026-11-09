"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Focus, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Pause, Play, Route, Shuffle } from "lucide-react";
import {
  ORDINAL,
  PATHWAY_MAP,
  SITES,
  autoKeys,
  checkTyped,
  neuronForCard,
  opp,
  physSide,
  sideName,
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
import { ORIGINS, ZONE_NAMES, buildPathwayScene, primaryOf, type LimbChoice, type SideMode } from "./buildPathwayScene";
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

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One plain line for a step, built from the course's own neuron data (cell body, synapse, crossing). */
function stepCaption(slug: string, ni: number, cp: CoursePathway): string {
  if (slug === "visual") {
    if (ni === 0) return "Light falls on the retina: each retina has a nasal and a temporal half, and the left half of the field falls on the right half of each retina.";
    if (ni === 1) return "Retinal ganglion cells leave in the optic nerve. At the chiasm the nasal fibres cross and the temporal fibres stay, so each optic tract carries the opposite visual field of both eyes.";
    return "The LGN sends the optic radiations to V1. Meyer's loop (temporal lobe) carries the upper field, the parietal route the lower field; the calcarine fissure splits V1 into two banks.";
  }
  const n = cp.neurons[ni];
  if (!n) return "";
  const cross = n.decussates ? "crosses the midline here" : "stays on the same side";
  return `${cap1(n.cell_body)} → ${n.synapse}; ${cross}.`;
}

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
  const [limbPart, setLimbPart] = useState<LimbChoice>("hand");
  const [quiz, setQuiz] = useState(false);
  const [answered, setAnswered] = useState<Answered>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; q: Question } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [userView, setUserView] = useState<View | null>(null);
  const [follow, setFollow] = useState(true);
  const [zoomCross, setZoomCross] = useState(false);
  const [frameNonce, setFrameNonce] = useState(0);
  const [ready, setReady] = useState(false);
  const [load, setLoad] = useState({ done: 0, total: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  const fsc = useFullscreen(() => setFrameNonce((x) => x + 1));
  const [reduced, setReduced] = useState(false);
  const colors = useSceneColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<PickerHandle>(null);
  const visited = useRef(new Set<number>());
  const completed = useRef(new Set<string>());

  const cp = bySlug.get(slug)!;
  const mp: MapPathway = PATHWAY_MAP[slug];
  const n = mp.neurons.length;
  const cur = Math.min(step, n); // n = whole pathway
  const summary = cur >= n;
  const qKey = `${slug}:${cur}`;
  const question = useMemo(() => (quiz && !summary ? buildQuestion(slug, cur, courses) : null), [quiz, summary, slug, cur, courses]);
  const gated = !!question && !answered[qKey];
  const lastShown = summary || playing ? n - 1 : gated ? cur - 1 : cur;
  const noun = sideNoun(slug);
  const cfg = ORIGINS[slug];
  const isVisual = !!mp.visual;

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
      setStep((s) => Math.max(0, Math.min(n, s + d)));
      setZoomCross(false);
      resetStepUi();
    },
    [n, resetStepUi],
  );
  const goTo = useCallback(
    (i: number) => {
      setStep(i);
      setZoomCross(false);
      resetStepUi();
    },
    [resetStepUi],
  );
  const choose = useCallback(
    (s: string) => {
      setSlug(s);
      setStep(0);
      setZoomCross(false);
      setPlaying(false);
      setUserView(null);
      resetStepUi();
      setReady(false);
      visited.current = new Set();
    },
    [resetStepUi],
  );

  // url state
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("p", slug);
    u.searchParams.set("side", sideMode);
    u.searchParams.set("step", String(cur));
    window.history.replaceState(null, "", u);
  }, [slug, sideMode, cur]);

  /* ----- progress: a pathway counts as done when every step was seen (stepped or played) and the whole is reached ----- */
  useEffect(() => {
    if (cur < n) visited.current.add(cur);
    else if (visited.current.size >= n && !completed.current.has(slug)) {
      completed.current.add(slug);
      const mine = Object.entries(answered).filter(([k]) => k.startsWith(slug + ":"));
      trackAtlas({
        type: "pathway_completed",
        pathway: slug,
        ...(mine.length ? { quizCorrect: mine.filter(([, v]) => v === "right").length, quizTotal: mine.length } : {}),
      });
    }
  }, [cur, n, slug, answered]);

  /* ----- play ----- */
  const startPlay = useCallback(() => {
    setStep(0);
    resetStepUi();
    setPlayNonce((x) => x + 1);
    setPlaying(true);
  }, [resetStepUi]);
  const togglePlay = useCallback(() => {
    if (quiz) return;
    if (playing) setPlaying(false);
    else startPlay();
  }, [quiz, playing, startPlay]);
  // with reduced motion there is no travelling impulse: the steps advance on a timer instead
  useEffect(() => {
    if (!playing || !reduced) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= n - 1) {
          setPlaying(false);
          return n;
        }
        return s + 1;
      });
    }, 3200);
    return () => clearInterval(t);
  }, [playing, reduced, n]);
  const onPlayProgress = useCallback(
    (neuron: number, done: boolean) => {
      if (done) {
        setPlaying(false);
        setStep(n);
      } else setStep(Math.min(neuron, n - 1));
    },
    [n],
  );
  const bodies = useMemo<Side[]>(() => (sideMode === "both" ? ["L", "R"] : [sideMode]), [sideMode]);
  const play = useMemo(() => (playing && !reduced ? { running: true, nonce: playNonce, bodies } : undefined), [playing, reduced, playNonce, bodies]);

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
  const effView: View = userView ?? (isVisual ? (summary ? "top" : cur === 0 ? "anterior" : cur === 1 ? "top" : sideMode === "R" ? "right" : "left") : "anterior");

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
      } else if (gated && /^[1-4]$/.test(e.key) && question) {
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

  const stepStretches = !summary ? mp.neurons[cur].stretches.filter((x) => x.path && x.path.length > 1) : [];
  const crossK = stepStretches.find((x) => x.phys === "cross")?.k;
  const focusStretch = zoomCross && crossK ? crossK : "all";

  /* ---------- the 3D scene for this step ---------- */
  const scene = useMemo(
    () => buildPathwayScene({ mp, slug, cur, lastShown, summary, follow, playing, colors, sideMode, limbPart, focusStretch, view: effView }),
    [mp, slug, cur, lastShown, summary, follow, playing, colors, sideMode, limbPart, focusStretch, effView],
  );
  const pal = useMemo(() => fieldPalette(colors.left, colors.right), [colors.left, colors.right]);
  const zoneColors = useMemo(() => [shade(colors.hi, 0.1), shade(colors.hi, -0.15), shade(colors.hi, -0.4)], [colors.hi]);

  const onLimbPick = useCallback(
    (s: Side) => {
      setSideMode(s);
      startPlay();
    },
    [startPlay],
  );

  /* ---------- panel data ---------- */
  const neuron = !summary ? cp.neurons[cur] : null;
  const mapN = !summary ? mp.neurons[cur] : null;
  const decIdx = cp.neurons.findIndex((x) => x.decussates);
  const stepCards = useMemo(() => cards.filter((c) => c.pathway === slug), [cards, slug]);
  const cardsFor = (neuronNo: number) => stepCards.filter((c) => neuronForCard(c, cp) === neuronNo);
  const lesionSites = useMemo(() => {
    const zones = new Set(mp.neurons.flatMap((x) => x.stretches.filter((s) => !s.noLesion).flatMap((s) => s.zones ?? [])));
    return SITES.filter((s) => s.zones.some((z) => zones.has(z))).slice(0, 6);
  }, [mp]);
  const primary = primaryOf(sideMode);
  const sideLines = (mapN?.stretches ?? []).map((s) => {
    const ps = physSide(s.phys, primary);
    const txt = s.phys === "cross" ? `crosses the midline, ${sideName(primary)} to ${sideName(opp(primary))}` : `${sideName(ps!)} side (${s.phys === "i" ? "same side as the " : "opposite the "}${noun})`;
    return { label: s.label, txt, color: s.phys === "cross" ? colors.hi : ps === "L" ? colors.left : colors.right };
  });
  const lossStretch = mapN?.stretches.find((s) => s.loss) ?? null;
  const loss = lossStretch?.loss ?? mp.loss;
  const topic = stepCards[0] ? (cards.find((c) => c.pathway === slug && c.topic)?.topic ?? null) : null;
  const caption = summary ? `The whole route, ${cp.neurons.length} neurons. ${cp.decussation ? `Crossing: ${cp.decussation}.` : ""}` : stepCaption(slug, cur, cp);
  const cardList = summary ? stepCards.filter((c) => neuronForCard(c, cp) === 0) : cardsFor(cur + 1);
  const stepOptions = [
    ...mp.neurons.map((_, i) => ({ id: String(i), label: `${ORDINAL[i + 1]}${answered[`${slug}:${i}`] === "right" ? " ✓" : ""}`, tip: `${ORDINAL[i + 1]}-order neuron: ${cp.neurons[i]?.cell_body ?? ""}` })),
    { id: "all", label: "All", tip: "The whole pathway" },
  ];
  const sideWord = (s: Side) => `${s === "L" ? "Left" : "Right"} ${noun}`;

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

        <div ref={fsc.ref} className="relative min-h-[380px] flex-1 overflow-hidden rounded-card border border-panel-border bg-bg-2 max-lg:h-[64dvh] max-lg:flex-none [&:fullscreen]:!h-screen [&:fullscreen]:!min-h-0 [&:fullscreen]:!w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
          <PathwayViewer
            layers={scene.layers}
            tubes={scene.tubes}
            marks={scene.marks}
            fit={scene.fit}
            limbs={scene.limbs}
            eyes={scene.eyes}
            zoneColors={zoneColors}
            play={play}
            onPlayProgress={onPlayProgress}
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
                ["structures", "Placing the structures", false, load.total ? `${load.done} / ${load.total}` : undefined],
              ])}
            />
          )}
          <Legend colors={colors} visual={isVisual} />
          <div data-label-obstacle className="absolute right-2 top-2 flex items-center gap-1.5">
            <Segmented
              label="View"
              value={effView}
              onChange={setUserView}
              options={VIEWS.map((v) => ({ id: v.id, label: v.label, tip: `${v.label} view`, keys: "V" }))}
            />
            <IconButton label="Re-frame" keys="F" icon={<Focus size={16} />} onClick={() => setFrameNonce((x) => x + 1)} tip="bottom" />
            {fsc.can && <IconButton label={fsc.fs ? "Leave full screen" : "Full screen"} icon={fsc.fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />} pressed={fsc.fs} onClick={fsc.toggle} tip="bottom" />}
            <IconButton label={panelOpen ? "Hide the side panel" : "Show the side panel"} icon={panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} pressed={panelOpen} onClick={() => setPanelOpen((o) => !o)} tip="bottom" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="Previous step" keys="←" icon={<ChevronLeft size={18} />} onClick={() => go(-1)} disabled={cur === 0 || playing} />
            <IconButton
              label={playing ? "Pause" : isVisual ? "Play: an impulse from the retina to V1" : "Play: an impulse along the pathway"}
              keys="Space"
              icon={playing ? <Pause size={17} /> : <Play size={17} />}
              onClick={togglePlay}
              disabled={quiz}
              pressed={playing}
              tone="primary"
            />
            <IconButton label="Next step" keys="→" icon={<ChevronRight size={18} />} onClick={() => go(1)} disabled={summary || gated || playing} />
          </div>
          <Segmented label="Step" value={summary ? "all" : String(cur)} onChange={(v) => goTo(v === "all" ? n : Number(v))} options={stepOptions} />
          <div className="ml-auto flex items-center gap-1">
            {crossK && follow && (
              <IconButton label={zoomCross ? "Show the whole step" : "Zoom on the crossing"} icon={<Shuffle size={16} />} pressed={zoomCross} onClick={() => setZoomCross((z) => !z)} />
            )}
            <IconButton label="Camera follows the step" icon={<Route size={16} />} pressed={follow} onClick={() => setFollow((f) => !f)} />
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
          <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-text-faint">{summary ? "Whole" : `Step ${cur + 1} of ${n}`}</span>
          {caption}
        </p>
        <p className="help-line">
          <span><span className="kbd">←</span> <span className="kbd">→</span> step</span>
          <span><span className="kbd">Space</span> play</span>
          <span><span className="kbd">S</span> side</span>
          <span><span className="kbd">P</span> pathways</span>
          <span><span className="kbd">V</span> view</span>
          <span><span className="kbd">Q</span> quiz</span>
          {scene.limbs.length > 0 && <span>click a {limbPartName(scene.limbs[0].part)} to trace that side</span>}
        </p>
      </div>

      {panelOpen && (
      <aside className="panel grid min-w-0 content-start gap-3 lg:w-[400px] lg:flex-none lg:overflow-y-auto" aria-live="polite">
        <div>
          <p className="eyebrow">{cp.name}</p>
          <p className="text-xs text-text-dim">{cp.modality}</p>
        </div>

        {gated && question ? (
          <div className="grid gap-3">
            <p className="eyebrow">Quiz · step {cur + 1} of {n}</p>
            <h2 className="font-display text-xl">{question.prompt}</h2>
            <p className="text-sm text-text-dim">The next part of the pathway is hidden. Type it, or pick one.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(typed, false);
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type the structure…"
                className="min-w-0 flex-1 rounded-sm border border-panel-border bg-panel-solid px-2 py-1.5 text-text"
                autoComplete="off"
                spellCheck={false}
              />
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
            {feedback && !summary && (
              <p className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: feedback.ok ? "var(--good)" : "var(--again)" }}>
                {feedback.ok ? "Correct." : "Not quite."} <strong>{feedback.q.answer}</strong>
              </p>
            )}
            {neuron && mapN ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl">{ORDINAL[neuron.order]}-order neuron</h2>
                  {neuron.decussates ? <span className="chip boss">decussates</span> : <span className="chip follow">no crossing</span>}
                  <span className="chip">{neuron.level}</span>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div><dt className="label">Cell body</dt><dd>{neuron.cell_body}</dd></div>
                  <div><dt className="label">Tract</dt><dd>{neuron.tract}</dd></div>
                  <div><dt className="label">Synapse</dt><dd>{neuron.synapse}</dd></div>
                </dl>
                <div>
                  <p className="label">Which side, where{sideMode === "both" ? ` (${sideName(primary).toLowerCase()} ${noun} shown; the other mirrors it)` : ""}</p>
                  <ul className="grid gap-1 text-sm">
                    {sideLines.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden style={{ color: l.color }}>■</span>
                        <span><span className="text-text-dim">{withGate(l.label)}:</span> {l.txt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="flex items-start gap-2 rounded-sm border border-panel-border px-3 py-2 text-sm">
                  <DeficitIcons text={loss} size={17} />
                  <span><span className="label">If damaged here</span> loss of {loss.replace(/\s*\([^)]*\)/g, "")}</span>
                </p>
                {neuron.decussates && (
                  <p className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: colors.hi }}>
                    <span className="label">Decussation</span> {cp.decussation}
                  </p>
                )}
                {mp.quality === "partial" && <p className="text-xs text-text-faint">Approximate map: the structures are lit in order, the exact fibre course is simplified.</p>}
              </div>
            ) : (
              <div className="grid gap-3">
                <h2 className="font-display text-2xl">The whole pathway</h2>
                <p className="text-sm">
                  <span className="label">Decussation</span> {cp.decussation}
                  {decIdx >= 0 && <span className="text-text-dim"> (the {ORDINAL[decIdx + 1]}-order neuron)</span>}
                </p>
                <div className="grid gap-1 text-sm">
                  <p className="label">Lesion rule</p>
                  <p><span className="text-text-dim">Below the crossing:</span> {cp.lesion.below_decussation}</p>
                  <p><span className="text-text-dim">Above the crossing:</span> {cp.lesion.above}</p>
                </div>
                <p className="flex items-start gap-2 text-sm">
                  <DeficitIcons text={mp.loss} size={17} />
                  <span><span className="label">Loss</span> {mp.loss.replace(/\s*\([^)]*\)/g, "")}</span>
                </p>
                {lesionSites.length > 0 && (
                  <div>
                    <p className="label">Try a lesion</p>
                    <div className="flex flex-wrap gap-1.5">
                      {lesionSites.map((s) => (
                        <Link key={s.id} className="chip follow no-underline" href={`/atlas/lesion?site=${s.id}&side=${primary}${s.cord ? `&cord=${s.cord.includes("T") ? "T" : s.cord[0]}` : ""}`}>
                          {s.name.length > 38 ? s.name.slice(0, 36) + "…" : s.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(answered).some((k) => k.startsWith(slug + ":")) && (
                  <p className="text-sm text-text-dim">
                    Quiz: {Object.entries(answered).filter(([k, v]) => k.startsWith(slug + ":") && v === "right").length} of{" "}
                    {Object.keys(answered).filter((k) => k.startsWith(slug + ":")).length} right this session.
                  </p>
                )}
              </div>
            )}

            {isVisual && (
              <Collapsible title="Visual field" defaultOpen>
                <div className="grid gap-2">
                  <FieldDiagram palette={pal} width={250} dim={{ L: sideMode === "R" ? 0.2 : 1, R: sideMode === "L" ? 0.2 : 1 }} />
                  <p className="text-xs text-text-dim">
                    Colour follows the field from retina to cortex: left field {" "}
                    <span style={{ color: colors.left }}>blue</span>, right field <span style={{ color: colors.right }}>orange</span>; upper quadrants lighter, lower darker. Solid line = fibres on the left of the head, dashed = right.
                  </p>
                  {(cur === 2 || summary) && (
                    <>
                      <CalcarineDiagram palette={pal} field={primary} width={230} />
                      <p className="text-xs text-text-dim">
                        The calcarine fissure splits V1: the upper field (Meyer&apos;s loop, via the temporal lobe) lands on the lingual gyrus below it, the lower field (parietal route) on the cuneus above it. Macular (central) vision sits at the occipital pole.
                      </p>
                    </>
                  )}
                </div>
              </Collapsible>
            )}

            {cfg && (cfg.skin.length > 0 || cfg.muscle.length > 0 || cfg.kind === "face" || cfg.kind === "muscle") && (
              <Collapsible title={cfg.kind === "muscle" ? "Where the signal goes" : "Where the signal starts"} defaultOpen={cur === 0 || cur === n - 1 || summary}>
                <div className="grid gap-2 text-sm">
                  {cfg.kind === "face" && (
                    <ul className="grid gap-1">
                      {ZONE_NAMES.map((z) => (
                        <li key={z} className="flex items-center gap-2">
                          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors.hi, opacity: 0.55 + 0.2 * ZONE_NAMES.indexOf(z) }} />
                          {z}
                        </li>
                      ))}
                    </ul>
                  )}
                  {cfg.kind === "muscle" && <p>Limb skeletal muscle: the alpha motor neuron (lower motor neuron, lamina IX) ends here. Everything before the ventral horn is the upper motor neuron.</p>}
                  {(cfg.skin.length > 0 || cfg.muscle.length > 0) && <ReceptorLens skin={cfg.skin} muscle={cfg.muscle} />}
                  <p className="text-xs text-text-faint">{cfg.source} Schematic, not to scale: the cord is drawn at one level.</p>
                </div>
              </Collapsible>
            )}

            <Collapsible title={`Cards for this ${summary ? "pathway" : "step"}`} defaultOpen={false} badge={<span className="chip">{cardList.length}</span>}>
              <div className="grid gap-2">
                {cardList.length === 0 && <p className="text-sm text-text-dim">No separate cards for this step.</p>}
                {cardList.map((c) => (
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

const limbPartName = (p: string) => (p === "muscle" ? "muscle" : p === "face" ? "face" : p);

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
