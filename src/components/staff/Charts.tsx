import type { ReactNode } from "react";

export type TrendPoint = { d: string; active_students: number; reviews: number; minutes: number };

/** Inline-SVG area/line chart of one series over time. No chart library. */
export function TrendChart({ points, field, label, unit }: { points: TrendPoint[]; field: "active_students" | "reviews" | "minutes"; label: string; unit: string }) {
  const w = 560;
  const h = 120;
  const pad = 22;
  const vals = points.map((p) => Number(p[field]) || 0);
  const max = Math.max(1, ...vals);
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad - 6);
  const y = (v: number) => h - 18 - (v / max) * (h - 30);
  const line = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${h - 18} ${line} ${x(vals.length - 1).toFixed(1)},${h - 18}`;
  const total = vals.reduce((a, b) => a + b, 0);
  const first = points[0]?.d.slice(5);
  const last = points[points.length - 1]?.d.slice(5);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${label} per day over the last ${points.length} days, ${total} in total`}>
        <line x1={pad} x2={w - 6} y1={h - 18} y2={h - 18} stroke="var(--panel-border)" />
        <polygon points={area} fill="var(--accent-2)" opacity="0.15" />
        <polyline points={line} fill="none" stroke="var(--accent-2)" strokeWidth="1.75" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.d} cx={x(i)} cy={y(vals[i])} r="2" fill="var(--accent-2)"><title>{`${p.d}: ${vals[i]} ${unit}`}</title></circle>
        ))}
        <text x={2} y={12} fontSize="10" fill="var(--text-faint)">{max}</text>
        <text x={pad} y={h - 4} fontSize="10" fill="var(--text-faint)">{first}</text>
        <text x={w - 6} y={h - 4} fontSize="10" textAnchor="end" fill="var(--text-faint)">{last}</text>
      </svg>
      <figcaption className="text-xs text-text-faint">{label}: {total} {unit} in {points.length} days</figcaption>
    </figure>
  );
}

export function Bar({ pct, secondary, children }: { pct: number; secondary?: number; children?: ReactNode }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 min-w-24 flex-1 overflow-hidden rounded-full" style={{ background: "var(--panel-border)" }} role="img" aria-label={`${p}%`}>
        {secondary !== undefined && <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, secondary)}%`, background: "var(--accent-2)", opacity: 0.3 }} />}
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p}%`, background: "var(--accent-2)" }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-text-dim">{children ?? `${p}%`}</span>
    </div>
  );
}
