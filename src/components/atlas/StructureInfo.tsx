"use client";

import { LinesSkeleton } from "@/components/ui/Skeleton";
import { withCranialNumeral } from "@/lib/atlas/cranial";
import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveMediaSrc } from "@/components/cards/media";
import ROTATIONS from "@/data/image-rotations.json";
import { Supplementary } from "@/components/supplementary/Supplementary";
import { MnemonicPanel } from "@/components/study/MnemonicPanel";
import { SpeakButton } from "@/components/tts/SpeakButton";
import "@/components/study/study.css"; // chips

type CardInfo = {
  id: string;
  kind: string;
  topic: string | null;
  prompt: string;
  answer: string;
  image: string | null;
  source: string;
  fromCourse: boolean;
  ref: string | null;
  studied: boolean;
};
type Info = {
  signedIn: boolean;
  course: { slug: string };
  slug: string;
  name: string;
  synonyms: string[];
  latin: string | null;
  unit: { slug: string; title: string } | null;
  lists: Array<{ unit?: number; lab?: string; group?: string; note?: string | null }>;
  topics: Array<{ title: string; kind: string; count: number }>;
  onPracticals: number;
  cards: CardInfo[];
  studied: number;
  supplementary: {
    explanation: string | null;
    facts: Record<string, string | null>;
    etymology: { roots?: Array<{ part: string; lang?: string; meaning: string }>; literal?: string; story?: string } | null;
  };
};

const FACT_NAMES: Record<string, string> = { function: "Function", lesion: "Lesion", supply: "Blood supply", connections: "Connections", passes: "What passes" };
const KIND_NAMES: Record<string, string> = { pin: "Name it", theory: "Question", pathway: "Pathway", section: "Section", clinical: "Clinical", written: "Written" };

const cache = new Map<string, Info | "signed-out" | "missing">();

/** The atlas info panel: the course's own material for a structure, and supplementary background kept apart. */
export function StructureInfo({ slug, name }: { slug: string; name?: string }) {
  const [, setTick] = useState(0);
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const data = cache.get(slug) ?? null;

  useEffect(() => {
    if (cache.has(slug)) return;
    let alive = true;
    fetch(`/api/atlas/structure/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const v: Info | "signed-out" | "missing" = r.status === 401 ? "signed-out" : r.ok ? ((await r.json()) as Info) : "missing";
        cache.set(slug, v);
      })
      .catch(() => cache.set(slug, "missing"))
      .finally(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (data === null) return <section className="panel !p-3"><LinesSkeleton lines={4} label={`Loading course notes for ${name ?? "this structure"}`} /></section>;
  if (data === "signed-out")
    return (
      <section className="panel !p-3 text-sm text-text-dim">
        <Link href="/login?next=/atlas" className="text-accent-2">Log in</Link> to see the course notes, cards and past exam questions for {name ?? "this structure"}.
      </section>
    );
  if (data === "missing") return null;

  const d = data;
  const facts = Object.entries(d.supplementary.facts ?? {}).filter(([, v]) => !!v);
  const ety = d.supplementary.etymology;
  const courseCards = d.cards.filter((c) => c.fromCourse);
  const suppCards = d.cards.filter((c) => !c.fromCourse);
  const images = [...new Set(courseCards.filter((c) => c.image).map((c) => c.image as string))];
  const listed = courseCards.filter((c) => !c.image); // slides first: cards that are not from the course sit behind the supplementary gate
  const shown = all ? listed : listed.slice(0, 6);

  return (
    <section className="panel struct-info grid grid-cols-[minmax(0,1fr)] gap-4 !p-3" aria-label={`${d.name}: course notes`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl tracking-wide">{withCranialNumeral(d.name)}</h2>
        <SpeakButton text={d.name} />
        {d.latin && <span className="text-sm italic text-text-dim">{d.latin}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-sm text-text-dim">
          {d.cards.length > 0 && (
            <>
              <span>
                seen {d.studied} of {d.cards.length} card{d.cards.length === 1 ? "" : "s"}
              </span>
              <Link className="btn btn-primary" href={`/study/run?scope=${encodeURIComponent(`structure:${d.slug}`)}`}>
                Study these cards
              </Link>
            </>
          )}
        </span>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div className="grid content-start gap-2 text-sm">
          <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent-2">
            On the syllabus <span className="text-text-faint normal-case tracking-normal">from the course materials</span>
          </h3>
          {d.unit && <p>{d.unit.title}</p>}
          {d.lists.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {d.lists.map((l, i) => (
                <span key={i} className="chip" title={l.note ?? undefined}>
                  {[l.lab, l.group].filter(Boolean).join(" · ")}
                </span>
              ))}
            </p>
          )}
          {d.topics.length > 0 && (
            <ul className="grid gap-0.5">
              {d.topics.map((t, i) => (
                <li key={`${t.title}-${i}`} className="text-text-dim">
                  {t.title} <span className="text-text-faint">({t.count})</span>
                </li>
              ))}
            </ul>
          )}
          {d.onPracticals > 0 && (
            <p>
              On past practicals and practice exams: <b>{d.onPracticals}</b> question{d.onPracticals === 1 ? "" : "s"}
            </p>
          )}
          {d.synonyms.length > 0 && <p className="text-text-dim">Also accepted: {d.synonyms.join(", ")}</p>}
          {!d.lists.length && !d.topics.length && <p className="text-text-dim">Not on a structure list in this course.</p>}
        </div>

        {(d.supplementary.explanation || facts.length > 0 || (ety && (ety.roots?.length || ety.literal))) && (
          <Supplementary section="atlas-info" title="Background and word origins">
          <div className="grid content-start gap-2 text-sm">
            <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-hard">
              Supplementary
              <Link href="/about#supplementary" className="normal-case tracking-normal text-text-faint underline-offset-2 hover:underline" title="Background written for this app, not from the course materials">
                what is this?
              </Link>
            </h3>
            {d.supplementary.explanation && <p>{d.supplementary.explanation}</p>}
            {facts.length > 0 && (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-text-faint">{FACT_NAMES[k] ?? k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {ety && (ety.roots?.length || ety.literal) && (
              <p className="text-text-dim">
                {ety.roots?.map((r) => `${r.part} (${r.lang ? r.lang + ": " : ""}${r.meaning})`).join(" + ")}
                {ety.literal ? `: “${ety.literal}”` : ""}
              </p>
            )}
          </div>

          </Supplementary>
        )}
      </div>

      <div className="struct-mnemo">
        <MnemonicPanel key={d.slug} structureSlug={d.slug} />
      </div>

      {images.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-accent-2">Where it is labelled in the course images ({images.length})</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.slice(0, 12).map((k, i) => (
              <button key={k} type="button" className="flex-none rounded-sm focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]" onClick={() => setZoom(i)} aria-label={`Course image ${i + 1}: open large`} title="Open large">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveMediaSrc(d.course.slug, k)} alt="" loading="lazy" decoding="async" className="h-28 w-auto cursor-zoom-in rounded-sm border border-panel-border bg-bg-2 object-contain transition-transform hover:scale-[1.03]" />
              </button>
            ))}
          </div>
          {zoom !== null && images[zoom] && (
            <ImageLightbox src={resolveMediaSrc(d.course.slug, images[zoom])} imageKey={images[zoom]} n={zoom} total={Math.min(12, images.length)} onClose={() => setZoom(null)} onStep={(dir) => setZoom((z) => (z === null ? z : (z + dir + Math.min(12, images.length)) % Math.min(12, images.length)))} />
          )}
        </div>
      )}

      {listed.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-accent-2">Questions about it ({listed.length})</h3>
          <ul className="grid gap-2">
            {shown.map((c) => (
              <li key={c.id} className="rounded-sm border border-panel-border p-2 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip">{KIND_NAMES[c.kind] ?? c.kind}</span>
                  <span className={`chip${c.fromCourse ? "" : " text-hard"}`}>{c.source}</span>
                  {c.topic && <span className="text-xs text-text-faint">{c.topic}</span>}
                  {c.studied && <span className="ml-auto text-xs text-good">seen</span>}
                </div>
                <p>{c.prompt}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-text-dim">Answer</summary>
                  <p className="mt-1 text-good">{c.answer}</p>
                </details>
              </li>
            ))}
          </ul>
          {listed.length > 6 && (
            <button type="button" className="btn justify-self-start" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${listed.length}`}
            </button>
          )}
        </div>
      )}
      {suppCards.length > 0 && (
        <Supplementary section="atlas-info" title={`${suppCards.length} extra question${suppCards.length === 1 ? "" : "s"} (not from your slides)`}>
          <ul className="grid gap-2">
            {suppCards.map((c) => (
              <li key={c.id} className="rounded-sm border border-panel-border p-2 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="chip">{KIND_NAMES[c.kind] ?? c.kind}</span>
                  <span className="chip text-hard">{c.source}</span>
                </div>
                <p>{c.prompt}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-text-dim">Answer</summary>
                  <p className="mt-1 text-good">{c.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        </Supplementary>
      )}
    </section>
  );
}

/** A course image, large: arrows step through the set, Esc or a click outside closes (owner 2026-11-21: "course images
 *  should be clickable and enlargable"). Sideways scans are shown upright. */
function ImageLightbox({ src, imageKey, n, total, onClose, onStep }: { src: string; imageKey: string; n: number; total: number; onClose: () => void; onStep: (dir: number) => void }) {
  const turn = (ROTATIONS as unknown as Record<string, number>)[imageKey] ?? 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onStep(1);
      else if (e.key === "ArrowLeft") onStep(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onStep]);
  const side = turn === 90 || turn === 270;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Course image ${n + 1} of ${total}`} onClick={(e) => e.target === e.currentTarget && onClose()} style={{ zIndex: 80 }}>
      <div className="relative grid place-items-center" style={{ width: "min(94vw, 1400px)", height: "88vh" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="rounded-sm bg-bg-2 object-contain shadow-pop" style={side ? { maxWidth: "88vh", maxHeight: "min(94vw, 1400px)", transform: `rotate(${turn}deg)` } : { maxWidth: "100%", maxHeight: "100%", transform: turn ? `rotate(${turn}deg)` : undefined }} />
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-panel-border bg-panel-solid/95 px-2 py-1 text-sm">
          <button type="button" className="btn btn-sm" onClick={() => onStep(-1)} aria-label="Previous image">‹</button>
          <span className="font-mono text-xs text-text-dim">{n + 1} / {total}</span>
          <button type="button" className="btn btn-sm" onClick={() => onStep(1)} aria-label="Next image">›</button>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close (Esc)">Close</button>
        </div>
      </div>
    </div>
  );
}
