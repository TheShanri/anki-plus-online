import type { ReactNode } from "react";
import { FIELD_COLORS } from "@/lib/atlas/pathwayPalette";
import { elbow, link, spline, sym, type P } from "./geom";
import type { DEl, DLabel, Diagram, EndKind, Side } from "./types";

/* Free-layout diagrams in the canvas's own coordinates (340 wide):
 *  - circuits (basal ganglia, cerebellar): boxes and arrows laid out like the brain (cortex on top, thalamus beside, brainstem below)
 *  - the mid-sagittal limbic brain (fornix, amygdala, septal, reward, olfactory)
 *  - the visual pathway (axial, eyes at the top, occipital cortex at the bottom). */

const W = 340;
const arr = (k: string | string[]) => (Array.isArray(k) ? k : [k]);
const STROKE = { fill: "none", stroke: "var(--text-faint)", vectorEffect: "non-scaling-stroke" as const };

/* ------------------------------------------------------------------ circuits */
interface Builder {
  els: DEl[];
  labels: DLabel[];
  n: number;
  box: (k: string | string[], x: number, y: number, text: string[], o?: { w?: number; h?: number; soma?: boolean }) => void;
  line: (k: string | string[], pts: P[], end: EndKind, o?: { dash?: boolean; r?: number }) => void;
  cross: (k: string | string[], x: number, y: number) => void;
  text: (k: string | string[], t: string, x: number, y: number, anchor?: "start" | "middle" | "end") => void;
}
function builder(): Builder {
  const b: Builder = {
    els: [],
    labels: [],
    n: 0,
    box(k, x, y, text, o = {}) {
      b.els.push({ id: `b${b.n++}`, keys: arr(k), kind: "box", side: "M", x, y, w: o.w ?? 84, h: o.h ?? 32, text, soma: o.soma ?? arr(k).some((q) => /^n\d$/.test(q)) });
    },
    line(k, pts, end, o = {}) {
      const l = elbow(pts, o.r ?? 8);
      b.els.push({ id: `l${b.n++}`, keys: arr(k), kind: "path", side: "M", d: l.d, end: l.end, endKind: end, dash: o.dash });
    },
    cross(k, x, y) {
      b.els.push({ id: `x${b.n++}`, keys: arr(k), kind: "cross", side: "M", x, y });
    },
    text(k, t, x, y, anchor = "start") {
      b.labels.push({ keys: arr(k), text: t, x, y, anchor, small: true });
    },
  };
  return b;
}

export function basalGanglia(): Diagram {
  const b = builder();
  b.box("n0", 174, 34, ["Motor cortex"], { w: 100 });
  b.box("n1", 58, 100, ["Striatum"]);
  b.box("end", 290, 100, ["VA/VL", "thalamus"]);
  b.box("n2", 174, 166, ["GPi"]);
  b.box("indirect", 58, 166, ["GPe"]);
  b.box("indirect", 174, 232, ["STN"]);
  b.box("snc", 58, 232, ["SNc", "dopamine"]);
  b.line("cs", [[132, 34], [58, 34], [58, 84]], "arrow");
  b.line("direct", [[100, 104], [116, 104], [116, 166], [132, 166]], "bar");
  b.line("indirect", [[58, 116], [58, 150]], "bar");
  b.line("indirect", [[58, 182], [58, 200], [174, 200], [174, 216]], "bar");
  b.line("indirect", [[216, 232], [226, 232], [226, 176], [216, 176]], "arrow");
  b.line("pt", [[216, 156], [290, 156], [290, 116]], "bar");
  b.line("pt", [[290, 84], [290, 34], [216, 34]], "arrow");
  b.line("snc", [[16, 232], [7, 232], [7, 100], [16, 100]], "arrow", { dash: true });
  b.text("direct", "Direct", 121, 132);
  b.text("indirect", "Indirect", 66, 194);
  return { w: W, h: 262, mode: "plain", deco: null, els: b.els, labels: b.labels, note: "→ excites  ⊣ inhibits  ┄ modulates" };
}

export function cerebellarCircuit(): Diagram {
  const b = builder();
  b.box("rn", 58, 34, ["VA/VL", "thalamus"]);
  b.box("dec", 290, 34, ["Red", "nucleus"]);
  b.box("n2", 174, 100, ["Deep", "nuclei"]);
  b.box("n1", 174, 166, ["Cerebellar", "cortex"]);
  b.box(["n0", "mf"], 58, 232, ["Pontine", "nuclei"]);
  b.box(["n0", "cf"], 290, 232, ["Inferior", "olive"]);
  b.line("rn", [[248, 34], [100, 34]], "arrow");
  b.line("scp", [[216, 104], [248, 104]], "none");
  b.line("dec", [[248, 104], [290, 104], [290, 50]], "arrow");
  b.cross("dec", 270, 104);
  b.line("cx", [[174, 150], [174, 116]], "bar");
  b.line("mf", [[58, 216], [58, 198], [150, 198], [150, 182]], "arrow");
  b.line("cf", [[290, 216], [290, 198], [198, 198], [198, 182]], "arrow");
  b.text("mf", "Mossy", 66, 194);
  b.text("cf", "Climbing", 282, 194, "end");
  b.text("scp", "SCP", 222, 94, "start");
  return { w: W, h: 262, mode: "plain", deco: null, els: b.els, labels: b.labels, note: "→ excites  ⊣ inhibits (Purkinje)", hasCross: true };
}

/* ------------------------------------------------------------------ the mid-sagittal brain */
const CEREBRUM: P[] = [[26, 108], [46, 78], [90, 52], [150, 40], [215, 44], [268, 64], [300, 100], [304, 134], [284, 160], [250, 172], [210, 170], [180, 178], [140, 176], [96, 164], [52, 146]];
const sagDeco = (): ReactNode => (
  <g>
    <ellipse cx={282} cy={198} rx={38} ry={24} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.2} />
    <path d={spline([[198, 150], [204, 196], [216, 238], [242, 240], [246, 196], [240, 150]], true)} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.2} />
    <path d={spline(CEREBRUM, true)} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.3} />
    <path d={spline([[62, 96], [90, 66], [150, 52], [220, 54], [266, 84]])} {...STROKE} strokeWidth={5} strokeOpacity={0.35} strokeLinecap="round" />
    <ellipse cx={180} cy={124} rx={32} ry={20} fill="color-mix(in srgb, var(--text-faint) 16%, transparent)" stroke="var(--text-faint)" strokeWidth={0.9} />
    <text x={20} y={20} fontSize={11} fill="var(--text-faint)">front</text>
    <text x={320} y={20} fontSize={11} fill="var(--text-faint)" textAnchor="end">back</text>
  </g>
);
function sag(b: Builder, h = 262): Diagram {
  return { w: W, h, mode: "plain", deco: sagDeco(), els: b.els, labels: b.labels };
}
const dot = (b: Builder, k: string | string[], x: number, y: number, o: { rx?: number; ry?: number; soma?: boolean } = {}) =>
  b.els.push({ id: `r${b.n++}`, keys: arr(k), kind: "region", side: "M", x, y, rx: o.rx ?? 7, ry: o.ry ?? 5, soma: o.soma ?? arr(k).some((q) => /^n\d$/.test(q)) });
const curve = (b: Builder, k: string | string[], pts: P[], end: EndKind = "arrow") => {
  const l = link(pts);
  b.els.push({ id: `c${b.n++}`, keys: arr(k), kind: "path", side: "M", d: l.d, end: l.end, endKind: end });
};

export function limbicFornix(): Diagram {
  const b = builder();
  curve(b, "fx", [[250, 152], [268, 130], [264, 96], [236, 72], [180, 68], [130, 78], [110, 102], [112, 128], [124, 148], [130, 158]]);
  dot(b, "n0", 250, 152, { rx: 9, ry: 5 });
  dot(b, "end", 130, 160);
  dot(b, "end", 104, 114, { rx: 5, ry: 5 });
  dot(b, "end", 92, 142, { rx: 6, ry: 4 });
  b.text("n0", "Hippocampus", 252, 132, "middle");
  b.text("end", "Mammillary", 140, 196, "middle");
  b.text("end", "bodies", 140, 208, "middle");
  b.text("end", "Septal nuclei", 60, 110, "middle");
  b.text("end", "Basal", 48, 174, "middle");
  b.text("end", "forebrain", 48, 186, "middle");
  b.text("fx", "Fornix", 190, 86, "middle");
  return sag(b);
}
export function limbicAmygdala(): Diagram {
  const b = builder();
  curve(b, "st", [[170, 166], [206, 150], [216, 112], [190, 92], [140, 90], [120, 104]]);
  curve(b, "st", [[170, 166], [158, 156], [148, 148]]);
  dot(b, "n0", 170, 166, { rx: 8, ry: 6 });
  dot(b, "end", 120, 104, { rx: 6, ry: 5 });
  dot(b, "end", 148, 146, { rx: 7, ry: 5 });
  dot(b, "end", 222, 202, { rx: 6, ry: 5 });
  b.text("n0", "Amygdala", 170, 196, "middle");
  b.text("end", "BNST", 98, 98, "middle");
  b.text("end", "Hypothalamus", 106, 178, "middle");
  b.text("end", "Brainstem", 270, 150, "middle");
  b.text("end", "autonomic nuclei", 270, 162, "middle");
  b.text("st", "Stria terminalis", 240, 100, "start");
  return sag(b);
}
export function limbicSeptal(): Diagram {
  const b = builder();
  curve(b, "sm", [[104, 114], [124, 104], [170, 99], [212, 99], [226, 104]]);
  dot(b, "n0", 104, 114, { rx: 6, ry: 6 });
  dot(b, "end", 228, 104, { rx: 6, ry: 5 });
  b.text("n0", "Septal nuclei", 62, 132, "middle");
  b.text("end", "Habenula", 272, 92, "middle");
  b.text("sm", "Stria medullaris", 166, 86, "middle");
  return sag(b);
}
export function reward(): Diagram {
  const b = builder();
  curve(b, "mfb", [[216, 206], [176, 190], [132, 172], [100, 150], [92, 142], [76, 124], [58, 100]]);
  dot(b, "n0", 216, 206, { rx: 8, ry: 5 });
  dot(b, "end", 92, 142, { rx: 7, ry: 5 });
  dot(b, "end", 54, 94, { rx: 9, ry: 7 });
  b.text("n0", "VTA", 258, 210, "start");
  b.text("end", "Nucleus", 70, 170, "middle");
  b.text("end", "accumbens", 70, 182, "middle");
  b.text("end", "Prefrontal", 44, 66, "middle");
  b.text("end", "cortex", 44, 78, "middle");
  b.text("mfb", "MFB", 150, 196, "middle");
  return sag(b);
}
export function olfactory(): Diagram {
  const b = builder();
  b.els.push({ id: "ic", keys: ["start"], kind: "icon", side: "M", x: 24, y: 196, icon: "nose" });
  curve(b, "startNerve", [[26, 184], [34, 168]]);
  dot(b, "n0", 34, 164, { rx: 6, ry: 5 });
  curve(b, "on", [[34, 164], [44, 152], [52, 146]]);
  dot(b, "n1", 54, 146, { rx: 8, ry: 6 });
  curve(b, "tr", [[54, 146], [92, 160], [130, 168], [166, 168]]);
  dot(b, "end", 134, 168, { rx: 8, ry: 5 });
  dot(b, "end", 168, 164, { rx: 8, ry: 6 });
  b.text("start", "Nose", 24, 226, "middle");
  b.text("n1", "Olfactory bulb", 70, 124, "middle");
  b.text("tr", "Olfactory tract", 104, 192, "middle");
  b.text("end", "Piriform", 134, 214, "middle");
  b.text("end", "cortex", 134, 226, "middle");
  b.text("end", "Amygdala", 200, 192, "start");
  return sag(b, 240);
}

/* ------------------------------------------------------------------ the visual pathway */
const mx = (pts: P[]): P[] => pts.map(([x, y]) => [W - x, y] as P);
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number): P[] => {
  const out: P[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = ((a0 + ((a1 - a0) * i) / 6) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
};

export function visual(): Diagram {
  const els: DEl[] = [];
  const labels: DLabel[] = [];
  let n = 0;
  const F = FIELD_COLORS;
  const seg = (keys: string[], side: Side, pts: P[], color: string, o: { endKind?: EndKind; width?: number } = {}) => {
    const l = link(pts);
    els.push({ id: `v${n++}`, keys, kind: "path", side, d: l.d, end: l.end, color, endKind: o.endKind ?? "none" });
  };
  const L = (keys: string[], text: string, x: number, y: number, anchor: "start" | "middle" | "end" = "middle") => labels.push({ keys, text, x, y, anchor, small: true });
  const col = (side: Side, upper?: boolean) => (side === "L" ? (upper ? F.leftUpper : F.leftLower) : upper ? F.rightUpper : F.rightLower);

  // fibres: the left and right VISUAL FIELD (left = solid blue, right = dashed orange). Eye: left x=100, right x=240.
  // optic nerves (each eye: nasal fibres carry that eye's temporal field; temporal fibres carry the nasal field)
  const nerve = ["~optic nerves"];
  seg(nerve, "R", [[88, 134], [92, 170], [150, 206]], col("R"));
  seg(nerve, "L", [[112, 134], [122, 172], [158, 206]], col("L"));
  seg(nerve, "R", [[228, 134], [218, 172], [182, 206]], col("R"));
  seg(nerve, "L", [[252, 134], [248, 170], [190, 206]], col("L"));
  // chiasm: nasal fibres cross, temporal fibres stay
  const crossK = ["~nasal fibres cross"];
  seg(crossK, "L", [[158, 206], [170, 216], [187, 226]], col("L"));
  seg(crossK, "R", [[182, 206], [170, 216], [153, 226]], col("R"));
  const stayK = ["~temporal fibres stay"];
  seg(stayK, "R", [[150, 206], [147, 226]], col("R"));
  seg(stayK, "L", [[190, 206], [193, 226]], col("L"));
  els.push({ id: "xv", keys: crossK, kind: "cross", side: "M", x: 170, y: 216 });
  // optic tracts
  const tract = ["~optic tract"];
  seg(tract, "R", [[147, 226], [135, 246], [129, 262]], col("R"), { endKind: "cup" });
  seg(tract, "R", [[153, 226], [141, 246], [135, 262]], col("R"), { endKind: "cup" });
  seg(tract, "L", [[193, 226], [205, 246], [211, 262]], col("L"), { endKind: "cup" });
  seg(tract, "L", [[187, 226], [199, 246], [205, 262]], col("L"), { endKind: "cup" });
  // radiations: the parietal route carries the lower field to the cuneus, Meyer's loop the upper field to the lingual gyrus
  const par = ["~parietal route"];
  const mey = ["~meyer"];
  const parP: P[] = [[132, 280], [127, 330], [116, 384]];
  const meyP: P[] = [[122, 274], [86, 266], [58, 300], [54, 360], [70, 410], [98, 424]];
  seg(par, "R", parP, col("R"), { endKind: "arrow" });
  seg(par, "L", mx(parP), col("L"), { endKind: "arrow" });
  seg(mey, "R", meyP, col("R", true), { endKind: "arrow" });
  seg(mey, "L", mx(meyP), col("L", true), { endKind: "arrow" });
  // regions
  const region = (keys: string[], x: number, y: number, rx: number, ry: number, soma = false) => els.push({ id: `g${n++}`, keys, kind: "region", side: "M", x, y, rx, ry, soma });
  const lgn = ["~lateral geniculate"];
  region(lgn, 132, 270, 13, 8, true);
  region(lgn, 208, 270, 13, 8, true);
  // the retina: two arcs per eye, in the colour of the field they receive (left eye: temporal half = right field)
  const ret = ["~retina"];
  // viewer-left half of either eye = the right field, viewer-right half = the left field
  const retina = (cx: number) => {
    seg(ret, "R", arcPts(cx, 112, 21, 180, 90), col("R"));
    seg(ret, "L", arcPts(cx, 112, 21, 90, 0), col("L"));
  };
  retina(100);
  retina(240);
  // V1: the calcarine fissure splits cuneus (upper bank, lower field) and lingual gyrus (lower bank, upper field)
  const v1 = ["~primary visual cortex"];
  region(v1, 110, 408, 29, 25);
  region(v1, 230, 408, 29, 25);
  for (const cx of [110, 230]) {
    const l = link([[cx - 28, 408], [cx + 28, 408]]);
    els.push({ id: `cal${cx}`, keys: v1, kind: "path", side: "M", d: l.d, color: "#1C1A17", endKind: "none", dash: true });
  }
  labels.push({ keys: v1, text: "Cuneus", x: 110, y: 397, anchor: "middle", small: true });
  labels.push({ keys: v1, text: "Lingual", x: 110, y: 424, anchor: "middle", small: true });
  labels.push({ keys: v1, text: "Calcarine", x: 170, y: 410, anchor: "middle", small: true });
  labels.push({ keys: v1, text: "V1", x: 170, y: 424, anchor: "middle", small: true });
  const badge = (keys: string[], x: number, y: number, text: string, order: number) => els.push({ id: `bd${n++}`, keys, kind: "badge", side: "M", x, y, badge: text, order });
  badge(ret, 60, 112, "1°", 1);
  badge(nerve, 70, 176, "2°", 2);
  badge(lgn, 150, 304, "3°", 3);
  L(ret, "Retina", 60, 134);
  L(nerve, "Optic nerve", 82, 196, "end");
  L(["~optic tract"], "Optic tract", 120, 246, "end");
  L(["~lateral geniculate"], "LGN", 170, 276);
  L(crossK, "Nasal fibres", 252, 202, "start");
  L(crossK, "cross", 252, 214, "start");
  L(stayK, "Temporal", 252, 232, "start");
  L(stayK, "fibres stay", 252, 244, "start");
  L(par, "Parietal", 170, 330);
  L(par, "route", 170, 342);
  L(mey, "Meyer's", 80, 322, "middle");
  L(mey, "loop", 80, 334, "middle");

  const deco = (
    <g>
      {([100, 240] as number[]).map((cx, i) => {
        // visual-field circle of each eye: left half = left field, right half = right field, upper lighter / lower darker
        const r = 26;
        const cy = 50;
        const q = (a0: number, a1: number, fill: string) => {
          const p0 = [cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180)];
          const p1 = [cx + r * Math.cos((a1 * Math.PI) / 180), cy + r * Math.sin((a1 * Math.PI) / 180)];
          return <path key={a0} d={`M${cx} ${cy}L${p0[0].toFixed(1)} ${p0[1].toFixed(1)}A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}Z`} fill={fill} stroke="var(--bg-2)" strokeWidth={0.8} />;
        };
        return (
          <g key={cx}>
            {q(-90, 0, F.rightUpper)}
            {q(0, 90, F.rightLower)}
            {q(90, 180, F.leftLower)}
            {q(180, 270, F.leftUpper)}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--text-faint)" strokeWidth={1.2} />
            <circle cx={cx} cy={cy} r={2.2} fill="var(--text)" />
            <text x={cx} y={cy + r + 14} fontSize={11} fill="var(--text-faint)" textAnchor="middle">
              {i === 0 ? "Left eye field" : "Right eye field"}
            </text>
          </g>
        );
      })}
      {([100, 240] as number[]).map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={112} r={22} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.3} />
          <path d={`M${cx - 8} ${96} Q${cx} ${88} ${cx + 8} ${96}`} fill="none" stroke="var(--text-faint)" strokeWidth={1.4} />
        </g>
      ))}
      <path d={sym([[0, 0], [14, -3], [20, 4], [14, 10], [0, 12]])} transform="translate(170 210)" fill="color-mix(in srgb, var(--text-faint) 18%, transparent)" stroke="var(--text-faint)" strokeWidth={0.9} />
    </g>
  );
  return { w: W, h: 448, mode: "field", midline: { x: 170, y0: 30, y1: 440 }, deco, els, labels, hasCross: true, legendField: true };
}

export const SCENES: Record<string, () => Diagram> = {
  "basal-ganglia": basalGanglia,
  cerebellar: cerebellarCircuit,
  "limbic-fornix": limbicFornix,
  "limbic-amygdala": limbicAmygdala,
  "limbic-septal": limbicSeptal,
  reward,
  olfactory,
  visual,
};
