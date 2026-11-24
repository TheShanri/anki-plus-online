import ANCH from "@/data/part-anchors.json";
import { hostParts, type Side, type V3Data } from "./types";

/* Which section inset a beat shows: the brainstem plate level (or a cord segment) where the signal is, the structures lit there,
 * and the side of the signal dot. */

const CORD: Record<string, string> = {
  "a:gracile-fasciculus": "fasciculus-gracilis",
  "a:cuneate-fasciculus": "fasciculus-cuneatus",
  "a:lateral-corticospinal-tract": "lateral-corticospinal-tract",
  "a:lateral-spinothalamic-tract": "anterolateral-spinothalamic-tract",
  "a:anterior-spinothalamic-tract": "anterolateral-spinothalamic-tract",
  "a:posterior-spinocerebellar-tract": "dorsal-spinocerebellar-tract",
  "a:anterior-corticospinal-tract": "anterior-corticospinal-tract",
  "a:rubrospinal-tract": "rubrospinal-tract",
  "a:tectospinal-tract": "tectospinal-tract",
  "a:lateral-vestibulospinal-tract": "vestibulospinal-tract",
  "a:medial-vestibulospinal-tract": "vestibulospinal-tract",
  "a:lateral-reticulospinal-tract": "reticulospinal-tract",
  "a:medial-reticulospinal-tract": "reticulospinal-tract",
  "a:posterior-horn-of-spinal-cord": "dorsal-horn",
  "a:anterior-horn-of-spinal-cord": "ventral-horn",
  "a:intermediolateral-nucleus": "lateral-horn",
};
const BS: Record<string, string> = {
  "a:mni-medial-lemniscus": "medial-lemniscus",
  "a:pyramid-of-medulla-oblongata": "pyramids",
  "a:base-of-peduncle": "cerebral-peduncles",
  "a:mni-longitudinal-fibers-of-the-pons": "longitudinal-fibers-of-the-pons",
  "a:nucleus-of-abducens-nerve": "abducens-nucleus",
  "a:motor-nucleus-of-facial-nerve": "facial-nucleus",
  "a:nucleus-ambiguus": "nucleus-ambiguus",
  "a:posterior-nucleus-of-vagus-nerve": "dorsal-motor-nucleus-of-the-vagus",
  "a:nucleus-of-hypoglossal-nerve": "hypoglossal-nucleus",
  "a:vestibular-nuclei": "vestibulocochlear-complex",
  "a:mni-medial-longitudinal-fasciculus": "medial-longitudinal-fasciculus",
  "a:red-nucleus": "red-nucleus",
  "a:superior-colliculus": "superior-colliculus",
  "a:inferior-colliculus": "inferior-colliculus",
  "a:nucleus-of-oculomotor-nerve": "oculomotor-nucleus",
  "a:accessory-nucleus-of-oculomotor-nerve": "edinger-westphal-nucleus",
  "a:superior-cerebellar-peduncle": "superior-cerebellar-peduncle",
  "a:mni-middle-cerebellar-peduncle": "middle-cerebellar-peduncle",
  "a:mni-inferior-cerebellar-peduncle": "inferior-cerebellar-peduncle",
  "a:olive": "inferior-olivary-nucleus",
  "a:mni-substantia-nigra": "substantia-nigra",
  "a:mni-periaqueductal-gray": "periaqueductal-gray",
  "a:anterior-cochlear-nucleus": "vestibulocochlear-complex",
  "a:posterior-cochlear-nucleus": "vestibulocochlear-complex",
};
const PROXY_BS: Record<string, string> = {
  gracile: "gracile-nucleus",
  cuneate: "cuneate-nucleus",
  "spinal-v": "spinal-trigeminal-nucleus",
  "principal-v": "principal-sensory-nucleus-of-trigeminal",
  "motor-v": "motor-trigeminal-nucleus",
  solitary: "solitary-nucleus",
  pontine: "pontine-nuclei",
};
const SEGS = Object.entries((ANCH as unknown as { spine: Record<string, number[]> }).spine)
  .filter(([k]) => /^cord_[CTLS]\d+$/.test(k))
  .map(([k, v]) => [k.slice(5), v[1]] as const);

function levelOf(y: number): { kind: "cord" | "brainstem"; level: string } | null {
  if (y < 1.5395) {
    let best = SEGS[0];
    for (const s of SEGS) if (Math.abs(s[1] - y) < Math.abs(best[1] - y)) best = s;
    return { kind: "cord", level: best[0] };
  }
  // plate slugs keep their old names; the course's level names are in brainstem-levels.json
  if (y < 1.5465) return { kind: "brainstem", level: "medulla-caudal" }; // brainstem / spinal cord transition (motor decussation)
  if (y < 1.558) return { kind: "brainstem", level: "medulla-mid" }; // caudal medulla (gracile and cuneate nuclei, internal arcuate fibres)
  // above the caudal medulla the brainstem is the 3D atlas's (re-hosted, tools/pathways/v3/rehost.py): the bounds are the
  // midpoints between the levels' landmarks there (olive, facial nucleus, motor trigeminal nucleus, inferior and superior
  // colliculi, carried into this frame)
  if (y < 1.5761) return { kind: "brainstem", level: "medulla-rostral" }; // rostral medulla (olive)
  if (y < 1.5868) return { kind: "brainstem", level: "pons-caudal" }; // caudal pons (facial and abducens)
  if (y < 1.6009) return { kind: "brainstem", level: "pons-mid" }; // rostral pons (trigeminal level)
  if (y < 1.6114) return { kind: "brainstem", level: "midbrain-ic" }; // caudal midbrain (inferior colliculus)
  if (y < 1.618) return { kind: "brainstem", level: "midbrain-sc" }; // rostral midbrain (superior colliculus)
  return null;
}

export interface InsetSpec {
  kind: "cord" | "brainstem";
  level: string;
  structures: string[];
  side: Side | "both";
}

export function insetFor(d: V3Data, bi: number, side: Side, sideAlpha: { L: number; R: number }): InsetSpec | null {
  const b = d.beats[bi]?.[side];
  if (!b) return null;
  // the representative point: the crossing, a cell body / synapse, else the middle of the fibre inside the brainstem or cord
  let p: number[] | null = b.cross?.p ?? b.soma?.p ?? b.syn?.p ?? null;
  let hostAt: string | null = b.soma?.host ?? b.syn?.host ?? null;
  const f = b.f[0];
  if (!p && f) {
    const pts: number[][] = [];
    for (let i = 0; i < f.pts.length; i += 3) pts.push([f.pts[i], f.pts[i + 1], f.pts[i + 2]]);
    const inside = pts.map((q, i) => [q, i] as const).filter(([q]) => q[1] < 1.618 && Math.abs(q[0]) < 0.03 && q[1] > 0.95);
    if (!inside.length) return null;
    const [q, i] = inside[Math.floor(inside.length / 2)];
    p = q;
    const seg = [...f.seg].reverse().find(([s]) => s <= i);
    hostAt = seg ? seg[1] : null;
  }
  if (!p) return null;
  const lv = levelOf(p[1]);
  if (!lv) return null;
  const structures: string[] = [];
  const add = (s?: string) => s && !structures.includes(s) && structures.push(s);
  const hosts = hostAt ? hostParts(hostAt) : [];
  if (b.cross && lv.kind === "brainstem") add(b.cross.name.toLowerCase().includes("arcuate") ? "internal-arcuate-fibers" : b.cross.name.toLowerCase().includes("pyramid") ? "motor-decussation" : undefined);
  if (b.cross && lv.kind === "cord") add("anterior-white-commissure");
  for (const h of hosts) {
    const base = h.split("@")[0];
    if (lv.kind === "cord") add(CORD[base] ?? (base.startsWith("p:clarke") ? "clarke-nucleus" : /Posterior root/.test(base) ? "dorsal-root" : /Anterior root/.test(base) ? "ventral-root" : undefined));
    else add(BS[base] ?? (base.startsWith("p:") ? PROXY_BS[base.slice(2).replace(/-[LR]$/, "")] : undefined));
  }
  if (!structures.length) return null;
  const physical: Side = p[0] >= 0 ? "L" : "R";
  const both = sideAlpha.L > 0.5 && sideAlpha.R > 0.5;
  return { ...lv, structures, side: b.cross ? "both" : both ? "both" : physical };
}
