"use client";

import { VEIN_NAME, VEIN_STEPS } from "./supply-guide";

/**
 * Flow diagram of the venous drainage (after the textbook scheme on lecture 16 slides 27-30), synced with the 3D layer:
 * hovering a node or a labelled link highlights the vessel in 3D (and a hover in 3D lights it here), a click goes to the step
 * that draws it, the current step's segment is lit and marked "you are here". Theme colours only, plus the vein blue.
 */
const VEIN = "#4f7cc4";
type Node = { id: string; x: number; y: number; label: string[]; dashed?: boolean; noVessel?: boolean };
// roomy columns: link labels (v. of Labbé, petrosal sinuses) sit in the gaps, never on a box
const C1 = 62;
const C2 = 222;
const C3 = 382;
const R = [44, 104, 164, 224, 284, 344, 404, 464];
const NODES: Node[] = [
  { id: "scv", x: C1, y: R[0], label: ["Superficial", "cerebral veins"] },
  { id: "bridging", x: C1, y: R[1], label: ["Bridging veins"] },
  { id: "sss", x: C1, y: R[2], label: ["Superior", "sagittal sinus"] },
  { id: "granulations", x: C1, y: R[3], label: ["Arachnoid", "granulations (CSF)"], dashed: true },
  { id: "smcv", x: C1, y: R[4], label: ["Superficial middle", "cerebral vein"] },
  { id: "cavernous", x: C1, y: R[5], label: ["Cavernous", "sinuses"] },
  { id: "iss", x: C2, y: R[1], label: ["Inferior", "sagittal sinus"] },
  { id: "straight", x: C2, y: R[2], label: ["Straight sinus"] },
  { id: "confluence", x: C2, y: R[3], label: ["Confluence", "of sinuses"] },
  { id: "transverse", x: C2, y: R[4], label: ["Transverse", "sinuses"] },
  { id: "sigmoid", x: C2, y: R[5], label: ["Sigmoid", "sinuses"] },
  { id: "ijv", x: C2, y: R[6], label: ["Internal", "jugular veins"] },
  { id: "heart", x: C2, y: R[7], label: ["To the heart"], noVessel: true },
  { id: "icv", x: C3, y: R[0], label: ["Internal", "cerebral veins"] },
  { id: "gcv", x: C3, y: R[1], label: ["Great", "cerebral vein"] },
  { id: "basal", x: C3, y: R[2], label: ["Basal veins"] },
  { id: "occipital", x: C3, y: R[4], label: ["Occipital", "sinus"] },
];
const BY = new Map(NODES.map((n) => [n.id, n]));
const W = 100;
const H = 34;
/** Links: from, to, the vessel id that lights the link (its step), and an optional label for links that are vessels themselves. */
type Link = { from: string; to: string; id: string; label?: string; dashed?: boolean };
const LINKS: Link[] = [
  { from: "scv", to: "bridging", id: "bridging" },
  { from: "bridging", to: "sss", id: "bridging" },
  { from: "granulations", to: "sss", id: "granulations", dashed: true },
  { from: "sss", to: "confluence", id: "sss" },
  { from: "icv", to: "gcv", id: "icv" },
  { from: "basal", to: "gcv", id: "basal" },
  { from: "gcv", to: "straight", id: "gcv" },
  { from: "iss", to: "straight", id: "iss" },
  { from: "straight", to: "confluence", id: "straight" },
  { from: "occipital", to: "confluence", id: "occipital" },
  { from: "confluence", to: "transverse", id: "transverse" },
  { from: "transverse", to: "sigmoid", id: "sigmoid" },
  { from: "sigmoid", to: "ijv", id: "ijv" },
  { from: "ijv", to: "heart", id: "ijv" },
  { from: "smcv", to: "cavernous", id: "smcv" },
  { from: "smcv", to: "transverse", id: "labbe", label: "v. of Labbé" },
  { from: "cavernous", to: "sigmoid", id: "sps", label: "sup. petrosal" },
  { from: "cavernous", to: "ijv", id: "ips", label: "inf. petrosal" },
];

/** Where a link leaves / enters a node box: the box edge point toward the other node. */
function edgePt(a: Node, b: Node, pad = 3): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = dx === 0 ? Infinity : (W / 2 + pad) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (H / 2 + pad) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [a.x + dx * s, a.y + dy * s];
}

export function VeinSchematic({ step, focus, onHover, onPick, compact = false }: { step: number; focus: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void; compact?: boolean }) {
  const cur = new Set(VEIN_STEPS[step]?.ids ?? []);
  const past = new Set(VEIN_STEPS.slice(0, step).flatMap((s) => s.ids));
  const whole = cur.size > 8;
  const here = whole ? null : NODES.find((n) => cur.has(n.id)) ?? (cur.has("bridging") ? BY.get("bridging") : null) ?? null;
  const state = (id: string) => (cur.has(id) ? "cur" : past.has(id) ? "past" : "off");
  const bind = (id: string, noVessel?: boolean) =>
    noVessel
      ? {}
      : {
          onMouseEnter: () => onHover(id),
          onMouseLeave: () => onHover(null),
          onFocus: () => onHover(id),
          onBlur: () => onHover(null),
          onClick: () => onPick(id),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPick(id);
            }
          },
          role: "button",
          tabIndex: 0,
          "aria-label": `${VEIN_NAME[id] ?? id}: show in 3D`,
          style: { cursor: "pointer" },
        };
  return (
    <figure className="m-0 grid gap-1" aria-label="Venous drainage schematic">
      <svg viewBox="0 0 444 492" className={`w-full ${compact ? "max-h-[46vh]" : ""}`} role="group" aria-label="Flow of venous blood from the brain to the heart">
        <defs>
          <marker id="vs-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--text-faint)" />
          </marker>
          <marker id="vs-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={VEIN} />
          </marker>
        </defs>
        {/* column captions */}
        <text x={C1} y={12} textAnchor="middle" fontSize="8.5" fill="var(--text-faint)" letterSpacing="0.08em">
          SUPERFICIAL
        </text>
        <text x={C3} y={12} textAnchor="middle" fontSize="8.5" fill="var(--text-faint)" letterSpacing="0.08em">
          DEEP
        </text>
        {LINKS.map((l, i) => {
          const a = BY.get(l.from)!;
          const b = BY.get(l.to)!;
          const [x1, y1] = edgePt(a, b);
          const [x2, y2] = edgePt(b, a, 5);
          const st = whole ? "cur" : state(l.id);
          const hot = focus === l.id;
          const on = st === "cur" || hot;
          // label at the link's middle, nudged off the line on the side away from the boxes
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 + (Math.abs(y2 - y1) > Math.abs(x2 - x1) ? 0 : -2);
          return (
            <g key={i} {...(l.label ? bind(l.id) : {})}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? VEIN : st === "past" ? "var(--text-dim)" : "var(--panel-border-hi)"} strokeWidth={on ? 2.6 : 1.4} strokeDasharray={l.dashed ? "3 3" : undefined} markerEnd={`url(#${on ? "vs-arrow-on" : "vs-arrow"})`} />
              {on && !l.dashed && (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--panel-solid)" strokeOpacity="0.55" strokeWidth={1.2} strokeDasharray="3 9" className="motion-reduce:hidden">
                  <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.1s" repeatCount="indefinite" />
                </line>
              )}
              {l.label && (
                <text x={mx + (Math.abs(y2 - y1) > Math.abs(x2 - x1) ? 6 : 0)} y={my - 4} textAnchor={Math.abs(y2 - y1) > Math.abs(x2 - x1) ? "start" : "middle"} fontSize="8" fill={on ? VEIN : "var(--text-faint)"} style={{ paintOrder: "stroke" }} stroke="var(--panel-solid)" strokeWidth={3}>
                  {l.label}
                </text>
              )}
              {/* a wider invisible hit area for labelled links */}
              {l.label && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} />}
            </g>
          );
        })}
        {NODES.map((n) => {
          const st = whole && !n.noVessel ? "cur" : state(n.id);
          const hot = focus === n.id;
          const on = st === "cur";
          return (
            <g key={n.id} {...bind(n.id, n.noVessel)}>
              <rect
                x={n.x - W / 2}
                y={n.y - H / 2}
                width={W}
                height={H}
                rx={n.noVessel ? 17 : 6}
                fill={on ? VEIN : "var(--panel-solid)"}
                fillOpacity={on ? 0.16 : 1}
                stroke={on || hot ? VEIN : st === "past" ? "var(--text-dim)" : "var(--panel-border-hi)"}
                strokeWidth={hot ? 2.6 : on ? 1.8 : 1}
                strokeDasharray={n.dashed ? "4 3" : undefined}
              />
              <text x={n.x} y={n.y + (n.label.length === 1 ? 3.5 : -2.5)} textAnchor="middle" fontSize="10.5" fill={on || hot ? "var(--text)" : st === "past" ? "var(--text-dim)" : "var(--text-faint)"} fontWeight={on ? 600 : 400}>
                {n.label.map((t, i) => (
                  <tspan key={i} x={n.x} dy={i === 0 ? 0 : 12}>
                    {t}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        {here && (
          <g aria-hidden="true" pointerEvents="none">
            <circle cx={here.x - W / 2 - 1} cy={here.y - H / 2 - 1} r="4.5" fill="var(--highlight)" stroke="var(--panel-solid)" strokeWidth="1.5" />
            <text x={here.x - W / 2 + 6} y={here.y - H / 2 - 4} fontSize="8.5" fill="var(--text-dim)" style={{ paintOrder: "stroke" }} stroke="var(--panel-solid)" strokeWidth={3}>
              you are here
            </text>
          </g>
        )}
      </svg>
      <figcaption className="text-[11px] leading-snug text-text-faint">Hover a box to find it in 3D; click to go to its step. Paired sinuses and veins are drawn once.</figcaption>
    </figure>
  );
}
