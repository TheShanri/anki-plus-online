"use client";
// "At this level": the structures present, grouped, each with its constant colour; click one to open its info.
import Link from "next/link";
import { useState } from "react";
import { BookMarked, ChevronDown, ChevronRight, GraduationCap } from "lucide-react";
import { Supplementary } from "@/components/supplementary/Supplementary";
import { GROUPS, STRUCTURES, type BsLevel } from "./data";

export function LevelPanel({
  level,
  hoverSlug,
  onHover,
  selected,
  onSelect,
}: {
  level: BsLevel;
  hoverSlug: string | null;
  onHover: (s: string | null) => void;
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const rows = level.structures.map((s) => ({ ...s, st: STRUCTURES[s.slug] })).filter((r) => r.st);
  const studySlugs = rows.filter((r) => r.st.onList && r.st.slug).map((r) => r.slug);
  return (
    <section className="panel !p-3" aria-label={`Structures at ${level.name}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base">{level.name}</h2>
          <p className="text-xs text-text-dim">{level.hallmark}</p>
        </div>
        {studySlugs.length > 0 && (
          <Link href={`/study/run?scope=structures:${studySlugs.join(",")}`} className="btn no-underline flex-none" title={`Study the ${studySlugs.length} course structures at this level`}>
            <GraduationCap size={15} aria-hidden className="mr-1.5 inline" />
            Study this level
          </Link>
        )}
      </div>
      {rows.length === 0 && <p className="text-sm text-text-dim">No structures are mapped to this view yet.</p>}
      {GROUPS.map((g) => {
        const items = rows.filter((r) => r.st.group === g.id);
        if (!items.length) return null;
        const shut = closed[g.id];
        return (
          <div key={g.id} className="mb-1">
            <button type="button" className="flex w-full items-center gap-1 py-1 text-left text-xs text-text-dim hover:text-text" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))}>
              {shut ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              {g.label} <span className="text-text-faint">({items.length})</span>
            </button>
            {!shut &&
              items.map((r) => {
                const clickable = !!r.st.slug;
                if (!r.st.onList)
                  return (
                    <div key={r.slug}>
                      <Supplementary section="brainstem" title="Extra structure at this level">
                        <span className="flex items-center gap-2 text-[13.5px]">
                          <span className="bs-sw" style={{ background: r.st.color }} />
                          {r.st.name}
                          <span className="text-[10px] text-text-faint">not on the course lists</span>
                        </span>
                      </Supplementary>
                    </div>
                  );
                return (
                  <button
                    key={r.slug}
                    type="button"
                    disabled={!clickable}
                    className={`bs-row${hoverSlug === r.slug ? " bs-hot" : ""}`}
                    aria-current={selected === r.slug ? "true" : undefined}
                    onClick={() => onSelect(r.slug)}
                    onPointerEnter={() => onHover(r.slug)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(r.slug)}
                    onBlur={() => onHover(null)}
                    title={r.source === "course" ? "Labelled on the course images" : "Standard neuroanatomy, not labelled on the course images at this level"}
                  >
                    <span className="bs-sw" style={{ background: r.st.color }} />
                    <span className="min-w-0 flex-1 truncate">{r.st.name}</span>
                    <BookMarked size={13} aria-label="on the course lists" className={r.source === "course" ? "text-accent-2" : "text-text-faint"} />
                  </button>
                );
              })}
          </div>
        );
      })}
      <p className="mt-2 text-[11px] text-text-faint">
        <BookMarked size={11} aria-hidden className="mr-1 inline" />
        On the course lists. Bright: labelled on the course images at this level; dim: standard anatomy for this level.
      </p>
    </section>
  );
}
