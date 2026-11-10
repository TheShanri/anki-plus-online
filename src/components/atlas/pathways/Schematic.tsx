"use client";

import { useEffect, useRef } from "react";
import type { Side } from "@/lib/atlas/pathways";
import type { Beat } from "./buildPathwayScene";

/* The pathway as a flowchart, built from the very same beat list as the 3D scene (so the two cannot drift apart):
 * nodes and arrows, a left lane and a right lane, crossings drawn as an X. It lights in step with the 3D beats, the
 * arrows draw as the 3D tubes draw, and hovering or clicking an element does the same as in 3D. */

type Lane = "L" | "R" | "M";
const laneOf = (rel: string | undefined, body: Side): Lane => (rel === "i" ? body : rel === "c" ? (body === "L" ? "R" : "L") : "M");
const X = { L: 14, R: 46, M: 30 } as const;

/** Where each body side sits (left or right lane) at the start and end of a beat. */
function lanes(b: Beat, prevEnd: { L: Lane; R: Lane }): { from: { L: Lane; R: Lane }; to: { L: Lane; R: Lane } } {
  if (b.kind === "node") {
    const l = (s: Side) => laneOf(b.rel, s);
    return { from: prevEnd, to: { L: l("L"), R: l("R") } };
  }
  const end = (s: Side): Lane => (b.phys === "i" ? s : b.phys === "c" || b.phys === "cross" ? (s === "L" ? "R" : "L") : prevEnd[s]);
  return { from: prevEnd, to: { L: end("L"), R: end("R") } };
}

export function Schematic({
  beats,
  cur,
  reveal,
  hoverKey,
  onHover,
  onPick,
  reduced,
  sideAlpha,
}: {
  beats: Beat[];
  cur: number | null;
  reveal: number;
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  onPick: (k: string) => void;
  reduced?: boolean;
  sideAlpha: { L: number; R: number };
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (cur === null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-beat="${cur}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [cur, reduced]);

  const rows = beats.reduce<{ b: Beat; i: number; l: ReturnType<typeof lanes> }[]>((acc, b, i) => {
    const prev = acc.length ? acc[acc.length - 1].l.to : { L: "L" as Lane, R: "R" as Lane };
    acc.push({ b, i, l: lanes(b, prev) });
    return acc;
  }, []);
  /** A fork: the rows of one split share a rail on the left; each branch starts with a tick. */
  const forkRail = (i: number) => {
    const f = rows[i].b.fork;
    if (!f) return null;
    const pf = rows[i - 1]?.b.fork;
    const nf = rows[i + 1]?.b.fork;
    const start = !pf || pf.id !== f.id;
    const sub = start || pf.k !== f.k;
    const last = !nf || nf.id !== f.id;
    return (
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-3" style={{ overflow: "visible" }}>
        <line x1="5" y1={start ? "0%" : "0%"} x2="5" y2={last ? "50%" : "100%"} stroke="var(--text-faint, #888)" strokeWidth="1.6" />
        {sub && <line x1="5" y1="50%" x2="11" y2="50%" stroke="var(--text-faint, #888)" strokeWidth="1.6" />}
        {start && <circle cx="5" cy="0" r="2.2" fill="var(--text-faint, #888)" />}
      </svg>
    );
  };
  return (
    <ol ref={listRef} className="m-0 grid list-none gap-0 p-0" aria-label="Pathway schematic">
      {rows.map(({ b, i, l }) => {
        const shown = i <= reveal;
        const hot = i === cur;
        const hov = hoverKey === b.info;
        const op = shown ? (hot || cur === null ? 1 : 0.62) : 0.28;
        const common = {
          "data-beat": i,
          onMouseEnter: () => onHover(b.info),
          onMouseLeave: () => onHover(null),
          onFocus: () => onHover(b.info),
          onBlur: () => onHover(null),
          onClick: () => onPick(b.info),
        };
        if (b.kind === "node") {
          const lanesUsed = (["L", "R"] as Side[]).map((s) => ({ s, x: X[l.to[s]] }));
          const merged = lanesUsed[0].x === lanesUsed[1].x;
          return (
            <li key={i} className="m-0">
              <button
                type="button"
                {...common}
                aria-current={hot ? "step" : undefined}
                className={`relative flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left transition-colors ${b.fork ? "pl-4" : ""} ${hov ? "bg-bg-3" : ""}`}
                style={{ opacity: op }}
              >
                {forkRail(i)}
                <svg width="60" height="22" aria-hidden className="flex-none">
                  {merged ? (
                    <circle cx={lanesUsed[0].x} cy="11" r={hot ? 7 : 5.5} fill="var(--accent-2, currentColor)" stroke={hot || hov ? "var(--text)" : "none"} strokeWidth="2" />
                  ) : (
                    lanesUsed.map(({ s, x }) => (
                      <circle key={s} cx={x} cy="11" r={hot ? 6.5 : 5} fill={s === "L" ? "var(--blue, #4d8dff)" : "var(--orange, #ff9e3d)"} fillOpacity={sideAlpha[s] < 0.5 ? 0.3 : 1} stroke={hot || hov ? "var(--text)" : "none"} strokeWidth="2" />
                    ))
                  )}
                </svg>
                <span className={`line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-tight ${hot ? "font-semibold text-text" : "text-text-dim"}`} title={b.caption}>{b.caption}</span>
              </button>
            </li>
          );
        }
        // path: two lanes (left solid, right dashed); a crossing swaps them into an X
        const H = 40;
        return (
          <li key={i} className="m-0">
            <button
              type="button"
              {...common}
              aria-current={hot ? "step" : undefined}
              className={`relative flex w-full items-center gap-2 rounded-sm px-1 text-left transition-colors ${b.fork ? "pl-4" : ""} ${hov ? "bg-bg-3" : ""}`}
              style={{ opacity: op, height: H }}
            >
              {forkRail(i)}
              <svg width="60" height={H} aria-hidden className="flex-none" style={{ overflow: "visible" }}>
                {(["L", "R"] as Side[]).map((s) => {
                  const x1 = X[l.from[s]];
                  const x2 = X[l.to[s]];
                  const len = Math.hypot(x2 - x1, H - 6) + 2;
                  const col = s === "L" ? "var(--blue, #4d8dff)" : "var(--orange, #ff9e3d)";
                  return (
                    <g key={s} opacity={sideAlpha[s] < 0.5 ? 0.3 : 1}>
                      <line x1={x1} y1="0" x2={x2} y2={H - 7} stroke={col} strokeWidth="1.5" strokeOpacity="0.22" strokeDasharray={s === "R" ? "4 3" : undefined} />
                      <line
                        x1={x1}
                        y1="0"
                        x2={x2}
                        y2={H - 7}
                        stroke={col}
                        strokeWidth={hot || hov ? 3.2 : 2.2}
                        strokeLinecap="round"
                        strokeDasharray={shown ? `${len} ${len}` : `${len} ${len}`}
                        strokeDashoffset={shown ? 0 : len}
                        style={{ transition: reduced ? "none" : "stroke-dashoffset 2s ease-in-out, stroke-width 150ms" }}
                      />
                      <path d={`M${x2 - 4} ${H - 11} L${x2} ${H - 4} L${x2 + 4} ${H - 11}`} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={shown ? 1 : 0} style={{ transition: reduced ? "none" : "opacity 200ms 800ms" }} />
                    </g>
                  );
                })}
                {b.cross && (
                  <g opacity={shown ? 1 : 0.2} style={{ transition: reduced ? "none" : "opacity 300ms 500ms" }}>
                    <circle cx="30" cy={H / 2 - 3} r="7" fill="var(--panel-solid, #111)" stroke="var(--highlight, #fffb96)" strokeWidth="1.6" />
                    <path d={`M26.5 ${H / 2 - 6.5} L33.5 ${H / 2 + 0.5} M33.5 ${H / 2 - 6.5} L26.5 ${H / 2 + 0.5}`} stroke="var(--highlight, #fffb96)" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
              </svg>
              <span className={`line-clamp-2 min-w-0 flex-1 text-[11.5px] leading-tight ${hot ? "font-semibold text-text" : "text-text-dim"}`} title={b.caption}>
                {b.caption}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
