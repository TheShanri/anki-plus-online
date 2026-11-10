import type { ReactNode } from "react";
import { spline, sym, type P } from "./geom";

/* Simplified cross-sections for the level stacks. Each level is drawn around its own midline (x = 0, dorsal at the top).
 * `at` holds named positions as [lateral distance from the midline, y]: the stack mirrors them for the two sides. */

export interface LevelDef {
  label: [string, string?];
  hw: number;
  h: number;
  draw: () => ReactNode;
  at: Record<string, P>;
}

const OUT = { fill: "var(--bg-3)", stroke: "var(--text-faint)", strokeWidth: 1.3, vectorEffect: "non-scaling-stroke" as const };
const GM = { fill: "color-mix(in srgb, var(--text-faint) 26%, transparent)", stroke: "var(--text-faint)", strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" as const };
const NUC = { fill: "color-mix(in srgb, var(--accent-2, #3a8) 24%, transparent)", stroke: "var(--text-faint)", strokeWidth: 0.7, vectorEffect: "non-scaling-stroke" as const };
const WM = { fill: "color-mix(in srgb, var(--bg-2) 70%, var(--bg-3))", stroke: "none" };
const LINE = { fill: "none", stroke: "var(--text-faint)", strokeWidth: 0.8, vectorEffect: "non-scaling-stroke" as const, strokeOpacity: 0.7 };
const MID = { fill: "none", stroke: "var(--text-faint)", strokeWidth: 0.7, strokeDasharray: "2 3", strokeOpacity: 0.55, vectorEffect: "non-scaling-stroke" as const };

/** A small nucleus pair (both sides). */
const Pair = ({ x, y, rx, ry, rot = 0 }: { x: number; y: number; rx: number; ry: number; rot?: number }) => (
  <>
    <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${rot} ${x} ${y})`} {...NUC} />
    <ellipse cx={-x} cy={y} rx={rx} ry={ry} transform={`rotate(${-rot} ${-x} ${y})`} {...NUC} />
  </>
);
const Ven = ({ half }: { half: P[] }) => <path d={sym(half)} fill="var(--bg-2)" stroke="var(--text-faint)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
const Dot = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <>
    <circle cx={x} cy={y} r={r} {...NUC} />
    <circle cx={-x} cy={y} r={r} {...NUC} />
  </>
);
const mirrorLine = (d: string) => (
  <>
    <path d={d} {...LINE} />
    <path d={d} {...LINE} transform="scale(-1 1)" />
  </>
);

/* ---- spinal cord ---- */
const cordDraw = () => (
  <>
    <path d={sym([[0, 1], [20, 2], [33, 10], [37, 23], [33, 36], [19, 44], [0, 45]])} {...OUT} />
    {mirrorLine("M11 3 L8.5 14")}
    <path d={sym([[0, 17], [4, 10], [9, 5], [14, 2], [18, 5], [16, 13], [22, 19], [29, 23], [31, 31], [25, 37], [16, 38], [8, 34], [0, 31]])} {...GM} />
    <circle cx={0} cy={24} r={1.8} fill="var(--bg-2)" stroke="var(--text-faint)" strokeWidth={0.7} />
  </>
);
const cordAt: Record<string, P> = {
  drg: [49, 9], root: [22, 3], gr: [6, 8], cu: [15, 8], dc: [10, 8], dh: [20, 10], mz: [21, 6], clarke: [9, 17], awc: [0, 29],
  alst: [31, 33], lcst: [29, 18], dsct: [34, 14], rst: [26, 24], acst: [8, 42], tst: [3, 41], vst: [17, 41], ret: [11, 39],
  lh: [25, 25], vh: [21, 32], vhm: [11, 33], vr: [26, 46], gang: [50, 38], mid: [0, 24], vrx: [30, 45], int: [16, 20],
};

const scaleAt = (at: Record<string, P>, kx: number, ky: number): Record<string, P> => Object.fromEntries(Object.entries(at).map(([n, [x, y]]) => [n, [x * kx, y * ky] as P]));
const cord = (hw: number, h: number, kx: number, ky: number): Omit<LevelDef, "label"> => ({
  hw,
  h,
  draw: () => <g transform={`scale(${kx} ${ky})`}>{cordDraw()}</g>,
  at: scaleAt(cordAt, kx, ky),
});

/* ---- medulla ---- */
const medCDraw = () => (
  <>
    <path d={sym([[0, 2], [18, 1], [33, 8], [40, 22], [36, 40], [20, 49], [0, 47]])} {...OUT} />
    <path d="M0 40 L0 48" {...LINE} />
    <circle cx={0} cy={17} r={1.8} fill="var(--bg-2)" stroke="var(--text-faint)" strokeWidth={0.7} />
    <Pair x={8} y={8} rx={5} ry={4} />
    <Pair x={17} y={10} rx={5} ry={4} />
    <Pair x={32} y={16} rx={4.5} ry={7} />
    <Pair x={13} y={43} rx={8} ry={4.5} />
    <Pair x={4} y={34} rx={2.5} ry={5} />
  </>
);
const medRDraw = () => (
  <>
    <path d={sym([[0, 2], [20, 1], [38, 8], [44, 24], [40, 42], [24, 54], [0, 52]])} {...OUT} />
    <Ven half={[[0, 3], [9, 9], [0, 16]]} />
    <Dot x={5} y={14} r={2.6} />
    <Dot x={11} y={15} r={2.6} />
    <Pair x={18} y={16} rx={3.5} ry={4} />
    <Pair x={28} y={11} rx={5} ry={3.5} />
    <Pair x={36} y={12} rx={3.5} ry={3.5} />
    <Pair x={35} y={23} rx={3.5} ry={6} />
    <Dot x={23} y={29} r={2.6} />
    <Pair x={24} y={38} rx={9} ry={7} rot={-20} />
    <Pair x={13} y={48} rx={8} ry={4} />
    <Pair x={4} y={32} rx={2.5} ry={5} />
    <path d="M0 44 L0 52" {...LINE} />
  </>
);

/* ---- pons ---- */
const ponsDraw = () => (
  <>
    <path d={sym([[0, 2], [24, 1], [46, 8], [58, 24], [55, 48], [34, 63], [0, 62]])} {...OUT} />
    <Ven half={[[0, 4], [12, 10], [0, 17]]} />
    <path d={spline([[-54, 33], [-25, 37], [0, 38], [25, 37], [54, 33]])} {...MID} />
    <Dot x={8} y={17} r={2.4} />
    <Dot x={24} y={30} r={3} />
    <Dot x={32} y={26} r={3} />
    <Pair x={38} y={17} rx={4.5} ry={3.5} />
    <Pair x={46} y={21} rx={3.5} ry={5} />
    <Pair x={28} y={52} rx={9} ry={6} />
    <Pair x={14} y={50} rx={4} ry={7} />
    <Pair x={10} y={36} rx={5} ry={2.2} />
  </>
);

/* ---- midbrain ---- */
const midOutline = sym([[0, 2], [22, 1], [40, 8], [50, 22], [49, 40], [36, 56], [14, 57], [0, 49]]);
const mbRDraw = () => (
  <>
    <path d={midOutline} {...OUT} />
    <circle cx={0} cy={16} r={3} fill="var(--bg-2)" stroke="var(--text-faint)" strokeWidth={0.8} />
    <Pair x={13} y={7} rx={9} ry={4.5} />
    <Dot x={3} y={20} r={2.4} />
    <Dot x={18} y={29} r={6} />
    {mirrorLine("M12 40 Q24 44 36 40")}
    <Pair x={34} y={50} rx={11} ry={5} rot={-30} />
  </>
);
const mbCDraw = () => (
  <>
    <path d={midOutline} {...OUT} />
    <circle cx={0} cy={16} r={3} fill="var(--bg-2)" stroke="var(--text-faint)" strokeWidth={0.8} />
    <Pair x={15} y={8} rx={9} ry={5} />
    <Dot x={3} y={21} r={2.2} />
    <Pair x={16} y={28} rx={4} ry={5} />
    {mirrorLine("M12 42 Q24 46 36 42")}
    <Pair x={34} y={50} rx={11} ry={5} rot={-30} />
  </>
);

/* ---- cervicomedullary junction (the pyramidal decussation) ---- */
const cmjDraw = () => (
  <>
    <path d={sym([[0, 2], [18, 1], [33, 8], [38, 22], [34, 38], [18, 47], [0, 46]])} {...OUT} />
    <path d={sym([[0, 15], [6, 9], [13, 8], [18, 14], [14, 22], [8, 28], [0, 30]])} {...GM} />
    <Pair x={14} y={40} rx={8} ry={4.5} />
  </>
);

/* ---- forebrain: one coronal slice through cortex, internal capsule and thalamus ---- */
const fbOuter: P[] = [[0, 3], [20, 1], [42, 8], [56, 24], [60, 46], [59, 70], [56, 92], [46, 108], [30, 116], [14, 112], [5, 108], [0, 108]];
const fbDraw = () => (
  <>
    <path d={sym(fbOuter)} {...OUT} />
    <g transform="translate(0 56) scale(0.86) translate(0 -56)">
      <path d={sym(fbOuter)} {...WM} />
    </g>
    <path d="M0 3 L0 30" {...LINE} />
    <path d="M-30 27 Q0 22 30 27" {...LINE} strokeWidth={2.4} />
    <path d="M57 62 Q48 66 42 72" {...LINE} />
    <path d="M-57 62 Q-48 66 -42 72" {...LINE} />
    <Pair x={9} y={39} rx={4} ry={8} />
    <Pair x={14} y={46} rx={5} ry={5} />
    <Pair x={13} y={68} rx={10} ry={15} />
    <path d="M0 50 L0 86" {...MID} />
    <Pair x={41} y={62} rx={8} ry={13} rot={-8} />
    {mirrorLine("M44 12 Q47 20 43 28")}
    {mirrorLine("M54 44 Q48 50 50 58")}
  </>
);

/* ---- cerebellum ---- */
const cbDraw = () => (
  <>
    <path d={sym([[0, 6], [22, 2], [46, 8], [58, 22], [54, 40], [34, 48], [10, 46], [0, 42]])} {...OUT} />
    <path d={sym([[0, 10], [20, 8], [40, 14], [50, 24], [46, 36], [30, 42], [8, 40], [0, 36]])} {...WM} />
    {mirrorLine("M30 12 Q38 20 34 30")}
    <Pair x={25} y={27} rx={6} ry={5} />
    <Pair x={15} y={27} rx={3} ry={3} />
    <Pair x={6} y={27} rx={3} ry={3} />
  </>
);

const big = (d: LevelDef, k: number, label: LevelDef["label"]): LevelDef => ({
  label,
  hw: d.hw * k,
  h: d.h * k,
  draw: () => <g transform={`scale(${k})`}>{d.draw()}</g>,
  at: scaleAt(d.at, k, k),
});

export const LEVELS: Record<string, LevelDef> = {
  fb: {
    label: ["Forebrain"], hw: 60, h: 118, draw: fbDraw,
    at: { m1: [33, 9], m1b: [33, 17], s1: [41, 13], fm: [52, 30], fs: [54, 36], fef: [24, 10], ctx: [41, 12], corona: [34, 38], coronaF: [38, 44], plic: [28, 68], genu: [23, 54], cap0: [23, 68], vpl: [13, 72], vpm: [8, 72], vl: [14, 60], mgn: [18, 85], a1: [51, 86], mid: [0, 60] },
  },
  mbR: {
    label: ["Midbrain", "rostral"], hw: 50, h: 58, draw: mbRDraw,
    at: { sc: [13, 7], pt: [10, 10], iii: [3, 20], ew: [5, 14], rn: [18, 29], rst: [20, 42], tst: [3, 40], ml: [33, 33], alst: [42, 28], mlf: [3, 24], ped: [34, 50], pedM: [26, 51], mid: [0, 36], mid2: [0, 41], vtd: [9, 40], pcom: [0, 9], sn: [24, 41], iiix: [6, 30] },
  },
  mbC: {
    label: ["Midbrain", "caudal"], hw: 50, h: 58, draw: mbCDraw,
    at: { ic: [15, 8], iv: [3, 21], scp: [16, 28], ml: [33, 33], alst: [42, 28], ped: [34, 50], pedM: [26, 51], brach: [40, 12], mid: [0, 34], mlf: [3, 24] },
  },
  pons: {
    label: ["Pons"], hw: 58, h: 64, draw: ponsDraw,
    at: { mlf: [3, 20], vi: [8, 17], vii: [24, 30], vm: [32, 26], vms: [38, 17], mes: [26, 8], stt: [46, 22], ppr: [9, 22], ml: [10, 36], alst: [44, 32], vn: [38, 12], cn: [47, 14], rf: [15, 27], cst: [15, 50], pn: [28, 52], tl: [16, 35], mcp: [53, 32], mid: [0, 28], midb: [0, 47], pedM: [20, 49], cb1: [20, 44], cb2: [9, 36], rst: [30, 38], tst: [5, 30], gg: [70, 40], ent: [54, 34], ssn: [14, 24], vexit: [58, 36], mlf2: [3, 27], ttt: [44, 34] },
  },
  medR: {
    label: ["Medulla", "rostral"], hw: 44, h: 56, draw: medRDraw,
    at: { xii: [5, 14], dmv: [11, 15], sol: [18, 16], vn: [28, 11], cn: [36, 12], stt: [35, 23], amb: [23, 29], olive: [24, 38], ml: [4, 32], pyr: [14, 48], icp: [38, 18], alst: [35, 34], rf: [14, 28], rst: [28, 34], tst: [4, 30], vst: [30, 36], isn: [15, 24], cnent: [47, 20], mid: [0, 30], olmid: [0, 36], cnx: [45, 26] },
  },
  medC: {
    label: ["Medulla", "caudal"], hw: 40, h: 50, draw: medCDraw,
    at: { gr: [8, 8], cu: [17, 10], dcn: [12, 9], arc1: [14, 20], arc2: [7, 28], mid: [0, 30], ml: [4, 35], stt: [32, 17], alst: [33, 34], pyr: [14, 43], vst: [26, 36], rst: [26, 30], tst: [4, 30], ttt: [33, 36] },
  },
  cmj: { label: ["Medulla–cord", "junction"], hw: 38, h: 48, draw: cmjDraw, at: { pyr: [13, 40], pd1: [8, 32], mid: [0, 26], pd2: [6, 20], lcst: [27, 16], acst: [8, 41] } },
  cordC: { label: ["Cervical", "cord"], ...cord(38, 46, 1, 1) },
  cordT: { label: ["Thoracic", "cord"], ...cord(30, 40, 0.8, 0.87) },
  cordL: { label: ["Lumbar", "cord"], ...cord(34, 40, 0.9, 0.87) },
  cordX: { label: ["Spinal cord"], ...cord(72, 87, 1.9, 1.9) },
  cb: { label: ["Cerebellum"], hw: 58, h: 50, draw: cbDraw, at: { cx: [40, 18], dn: [25, 27], fn: [6, 27], icp: [47, 40], mcp: [53, 30], vn: [10, 38] } },
};
LEVELS.ponsX = big(LEVELS.pons, 1.25, ["Pons"]);
LEVELS.mbRX = big(LEVELS.mbR, 1.45, ["Midbrain"]);
