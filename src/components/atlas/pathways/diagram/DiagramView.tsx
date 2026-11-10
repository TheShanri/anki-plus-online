"use client";

import { useId, useMemo } from "react";
import { Activity, Ear, Eye, Footprints, Hand, Heart, Smile, Wind, Dumbbell, type LucideIcon } from "lucide-react";
import { FIELD_COLORS, GUIDE_COLORS, ORDER_COLORS, REGION_COLORS } from "@/lib/atlas/pathwayPalette";
import type { Beat } from "../buildPathwayScene";
import type { Resolved } from "./resolve";
import type { DEl, DLabel, Diagram, EndKind, Side } from "./types";

const ICONS: Record<string, LucideIcon> = { hand: Hand, foot: Footprints, smile: Smile, eye: Eye, ear: Ear, nose: Wind, muscle: Dumbbell, organ: Heart, visceral: Activity };
const INK = REGION_COLORS.outline;
const orderColor = (o: number) => ORDER_COLORS[Math.max(1, Math.min(4, o)) as 1 | 2 | 3 | 4];

interface Props {
  diagram: Diagram;
  beats: Beat[];
  resolved: Resolved;
  cur: number | null;
  reveal: number;
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  onPick: (k: string) => void;
  reduced?: boolean;
  sideAlpha: { L: number; R: number };
  ends: Map<string, EndKind>;
  /** unique mask ids when several diagrams share a page (static sheets) */
  idPrefix?: string;
}

export function DiagramView({ diagram, beats, resolved, cur, reveal, hoverKey, onHover, onPick, reduced, sideAlpha, ends, idPrefix = "" }: Props) {
  const uid = idPrefix + useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w } = diagram;

  /* labels: free ones where they are; gutter ones stacked on the right, leading to the target on the right half */
  const labelNodes = useMemo(() => {
    const nodes: { l: DLabel; x: number; y: number; anchor: "start" | "middle" | "end"; tx?: number; ty?: number }[] = [];
    const gut: { l: DLabel; ty: number; tx: number; y: number; lines: number }[] = [];
    for (const l of diagram.labels) {
      if (l.lead) {
        const tgt = l.lead.L[0] > l.lead.R[0] ? l.lead.L : l.lead.R;
        gut.push({ l, tx: tgt[0], ty: tgt[1], y: tgt[1], lines: l.text.split("\n").length });
      } else nodes.push({ l, x: l.x ?? 0, y: l.y ?? 0, anchor: l.anchor ?? "middle", tx: l.to?.[0], ty: l.to?.[1] });
    }
    gut.sort((a, b) => a.ty - b.ty);
    let bottom = -1e9;
    for (const g of gut) {
      const hh = g.lines * 13;
      const y = Math.max(g.ty, bottom + hh / 2 + 2);
      g.y = y;
      bottom = y + hh / 2;
    }
    for (const g of gut) nodes.push({ l: g.l, x: diagram.midline ? diagram.midline.x + 89 : 250, y: g.y, anchor: "start", tx: g.tx, ty: g.ty });
    return nodes;
  }, [diagram]);

  /** the beats an element stands for and how lit it is */
  const stateOf = (keys: string[]) => {
    const idx = [...new Set(keys.flatMap((k) => resolved.get(k) ?? []))].sort((a, b) => a - b);
    if (!idx.length) return null;
    const shown = idx[0] <= reveal;
    const hot = cur !== null && idx.includes(cur);
    const hov = idx.some((i) => beats[i]?.info === hoverKey);
    const op = shown ? (hot || cur === null ? 1 : 0.62) : 0.3;
    return { idx, shown, hot, hov, op, main: idx[0], order: (beats[idx[0]]?.neuron ?? 0) + 1 };
  };

  const items = useMemo(
    () =>
      diagram.els
        .map((el) => ({ el, st: stateOf(el.keys) }))
        .filter((x): x is { el: DEl; st: NonNullable<ReturnType<typeof stateOf>> } => x.st !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diagram, resolved, cur, reveal, hoverKey, beats],
  );

  const alphaOf = (s: DEl["side"]) => (s === "M" ? 1 : sideAlpha[s] < 0.5 ? 0.22 : 1);
  const handlers = (idx: number[]) => {
    const info = beats[idx[0]].info;
    return {
      onMouseEnter: () => onHover(info),
      onMouseLeave: () => onHover(null),
      onClick: () => onPick(info),
      style: { cursor: "pointer" } as const,
    };
  };
  const colorOf = (el: DEl, order: number) => el.color ?? orderColor(el.order ?? order);
  const h = Math.max(diagram.h, ...labelNodes.map((nd) => nd.y + nd.l.text.split("\n").length * 6 + 6));
  const trans = reduced ? "none" : undefined;
  const bar = (el: DEl) => (el.side === "R" || el.dash ? "5 4" : undefined);

  const renderPath = ({ el, st }: (typeof items)[number], key: string) => {
    if (!el.d) return null;
    const c = colorOf(el, st.order);
    const mid = `${uid}m${key}`;
    const lw = (el.width ?? 0) + (st.hot ? 1.4 : st.hov ? 1 : 0) || (st.hot ? 4.2 : st.hov ? 3.8 : 2.8);
    const dashed = bar(el);
    const ek = el.endKind ?? ends.get(el.keys.find((k) => ends.has(k)) ?? "") ?? "none";
    return (
      <g key={key} data-beat={st.main} data-beats={st.idx.join(",")} opacity={alphaOf(el.side) * st.op} {...handlers(st.idx)}>
        <title>{beats[st.main].caption}</title>
        <mask id={mid} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <path d={el.d} pathLength={1} fill="none" stroke="#fff" strokeWidth={14} strokeDasharray="1 1" strokeDashoffset={st.shown ? 0 : 1} className="pwd-draw" style={trans ? { transition: trans } : undefined} />
        </mask>
        <path d={el.d} fill="none" stroke={c} strokeOpacity={0.22} strokeWidth={2.2} strokeDasharray={dashed} strokeLinecap="round" />
        <path d={el.d} fill="none" stroke={c} strokeWidth={lw} strokeDasharray={dashed} strokeLinecap="round" strokeLinejoin="round" mask={`url(#${mid})`} style={{ transition: trans ?? "stroke-width 150ms" }} />
        <path d={el.d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />
        {el.end && ek !== "none" && (
          <g transform={`translate(${el.end.x} ${el.end.y}) rotate(${el.end.a})`} opacity={st.shown ? 1 : 0} className="pwd-late" style={trans ? { transition: trans } : undefined}>
            {ek === "arrow" && <path d="M-9 -5.5 L0 0 L-9 5.5" fill="none" stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />}
            {ek === "bar" && <path d="M1 -6.5 L1 6.5" stroke={c} strokeWidth={3.2} strokeLinecap="round" />}
            {ek === "cup" && (
              <>
                <circle cx={-1} cy={0} r={2.6} fill={c} stroke={INK} strokeWidth={0.6} />
                <path d="M3 -6 Q9 0 3 6" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
              </>
            )}
          </g>
        )}
      </g>
    );
  };

  const renderRegion = ({ el, st }: (typeof items)[number], key: string) => {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const c = colorOf(el, st.order);
    return (
      <g key={key} data-beat={st.main} data-beats={st.idx.join(",")} opacity={alphaOf(el.side) * st.op} {...handlers(st.idx)}>
        <title>{beats[st.main].caption}</title>
        <ellipse cx={x} cy={y} rx={(el.rx ?? 6) + (st.hot ? 1.5 : 0)} ry={(el.ry ?? 4.5) + (st.hot ? 1.5 : 0)} fill={st.hot || st.hov ? REGION_COLORS.current : REGION_COLORS.fill} stroke={INK} strokeWidth={st.hot ? 2 : 1.2} strokeDasharray={el.side === "R" ? "3 2" : undefined} />
        {el.soma && <circle cx={x} cy={y} r={st.hot ? 3.6 : 3} fill={c} stroke={INK} strokeWidth={0.8} />}
      </g>
    );
  };

  const renderIcon = ({ el, st }: (typeof items)[number], key: string) => {
    const I = ICONS[el.icon ?? "organ"] ?? Heart;
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    return (
      <g key={key} data-beat={st.main} data-beats={st.idx.join(",")} opacity={alphaOf(el.side) * st.op} {...handlers(st.idx)}>
        <title>{beats[st.main].caption}</title>
        <circle cx={x} cy={y} r={st.hot ? 14 : 12.5} fill={st.hot || st.hov ? REGION_COLORS.current : REGION_COLORS.fill} stroke={INK} strokeWidth={st.hot ? 2 : 1.2} strokeDasharray={el.side === "R" ? "3 2" : undefined} />
        <I x={x - 8} y={y - 8} width={16} height={16} stroke={INK} strokeWidth={2} />
      </g>
    );
  };

  const renderBox = ({ el, st }: (typeof items)[number], key: string) => {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const bw = el.w ?? 84;
    const bh = el.h ?? 32;
    const lines = el.text ?? [];
    return (
      <g key={key} data-beat={st.main} data-beats={st.idx.join(",")} opacity={st.op} {...handlers(st.idx)}>
        <title>{beats[st.main].caption}</title>
        <rect x={x - bw / 2} y={y - bh / 2} width={bw} height={bh} rx={7} fill={st.hot || st.hov ? REGION_COLORS.current : REGION_COLORS.fill} stroke={INK} strokeWidth={st.hot ? 2.4 : 1.3} />
        {lines.map((t, i) => (
          <text key={i} x={x + (el.soma ? 3 : 0)} y={y + (i - (lines.length - 1) / 2) * 13 + 4.4} textAnchor="middle" fontSize={13} fontWeight={st.hot ? 700 : 500} fill={INK}>
            {t}
          </text>
        ))}
        {el.soma && <circle cx={x - bw / 2 + 9} cy={y - bh / 2 + 9} r={3.6} fill={colorOf(el, st.order)} stroke={INK} strokeWidth={0.8} />}
      </g>
    );
  };

  const renderCross = ({ el, st }: (typeof items)[number], key: string) => (
    <g key={key} data-beat={st.main} data-beats={st.idx.join(",")} opacity={st.shown ? Math.max(st.op, 0.7) : 0.25} {...handlers(st.idx)} className="pwd-late" style={trans ? { transition: trans } : undefined}>
      <title>Crosses the midline</title>
      <circle cx={el.x} cy={el.y} r={st.hot ? 8.5 : 7} fill="var(--bg-2)" stroke={GUIDE_COLORS.crossing} strokeWidth={2} />
      <path d={`M${(el.x ?? 0) - 3} ${(el.y ?? 0) - 3} L${(el.x ?? 0) + 3} ${(el.y ?? 0) + 3} M${(el.x ?? 0) + 3} ${(el.y ?? 0) - 3} L${(el.x ?? 0) - 3} ${(el.y ?? 0) + 3}`} stroke={GUIDE_COLORS.crossing} strokeWidth={2} strokeLinecap="round" />
    </g>
  );

  const renderBadge = ({ el, st }: (typeof items)[number], key: string) => (
    <g key={key} opacity={st.op} data-beat={st.main} data-beats={st.idx.join(",")} {...handlers(st.idx)}>
      <circle cx={el.x} cy={el.y} r={9} fill={orderColor(el.order ?? st.order)} stroke={INK} strokeWidth={1} />
      <text x={el.x} y={(el.y ?? 0) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={INK}>
        {el.badge}
      </text>
    </g>
  );

  const order: DEl["kind"][] = ["path", "region", "box", "icon", "cross", "badge"];
  const drawn = order.flatMap((kind) =>
    items
      .filter((x) => x.el.kind === kind)
      .map((x) => {
        const key = `${x.el.id}`;
        if (kind === "path") return renderPath(x, key);
        if (kind === "region") return renderRegion(x, key);
        if (kind === "box") return renderBox(x, key);
        if (kind === "icon") return renderIcon(x, key);
        if (kind === "cross") return renderCross(x, key);
        return renderBadge(x, key);
      }),
  );

  const labelState = (l: DLabel) => stateOf(l.keys);
  const renderLabel = (nd: (typeof labelNodes)[number], i: number) => {
    const st = labelState(nd.l);
    if (!st) return null;
    const lines = nd.l.text.split("\n");
    const fs = 13;
    const y0 = nd.y - ((lines.length - 1) * fs) / 2 + fs * 0.34;
    return (
      <g key={i} opacity={st.shown ? (st.hot || cur === null ? 1 : 0.8) : 0.4}>
        {nd.tx !== undefined && nd.ty !== undefined && <line x1={nd.anchor === "start" ? nd.x - 3 : nd.anchor === "end" ? nd.x + 3 : nd.x} y1={nd.y} x2={nd.tx} y2={nd.ty} stroke="var(--text-faint)" strokeWidth={0.8} strokeOpacity={0.6} strokeDasharray="1.5 2.5" />}
        <text x={nd.x} y={y0} textAnchor={nd.anchor} fontSize={fs} fontWeight={st.hot ? 700 : 500} fill={nd.l.ink ? INK : "var(--text)"} stroke={nd.l.ink ? "none" : "var(--bg-2)"} strokeWidth={3.2} paintOrder="stroke" strokeLinejoin="round">
          {lines.map((t, k) => (
            <tspan key={k} x={nd.x} dy={k === 0 ? 0 : fs}>
              {t}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  const ml = diagram.midline;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Pathway diagram" className="pwd-fig block select-none">
      {diagram.deco}
      {ml && (
        <g>
          <line x1={ml.x} y1={ml.y0 + 6} x2={ml.x} y2={ml.y1} stroke={GUIDE_COLORS.midline} strokeWidth={1.2} strokeOpacity={0.55} />
          <text x={ml.x - 7} y={ml.y0 + 5} textAnchor="end" fontSize={12} fontWeight={700} fill={GUIDE_COLORS.midline}>
            L
          </text>
          <text x={ml.x} y={ml.y0 + 5} textAnchor="middle" fontSize={12} fill={GUIDE_COLORS.midline}>
            |
          </text>
          <text x={ml.x + 7} y={ml.y0 + 5} textAnchor="start" fontSize={12} fontWeight={700} fill={GUIDE_COLORS.midline}>
            R
          </text>
        </g>
      )}
      {diagram.levelNames?.map((n, i) => (
        <text key={i} x={(ml?.x ?? 170) - 92} y={n.y - (n.text[1] ? 2 : -4)} textAnchor="end" fontSize={12.5} fill="var(--text-dim)">
          <tspan x={(ml?.x ?? 170) - 92}>{n.text[0]}</tspan>
          {n.text[1] && (
            <tspan x={(ml?.x ?? 170) - 92} dy={13}>
              {n.text[1]}
            </tspan>
          )}
        </text>
      ))}
      {drawn}
      {labelNodes.map(renderLabel)}
    </svg>
  );
}

export const FIELD_LEGEND = [
  { color: FIELD_COLORS.leftLower, label: "left field", dash: false },
  { color: FIELD_COLORS.rightLower, label: "right field", dash: true },
];
export type { Side };
