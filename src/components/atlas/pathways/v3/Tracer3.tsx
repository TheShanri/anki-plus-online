"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, FlipHorizontal2, Focus, LayoutGrid, Maximize2, Minimize2, Orbit, Pause, Play, Tag, X } from "lucide-react";
import { ORDINAL, PATHWAY_MAP, SITES, autoKeys, checkTyped, neuronForCard, type CoursePathway, type MapPathway, type PathwayCard, type Side } from "@/lib/atlas/pathways";
import { ORDER_COLORS, FIELD_COLORS, GUIDE_COLORS } from "@/lib/atlas/pathwayPalette";
import { trackAtlas } from "@/lib/atlas/progress";
import { Supplementary } from "@/components/supplementary/Supplementary";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import { AtlasLoader, stagesFrom } from "@/components/atlas/ui/AtlasLoader";
import { Divider, Group, IconBtn, MenuItem, Popover } from "@/components/atlas/ui/Toolbar";
import { CutCoronalIcon, CutNoneIcon, CutSagittalIcon, CutTransverseIcon } from "@/components/atlas/ui/icons";
import { readCssColor } from "@/lib/atlas/theme";
import { useSceneColors } from "../sceneTheme";
import { BodyIcon, Collapsible, IconButton, Segmented } from "../controls";
import { PathwayPicker, type PickerGroup, type PickerHandle } from "../PathwayPicker";
import { DeficitIcons, DeficitLegend } from "../deficits";
import { ORIGINS, alphaOf, buildBeatScene, primaryOf, type LimbChoice, type SideMode } from "../buildPathwayScene";
import { Schematic } from "../Schematic";
import { useFullscreen } from "../useFullscreen";
import { PathwayCredits } from "../PathwayCredits";
import { loadV3, type V3Data } from "./types";
import { VIEW_LABELS, type ViewName } from "./rig";
import type { CutState } from "./Scene3";
import { beatCopy, NEXT_PREFIX } from "./copy";
import { insetFor } from "./insetMap";
import { CordInset } from "./insets";
import { loadPlate as preloadPlate } from "@/components/atlas/brainstem/plate/load";
import { BrainstemRef } from "@/components/atlas/brainstem/BrainstemRef";
import { slugForStop } from "./structureSlugs";
import "@/components/atlas/ui/atlas-ui.css";

const Scene3 = dynamic(() => import("./Scene3"), { ssr: false, loading: () => null });

/* Pathway tracer v3 (docs/PATHWAY_V3.md): one beat per click (start, path, end) in a crisp 3D scene where every fibre runs
 * inside its real host structure, with the textbook diagram in the side rail (synced both ways), a section inset at cord and
 * brainstem beats, Explore's cut and multi-view tools, and the four questions answered on every frame: where is the signal,
 * which neuron, which side, what is next. */

const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Ascending (sensory)", slugs: ["dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain"] },
  { title: "Descending (motor)", slugs: ["lcst", "acst", "corticobulbar", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn"] },
  { title: "Special senses", slugs: ["visual", "cochlear", "vestibular", "solitary", "olfactory"] },
  { title: "Reflexes", slugs: ["stretch-reflex", "withdrawal-reflex", "jaw-jerk", "pupillary", "corneal", "gaze"] },
  { title: "Cerebellum and basal ganglia", slugs: ["corticopontocerebellar", "cerebellar", "basal-ganglia"] },
  { title: "Autonomic and limbic", slugs: ["sympathetic", "parasympathetic", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward"] },
];
const SIDE_NOUN: Record<string, string> = {
  cochlear: "ear", vestibular: "ear", "stretch-reflex": "limb", "withdrawal-reflex": "limb", visual: "field", pupillary: "eye", cerebellar: "cerebellum",
  corticopontocerebellar: "cerebellum", "basal-ganglia": "body", lcst: "limb", acst: "body", corticobulbar: "face", rubrospinal: "red nucleus", tectospinal: "tectum",
  "umn-lmn": "limb", vestibulospinal: "body", reticulospinal: "body", "trigeminal-discriminative": "face", "trigeminal-pain": "face", gaze: "gaze",
};
const sideNoun = (slug: string) => SIDE_NOUN[slug] ?? "body";
/** What "same side" is measured against in the side chip: the stimulus for sensory pathways, the target for motor ones. */
const REL_NOUN: Record<string, string> = {
  lcst: "limb", acst: "muscles", "umn-lmn": "limb", rubrospinal: "red nucleus", tectospinal: "tectum", reticulospinal: "muscles", vestibulospinal: "muscles",
  corticobulbar: "face muscles", "stretch-reflex": "limb", "withdrawal-reflex": "limb", visual: "visual field", gaze: "eyes' turn", cochlear: "ear", vestibular: "ear",
  cerebellar: "cerebellum", corticopontocerebellar: "cortex", "basal-ganglia": "cortex", sympathetic: "organ", parasympathetic: "organ", reward: "VTA",
  "limbic-fornix": "hippocampus", "limbic-amygdala": "amygdala", "limbic-septal": "septal nuclei", olfactory: "nostril", pupillary: "lit eye", "jaw-jerk": "muscle",
};
const relNoun = (slug: string) => REL_NOUN[slug] ?? "stimulus";

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
  let prompt: string, answer: string, keys: string[], pool: string[];
  if (step === 0) {
    const n = mp.neurons[0];
    prompt = "Where is the cell body of the 1st-order neuron?";
    answer = n.short;
    keys = [...autoKeys(cp.neurons[0].cell_body), ...autoKeys(n.short)];
    pool = Object.values(PATHWAY_MAP).map((p) => p.neurons[0]?.short);
  } else {
    const prev = mp.neurons[step - 1];
    prompt = `What comes next? Where do the ${ORDINAL[step]}-order axons synapse?`;
    answer = prev.syn ?? cp.neurons[step - 1].synapse;
    keys = prev.synKeys?.length ? prev.synKeys : autoKeys(cp.neurons[step - 1].synapse);
    pool = Object.values(PATHWAY_MAP).flatMap((p) => p.neurons.map((n) => n.syn ?? ""));
  }
  const bad = [...new Set(pool.filter((x) => x && x !== answer && !checkTyped(x, keys)))].sort((a, b) => hash(slug + step + a) - hash(slug + step + b)).slice(0, 3);
  const options = [answer, ...bad].sort((a, b) => hash(step + slug + a) - hash(step + slug + b));
  return { prompt, answer, keys, options };
}

/** Text between ‹ and › (and "posterior limb") is beyond the slides: it sits behind the Supplementary gate. */
function withGate(label: string) {
  const parts = label.replace(/, posterior limb/g, "‹, posterior limb›").replace(/\(posterior limb\)/g, "‹(posterior limb)›").split(/(‹[^›]*›)/);
  if (parts.length === 1) return label;
  return (
    <>
      {parts.map((part, i) =>
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
const NAMED_SITE = /syndrome|locked-in|wallenberg|weber|brown|parkinson|huntington|ballism|chorea|syrinx|pica\b|medial medullary|lateral medullary|brown-s/i;
const meaningful = (s?: string) => !!s && !/^\s*(n\/a|none|not stated|not taught|see specific)/i.test(s) && s.trim().length > 1;
type Answered = Record<string, "right" | "wrong">;

export function Tracer3({ courses, cards, courseSlug, initial, onSwitch }: { courses: CoursePathway[]; cards: PathwayCard[]; courseSlug: string; initial: { p?: string; side?: string; step?: string; limb?: string }; onSwitch?: (slug: string, limb?: string) => boolean }) {
  const bySlug = useMemo(() => new Map(courses.map((c) => [c.slug, c])), [courses]);
  const groups = useMemo<PickerGroup[]>(
    () => GROUPS.map((g) => ({ title: g.title, items: g.slugs.filter((s) => bySlug.has(s) && PATHWAY_MAP[s]).map((s) => ({ slug: s, name: bySlug.get(s)!.name })) })).filter((g) => g.items.length),
    [bySlug],
  );
  const [slug, setSlug] = useState(initial.p && bySlug.has(initial.p) && PATHWAY_MAP[initial.p] ? initial.p : "dcml");
  const [sideMode, setSideMode] = useState<SideMode>(initial.side === "L" ? "L" : initial.side === "R" ? "R" : "both");
  const [step, setStep] = useState(Math.max(0, Number(initial.step) || 0));
  const [all, setAll] = useState(false);
  const [limbPart, setLimbPart] = useState<LimbChoice>(initial.limb === "foot" ? "foot" : "hand");
  const [quiz, setQuiz] = useState(false);
  const [answered, setAnswered] = useState<Answered>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; q: Question } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<ViewName>("beat");
  const [frameNonce, setFrameNonce] = useState(0);
  const [cut, setCut] = useState<CutState>({ mode: "auto", t: 0.5, flip: false });
  const [multi, setMulti] = useState(false);
  const [labels, setLabels] = useState(true);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [keyOpen, setKeyOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) {
      setBarOpen(false);
      setKeyOpen(false);
    }
  }, []);
  const [data, setData] = useState<{ key: string; d: V3Data } | null>(null);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const [reduced, setReduced] = useState(false);
  const { attach: attachFs, fs: isFs, toggle: toggleFs, can: canFs } = useFullscreen(() => setFrameNonce((x) => x + 1));
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
  const part: LimbChoice = cfg?.parts ? (cfg.parts.includes(limbPart) ? limbPart : cfg.parts[0]) : "hand";
  const limbKey = cfg?.parts ? part : null;
  const dataKey = limbKey ? `${slug}-${limbKey}` : slug;

  // the shared beat model (same beats, captions and info keys as the 2D diagram)
  const bs = useMemo(() => buildBeatScene({ mp, cp, slug, colors, limbPart: part }), [mp, cp, slug, colors, part]);
  const B = bs.beats.length;
  useEffect(() => {
    (window as unknown as { __pwBeats?: unknown }).__pwBeats = { slug, beats: bs.beats.map(({ kind, neuron, caption, cross, info, phys, rel, branch, fork }) => ({ kind, neuron, caption, cross: !!cross, info, phys, rel, branch: !!branch, fork })) };
  }, [bs.beats, slug]);
  const cur = Math.max(0, Math.min(step, B - 1));
  const beat = bs.beats[cur];
  const curBeat: number | null = all ? null : cur;

  // v3 geometry: fetched for the pathway and body part, behind the loader
  useEffect(() => {
    let alive = true;
    setDataErr(null);
    loadV3(slug, limbKey)
      .then((d) => alive && setData({ key: dataKey, d }))
      .catch((e: Error) => alive && setDataErr(e.message));
    return () => {
      alive = false;
    };
  }, [slug, limbKey, dataKey]);
  const d = data && data.key === dataKey ? data.d : null;

  // quiz gate: "what comes next?" before the arrival at each synapse and before the first node
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
    (dl: number) => {
      setAll(false);
      setStep((s) => Math.max(0, Math.min(B - 1, s + dl)));
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
      if (s !== slug && onSwitch?.(s)) return; // a pathway still on v2: the page swaps the tracer
      setSlug(s);
      setStep(0);
      setAll(false);
      setPlaying(false);
      setView("beat");
      setOpenKey(null);
      setHoverKey(null);
      setCut({ mode: "auto", t: 0.5, flip: false });
      resetStepUi();
      setReady(false);
      visited.current = new Set();
    },
    [resetStepUi, slug, onSwitch],
  );
  useEffect(() => {
    (window as unknown as { __pwChoose?: (s: string, limb?: string) => void }).__pwChoose = (s: string, limb?: string) => {
      if (limb === "hand" || limb === "foot" || limb === "leg") setLimbPart(limb);
      choose(s);
    };
    (window as unknown as { __pwGo?: (i: number) => void }).__pwGo = (i: number) => goTo(i);
  }, [choose, goTo]);

  // the loader always ends: after 15 s the scene shows anyway and the note names what is missing
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const loaded = ready && !!d;
  useEffect(() => {
    if (loaded) {
      setLoadNote(null);
      return;
    }
    const t = setTimeout(() => {
      setLoadNote(dataErr ? `The pathway data did not load (${dataErr}).` : "Some parts did not finish loading; showing what is there.");
      setReady(true);
    }, 15000);
    return () => clearTimeout(t);
  }, [loaded, dataKey, dataErr]);
  // stable callbacks for the scene: a new function each render would re-run its effects (and loop)
  const onReady = useCallback((r: boolean) => setReady((x) => (x === r ? x : r)), []);
  const onProgress = useCallback((done: number, total: number) => setProg((p) => (p.done === done && p.total === total ? p : { done, total })), []);
  useEffect(() => {
    (window as unknown as { __pw3?: unknown }).__pw3 = { ready: loaded, slug, limb: limbKey, cur, B };
  }, [loaded, slug, limbKey, cur, B]);

  // url state
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("p", slug);
    u.searchParams.set("side", sideMode);
    u.searchParams.set("step", String(cur));
    if (limbKey) u.searchParams.set("limb", limbKey);
    else u.searchParams.delete("limb");
    window.history.replaceState(window.history.state, "", u);
  }, [slug, sideMode, cur, limbKey]);

  // progress: a pathway counts as done when every beat was seen
  useEffect(() => {
    if (all || !loaded) return;
    visited.current.add(cur);
    if (cur === B - 1 && visited.current.size >= B && !completed.current.has(slug)) {
      completed.current.add(slug);
      const mine = Object.entries(answered).filter(([k]) => k.startsWith(slug + ":"));
      trackAtlas({ type: "pathway_completed", pathway: slug, ...(mine.length ? { quizCorrect: mine.filter(([, v]) => v === "right").length, quizTotal: mine.length } : {}) });
    }
  }, [cur, B, slug, answered, all, loaded]);

  // play: one beat after another (a fork's branch is drawn slower)
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
    const fork = !!beat?.fork;
    const t = setTimeout(
      () => {
        setStep((s) => {
          if (s >= B - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      },
      reduced ? 1400 : fork ? 3400 : 2800,
    );
    return () => clearTimeout(t);
  }, [playing, quiz, B, reduced, cur, beat]);

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
  const pickCut = useCallback((mode: CutState["mode"]) => setCut((c) => ({ ...c, mode, t: mode === c.mode ? c.t : 0.5 })), []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "ArrowRight") {
        e.preventDefault();
        if (!gated) go(1);
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (k === " " && !quiz) {
        e.preventDefault();
        togglePlay();
      } else if (k === "q" || k === "Q") setQuiz((v) => !v);
      else if (k === "f" || k === "F") {
        setView("beat");
        setFrameNonce((x) => x + 1);
      } else if (k === "s" || k === "S") cycleSide();
      else if (k === "m" || k === "M") setMulti((v) => !v);
      else if (k === "l" || k === "L") setLabels((v) => !v);
      else if (k === "n" || k === "N") pickCut("off");
      else if (k === "c" || k === "C") pickCut("z");
      else if (k === "t" || k === "T") pickCut("y");
      else if (k === "a" || k === "A") pickCut("auto");
      else if (k === "p" || k === "P") {
        e.preventDefault();
        pickerRef.current?.open();
      } else if (k === "Escape") setOpenKey(null);
      else if (gated && /^[1-4]$/.test(k) && question) {
        const o = question.options[Number(k) - 1];
        if (o) {
          setPicked(o);
          submit(o, true);
        }
      } else if (gated && k === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, gated, quiz, question, submit, togglePlay, cycleSide, pickCut]);

  /* ---------- derived ---------- */
  const sideAlpha = useMemo(() => ({ L: alphaOf(sideMode, "L"), R: alphaOf(sideMode, "R") }), [sideMode]);
  const primary: Side = primaryOf(sideMode);
  const ni = beat?.neuron ?? 0;
  const neuron = cp.neurons[ni];
  const stepCards = useMemo(() => cards.filter((c) => c.pathway === slug), [cards, slug]);
  const cardsFor = useCallback((no: number) => stepCards.filter((c) => neuronForCard(c, cp) === no), [stepCards, cp]);
  const lesionSites = useMemo(() => {
    const zones = new Set(mp.neurons.flatMap((x) => x.stretches.filter((s) => !s.noLesion).flatMap((s) => s.zones ?? [])));
    return SITES.filter((s) => s.zones.some((z) => zones.has(z))).slice(0, 6);
  }, [mp]);
  const topic = cards.find((c) => c.pathway === slug && c.topic)?.topic ?? null;
  const copy = beat ? beatCopy(slug, cur, beat, bs.infos[beat.info], part) : null;
  const next = !all && cur < B - 1 ? beatCopy(slug, cur + 1, bs.beats[cur + 1], bs.infos[bs.beats[cur + 1].info], part) : null;
  const visual = !!mp.visual;
  const order = Math.min(4, (beat?.neuron ?? 0) + 1) as 1 | 2 | 3 | 4;
  const badge = /lcst|acst|corticobulbar|umn-lmn/.test(slug) ? (order === 1 ? "UMN" : "LMN") : /sympathetic/.test(slug) ? (order === 1 ? "Pre" : "Post") : `${ORDINAL[order]}`;
  // which side the signal is on now: the physical side of the focused fibre at the end of this beat, and whether that is the
  // same side as the stimulus / limb (the body side the user picked) or the opposite one
  const sideNow = useMemo(() => {
    if (!d || all) return null;
    const x = d.beats[cur]?.[primary];
    if (!x) return null;
    const p = x.f.length ? x.f[x.f.length - 1].pts.slice(-3) : (x.soma ?? x.syn ?? x.start)?.p;
    if (!p) return null;
    const px = p[0];
    // "crossing" only on a crossing beat (in the conus the cord itself is narrower than that margin)
    if (Math.abs(px) < 0.0006 && (x.cross || px === 0)) return { phys: null, rel: "mid" as const };
    const phys: Side = px > 0 ? "L" : "R";
    return { phys, rel: phys === primary ? ("same" as const) : ("opp" as const) };
  }, [d, cur, primary, all]);
  const sideText = (() => {
    if (!sideNow) return null;
    if (sideNow.rel === "mid") return "Crossing the midline";
    const rel = sideNow.rel === "same" ? `same side as the ${relNoun(slug)}` : `opposite the ${relNoun(slug)}`;
    if (sideMode === "both") return `Each side: ${rel}`;
    return `${sideNow.phys === "L" ? "Left" : "Right"} side, ${rel}`;
  })();
  const inset = useMemo(() => (d && !all ? insetFor(d, cur, primary, sideAlpha) : null), [d, cur, primary, all, sideAlpha]);
  useEffect(() => {
    if (!d) return;
    for (let i = 0; i < d.beats.length; i++) {
      const s = insetFor(d, i, primary, sideAlpha);
      if (s?.kind === "brainstem") void preloadPlate(s.level);
    }
  }, [d, primary, sideAlpha]);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => setPulseKey((k) => k + 1), [cur]);
  const [accent, setAccent] = useState("#22d3ee");
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const upd = () => {
      setAccent(readCssColor("--accent-2", "#22d3ee").getStyle());
      const bg = readCssColor("--bg-2", "#101010");
      setDark(bg.r * 0.3 + bg.g * 0.59 + bg.b * 0.11 < 0.5);
    };
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);
  const onPick = useCallback((k: string | null) => setOpenKey(k), []);
  const onHover = useCallback((k: string | null) => setHoverKey(k), []);
  const info = openKey && bs.infos[openKey] ? bs.infos[openKey] : null;
  const infoCards = info ? cardsFor(info.neuron + 1) : [];
  const regionSlug = openKey && (openKey.startsWith("r:") || openKey.startsWith("h:")) ? slugForStop(openKey.slice(2)) : null;
  const regionName = openKey && d ? regionNameOf(d, openKey) : null;
  const firstBeatOf = useCallback((idx: number) => Math.max(0, bs.beats.findIndex((b) => b.neuron === idx)), [bs.beats]);
  const sideWord = (s: Side) => `${s === "L" ? "Left" : "Right"} ${noun}`;
  const stepOptions = [
    ...mp.neurons.map((_, i) => ({ id: String(i), label: `${ORDINAL[i + 1]}${answered[`${slug}:${i}`] === "right" ? " ✓" : ""}`, tip: `${ORDINAL[i + 1]}-order neuron: ${cp.neurons[i]?.cell_body ?? ""}` })),
    { id: "all", label: "All", tip: "The whole pathway" },
  ];

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-132px)] lg:min-h-[680px] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PathwayPicker ref={pickerRef} groups={groups} value={slug} onChange={choose} />
          <Segmented
            big
            label={`Which side of the ${noun}`}
            value={sideMode}
            onChange={setSideMode}
            options={[
              { id: "L", label: sideWord("L"), tip: `${sideWord("L")} (solid lines): the other side dims`, keys: "S", icon: <BodyIcon fill="L" /> },
              { id: "both", label: "Both", tip: "Both sides: left solid, right dashed", keys: "S", icon: <BodyIcon fill="both" /> },
              { id: "R", label: sideWord("R"), tip: `${sideWord("R")} (dashed lines): the other side dims`, keys: "S", icon: <BodyIcon fill="R" /> },
            ]}
          />
          {cfg?.parts && cfg.parts.length > 1 && (
            <Segmented
              label="Where the signal starts"
              value={part}
              onChange={(v) => {
                setLimbPart(v);
                choose(slug);
              }}
              options={[
                { id: "hand", label: "Hand", tip: "Hand: C8, fasciculus cuneatus" },
                { id: "foot", label: "Foot", tip: "Foot: L5, fasciculus gracilis" },
              ]}
            />
          )}
        </div>

        <div
          ref={attachFs}
          className="relative min-h-[380px] flex-1 overflow-hidden rounded-card border border-panel-border bg-bg-2 max-lg:h-[62dvh] max-lg:flex-none [&:fullscreen]:!h-screen [&:fullscreen]:!min-h-0 [&:fullscreen]:!w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
        >
          {d && (
            <Scene3
              data={d}
              cur={curBeat}
              reveal={reveal}
              sideAlpha={sideAlpha}
              hoverKey={hoverKey}
              onHover={onHover}
              onPick={onPick}
              view={view}
              frameNonce={frameNonce}
              resetKey={dataKey}
              cut={cut}
              multi={multi}
              onMulti={setMulti}
              onView={setView}
              reduced={reduced}
              dark={dark}
              accent={accent}
              labels={labels}
              quiz={quiz}
              onReady={onReady}
              onProgress={onProgress}
            />
          )}
          {!loaded && (
            <AtlasLoader
              label="Placing the pathway"
              progress={prog.total ? prog.done / prog.total : undefined}
              stages={stagesFrom([
                ["data", "Reading the traced pathway", !!d, dataErr ?? undefined],
                ["geometry", "Placing nerves, tracts and nuclei", ready, prog.total ? `${prog.done} / ${prog.total}` : undefined],
              ])}
            />
          )}
          {loadNote && <p role="status" className="absolute bottom-16 left-2 z-10 max-w-sm rounded-sm border border-panel-border bg-panel-solid/90 px-2 py-1 text-[11px] text-text-dim">{loadNote}</p>}

          {/* legend: colour = neuron, line style = side */}
          {loaded && !multi && keyOpen && <Legend visual={visual} motor={/lcst|acst|corticobulbar|umn-lmn/.test(slug)} n={n} onClose={() => setKeyOpen(false)} />}
          {loaded && !multi && !keyOpen && (
            <button type="button" onClick={() => setKeyOpen(true)} className="absolute left-2 top-2 z-10 rounded-sm border border-panel-border bg-panel-solid/92 px-2 py-1 text-[11px] text-text" aria-label="Show the colour and line key">
              Key
            </button>
          )}
          {/* phones: the beat's title and side stay on screen with the scene (the four answers at a glance) */}
          {loaded && !all && copy && (
            <div className="pointer-events-none absolute inset-x-12 top-2 z-10 flex flex-col items-center gap-0.5 text-center sm:hidden" aria-hidden>
              <span className="max-w-full whitespace-normal text-balance rounded-sm bg-panel-solid/92 px-2 py-0.5 text-[12px] font-semibold leading-tight text-text">
                <span className="mr-1 rounded-sm px-1 font-mono text-[10px]" style={{ background: visual ? FIELD_COLORS.leftUpper : ORDER_COLORS[order], color: "#111" }}>{badge}</span>
                {stripGate(copy.title)}
              </span>
              {sideText && <span className="rounded-sm bg-panel-solid/85 px-1.5 text-[10.5px] leading-tight text-text-dim">{sideText}</span>}
            </div>
          )}

          {/* section inset for cord and brainstem beats */}
          {loaded && inset && !multi && (
            <div className="pointer-events-auto absolute right-2 top-12 z-10 rounded-card border border-panel-border bg-panel-solid/95 p-1.5 shadow-pop max-sm:hidden">
              {inset.kind === "cord" ? (
                <CordInset level={inset.level} structures={inset.structures} side={inset.side} pulseKey={pulseKey} compact />
              ) : (
                <BrainstemRef level={inset.level} structures={inset.structures} side={inset.side} pulseKey={pulseKey} compact onPick={(s) => setOpenKey(`bs:${s}`)} />
              )}
            </div>
          )}

          {/* info card: a region opens the Explore card; a fibre or cell body opens the beat's course notes */}
          {(info || regionSlug || openKey?.startsWith("bs:")) && openKey && (
            <div className="absolute left-2 top-12 z-20 max-h-[72%] w-[min(360px,calc(100%-16px))] overflow-y-auto rounded-card border border-panel-border bg-panel-solid/97 p-3 text-sm shadow-pop" role="dialog" aria-label="Notes">
              <div className="mb-1 flex items-start gap-2">
                <p className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">{info ? (info.kind === "node" ? "Stop" : "Fibre") : "Structure"}</p>
                <IconButton label="Close" keys="Esc" icon={<X size={15} />} onClick={() => setOpenKey(null)} size={28} />
              </div>
              {info ? (
                <>
                  <h3 className="font-display text-base leading-tight">{withGate(info.title)}</h3>
                  <dl className="mt-2 grid gap-1.5">
                    {info.lines.filter(([, v]) => meaningful(v)).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[88px_1fr] gap-2">
                        <dt className="text-xs text-text-faint">{k}</dt>
                        <dd className="min-w-0 text-[13px]">{withGate(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {meaningful(info.crossing) && (
                    <p className="mt-2 rounded-sm border px-2 py-1 text-[13px]" style={{ borderColor: GUIDE_COLORS.crossing }}>
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
                  {infoCards.slice(0, 3).map((c) => (
                    <details key={c.slug} className="mt-1 rounded-sm border border-panel-border px-2 py-1 text-[13px]">
                      <summary className="cursor-pointer">{c.prompt}</summary>
                      <p className="mt-1 text-text-dim">{c.answer}</p>
                    </details>
                  ))}
                </>
              ) : regionSlug ? (
                <StructureInfo key={regionSlug} slug={regionSlug} name={regionName ?? undefined} />
              ) : openKey.startsWith("bs:") ? (
                <StructureInfo key={openKey} slug={openKey.slice(3)} />
              ) : (
                <p className="text-sm">{regionName}</p>
              )}
              {regionName && !regionSlug && !info && <p className="mt-1 text-xs text-text-dim">Not a structure on the course lists.</p>}
            </div>
          )}

          {/* toolbar: Explore's view, cut and multi-view tools */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center gap-1.5">
            {cut.mode !== "auto" && cut.mode !== "off" && (
              <div className="atl-bar pointer-events-auto items-center gap-2 px-2">
                <input type="range" min={0} max={1000} value={Math.round(cut.t * 1000)} onChange={(e) => setCut((c) => ({ ...c, t: Number(e.target.value) / 1000 }))} aria-label="Cut position" className="w-40 sm:w-56" />
                <IconBtn label="Flip the cut side" icon={<FlipHorizontal2 />} onClick={() => setCut((c) => ({ ...c, flip: !c.flip }))} />
              </div>
            )}
            <div className="atl-bar pointer-events-auto" role="toolbar" aria-label="3D view controls">
              <IconBtn label={barOpen ? "Hide controls" : "Show controls"} icon={barOpen ? <ChevronDown /> : <ChevronUp />} onClick={() => setBarOpen((o) => !o)} />
              {barOpen && (
                <>
                  <Divider />
                  {!multi && (
                    <Group label="View">
                      <Popover trigger={({ open, toggle }) => <IconBtn label="Camera view" icon={<Orbit />} text={view === "beat" ? "Beat" : VIEW_LABELS.find((v) => v[0] === view)?.[1]} on={open} onClick={toggle} />}>
                        {(close) => (
                          <>
                            <MenuItem label="Follow the beat" keys="F" on={view === "beat"} onClick={() => { setView("beat"); setFrameNonce((x) => x + 1); close(); }} />
                            {VIEW_LABELS.map(([id, label]) => (
                              <MenuItem key={id} label={label} on={view === id} onClick={() => { setView(id); setFrameNonce((x) => x + 1); close(); }} />
                            ))}
                          </>
                        )}
                      </Popover>
                    </Group>
                  )}
                  <Divider />
                  <Group label="Cut">
                    <IconBtn radio label="Cut follows the beat" keys="A" text="Auto" on={cut.mode === "auto"} onClick={() => pickCut("auto")} />
                    {([
                      ["off", "No cut", "N", <CutNoneIcon key="n" />],
                      ["z", "Coronal cut", "C", <CutCoronalIcon key="c" />],
                      ["x", "Sagittal cut", "", <CutSagittalIcon key="s" />],
                      ["y", "Transverse cut", "T", <CutTransverseIcon key="t" />],
                    ] as const).map(([id, label, key, icon]) => (
                      <IconBtn key={id} radio label={label} keys={key || undefined} on={cut.mode === id} onClick={() => pickCut(id)} icon={icon} />
                    ))}
                  </Group>
                  <Divider />
                  <Group label="Layout">
                    <IconBtn label={labels ? "Hide labels" : "Show labels"} keys="L" on={labels} onClick={() => setLabels((v) => !v)} icon={<Tag />} />
                    <IconBtn label="Multi-view (anterior, lateral, superior, free)" keys="M" on={multi} onClick={() => setMulti((v) => !v)} icon={<LayoutGrid />} />
                    <IconBtn label="Re-frame (follow the beat)" keys="F" onClick={() => { setView("beat"); setFrameNonce((x) => x + 1); }} icon={<Focus />} />
                    {canFs && <IconBtn label={isFs ? "Leave full screen" : "Full screen"} on={isFs} onClick={toggleFs} icon={isFs ? <Minimize2 /> : <Maximize2 />} />}
                  </Group>
                </>
              )}
            </div>
          </div>
        </div>

        {/* beat controls and the four answers */}
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
            <IconButton label="Quiz: what comes next?" keys="Q" icon={<CircleHelp size={16} />} pressed={quiz} onClick={() => { setQuiz((v) => !v); setPlaying(false); }} />
          </div>
        </div>
        <div className="rounded-card border border-panel-border bg-panel-solid/70 px-3 py-2" aria-live="polite">
          {all ? (
            <p className="text-sm">
              <span className="font-display text-base">The whole route</span> <span className="text-text-dim">{B} beats, {n} neurons{meaningful(cp.decussation) ? `; crossing: ${cp.decussation}` : ""}.</span>
            </p>
          ) : copy ? (
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ background: visual ? FIELD_COLORS.leftUpper : ORDER_COLORS[order], color: "#111" }} title={`${badge} neuron`}>
                  {badge}
                </span>
                <h2 className="font-display text-lg leading-tight">{withGate(copy.title)}</h2>
                {sideText && (
                  <span className="chip" title="Which side the signal is on now">
                    {sideMode !== "both" && (
                      <svg width="18" height="6" aria-hidden className="mr-1 inline-block align-middle">
                        <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2.4" strokeDasharray={primary === "R" ? "5 3" : undefined} />
                      </svg>
                    )}
                    {sideText}
                    {copy.where ? ` · ${copy.where}` : ""}
                  </span>
                )}
              </div>
              <p className="text-sm leading-snug">{withGate(copy.sentence)}</p>
              {next && (
                <p className="text-xs text-text-dim">
                  {NEXT_PREFIX} <span className="text-text">{withGate(next.title)}</span>
                </p>
              )}
            </div>
          ) : null}
        </div>
        {gated && question && (
          <div className="grid gap-2 rounded-card border border-accent/60 p-3">
            <p className="eyebrow">Quiz · beat {cur + 1} of {B}</p>
            <h2 className="font-display text-lg">{question.prompt}</h2>
            <form onSubmit={(e) => { e.preventDefault(); submit(typed, false); }} className="flex gap-2">
              <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type the structure…" className="min-w-0 flex-1 rounded-sm border border-panel-border bg-panel-solid px-2 py-1.5 text-text" autoComplete="off" spellCheck={false} />
              <button className="btn btn-primary" type="submit" disabled={typed.trim().length < 2}>Check</button>
            </form>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {question.options.map((o, i) => (
                <button key={o} type="button" className={`btn text-left ${picked === o ? "btn-primary" : ""}`} style={{ justifyContent: "flex-start" }} onClick={() => { setPicked(o); submit(o, true); }}>
                  <span className="kbd mr-2">{i + 1}</span>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        {feedback && !all && (
          <p className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: feedback.ok ? "var(--good)" : "var(--again)" }}>
            {feedback.ok ? "Correct." : "Not quite."} <strong>{feedback.q.answer}</strong>
          </p>
        )}
        <p className="help-line flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-xs text-text-dim [&_.kbd]:mr-1 [&_.kbd]:rounded [&_.kbd]:border [&_.kbd]:border-panel-border [&_.kbd]:bg-bg-3 [&_.kbd]:px-1.5 [&_.kbd]:py-px [&_.kbd]:font-mono [&_.kbd]:text-[11px] [&_.kbd]:text-text">
          <span><span className="kbd">←</span> <span className="kbd">→</span> beat</span>
          <span><span className="kbd">Space</span> play</span>
          <span><span className="kbd">S</span> side</span>
          <span><span className="kbd">F</span> frame</span>
          <span><span className="kbd">M</span> multi-view</span>
          <span>click a structure or a fibre for its notes</span>
        </p>
      </div>

      {/* side rail: the textbook diagram (synced both ways), then the neuron in detail */}
      <aside className="pw3-rail grid min-w-0 content-start gap-3 lg:w-[392px] lg:flex-none lg:overflow-y-auto" aria-label="Diagram and notes">
        <style>{`@media (max-width:1023px){.pw3-rail .pwd-fitbox{height:min(68dvh,560px)}}`}</style>
        <div className="panel grid gap-1 p-2">
          <p className="eyebrow min-w-0">{cp.name}: the textbook diagram</p>
          <div className="min-h-[300px] lg:h-[560px]">
            <Schematic slug={slug} beats={bs.beats} cur={curBeat} reveal={reveal} hoverKey={hoverKey} onHover={setHoverKey} onPick={(k) => setOpenKey(k)} reduced={reduced} sideAlpha={sideAlpha} />
          </div>
        </div>
        <div className="panel grid gap-2 p-3">
          {!all && neuron ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg">{ORDINAL[neuron.order]}-order neuron</h2>
                {neuron.decussates ? <span className="chip boss">decussates</span> : <span className="chip follow">no crossing</span>}
              </div>
              <dl className="grid gap-1.5 text-sm">
                <div><dt className="label">Cell body</dt><dd>{withGate(neuron.cell_body)}</dd></div>
                <div><dt className="label">Tract</dt><dd>{withGate(neuron.tract)}</dd></div>
                <div><dt className="label">Synapse</dt><dd>{withGate(neuron.synapse)}</dd></div>
                {meaningful(neuron.level) && <div><dt className="label">Level</dt><dd>{neuron.level}</dd></div>}
              </dl>
              {(() => {
                const loss = mp.neurons[ni]?.stretches.find((s) => s.loss)?.loss ?? mp.loss;
                return (
                  <p className="flex items-start gap-2 text-sm">
                    <DeficitIcons text={loss} size={17} />
                    <span><span className="text-text-faint">If damaged here: </span>loss of {loss.replace(/\s*\([^)]*\)/g, "")}</span>
                  </p>
                );
              })()}
            </>
          ) : (
            <>
              <h2 className="font-display text-lg">The whole pathway</h2>
              {meaningful(cp.decussation) && <p className="text-sm"><span className="label">Decussation</span> {cp.decussation}</p>}
              {(meaningful(cp.lesion.below_decussation) || meaningful(cp.lesion.above)) && (
                <div className="grid gap-1 text-sm">
                  <p className="label">Lesion rule</p>
                  {meaningful(cp.lesion.below_decussation) && <p><span className="text-text-dim">Below the crossing:</span> {cp.lesion.below_decussation}</p>}
                  {meaningful(cp.lesion.above) && <p><span className="text-text-dim">Above the crossing:</span> {cp.lesion.above}</p>}
                </div>
              )}
            </>
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
          <PathwayCredits />
          <span className="hidden">{courseSlug}</span>
        </div>
      </aside>
    </div>
  );
}

function regionNameOf(d: V3Data, key: string): string | null {
  const k = key.replace(/^[rh]:/, "");
  for (const b of d.beats) for (const s of ["L", "R"] as const) for (const st of b[s]?.stops ?? []) if (st.key === k) return st.name;
  const g = d.geo[k];
  return g ? g.name : k.startsWith("a:") ? k.slice(2).split("@")[0].replace(/^mni-/, "").replace(/-/g, " ") : null;
}

/** Plain text of a copy string (the ‹ › gate marks dropped with their content). */
function stripGate(s: string) {
  return s.replace(/‹[^›]*›/g, "").replace(/\s{2,}/g, " ").trim();
}

function Legend({ visual, motor, n, onClose }: { visual: boolean; motor: boolean; n: number; onClose: () => void }) {
  const rows = visual
    ? [
        ["Left visual field", FIELD_COLORS.leftUpper],
        ["Right visual field", FIELD_COLORS.rightUpper],
      ]
    : Array.from({ length: Math.min(4, n) }, (_, i) => [motor ? (i === 0 ? "Upper motor neuron" : "Lower motor neuron") : `${ORDINAL[i + 1]}-order neuron`, ORDER_COLORS[(i + 1) as 1 | 2 | 3 | 4]]);
  return (
    <div className="absolute left-2 top-2 z-10 grid gap-1 rounded-sm border border-panel-border bg-panel-solid/92 py-1.5 pl-2 pr-6 text-[11px] leading-none text-text">
      <button type="button" onClick={onClose} className="absolute right-0.5 top-0.5 rounded-sm p-0.5 text-text-dim hover:text-text" aria-label="Hide the key">
        <X size={12} aria-hidden />
      </button>
      {rows.map(([t, c]) => (
        <span key={t} className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#111" strokeWidth="5" strokeLinecap="round" /><line x1="1" y1="4" x2="21" y2="4" stroke={c} strokeWidth="2.8" strokeLinecap="round" /></svg>
          {t}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="var(--text)" strokeWidth="2.4" /></svg>
        Left side · <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="var(--text)" strokeWidth="2.4" strokeDasharray="5 3" /></svg> right side
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden><rect x="2" y="1" width="18" height="8" rx="4" fill="#ede6d6" stroke="#1c1a17" strokeWidth="1.4" /></svg>
        Region (stop): click for notes
      </span>
    </div>
  );
}
