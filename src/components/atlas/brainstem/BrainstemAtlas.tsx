"use client";
// /atlas/brainstem: transverse brainstem levels from midbrain to cervicomedullary, as course images, histology, gross,
// cartoon and MRI, with labels, a label quiz, an "at this level" panel and progress.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Brain, ChevronDown, ChevronUp, Columns2, Eye, EyeOff, CircleHelp, GraduationCap, Microscope, PenTool, ScanLine, type LucideIcon } from "lucide-react";
import { trackAtlas } from "@/lib/atlas/progress";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import "./brainstem.css";
import { IconBtn } from "./ui";
import { LevelNav, type ProgressView } from "./LevelNav";
import { LevelPanel } from "./LevelPanel";
import { Pane } from "./Pane";
import { imageSrc, type LabelMode, type QuizResult } from "./SectionViewer";
import { countFor, IMAGES, imagesFor, LEVELS, levelBySlug, STRUCTURES, STYLES, type StyleId } from "./data";

const ICONS: Record<StyleId, LucideIcon> = { course: GraduationCap, histology: Microscope, gross: Brain, cartoon: PenTool, mri: ScanLine };
const STORE = "bs-progress-v1";
type Store = { visited: Record<string, boolean>; best: Record<string, { right: number; total: number }> };
const MODES: { id: LabelMode; label: string; key: string; icon: LucideIcon }[] = [
  { id: "labels", label: "Labels: names on hover", key: "L", icon: Eye },
  { id: "quiz", label: "Quiz: labels covered", key: "Q", icon: CircleHelp },
  { id: "clean", label: "Clean: no overlays", key: "C", icon: EyeOff },
];

function readStore(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as Store | null;
    if (v && typeof v === "object") return { visited: v.visited ?? {}, best: v.best ?? {} };
  } catch {
    /* private mode or corrupt: start fresh */
  }
  return { visited: {}, best: {} };
}

export function BrainstemAtlas({ courseSlug }: { courseSlug: string }) {
  const [levelSlug, setLevel] = useState(LEVELS[0].slug);
  const [want, setWant] = useState<StyleId>("course");
  const [idx, setIdx] = useState(0);
  const [compare, setCompare] = useState(false);
  const [want2, setWant2] = useState<StyleId>("cartoon");
  const [idx2, setIdx2] = useState(0);
  const [mode, setMode] = useState<LabelMode>("labels");
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<number, QuizResult>>>({});
  const [store, setStore] = useState<Store>({ visited: {}, best: {} });
  const [out, setOut] = useState<{ src: string; ratio: number } | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const level = levelBySlug(levelSlug);
  // styles with nothing for this level fall back to the first that has something
  const avail = STYLES.filter((s) => countFor(level, s.id) > 0).map((s) => s.id);
  const style: StyleId = avail.includes(want) ? want : (avail[0] ?? "course");
  const style2: StyleId = avail.includes(want2) && want2 !== style ? want2 : (avail.find((s) => s !== style) ?? style);
  const canCompare = avail.length > 1;
  const comparing = compare && canCompare;
  const cur = style === "mri" ? null : imagesFor(level.slug, style)[idx];

  useEffect(() => {
    setStore(readStore());
    loaded.current = true;
  }, []);
  const save = useCallback((fn: (s: Store) => Store) => {
    setStore((s) => {
      const n = fn(s);
      if (loaded.current) {
        try {
          localStorage.setItem(STORE, JSON.stringify(n));
        } catch {
          /* ignore */
        }
      }
      return n;
    });
  }, []);

  // viewing a level + style counts as a visit
  useEffect(() => {
    trackAtlas({ type: "brainstem_level_viewed", level: level.slug, style });
    save((s) => (s.visited[level.slug] ? s : { ...s, visited: { ...s.visited, [level.slug]: true } }));
  }, [level.slug, style, save]);

  const snapshot = useCallback(() => {
    if (!cur) return;
    if (outTimer.current) clearTimeout(outTimer.current);
    setOut({ src: imageSrc(cur, courseSlug), ratio: cur.w && cur.h ? cur.w / cur.h : 4 / 3 });
    outTimer.current = setTimeout(() => setOut(null), 280);
  }, [cur, courseSlug]);
  useEffect(() => () => void (outTimer.current && clearTimeout(outTimer.current)), []);

  const goLevel = useCallback(
    (slug: string) => {
      if (slug === levelSlug) return;
      snapshot();
      setLevel(slug);
      setIdx(0);
      setIdx2(0);
      setSelected(null);
      setHover(null);
    },
    [levelSlug, snapshot],
  );
  const step = useCallback(
    (d: number) => {
      const i = LEVELS.findIndex((l) => l.slug === levelSlug);
      const n = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + d))];
      goLevel(n.slug);
    },
    [levelSlug, goLevel],
  );
  const pickStyle = (s: StyleId) => {
    if (s === style) return;
    snapshot();
    setWant(s);
    setIdx(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") step(1);
      else if (k === "arrowup" || k === "k") step(-1);
      else if (k === "l") setMode("labels");
      else if (k === "q") setMode("quiz");
      else if (k === "c") setMode("clean");
      else if (k === "x") setCompare((c) => !c);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const onResult = useCallback(
    (imageId: string, i: number, r: QuizResult, slug: string | null) => {
      const im = IMAGES.find((x) => x.id === imageId);
      trackAtlas({ type: "brainstem_label", level: im?.level ?? levelSlug, slug: slug ?? "unlisted", correct: r === "right" });
      setResults((prev) => {
        const nextImg = { ...(prev[imageId] ?? {}), [i]: r };
        const total = im?.labels.length ?? 0;
        const right = Object.values(nextImg).filter((x) => x === "right").length;
        const lv = im?.level;
        if (lv && total > 0 && Object.keys(nextImg).length === total) {
          // a finished image: keep the best ratio per level
          save((s) => {
            const b = s.best[lv];
            return !b || right / total > b.right / b.total ? { ...s, best: { ...s.best, [lv]: { right, total } } } : s;
          });
        }
        return { ...prev, [imageId]: nextImg };
      });
    },
    [levelSlug, save],
  );

  const select = (slug: string) => {
    setSelected(slug);
    trackAtlas({ type: "structure_viewed", slug, via: "brainstem" });
  };

  const progress: ProgressView = store;
  const sections = LEVELS.filter((l) => l.kind === "section");
  const seen = LEVELS.filter((l) => store.visited[l.slug]).length;
  const secSeen = sections.filter((l) => store.visited[l.slug]).length;
  const quizzed = sections.filter((l) => store.best[l.slug]).length;
  const stylesBar = useMemo(() => STYLES, []);
  const selName = selected ? STRUCTURES[selected]?.name : undefined;

  const paneProps = { level, courseSlug, mode, hoverSlug: hover, onHover: setHover, results, onResult };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[272px_minmax(0,1fr)] 2xl:grid-cols-[272px_minmax(0,1fr)_minmax(0,340px)]">
      <div className="min-w-0 md:row-span-2 2xl:row-span-1">
        <LevelNav level={levelSlug} onPick={goLevel} progress={progress} />
        <div className="mt-3 hidden text-xs text-text-dim md:block">
          <div className="mb-1 flex justify-between">
            <span>Progress</span>
            <span>
              {secSeen}/{sections.length} levels, {quizzed} quizzed
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuemin={0} aria-valuemax={LEVELS.length} aria-valuenow={seen} aria-label="Views visited">
            <div className="h-full w-full origin-left bg-accent" style={{ transform: `scaleX(${seen / LEVELS.length})` }} />
          </div>
          <p className="mt-2">Up/Down or J/K: move a level. L, Q, C: label mode. X: compare.</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="bs-seg" role="tablist" aria-label="Image style">
            {stylesBar.map((s) => {
              const n = countFor(level, s.id);
              const Icon = ICONS[s.id];
              return (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === style} disabled={n === 0} title={n === 0 ? `${s.label}: nothing for this level yet` : `${s.label}${n > 1 ? ` (${n})` : ""}`} onClick={() => pickStyle(s.id)}>
                  <Icon size={15} aria-hidden />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="bs-seg bs-icons" role="group" aria-label="Label mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} title={`${m.label} (${m.key})`} aria-label={`${m.label} (${m.key})`} onClick={() => setMode(m.id)}>
                <m.icon size={16} aria-hidden />
              </button>
            ))}
          </div>
          <IconBtn icon={Columns2} label="Compare two styles" keys="X" pressed={comparing} disabled={!canCompare} onClick={() => setCompare((c) => !c)} />
          <div className="ml-auto flex gap-1.5">
            <IconBtn icon={ChevronUp} label="Previous level" keys="Up / K" onClick={() => step(-1)} disabled={levelSlug === LEVELS[0].slug} />
            <IconBtn icon={ChevronDown} label="Next level" keys="Down / J" onClick={() => step(1)} disabled={levelSlug === LEVELS[LEVELS.length - 1].slug} />
          </div>
        </div>

        <div className="relative">
          {out && !comparing && (
            <div className="bs-fade-out pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" aria-hidden>
              <div style={{ width: "100%", aspectRatio: String(out.ratio), maxWidth: `min(100%, calc(var(--bs-max-h, 66vh) * ${out.ratio}))` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={out.src} alt="" className="h-full w-full object-contain" />
              </div>
            </div>
          )}
          <div key={`${level.slug}|${style}`} className="bs-fade-in">
            {comparing ? (
              <div className="grid gap-3 lg:grid-cols-2" style={{ ["--bs-max-h" as string]: "56vh" }}>
                <Pane {...paneProps} style={style} index={idx} onIndex={setIdx} />
                <div>
                  <div className="bs-seg mb-2" role="tablist" aria-label="Second image style">
                    {stylesBar
                      .filter((s) => s.id !== style)
                      .map((s) => {
                        const Icon = ICONS[s.id];
                        const n = countFor(level, s.id);
                        return (
                          <button key={s.id} type="button" role="tab" aria-selected={s.id === style2} disabled={n === 0} title={n === 0 ? `${s.label}: nothing for this level yet` : s.label} onClick={() => (setWant2(s.id), setIdx2(0))}>
                            <Icon size={15} aria-hidden />
                            <span className="hidden sm:inline">{s.label}</span>
                          </button>
                        );
                      })}
                  </div>
                  <Pane {...paneProps} style={style2} index={idx2} onIndex={setIdx2} />
                </div>
              </div>
            ) : (
              <Pane {...paneProps} style={style} index={idx} onIndex={setIdx} />
            )}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-dim">
          <BookOpen size={13} aria-hidden /> Click an image to zoom, drag to pan, pinch on touch screens.
        </p>
      </div>

      <div className="min-w-0 md:col-start-2 2xl:col-start-3">
        <LevelPanel level={level} hoverSlug={hover} onHover={setHover} selected={selected} onSelect={select} />
        {selected && <StructureInfo key={selected} slug={selected} name={selName} />}
      </div>
    </div>
  );
}
