"use client";
// The mastery path, and the only way into studying the brainstem: mastery layer by layer (the plate cards, with their
// spelling and fact/function follow-ups, skipping the first look for what the decks already made solid), then a whole
// region, then the whole brainstem; practice reviews only what is already mastered, in the same three patterns.
import Link from "next/link";
import { GraduationCap, Repeat } from "lucide-react";
import type { BrainstemMastery } from "@/lib/brainstem/mastery-server";
import { BRAINSTEM_REGIONS } from "@/lib/study/mastery";
import { levelBySlug, STRUCTURES } from "./data";
import { MasteryRing } from "./Navigator";
import { usePlate } from "./plate/usePlate";

type Roll = { mean: number; mastered: boolean; done: number; total: number };

function Row({ title, sub, roll, scope, strong }: { title: string; sub?: string; roll?: Roll; scope: string; strong?: boolean }) {
  const pct = roll ? Math.round(roll.mean * 100) : 0;
  const can = !!roll && roll.total > 0;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <MasteryRing value={roll?.mean ?? 0} mastered={roll?.mastered} soon={!can} size={22} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`truncate text-sm ${strong ? "font-semibold text-text" : "text-text"}`}>{title}</div>
        <div className="truncate text-xs text-text-dim">{can ? `${pct}% · ${roll!.done} of ${roll!.total} structures mastered` : (sub ?? "coming soon")}</div>
      </div>
      {can ? (
        <>
          <Link href={`/study/run?scope=${scope}`} className="bs-ib no-underline" title={`Learn: ${title}`} aria-label={`Learn: ${title}`}>
            <GraduationCap size={16} aria-hidden />
          </Link>
          {roll!.done > 0 ? (
            <Link href={`/study/run?scope=${scope}:practice`} className="bs-ib no-underline" title={`Practice what you have mastered: ${title}`} aria-label={`Practice: ${title}`}>
              <Repeat size={16} aria-hidden />
            </Link>
          ) : (
            <span className="bs-ib" style={{ opacity: 0.35 }} title="Nothing mastered here yet" aria-hidden>
              <Repeat size={16} />
            </span>
          )}
        </>
      ) : null}
    </div>
  );
}

export function MasteryPanel({
  level,
  mastery,
  onPick,
  hover,
  onHover,
  onSelect,
}: {
  level: string;
  mastery: BrainstemMastery;
  onPick: (level: string) => void;
  hover: string | null;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string) => void;
}) {
  const lv = levelBySlug(level);
  const m = mastery.levels[level];
  const region = BRAINSTEM_REGIONS[level];
  // every structure on the plate is listed (pickable), with its mastery where the study cards already measure it
  const plate = usePlate(level);
  const onPlate = plate && plate !== "missing" ? [...new Set([...plate.regions.map((r) => r.slug), ...plate.fibres.map((f) => f.slug)])] : [];
  const known = m?.structures ?? {};
  const structs: [string, number | null][] = [
    ...Object.entries(known).sort((a, b) => a[1] - b[1]),
    ...onPlate.filter((s) => known[s] === undefined).sort((a, b) => (STRUCTURES[a]?.name ?? a).localeCompare(STRUCTURES[b]?.name ?? b)).map((s) => [s, null] as [string, null]),
  ];
  return (
    <section className="panel !p-3" aria-label="Mastery">
      <h2 className="mb-1 text-base">Mastery</h2>
      <p className="mb-1 text-xs text-text-dim">Built from your answers, on this plate and in the deck cards.</p>
      <Row title={lv.name} roll={m} scope={`bslevel:${level}`} strong sub="plate coming soon" />
      {region && mastery.regions[region] && <Row title={region === "surface" ? "All surface views" : `Whole ${region}`} roll={mastery.regions[region]} scope={`bsregion:${region}`} />}
      <Row title="Whole brainstem" roll={mastery.all.total ? mastery.all : undefined} scope="bs:all" />
      {mastery.next && mastery.next !== level && (
        <button type="button" className="mt-1 text-left text-xs text-accent-2 underline underline-offset-2" onClick={() => onPick(mastery.next!)}>
          Next up: {levelBySlug(mastery.next).name}
        </button>
      )}
      {structs.length > 0 && (
        <div className="mt-3 border-t border-panel-border pt-2">
          <div className="mb-1 text-xs text-text-dim">Structures on this plate ({structs.length})</div>
          {structs.map(([slug, v]) => (
            <button key={slug} type="button" className={`bs-row${hover === slug ? " bs-hot" : ""}`} onClick={() => onSelect(slug)} onPointerEnter={() => onHover(slug)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(slug)} onBlur={() => onHover(null)}>
              <span className="min-w-0 flex-1 truncate">{STRUCTURES[slug]?.name ?? slug}</span>
              {v === null ? (
                <span className="w-[5.5rem] flex-none text-right text-xs text-text-faint" title="No study card for this structure on this plate yet">not in the path yet</span>
              ) : (
                <>
                  <span className="h-1.5 w-14 flex-none overflow-hidden rounded-full bg-bg-3" aria-hidden>
                    <span className="block h-full origin-left" style={{ width: "100%", transform: `scaleX(${Math.max(0.02, v)})`, background: v >= 0.7 ? "var(--good)" : "var(--accent)" }} />
                  </span>
                  <span className="w-8 flex-none text-right text-xs text-text-dim">{Math.round(v * 100)}%</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
