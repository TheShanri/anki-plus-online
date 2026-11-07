"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type WP,
} from "@/lib/atlas/pathways";
import { PathwayViewer } from "./PathwayViewer";
import { VIEWS, type SceneColors, type SceneLayer, type SceneMark, type SceneTube, type View } from "./PathwayScene";
import { useSceneColors } from "./sceneTheme";

const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Sensory", slugs: ["dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain"] },
  { title: "Motor", slugs: ["lcst", "acst", "corticobulbar", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn"] },
  { title: "Cerebellum and basal ganglia", slugs: ["corticopontocerebellar", "cerebellar", "basal-ganglia"] },
  { title: "Eye and reflexes", slugs: ["visual", "pupillary", "corneal", "gaze", "jaw-jerk"] },
  { title: "Autonomic, smell and limbic", slugs: ["sympathetic", "parasympathetic", "olfactory", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward"] },
];
const SIDE_WORD: Record<string, string> = {
  visual: "visual field",
  pupillary: "eye lit",
  cerebellar: "cerebellar side",
  corticopontocerebellar: "cerebellar side",
  "basal-ganglia": "body side affected",
  lcst: "limb moved",
  acst: "limb moved",
  corticobulbar: "face side",
  rubrospinal: "limb moved",
  tectospinal: "limb moved",
  "umn-lmn": "limb moved",
  vestibulospinal: "limb moved",
  reticulospinal: "limb moved",
};
const sideWord = (slug: string) => SIDE_WORD[slug] ?? "body side stimulated";

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


function buildScene(o: { mp: MapPathway; slug: string; body: Side; cur: number; lastShown: number; summary: boolean; follow: boolean; colors: SceneColors; effFocus: string }) {
  const { mp, slug, body, cur, lastShown, summary, follow, colors, effFocus } = o;

    const layers: SceneLayer[] = [];
    const tubes: SceneTube[] = [];
    const marks: SceneMark[] = [];
    const fit: { wp: WP; body: Side }[] = [];
    const relColor = (rel: string) => (rel === "i" ? (body === "L" ? colors.left : colors.right) : rel === "c" ? (body === "L" ? colors.right : colors.left) : colors.hi);
    mp.neurons.forEach((nr, ni) => {
      const visible = ni <= lastShown;
      const active = ni === cur || summary;
      const inFit = follow && !summary ? ni === cur : true;
      for (const st of nr.stretches) {
        if (inFit && (effFocus === "all" || ni !== cur || st.k === effFocus || !follow)) {
          st.path?.forEach((w) => fit.push({ wp: w, body }));
          st.marks?.forEach((m) => fit.push({ wp: m.p, body }));
        }
        if (!visible) continue;
        const ps = physSide(st.phys, body);
        if (st.ids?.length) {
          layers.push({
            key: `${ni}:${st.k}`,
            ids: st.ids,
            side: ps ?? "both",
            color: ps === "L" ? colors.left : ps === "R" ? colors.right : colors.hi,
            opacity: active ? 0.9 : 0.5,
          });
        }
        if (st.path && st.path.length > 1) {
          tubes.push({ key: `${slug}:${body}:${ni}:${st.k}`, pts: st.path, body, opacity: active ? 1 : 0.55, reveal: 1, pulse: ni === cur && !summary, width: active ? 1 : 0.75 });
        }
        st.marks?.forEach((m, mi) => {
          if (m.kind !== "dec" && !(ni === cur || summary)) return;
          marks.push({ key: `${slug}:${body}:${ni}:${st.k}:${mi}`, p: m.p, body, kind: m.kind, text: m.text, color: m.kind === "dec" ? colors.hi : relColor(String(m.p[1])) });
        });
      }
    });
    return { layers, tubes, marks, fit };
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
  const ordered = useMemo(() => GROUPS.map((g) => ({ ...g, slugs: g.slugs.filter((s) => bySlug.has(s) && PATHWAY_MAP[s]) })), [bySlug]);
  const [slug, setSlug] = useState(initial.p && bySlug.has(initial.p) && PATHWAY_MAP[initial.p] ? initial.p : "dcml");
  const [body, setBody] = useState<Side>(initial.side === "L" ? "L" : "R");
  const [step, setStep] = useState(Math.max(0, Number(initial.step) || 0));
  const [quiz, setQuiz] = useState(false);
  const [answered, setAnswered] = useState<Answered>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; q: Question } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>("anterior");
  const [follow, setFollow] = useState(true);
  const [frameNonce, setFrameNonce] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const colors = useSceneColors();
  const inputRef = useRef<HTMLInputElement>(null);

  const cp = bySlug.get(slug)!;
  const mp = PATHWAY_MAP[slug];
  const n = mp.neurons.length;
  const cur = Math.min(step, n); // n = whole pathway
  const summary = cur >= n;
  const qKey = `${slug}:${cur}`;
  const question = useMemo(() => (quiz && !summary ? buildQuestion(slug, cur, courses) : null), [quiz, summary, slug, cur, courses]);
  const gated = !!question && !answered[qKey];
  const lastShown = summary ? n - 1 : gated ? cur - 1 : cur;

  const go = useCallback(
    (d: number) => {
      setStep((s) => Math.max(0, Math.min(n, s + d)));
      setFocus(null);
      setPicked(null);
      setTyped("");
      setFeedback(null);
    },
    [n],
  );
  const choose = useCallback((s: string) => {
    setSlug(s);
    setStep(0);
    setFocus(null);
    setPlaying(false);
    setPicked(null);
    setTyped("");
    setFeedback(null);
    setReady(false);
  }, []);

  // url state
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("p", slug);
    u.searchParams.set("side", body);
    u.searchParams.set("step", String(cur));
    window.history.replaceState(null, "", u);
  }, [slug, body, cur]);

  // play
  useEffect(() => {
    if (!playing || quiz) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= n) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
      setFocus(null);
    }, 4600);
    return () => clearInterval(t);
  }, [playing, quiz, n]);

  const submit = useCallback(
    (text: string, viaOption: boolean) => {
      if (!question || answered[qKey]) return;
      const ok = viaOption ? text === question.answer : checkTyped(text, question.keys);
      setAnswered((a) => ({ ...a, [qKey]: ok ? "right" : "wrong" }));
      setFeedback({ ok, q: question });
    },
    [question, answered, qKey],
  );

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
        setPlaying((p) => !p);
      } else if (e.key === "q" || e.key === "Q") setQuiz((v) => !v);
      else if (e.key === "v" || e.key === "V") setView((v) => VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length].id);
      else if (e.key === "f" || e.key === "F") setFrameNonce((x) => x + 1);
      else if (e.key === "s" || e.key === "S") setBody((b) => opp(b));
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
  }, [go, gated, quiz, question, submit]);

  const stepStretches = !summary ? mp.neurons[cur].stretches.filter((x) => x.path && x.path.length > 1) : [];
  // a step with a decussation opens zoomed on the crossing
  const effFocus = summary ? "all" : (focus ?? stepStretches.find((x) => x.phys === "cross")?.k ?? "all");

  /* ---------- the 3D scene for this step ---------- */
  const scene = buildScene({ mp, slug, body, cur, lastShown, summary, follow, colors, effFocus });

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

  const sideLines = (mapN?.stretches ?? []).map((s) => {
    const ps = physSide(s.phys, body);
    const txt = s.phys === "cross" ? `Crosses the midline: ${sideName(body)} to ${sideName(opp(body))}` : `${sideName(ps!)} side (${s.phys === "i" ? "ipsilateral" : "contralateral"})`;
    return { label: s.label, txt, color: s.phys === "cross" ? colors.hi : ps === "L" ? colors.left : colors.right };
  });

  const topic = stepCards[0] ? (cards.find((c) => c.pathway === slug && c.topic)?.topic ?? null) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pw-select">Pathway</label>
          <select
            id="pw-select"
            value={slug}
            onChange={(e) => choose(e.target.value)}
            className="min-w-0 max-w-full flex-1 rounded-sm border border-panel-border bg-panel-solid px-2 py-1.5 text-sm text-text"
          >
            {ordered.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.slugs.map((s) => (
                  <option key={s} value={s}>
                    {bySlug.get(s)!.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div role="group" aria-label={`Side of the ${sideWord(slug)}`} className="flex items-center gap-1">
            <span className="text-xs text-text-dim">{sideWord(slug)}:</span>
            {(["L", "R"] as Side[]).map((s) => (
              <button key={s} type="button" aria-pressed={body === s} onClick={() => setBody(s)} className={`btn ${body === s ? "btn-primary" : ""}`} style={{ minWidth: 38 }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-card border border-panel-border bg-bg-2" style={{ height: "min(64vh, 640px)", minHeight: 360 }}>
          <PathwayViewer
            layers={scene.layers}
            tubes={scene.tubes}
            marks={scene.marks}
            fit={scene.fit}
            view={view}
            frameNonce={frameNonce}
            colors={colors}
            onReady={setReady}
          />
          {!ready && <div className="pointer-events-none absolute left-3 top-3 rounded-sm bg-panel-solid/80 px-2 py-1 text-xs text-text-dim">Placing the pathway…</div>}
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-sm bg-panel-solid/85 px-2 py-1" style={{ color: colors.left }}>■ Left side</span>
            <span className="rounded-sm bg-panel-solid/85 px-2 py-1" style={{ color: colors.right }}>■ Right side</span>
            <span className="rounded-sm bg-panel-solid/85 px-2 py-1" style={{ color: colors.hi }}>◆ Decussation</span>
          </div>
          <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`btn ${view === v.id ? "btn-primary" : ""}`} style={{ padding: "2px 8px", fontSize: 12 }}>
                {v.label}
              </button>
            ))}
            <button type="button" className="btn" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setFrameNonce((x) => x + 1)} title="Re-frame (F)">
              Frame
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Steps">
          {mp.neurons.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={cur === i}
              onClick={() => {
                setStep(i);
                setFocus(null);
                setPicked(null);
                setTyped("");
                setFeedback(null);
              }}
              className={`btn ${cur === i ? "btn-primary" : ""}`}
              style={{ minWidth: 44 }}
            >
              {ORDINAL[i + 1]}
              {answered[`${slug}:${i}`] === "right" ? " ✓" : ""}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={summary} onClick={() => { setStep(n); setFocus(null); }} className={`btn ${summary ? "btn-primary" : ""}`}>
            Whole
          </button>
          <span className="mx-1 h-5 w-px bg-panel-border" />
          <button type="button" className="btn" onClick={() => go(-1)} disabled={cur === 0} aria-label="Previous step">
            ←
          </button>
          <button type="button" className="btn" onClick={() => go(1)} disabled={summary || gated} aria-label="Next step">
            →
          </button>
          <button type="button" className="btn" onClick={() => setPlaying((p) => !p)} disabled={quiz} aria-pressed={playing}>
            {playing ? "Pause" : "Play"}
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow step
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={quiz}
              onChange={(e) => {
                setQuiz(e.target.checked);
                setPlaying(false);
              }}
            />{" "}
            What comes next?
          </label>
        </div>
        {stepStretches.length > 1 && follow && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-text-dim">Look at:</span>
            {stepStretches.map((x) => (
              <button key={x.k} type="button" aria-pressed={effFocus === x.k} className={`chip ${effFocus === x.k ? "follow" : ""}`} onClick={() => setFocus(x.k)}>
                {x.phys === "cross" ? "The crossing" : x.label.split(/[(:,]/)[0].trim().slice(0, 30)}
              </button>
            ))}
            <button type="button" aria-pressed={effFocus === "all"} className={`chip ${effFocus === "all" ? "follow" : ""}`} onClick={() => setFocus("all")}>
              All of it
            </button>
          </div>
        )}
        <p className="help-line">
          <span><span className="kbd">←</span> <span className="kbd">→</span> step</span>
          <span><span className="kbd">Space</span> play</span>
          <span><span className="kbd">S</span> flip side</span>
          <span><span className="kbd">V</span> view</span>
          <span><span className="kbd">Q</span> quiz</span>
          <span>drag to rotate, scroll to zoom</span>
        </p>
      </div>

      <aside className="panel grid min-w-0 content-start gap-3" aria-live="polite">
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
                  <p className="label">Which side, where</p>
                  <ul className="grid gap-1 text-sm">
                    {sideLines.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden style={{ color: l.color }}>■</span>
                        <span><span className="text-text-dim">{l.label}:</span> {l.txt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
                {lesionSites.length > 0 && (
                  <div>
                    <p className="label">Try a lesion</p>
                    <div className="flex flex-wrap gap-1.5">
                      {lesionSites.map((s) => (
                        <Link key={s.id} className="chip follow no-underline" href={`/atlas/lesion?site=${s.id}&side=${body}${s.cord ? `&cord=${s.cord.includes("T") ? "T" : s.cord[0]}` : ""}`}>
                          {s.name.length > 38 ? s.name.slice(0, 36) + "…" : s.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {answered && Object.keys(answered).some((k) => k.startsWith(slug + ":")) && (
                  <p className="text-sm text-text-dim">
                    Quiz: {Object.entries(answered).filter(([k, v]) => k.startsWith(slug + ":") && v === "right").length} of{" "}
                    {Object.keys(answered).filter((k) => k.startsWith(slug + ":")).length} right this session.
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-2 border-t border-panel-border pt-3">
              <p className="label">Cards for this {summary ? "pathway" : "step"}</p>
              {(summary ? stepCards.filter((c) => neuronForCard(c, cp) === 0) : cardsFor(cur + 1)).length === 0 && <p className="text-sm text-text-dim">No separate cards for this step.</p>}
              {(summary ? stepCards.filter((c) => neuronForCard(c, cp) === 0) : cardsFor(cur + 1)).map((c) => (
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
          </>
        )}
      </aside>
    </div>
  );
}
