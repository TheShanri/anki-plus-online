"use client";
// "Cuts going down": a side-view schematic of the brainstem with a line at each section level (vertical on wide
// screens, a horizontal strip on phones). Real buttons, so keyboard and screen readers work.
import { Check } from "lucide-react";
import { LEVELS, type BsLevel } from "./data";

export interface ProgressView {
  visited: Record<string, boolean>;
  best: Record<string, { right: number; total: number } | undefined>;
}

const H = 410;

function Mark({ l, p }: { l: BsLevel; p: ProgressView }) {
  const b = p.best[l.slug];
  return (
    <span className="ml-auto flex items-center gap-1.5 text-[11px] text-text-dim">
      {b && <span title="Best quiz score at this level">{b.right}/{b.total}</span>}
      {p.visited[l.slug] && <Check size={12} aria-label="visited" className="text-good" />}
    </span>
  );
}

export function LevelNav({ level, onPick, progress }: { level: string; onPick: (slug: string) => void; progress: ProgressView }) {
  const sections = LEVELS.filter((l) => l.kind === "section");
  const gross = LEVELS.filter((l) => l.kind === "gross");
  return (
    <nav aria-label="Brainstem levels">
      {/* wide screens: the schematic */}
      <div className="hidden md:block">
        <div className="relative w-[272px]" style={{ height: H }}>
          <svg viewBox="0 0 124 410" width="124" height={H} className="absolute left-0 top-0" aria-hidden>
            <path
              d="M56 14 L98 14 C102 40 100 72 96 96 L94 204 C90 236 84 276 82 316 L82 404 L58 404 L58 340 C58 296 56 246 50 210 C24 190 22 126 46 100 C54 80 54 46 56 14 Z"
              fill="var(--bg-3)"
              stroke="var(--panel-border-hi)"
              strokeWidth="1.5"
            />
            <path d="M60 14 C62 30 70 36 78 30 C86 36 94 30 96 16" fill="none" stroke="var(--panel-border-hi)" strokeWidth="1" opacity="0.7" />
            {sections.map((l) => (
              <line key={l.slug} x1="24" x2="104" y1={(l.y ?? 0) * 400} y2={(l.y ?? 0) * 400} stroke={l.slug === level ? "var(--accent)" : "var(--panel-border-hi)"} strokeWidth={l.slug === level ? 2.5 : 1} strokeDasharray={l.slug === level ? undefined : "3 3"} />
            ))}
          </svg>
          {sections.map((l) => {
            const on = l.slug === level;
            return (
              <button
                key={l.slug}
                type="button"
                onClick={() => onPick(l.slug)}
                aria-current={on ? "true" : undefined}
                title={`${l.name}: ${l.hallmark}`}
                className="bs-row absolute !py-0.5"
                style={{ left: 112, width: 160, top: (l.y ?? 0) * 400 - 13, height: 26, fontSize: 12, color: on ? "var(--accent)" : undefined, fontWeight: on ? 600 : undefined, outline: "none", background: on ? "var(--bg-3)" : undefined }}
              >
                <span className="truncate">{l.name}</span>
                <Mark l={l} p={progress} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-panel-border pt-2">
          <div className="mb-1 text-xs text-text-dim">Surface views</div>
          {gross.map((l) => (
            <button key={l.slug} type="button" onClick={() => onPick(l.slug)} aria-current={l.slug === level ? "true" : undefined} className="bs-row" style={{ color: l.slug === level ? "var(--accent)" : undefined }} title={l.hallmark}>
              <span className="truncate">{l.name}</span>
              <Mark l={l} p={progress} />
            </button>
          ))}
        </div>
      </div>
      {/* phones: a horizontal strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden" style={{ scrollSnapType: "x proximity" }}>
        {LEVELS.map((l) => {
          const on = l.slug === level;
          return (
            <button
              key={l.slug}
              type="button"
              onClick={() => onPick(l.slug)}
              aria-current={on ? "true" : undefined}
              className="flex flex-none items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs"
              style={{ scrollSnapAlign: "start", borderColor: on ? "var(--accent)" : "var(--panel-border)", color: on ? "var(--accent)" : "var(--text-dim)", background: on ? "var(--bg-3)" : "var(--panel-solid)" }}
            >
              {l.name}
              {progress.visited[l.slug] && <Check size={11} className="text-good" aria-label="visited" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
