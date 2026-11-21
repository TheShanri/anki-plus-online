"use client";
// "Cuts going down": a side-view brainstem with a line at each section level. The current level is the bold accent line;
// each level carries its mastery ring (no checkmarks). Vertical on wide screens, a horizontal strip on phones.
import type { BrainstemMastery } from "@/lib/brainstem/mastery-server";
import { LEVELS } from "./data";

const H = 410;

export function MasteryRing({ value, mastered, soon, size = 20 }: { value: number; mastered?: boolean; soon?: boolean; size?: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="flex-none" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--panel-border-hi)" strokeWidth="2.5" strokeDasharray={soon ? "2 3" : undefined} opacity={soon ? 0.7 : 1} />
      {!soon && value > 0 && <circle cx="10" cy="10" r={r} fill="none" stroke={mastered ? "var(--good)" : "var(--accent)"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${Math.max(0.5, c * Math.min(1, value))} ${c}`} />}
    </svg>
  );
}

function label(level: string, m: BrainstemMastery) {
  const x = m.levels[level];
  if (x) return `${Math.round(x.mean * 100)}% mastered (${x.done} of ${x.total} structures)`;
  // surface views and the midline have their plates; only a few section levels still wait for one
  return LEVELS.find((l) => l.slug === level)?.kind === "section" ? "plate coming soon" : "no mastery score for this view";
}

export function Navigator({ level, onPick, mastery }: { level: string; onPick: (slug: string) => void; mastery: BrainstemMastery }) {
  const sections = LEVELS.filter((l) => l.kind === "section");
  const gross = LEVELS.filter((l) => l.kind === "gross");
  return (
    <nav aria-label="Brainstem levels">
      <div className="hidden md:block">
        <div className="relative w-[272px]" style={{ height: H }}>
          <svg viewBox="0 0 124 410" width="124" height={H} className="absolute left-0 top-0" aria-hidden>
            <path d="M56 14 L98 14 C102 40 100 72 96 96 L94 204 C90 236 84 276 82 316 L82 404 L58 404 L58 340 C58 296 56 246 50 210 C24 190 22 126 46 100 C54 80 54 46 56 14 Z" fill="var(--bg-3)" stroke="var(--panel-border-hi)" strokeWidth="1.5" />
            {sections.map((l) => (
              <line key={l.slug} x1="24" x2="104" y1={(l.y ?? 0) * 400} y2={(l.y ?? 0) * 400} stroke={l.slug === level ? "var(--accent)" : "var(--panel-border-hi)"} strokeWidth={l.slug === level ? 3 : 1} strokeDasharray={l.slug === level ? undefined : "3 3"} />
            ))}
          </svg>
          {sections.map((l) => {
            const on = l.slug === level;
            const mm = mastery.levels[l.slug];
            return (
              <button
                key={l.slug}
                type="button"
                onClick={() => onPick(l.slug)}
                aria-current={on ? "true" : undefined}
                title={`${l.name}: ${label(l.slug, mastery)}`}
                className="bs-row absolute !py-0.5"
                style={{ left: 112, width: 160, top: (l.y ?? 0) * 400 - 13, height: 26, fontSize: 12, color: on ? "var(--accent)" : mm ? undefined : "var(--text-dim)", fontWeight: on ? 700 : undefined, outline: "none", background: on ? "var(--bg-3)" : undefined }}
              >
                <span className="truncate">{l.name}</span>
                <span className="ml-auto">
                  <MasteryRing value={mm?.mean ?? 0} mastered={mm?.mastered} soon={!mm} size={18} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-panel-border pt-2">
          <div className="mb-1 text-xs text-text-dim">Surface views</div>
          {gross.map((l) => (
            <button key={l.slug} type="button" onClick={() => onPick(l.slug)} aria-current={l.slug === level ? "true" : undefined} className="bs-row" style={{ color: l.slug === level ? "var(--accent)" : undefined, fontWeight: l.slug === level ? 700 : undefined }} title={l.hallmark}>
              <span className="truncate">{l.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden" style={{ scrollSnapType: "x proximity" }}>
        {LEVELS.map((l) => {
          const on = l.slug === level;
          const mm = mastery.levels[l.slug];
          return (
            <button
              key={l.slug}
              type="button"
              onClick={() => onPick(l.slug)}
              aria-current={on ? "true" : undefined}
              title={`${l.name}: ${label(l.slug, mastery)}`}
              className="flex flex-none items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs"
              style={{ scrollSnapAlign: "start", borderColor: on ? "var(--accent)" : "var(--panel-border)", color: on ? "var(--accent)" : "var(--text-dim)", background: on ? "var(--bg-3)" : "var(--panel-solid)", fontWeight: on ? 700 : undefined }}
            >
              {l.kind === "section" && <MasteryRing value={mm?.mean ?? 0} mastered={mm?.mastered} soon={!mm} size={16} />}
              {l.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
