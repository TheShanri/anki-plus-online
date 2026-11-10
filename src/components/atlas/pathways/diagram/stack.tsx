import type { ReactNode } from "react";
import { link, type P } from "./geom";
import { LEVELS } from "./levels";
import type { DEl, DLabel, Diagram, EndKind, Side } from "./types";

/* The "level stack": cross-sections from the top of the neuraxis to the bottom, with the pathway passing through them.
 * Positions are written "level.anchor:rel" (rel i = the side of the traced limb, c = the opposite, m = midline), with an
 * optional pixel nudge "@dx,dy". One instance is traced (the left one is drawn on the left of the midline); the stack builds
 * both instances and the renderer decides which is solid. */

export const W = 352;
export const CX = 170;
export interface Cap {
  icon: string;
  /** below the stack, this far from the midline (the default) */
  dx?: number;
  /** or beside a level: any point string */
  at?: string;
}
export type SEl =
  | { t: "p"; k: string | string[]; pts: string[]; end?: EndKind; cross?: string; lbl?: string; at?: number; dash?: boolean; order?: number }
  | { t: "n"; k: string | string[]; at: string; lbl?: string; rx?: number; ry?: number; soma?: boolean; order?: number; lblAt?: string };
export interface StackSpec {
  levels: string[];
  capS?: Cap;
  capE?: Cap;
  els: SEl[];
}

const SIDES: Side[] = ["L", "R"];
const arr = (k: string | string[]) => (Array.isArray(k) ? k : [k]);

export function buildStack(spec: StackSpec): Diagram {
  const TOP = 26;
  const GAP = 22;
  let y = TOP;
  const at: Record<string, { y: number; id: string }> = {};
  const deco: ReactNode[] = [];
  const levelNames: NonNullable<Diagram["levelNames"]> = [];
  for (const id of spec.levels) {
    const def = LEVELS[id];
    if (!def) throw new Error(`unknown level ${id}`);
    at[id] = { y, id };
    deco.push(
      <g key={id} transform={`translate(${CX} ${y})`}>
        {def.draw()}
      </g>,
    );
    levelNames.push({ text: def.label, y: y + def.h / 2 });
    y += def.h + GAP;
  }
  const bottom = y - GAP;
  const capY = bottom + 36;
  const hasCap = !!((spec.capS && !spec.capS.at) || (spec.capE && !spec.capE.at));
  const h = hasCap ? capY + 24 : bottom + 14;

  const pt = (s: string, side: Side): P => {
    const m = /^([A-Za-z0-9]+)(?:\.([A-Za-z0-9]+))?(?::([icm]))?(?:@(-?[\d.]+),(-?[\d.]+))?$/.exec(s);
    if (!m) throw new Error(`bad point ${s}`);
    const [, lv, an, rel = "i", ox = "0", oy = "0"] = m;
    const dir = rel === "m" ? (side === "L" ? -1 : 1) : (rel === "i") === (side === "L") ? -1 : 1;
    let x: number;
    let yy: number;
    if (lv === "capS" || lv === "capE") {
      const cap = lv === "capS" ? spec.capS : spec.capE;
      if (!cap) throw new Error(`no ${lv}`);
      if (cap.at) {
        const base = pt(cap.at, side);
        x = rel === "c" ? 2 * CX - base[0] : base[0];
        yy = base[1];
      } else {
        x = CX + (rel === "m" ? 0 : dir) * (cap.dx ?? 40);
        yy = capY;
      }
    } else {
      const lvl = at[lv];
      if (!lvl) throw new Error(`level ${lv} is not in the stack (${s})`);
      const a = LEVELS[lv].at[an];
      if (!a) throw new Error(`no anchor ${s}`);
      x = CX + (rel === "m" ? 0 : dir) * a[0];
      yy = lvl.y + a[1];
    }
    // the pixel nudge is lateral: away from the midline on the side the point is on
    return [x + dir * Number(ox), yy + Number(oy)];
  };

  const els: DEl[] = [];
  const labels: DLabel[] = [];
  let hasCross = false;
  spec.els.forEach((e, n) => {
    const keys = arr(e.k);
    if (e.t === "p") {
      for (const side of SIDES) {
        const pts = e.pts.map((s) => pt(s, side));
        const l = link(pts);
        els.push({ id: `p${n}${side}`, keys, kind: "path", side, d: l.d, end: l.end, endKind: e.end, dash: e.dash, order: e.order });
      }
      if (e.cross) {
        hasCross = true;
        const p = pt(e.cross, "L");
        els.push({ id: `x${n}`, keys, kind: "cross", side: "M", x: CX, y: p[1] });
      }
      if (e.lbl) {
        const i = e.at ?? Math.floor((e.pts.length - 1) / 2);
        labels.push({ keys, text: e.lbl, lead: { L: pt(e.pts[i], "L"), R: pt(e.pts[i], "R") } });
      }
    } else {
      const isIcon = /^cap[SE]/.test(e.at);
      for (const side of SIDES) {
        const [x, yy] = pt(e.at, side);
        els.push(
          isIcon
            ? { id: `n${n}${side}`, keys, kind: "icon", side, x, y: yy, icon: (e.at.startsWith("capS") ? spec.capS : spec.capE)?.icon }
            : { id: `n${n}${side}`, keys, kind: "region", side, x, y: yy, rx: e.rx ?? 6, ry: e.ry ?? 4.5, soma: e.soma ?? keys.some((k) => /^n\d$/.test(k)), order: e.order },
        );
      }
      if (e.lbl) labels.push({ keys, text: e.lbl, lead: { L: pt(e.lblAt ?? e.at, "L"), R: pt(e.lblAt ?? e.at, "R") } });
    }
  });

  return { w: W, h, mode: "instance", midline: { x: CX, y0: TOP - 8, y1: h - 6 }, deco, els, labels, levelNames: spec.levels.length > 1 ? levelNames : undefined, hasCross };
}
