"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveMediaSrc } from "@/components/cards/media";
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

  if (data === null) return <section className="panel !p-3 text-sm text-text-dim">Loading course notes for {name ?? "this structure"}…</section>;
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
  const listed = [...courseCards.filter((c) => !c.image), ...suppCards];
  const shown = all ? listed : listed.slice(0, 6);

  return (
    <section className="panel struct-info grid grid-cols-[minmax(0,1fr)] gap-4 !p-3" aria-label={`${d.name}: course notes`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-xl tracking-wide">{d.name}</h2>
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
              {d.topics.map((t) => (
                <li key={t.title} className="text-text-dim">
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
            {images.slice(0, 12).map((k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={resolveMediaSrc(d.course.slug, k)} alt="" loading="lazy" decoding="async" className="h-28 w-auto flex-none rounded-sm border border-panel-border bg-bg-2 object-contain" />
            ))}
          </div>
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
    </section>
  );
}
