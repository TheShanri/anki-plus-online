import type { ReactNode } from "react";
import { FIELD_COLORS, REGION_COLORS } from "@/lib/atlas/pathwayPalette";
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
  line: (k: string | string[], pts: P[], end: EndKind, o?: { dash?: boolean; r?: number; order?: number }) => void;
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
      b.els.push({ id: `l${b.n++}`, keys: arr(k), kind: "path", side: "M", d: l.d, end: l.end, endKind: end, dash: o.dash, order: o.order });
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
  b.line("indirect", [[58, 116], [58, 150]], "bar", { order: 2 });
  b.line("indirect", [[58, 182], [58, 200], [174, 200], [174, 216]], "bar", { order: 3 });
  b.line("indirect", [[216, 232], [226, 232], [226, 176], [216, 176]], "arrow", { order: 3 });
  b.line("pt", [[216, 156], [290, 156], [290, 116]], "bar", { order: 3 });
  b.line("pt", [[290, 84], [290, 34], [216, 34]], "arrow", { order: 4 });
  b.line("snc", [[16, 232], [7, 232], [7, 100], [16, 100]], "arrow", { dash: true });
  b.text("direct", "Direct (go)", 121, 132);
  b.text("indirect", "Indirect (no-go)", 66, 194);
  return { w: W, h: 262, mode: "plain", deco: null, els: b.els, labels: b.labels, note: "→ excites  ⊣ inhibits  ┄ modulates" };
}

export function cerebellarCircuit(): Diagram {
  const b = builder();
  // the deep nuclei project through the SCP, cross, and end in BOTH the contralateral red nucleus and VA/VL thalamus (two
  // targets of one tract; the red nucleus is not a relay on the way to the thalamus, owner audit 2026-11-22)
  // ... and the thalamus projects on to the motor cortex (the loop's last step, added 2026-11-22)
  b.box("end", 58, 34, ["Motor", "cortex"]);
  b.box(["rn", "n3"], 58, 100, ["VA/VL", "thalamus"]);
  b.box(["rn", "n3"], 290, 34, ["Red", "nucleus"]);
  b.box("n2", 174, 100, ["Deep", "nuclei"]);
  b.box("n1", 174, 166, ["Cerebellar", "cortex"]);
  b.box(["n0", "mf"], 58, 232, ["Pontine", "nuclei"]);
  b.box(["n0", "cf"], 290, 232, ["Inferior", "olive"]);
  b.line("scp", [[216, 104], [248, 104]], "none");
  b.line("dec", [[248, 104], [290, 104], [290, 72]], "none");
  b.cross("dec", 270, 104);
  b.line("rn", [[290, 72], [290, 50]], "arrow");
  b.line("rn", [[290, 72], [124, 72], [124, 100], [100, 100]], "arrow");
  b.line("tc", [[58, 84], [58, 50]], "arrow");
  b.line("cx", [[174, 150], [174, 116]], "bar");
  b.line("mf", [[58, 216], [58, 198], [150, 198], [150, 182]], "arrow");
  b.line("cf", [[290, 216], [290, 198], [198, 198], [198, 182]], "arrow");
  b.text("mf", "Mossy", 66, 194);
  b.text("cf", "Climbing", 282, 194, "end");
  b.text("scp", "SCP", 222, 94, "start");
  return { w: W, h: 262, mode: "plain", deco: null, els: b.els, labels: b.labels, note: "→ excites  ⊣ inhibits (Purkinje)", hasCross: true };
}

/* The solitary nucleus as a hub (2026-11-22, owner: its outputs should reach the glands and the heart): inputs down the left
 * column to the nucleus, then one row per output: the brainstem / cord nucleus, the nerve, the effector. Rows follow the beat
 * order (inferior salivatory, ambiguus, dorsal motor X, superior salivatory, lateral horn). */
export function solitaryHub(): Diagram {
  const b = builder();
  const ROWS = [34, 92, 150, 208, 266];
  const rows: { k: string; nuc: string; nucText: string[]; nerveKey: string; nerve: string; endKey: string; endText: string[] }[] = [
    { k: "ia", nuc: "~inferior salivatory", nucText: ["Inferior", "salivatory"], nerveKey: "~otic ganglion", nerve: "IX", endKey: "~parotid gland", endText: ["Parotid", "gland"] },
    { k: "na", nuc: "~nucleus ambiguus", nucText: ["Nucleus", "ambiguus"], nerveKey: "~to the pharynx", nerve: "X", endKey: "~pharynx and larynx", endText: ["Pharynx,", "larynx"] },
    { k: "dm", nuc: "~dorsal motor", nucText: ["Dorsal motor", "nucleus X"], nerveKey: "~cardiac ganglia", nerve: "X", endKey: "~heart (slows)", endText: ["Heart", "(slows)"] },
    { k: "sa", nuc: "~superior salivatory", nucText: ["Superior", "salivatory"], nerveKey: "~submandibular ganglion", nerve: "VII", endKey: "~submandibular and", endText: ["Submandibular,", "sublingual"] },
    { k: "lh", nuc: "~lateral horn", nucText: ["Lateral horn", "T1–L2"], nerveKey: "~sympathetic chain", nerve: "chain", endKey: "~heart and blood", endText: ["Heart (speeds),", "vessels"] },
  ];
  b.box("start", 50, ROWS[0], ["Tongue,", "viscera"]);
  b.line("startNerve", [[50, ROWS[0] + 16], [50, ROWS[1] - 16]], "arrow");
  b.box("n0", 50, ROWS[1], ["Ganglion", "VII, IX, X"]);
  b.line("cn", [[50, ROWS[1] + 16], [50, ROWS[2] - 16]], "arrow");
  b.box("n1", 50, ROWS[2], ["Solitary", "nucleus"]);
  for (const r of rows) {
    const y = ROWS[rows.indexOf(r)];
    b.line(r.k, y === ROWS[2] ? [[92, y], [124, y]] : [[92, ROWS[2]], [108, ROWS[2]], [108, y], [124, y]], "arrow");
    b.box(r.nuc, 166, y, r.nucText, { w: 84 });
    b.line(r.nerveKey, [[208, y], [240, y]], "arrow");
    b.text(r.nerveKey, r.nerve, 224, y - 7, "middle");
    b.box(r.endKey, 290, y, r.endText, { w: 96 });
  }
  return { w: W, h: 296, mode: "plain", deco: null, els: b.els, labels: b.labels, note: "Parasympathetic: VII, IX, X · sympathetic: the lateral horn", hasCross: false };
}

/* ------------------------------------------------------------------ the mid-sagittal brain */
/* One medial-view brain (front on the left): cerebrum with the corpus callosum, thalamus, hypothalamus and a brainstem stub.
 * Every label sits OUTSIDE the silhouette (left margin, below, or right) with a dotted leader to its node. */
// (redrawn 2026-11-22, owner: "what the hell is this schematic?": it was a blob with a tube hanging from its middle and
// two unnamed ovals) A medial view as in the course's midsagittal figures: the cerebral hemisphere with its frontal and
// occipital poles and the orbital and tentorial undersides, the corpus callosum, cingulate, central, parieto-occipital and
// calcarine sulci, the thalamus and hypothalamus, and the brainstem (midbrain, the bulging pons, medulla) with the
// cerebellum behind it. The structures are named in small faint type so the student can place the pathway.
const CEREBRUM: P[] = [
  [110, 124], [114, 96], [132, 68], [164, 46], [206, 34], [248, 36], [284, 52], [306, 76], [316, 106], [314, 136], [302, 156],
  [280, 164], [256, 166], [238, 168], [214, 174], [196, 180], [176, 182], [156, 176], [138, 166], [122, 150],
];
const BRAINSTEM: P[] = [[210, 168], [204, 184], [198, 200], [200, 214], [210, 226], [216, 244], [220, 262], [236, 262], [238, 244], [240, 226], [244, 206], [244, 186], [242, 170]];
const CEREBELLUM: P[] = [[246, 176], [270, 168], [296, 172], [312, 188], [310, 212], [290, 226], [262, 228], [246, 216], [244, 196]];
const tiny = (x: number, y: number, t: string, anchor: "start" | "middle" | "end" = "middle") => (
  <text x={x} y={y} fontSize={7.5} fill="var(--text-faint)" fillOpacity={0.85} textAnchor={anchor} fontStyle="italic">
    {t}
  </text>
);
const sagDeco = (): ReactNode => (
  <g>
    {/* cerebellum behind the brainstem, its folia in a fan (the arbor vitae) */}
    <path d={spline(CEREBELLUM, true)} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.1} />
    {[[[252, 198], [272, 184], [300, 182]], [[252, 202], [276, 196], [306, 198]], [[252, 206], [274, 210], [298, 218]]].map((pts, i) => (
      <path key={i} d={spline(pts as P[])} {...STROKE} strokeWidth={0.7} strokeOpacity={0.45} />
    ))}
    {/* brainstem: midbrain, the pons bulging forward, the medulla tapering into the cord */}
    <path d={spline(BRAINSTEM, true)} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.2} />
    <path d={spline([[201, 196], [222, 192], [243, 192]])} {...STROKE} strokeWidth={0.7} strokeOpacity={0.4} />
    <path d={spline([[204, 220], [224, 218], [241, 220]])} {...STROKE} strokeWidth={0.7} strokeOpacity={0.4} />
    <path d={spline(CEREBRUM, true)} fill="var(--bg-3)" stroke="var(--text-faint)" strokeWidth={1.4} />
    {/* sulci: cingulate (above the corpus callosum), central (from the top), parieto-occipital and calcarine (at the back) */}
    <path d={spline([[126, 104], [150, 76], [196, 60], [246, 62], [276, 78]])} {...STROKE} strokeWidth={0.9} strokeOpacity={0.45} />
    <path d={spline([[226, 36], [222, 48], [228, 60]])} {...STROKE} strokeWidth={0.9} strokeOpacity={0.45} />
    <path d={spline([[282, 54], [272, 86], [270, 116]])} {...STROKE} strokeWidth={0.9} strokeOpacity={0.5} />
    <path d={spline([[314, 128], [292, 128], [270, 120]])} {...STROKE} strokeWidth={0.9} strokeOpacity={0.5} />
    {/* corpus callosum: genu at the front, body, splenium at the back */}
    <path
      d={spline([[128, 106], [140, 84], [172, 72], [214, 70], [252, 82], [270, 104], [260, 108], [246, 94], [214, 86], [178, 88], [150, 98], [138, 110]], true)}
      fill="color-mix(in srgb, var(--text-faint) 26%, var(--bg-2))"
      stroke="var(--text-faint)"
      strokeWidth={0.9}
    />
    {/* thalamus and hypothalamus (the walls of the third ventricle) */}
    <ellipse cx={198} cy={122} rx={26} ry={16} fill="color-mix(in srgb, var(--text-faint) 16%, transparent)" stroke="var(--text-faint)" strokeWidth={0.9} />
    <path d={spline([[170, 146], [186, 142], [204, 146], [208, 160], [196, 170], [178, 166]], true)} fill="color-mix(in srgb, var(--text-faint) 12%, transparent)" stroke="var(--text-faint)" strokeWidth={0.8} />
    {tiny(198, 125, "thalamus")}
    {tiny(188, 159, "hypothal.")}
    {tiny(200, 80, "corpus callosum")}
    {tiny(222, 182, "midbrain")}
    {tiny(222, 208, "pons")}
    {tiny(228, 240, "medulla")}
    {tiny(284, 204, "cerebellum")}
    <text x={120} y={20} fontSize={11} fill="var(--text-faint)" textAnchor="middle">front</text>
    <text x={308} y={20} fontSize={11} fill="var(--text-faint)" textAnchor="middle">back</text>
  </g>
);
function sag(b: Builder, h = 270): Diagram {
  return { w: W, h, mode: "plain", deco: sagDeco(), els: b.els, labels: b.labels };
}
const dot = (b: Builder, k: string | string[], x: number, y: number, o: { rx?: number; ry?: number; soma?: boolean } = {}) =>
  b.els.push({ id: `r${b.n++}`, keys: arr(k), kind: "region", side: "M", x, y, rx: o.rx ?? 7, ry: o.ry ?? 5, soma: o.soma ?? arr(k).some((q) => /^n\d$/.test(q)) });
const curve = (b: Builder, k: string | string[], pts: P[], end: EndKind = "arrow") => {
  const l = link(pts);
  b.els.push({ id: `c${b.n++}`, keys: arr(k), kind: "path", side: "M", d: l.d, end: l.end, endKind: end });
};
/** A label outside the brain with a leader to its node: lines are stacked at (x, y). */
const tag = (b: Builder, k: string | string[], lines: string[], x: number, y: number, anchor: "start" | "middle" | "end", to: [number, number]) =>
  lines.forEach((t, i) => b.labels.push({ keys: arr(k), text: t, x, y: y + i * 13, anchor, small: true, to: i === 0 ? to : undefined }));

export function limbicFornix(): Diagram {
  const b = builder();
  curve(b, "fx", [[250, 160], [264, 140], [260, 114], [238, 98], [204, 94], [172, 98], [152, 110], [150, 128], [160, 146], [174, 158]]);
  dot(b, "n0", 250, 160, { rx: 9, ry: 5 });
  dot(b, "end", 176, 160);
  dot(b, "end", 148, 116, { rx: 5, ry: 5 });
  dot(b, "end", 134, 144, { rx: 6, ry: 4 });
  tag(b, "n0", ["Hippocampus"], 296, 250, "middle", [254, 166]);
  tag(b, "end", ["Mammillary", "bodies"], 150, 210, "middle", [176, 164]);
  tag(b, "end", ["Septal nuclei"], 100, 112, "end", [143, 116]);
  tag(b, "end", ["Basal", "forebrain"], 100, 150, "end", [128, 146]);
  tag(b, "fx", ["Fornix"], 204, 28, "middle", [204, 91]);
  return sag(b);
}
export function limbicAmygdala(): Diagram {
  const b = builder();
  // the amygdala sits in the front of the temporal lobe, below and in front of the thalamus (it was drawn at the back);
  // the stria terminalis arches back around the thalamus and forward over it to the BNST
  curve(b, "st", [[186, 177], [214, 174], [244, 166], [266, 148], [274, 116], [250, 96], [200, 94], [160, 106], [146, 120]]);
  curve(b, "st", [[186, 177], [188, 168], [188, 161]]);
  dot(b, "n0", 186, 177, { rx: 8, ry: 5 });
  dot(b, "end", 146, 120, { rx: 6, ry: 5 });
  dot(b, "end", 188, 156, { rx: 7, ry: 5 });
  dot(b, "end", 230, 236, { rx: 6, ry: 5 });
  tag(b, "n0", ["Amygdala"], 140, 214, "middle", [182, 181]);
  tag(b, "end", ["BNST"], 100, 112, "end", [140, 118]);
  tag(b, "end", ["Hypothalamus"], 100, 168, "end", [182, 158]);
  tag(b, "end", ["Brainstem", "autonomic", "nuclei"], 292, 244, "middle", [236, 238]);
  tag(b, "st", ["Stria terminalis"], 204, 28, "middle", [236, 92]);
  return sag(b);
}
export function limbicSeptal(): Diagram {
  const b = builder();
  // along the top of the thalamus to the habenula at its back end (it was drawn inside the corpus callosum)
  curve(b, "sm", [[146, 116], [166, 104], [196, 104], [216, 106], [226, 112]]);
  dot(b, "n0", 146, 116, { rx: 6, ry: 6 });
  dot(b, "end", 228, 113, { rx: 5, ry: 4 });
  tag(b, "n0", ["Septal nuclei"], 100, 124, "end", [140, 118]);
  tag(b, "end", ["Habenula"], 300, 250, "middle", [232, 116]);
  tag(b, "sm", ["Stria medullaris"], 204, 28, "middle", [204, 94]);
  return sag(b);
}
export function reward(): Diagram {
  const b = builder();
  // the VTA in the ventral midbrain; the medial forebrain bundle forward through the lateral hypothalamus
  curve(b, "mfb", [[214, 182], [198, 170], [178, 160], [156, 152], [138, 144], [128, 130], [120, 112]]);
  dot(b, "n0", 214, 182, { rx: 7, ry: 5 });
  dot(b, "end", 136, 144, { rx: 7, ry: 5 });
  dot(b, "end", 118, 108, { rx: 9, ry: 7 });
  tag(b, "n0", ["VTA"], 160, 226, "middle", [210, 186]);
  tag(b, "end", ["Nucleus", "accumbens"], 100, 176, "end", [132, 148]);
  tag(b, "end", ["Prefrontal", "cortex"], 100, 92, "end", [112, 104]);
  tag(b, "mfb", ["MFB"], 116, 214, "middle", [168, 157]);
  return sag(b);
}
export function olfactory(): Diagram {
  const b = builder();
  b.els.push({ id: "ic", keys: ["start"], kind: "icon", side: "M", x: 30, y: 206, icon: "nose" });
  curve(b, "startNerve", [[32, 194], [44, 184]]);
  dot(b, "n0", 46, 182, { rx: 6, ry: 5 });
  curve(b, "on", [[46, 182], [84, 178], [118, 170]]);
  dot(b, "n1", 124, 166, { rx: 8, ry: 6 });
  curve(b, "tr", [[124, 166], [146, 174], [172, 178], [204, 176]]);
  dot(b, "end", 170, 178, { rx: 8, ry: 5 });
  dot(b, "end", 206, 172, { rx: 8, ry: 6 });
  tag(b, "start", ["Nose"], 30, 238, "middle", [30, 220]);
  tag(b, "n1", ["Olfactory bulb"], 118, 120, "end", [124, 160]);
  tag(b, "tr", ["Olfactory tract"], 120, 214, "middle", [140, 173]);
  tag(b, "end", ["Olfactory", "tubercle"], 168, 244, "middle", [170, 184]);
  tag(b, "end", ["Prepiriform", "cortex"], 262, 204, "start", [210, 176]);
  return sag(b, 262);
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
    els.push({ id: `v${n++}`, keys, kind: "path", side, d: l.d, end: l.end, color, endKind: o.endKind ?? "none", width: o.width });
  };
  const L = (keys: string[], text: string, x: number, y: number, anchor: "start" | "middle" | "end" = "middle", to?: [number, number], ink = false) =>
    labels.push({ keys, text, x, y, anchor, small: true, to, ink });
  const col = (side: Side, upper?: boolean) => (side === "L" ? (upper ? F.leftUpper : F.leftLower) : upper ? F.rightUpper : F.rightLower);

  // The two VISUAL FIELDS (left = solid blue, right = dashed orange). Left eye x=100, right eye x=240, both at y=112.
  // Optic nerves: each eye sends two bundles. Nasal retina (toward the nose) sees the temporal field of its own side
  // and crosses; temporal retina sees the nasal field and stays.
  const nerve = ["~optic nerves"];
  seg(nerve, "R", [[88, 134], [92, 170], [150, 206]], col("R"));
  seg(nerve, "L", [[112, 134], [122, 172], [158, 206]], col("L"));
  seg(nerve, "R", [[228, 134], [218, 172], [182, 206]], col("R"));
  seg(nerve, "L", [[252, 134], [248, 170], [190, 206]], col("L"));
  const crossK = ["~nasal fibres cross"];
  seg(crossK, "L", [[158, 206], [170, 216], [187, 226]], col("L"));
  seg(crossK, "R", [[182, 206], [170, 216], [153, 226]], col("R"));
  const stayK = ["~temporal fibres stay"];
  seg(stayK, "R", [[150, 206], [147, 226]], col("R"));
  seg(stayK, "L", [[190, 206], [193, 226]], col("L"));
  els.push({ id: "xv", keys: crossK, kind: "cross", side: "M", x: 170, y: 216 });
  const tract = ["~optic tract"];
  seg(tract, "R", [[147, 226], [135, 246], [129, 262]], col("R"), { endKind: "cup" });
  seg(tract, "R", [[153, 226], [141, 246], [135, 262]], col("R"), { endKind: "cup" });
  seg(tract, "L", [[193, 226], [205, 246], [211, 262]], col("L"), { endKind: "cup" });
  seg(tract, "L", [[187, 226], [199, 246], [205, 262]], col("L"), { endKind: "cup" });
  // radiations: parietal route = lower field -> cuneus (above the calcarine fissure); Meyer's loop = upper field -> lingual gyrus (below it)
  const par = ["~parietal route"];
  const mey = ["~meyer"];
  const parP: P[] = [[132, 280], [122, 335], [100, 378]];
  const meyP: P[] = [[122, 274], [86, 266], [54, 300], [48, 360], [56, 418], [68, 438]];
  seg(par, "R", parP, col("R"), { endKind: "arrow" });
  seg(par, "L", mx(parP), col("L"), { endKind: "arrow" });
  seg(mey, "R", meyP, col("R", true), { endKind: "arrow" });
  seg(mey, "L", mx(meyP), col("L", true), { endKind: "arrow" });
  const region = (keys: string[], x: number, y: number, rx: number, ry: number, soma = false) => els.push({ id: `g${n++}`, keys, kind: "region", side: "M", x, y, rx, ry, soma });
  const lgn = ["~lateral geniculate"];
  region(lgn, 132, 270, 13, 8, true);
  region(lgn, 208, 270, 13, 8, true);
  // retina: the half toward the nose (nasal) and the half toward the temple (temporal) in the colour of the field each one sees
  const ret = ["~retina"];
  for (const cx of [100, 240]) {
    seg(ret, "R", arcPts(cx, 112, 22, 180, 90), col("R"), { width: 6 });
    seg(ret, "L", arcPts(cx, 112, 22, 90, 0), col("L"), { width: 6 });
  }
  // V1: calcarine fissure (dark line) with the cuneus above it (lower field) and the lingual gyrus below it (upper field)
  const v1 = ["~primary visual cortex"];
  for (const cx of [96, 244]) {
    region(v1, cx, 394, 30, 13);
    region(v1, cx, 438, 30, 13);
    const l = link([[cx - 34, 416], [cx + 34, 416]]);
    els.push({ id: `cal${cx}`, keys: v1, kind: "path", side: "M", d: l.d, color: REGION_COLORS.outline, endKind: "none", dash: true });
  }
  const badge = (keys: string[], x: number, y: number, text: string, order: number) => els.push({ id: `bd${n++}`, keys, kind: "badge", side: "M", x, y, badge: text, order });
  badge(ret, 18, 100, "1°", 1);
  badge(nerve, 66, 170, "2°", 2);
  badge(lgn, 160, 296, "3°", 3);

  L(ret, "Retina", 32, 104, "start");
  L(ret, "Temporal", 68, 152, "end", [82, 126]);
  L(ret, "Nasal", 122, 150, "start", [114, 128]);
  L(nerve, "Optic nerve", 8, 200, "start", [100, 186]);
  L(crossK, "Nasal fibres", 232, 234, "start", [182, 222]);
  L(crossK, "cross", 232, 247, "start");
  L(stayK, "Temporal", 272, 184, "start", [250, 166]);
  L(stayK, "fibres stay", 272, 197, "start");
  L(["~optic tract"], "Optic tract", 112, 244, "end", [133, 244]);
  L(lgn, "LGN", 170, 276);
  L(par, "Parietal", 170, 320);
  L(par, "route", 170, 333);
  L(mey, "Meyer's", 84, 330, "middle");
  L(mey, "loop", 84, 343, "middle");
  // V1 labels sit in the gap between the two occipital lobes, outside the shapes, each with a leader to its own band
  L(v1, "Cuneus", 170, 392, "middle", [128, 394]);
  L(v1, "lower field", 170, 407, "middle");
  L(v1, "Calcarine", 170, 422, "middle", [128, 416]);
  L(v1, "Lingual", 170, 437, "middle", [128, 438]);
  L(v1, "upper field", 170, 452, "middle");
  L(v1, "", 170, 392, "middle", [212, 394]);
  L(v1, "", 170, 422, "middle", [212, 416]);
  L(v1, "", 170, 437, "middle", [212, 438]);
  L(v1, "V1", 170, 482, "middle");

  const deco = (
    <g>
      {([100, 240] as number[]).map((cx, i) => {
        // visual-field circle of each eye: left half = left field, right half = right field, upper lighter / lower darker
        const r = 26;
        const cy = 56;
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
            <text x={cx} y={cy - r - 8} fontSize={12} fill="var(--text-dim)" textAnchor="middle">
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
  return { w: W, h: 494, mode: "field", midline: { x: 170, y0: 30, y1: 488 }, deco, els, labels, hasCross: true, legendField: true };
}

export const SCENES: Record<string, () => Diagram> = {
  "basal-ganglia": basalGanglia,
  cerebellar: cerebellarCircuit,
  solitary: solitaryHub,
  "limbic-fornix": limbicFornix,
  "limbic-amygdala": limbicAmygdala,
  "limbic-septal": limbicSeptal,
  reward,
  olfactory,
  visual,
};
