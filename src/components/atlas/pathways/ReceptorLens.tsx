"use client";

import { useState } from "react";
import { RECEPTORS, type ReceptorId } from "./receptorInfo";

/* A magnified "lens" on the skin and the muscle: a clean cross-section drawn in vector, with each ending the course
 * names as a recognisable cell or ending. Hover or focus a name to light its ending. Schematic, not to scale. */

const SKIN: { id: ReceptorId; x: number }[] = [
  { id: "free", x: 38 },
  { id: "merkel", x: 92 },
  { id: "meissner", x: 148 },
  { id: "ruffini", x: 204 },
  { id: "pacinian", x: 262 },
];

function Ending({ id, x, on }: { id: ReceptorId; x: number; on: boolean }) {
  const c = RECEPTORS[id].color;
  const sw = on ? 2.6 : 1.8;
  const g = { stroke: c, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "free":
      return (
        <g transform={`translate(${x},0)`} {...g}>
          <path d="M0 200 V92 C0 70 -2 60 -2 48" />
          <path d="M-2 48 C-10 38 -16 30 -18 14" />
          <path d="M-2 48 C-4 36 -6 24 -6 8" />
          <path d="M-2 48 C2 36 6 24 6 10" />
          <path d="M-2 48 C8 40 14 30 18 16" />
          {[[-18, 12], [-6, 6], [6, 8], [18, 14]].map(([px, py]) => (
            <circle key={px} cx={px} cy={py} r="2.4" fill={c} stroke="none" />
          ))}
        </g>
      );
    case "merkel":
      return (
        <g transform={`translate(${x},0)`}>
          {[-13, 13].map((dx) => (
            <g key={dx}>
              <ellipse cx={dx} cy="33" rx="9" ry="6.5" fill={c} fillOpacity={on ? 0.95 : 0.75} stroke={c} strokeWidth={sw * 0.6} />
              <path d={`M${dx - 7} 41 Q${dx} 46 ${dx + 7} 41`} {...g} />
              <path d={`M${dx} 44 V70`} {...g} />
            </g>
          ))}
          <path d="M-13 70 Q0 82 0 100 V200 M13 70 Q0 82 0 100" {...g} />
        </g>
      );
    case "meissner":
      return (
        <g transform={`translate(${x},0)`}>
          <path d="M-20 60 C-20 38 -12 36 0 36 C12 36 20 38 20 60" fill="#f6dccb" fillOpacity={0.7} stroke="none" />
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx="0" cy={44 + i * 7} rx={14 - Math.abs(i - 2) * 1.5} ry="3.4" fill={c} fillOpacity={on ? 0.95 : 0.78} stroke="#7a3f1c" strokeWidth="0.6" />
          ))}
          <path d="M0 200 V100 C0 86 -8 80 -6 70 C-4 62 6 60 4 52 C3 47 -2 46 0 42" {...g} />
        </g>
      );
    case "ruffini":
      return (
        <g transform={`translate(${x},0)`}>
          <ellipse cx="0" cy="92" rx="11" ry="32" fill={c} fillOpacity={on ? 0.45 : 0.28} stroke={c} strokeWidth={sw} />
          {[-6, 0, 6].map((dx) => (
            <path key={dx} d={`M${dx} 70 C${dx + 5} 82 ${dx - 5} 98 ${dx} 114`} {...g} strokeWidth={1.2} />
          ))}
          <path d="M0 124 V200" {...g} />
        </g>
      );
    case "pacinian":
      return (
        <g transform={`translate(${x},0)`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse key={i} cx="0" cy="158" rx={22 - i * 3.3} ry={36 - i * 5.2} fill={i % 2 ? c : "none"} fillOpacity={0.35} stroke={c} strokeWidth={on ? 2 : 1.4} />
          ))}
          <path d="M0 194 V200 M0 124 V192" {...g} strokeWidth={on ? 2.4 : 1.8} />
        </g>
      );
    default:
      return null;
  }
}

function SkinSvg({ ids, hot }: { ids: ReceptorId[]; hot: ReceptorId | null }) {
  return (
    <svg viewBox="0 0 300 200" width="100%" role="img" aria-label="Cross-section of skin with the endings the course names" style={{ borderRadius: 10, display: "block" }}>
      <defs>
        <clipPath id="skin-clip"><rect width="300" height="200" rx="10" /></clipPath>
      </defs>
      <g clipPath="url(#skin-clip)">
        <rect width="300" height="200" fill="#f1dc9f" />
        <path d="M0 126 Q40 118 80 126 T160 126 T240 126 T300 124 V200 H0Z" fill="#f1dc9f" />
        <path d="M0 52 C20 66 30 40 50 52 C70 66 80 40 100 52 C120 66 125 30 148 36 C170 40 176 66 200 52 C220 40 230 66 250 52 C270 40 285 60 300 52 V126 Q240 134 150 126 T0 128 Z" fill="#e8a88f" />
        <path d="M0 0 H300 V54 C285 62 270 42 250 54 C230 66 220 42 200 54 C176 68 170 42 148 38 C125 32 120 66 100 54 C80 42 70 66 50 54 C30 42 20 66 0 54Z" fill="#f4d9c6" />
        <path d="M0 8 H300" stroke="#d9b49c" strokeWidth="6" strokeOpacity="0.5" />
        {SKIN.filter((s) => ids.includes(s.id)).map((s) => (
          <g key={s.id} opacity={hot && hot !== s.id ? 0.35 : 1}>
            <Ending id={s.id} x={s.x} on={hot === s.id} />
          </g>
        ))}
      </g>
      <g style={{ font: "600 9px var(--font-mono, monospace)" }} fill="#3a2a22" opacity="0.7">
        <text x="6" y="20">EPIDERMIS</text>
        <text x="6" y="98">DERMIS</text>
        <text x="6" y="190">SUBCUTANEOUS</text>
      </g>
    </svg>
  );
}

function MuscleSvg({ ids, hot }: { ids: ReceptorId[]; hot: ReceptorId | null }) {
  const sp = RECEPTORS.spindle.color;
  const go = RECEPTORS.gto.color;
  return (
    <svg viewBox="0 0 300 150" width="100%" role="img" aria-label="Muscle fibres with a muscle spindle and a Golgi tendon organ" style={{ borderRadius: 10, display: "block" }}>
      <rect width="300" height="150" rx="10" fill="#2a1b1e" />
      {[34, 52, 70, 88, 106].map((y, i) => (
        <path key={y} d={`M0 ${y + (i % 2) * 2} C60 ${y - 6} 130 ${y + 6} 210 ${y}`} stroke="#c0454c" strokeWidth="11" strokeLinecap="round" fill="none" opacity={0.9 - i * 0.04} />
      ))}
      {/* tendon */}
      <path d="M200 30 L300 52 V92 L200 112 Z" fill="#ece5d3" />
      {[44, 60, 76, 92].map((y) => (
        <path key={y} d={`M210 ${y - 8} L300 ${y + 4}`} stroke="#c9bfa6" strokeWidth="1.2" />
      ))}
      {ids.includes("spindle") && (
        <g opacity={hot && hot !== "spindle" ? 0.35 : 1}>
          <path d="M46 62 C70 46 110 46 134 62 C110 78 70 78 46 62Z" fill={sp} fillOpacity="0.28" stroke={sp} strokeWidth={hot === "spindle" ? 2.8 : 1.8} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path key={i} d={`M${72 + i * 6} ${52 + (i % 2) * 2} q3 10 0 20`} stroke={sp} strokeWidth="1.6" fill="none" />
          ))}
          <path d="M90 46 C92 30 80 22 82 8" stroke={sp} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      {ids.includes("gto") && (
        <g opacity={hot && hot !== "gto" ? 0.35 : 1}>
          <ellipse cx="198" cy="72" rx="13" ry="25" fill={go} fillOpacity="0.32" stroke={go} strokeWidth={hot === "gto" ? 2.8 : 1.8} />
          {[-12, -6, 0, 6, 12].map((dy) => (
            <path key={dy} d={`M186 ${72 + dy} H210`} stroke={go} strokeWidth="1.3" />
          ))}
          <path d="M200 48 C204 30 216 22 214 6" stroke={go} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
      <g style={{ font: "600 9px var(--font-mono, monospace)" }} fill="#e9d8d8" opacity="0.7">
        <text x="8" y="140">MUSCLE</text>
        <text x="292" y="140" textAnchor="end">TENDON</text>
      </g>
    </svg>
  );
}

/** The endings of a pathway: a skin cross-section and/or a muscle, plus a named list that highlights each ending. */
export function ReceptorLens({ skin, muscle }: { skin: ReceptorId[]; muscle: ReceptorId[] }) {
  const [hot, setHot] = useState<ReceptorId | null>(null);
  const all = [...skin, ...muscle];
  return (
    <div className="grid gap-2">
      {skin.length > 0 && <SkinSvg ids={skin} hot={hot} />}
      {muscle.length > 0 && <MuscleSvg ids={muscle} hot={hot} />}
      <ul className="grid gap-1 text-sm">
        {all.map((id) => (
          <li key={id}>
            <button
              type="button"
              onMouseEnter={() => setHot(id)}
              onMouseLeave={() => setHot(null)}
              onFocus={() => setHot(id)}
              onBlur={() => setHot(null)}
              className="flex w-full items-start gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-bg-3"
            >
              <span aria-hidden className="mt-1 inline-block h-3 w-3 flex-none rounded-full" style={{ background: RECEPTORS[id].color }} />
              <span>
                <strong>{RECEPTORS[id].name}</strong>
                {RECEPTORS[id].senses ? <span className="text-text-dim">: {RECEPTORS[id].senses}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
