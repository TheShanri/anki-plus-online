import type { Beat, InfoSpec } from "../buildPathwayScene";

/* The words of each beat: a title of five words or fewer, one sentence at the depth of the course slides (beyond-slide detail
 * in ‹ › goes behind the Supplementary gate), and where the signal is (for the side chip). Keyed by pathway and beat index;
 * beats without an entry fall back to the beat model's caption. */

export interface BeatCopy {
  title: string;
  sentence: string;
  where?: string;
}
type Row = [title: string, sentence: string, where?: string];
type Limb = "hand" | "foot" | "leg";
export const NEXT_PREFIX = "Next:";

const hand = (l: Limb) => l === "hand";

const COPY: Record<string, (l: Limb) => Row[]> = {
  dcml: (l) => [
    ["Touch on the skin", `Receptors in the ${hand(l) ? "skin of the little finger" : "skin of the big toe"} and in the muscles pick up fine touch, vibration and joint position.`, hand(l) ? "hand" : "foot"],
    [hand(l) ? "Up the ulnar nerve" : "Up the sciatic nerve", hand(l) ? "The 1st-order axon runs in the ulnar nerve, the inferior trunk and the C8 root to its cell body." : "The 1st-order axon runs in the medial plantar, tibial and sciatic nerves to the L5 ganglion.", hand(l) ? "ulnar nerve" : "sciatic nerve"],
    [`Dorsal root ganglion (${hand(l) ? "C8" : "L5"})`, "The 1st-order cell body (pseudounipolar) sits in the dorsal root ganglion, outside the cord.", "dorsal root ganglion"],
    ["Up the dorsal column", hand(l) ? "The axon enters by the dorsal root and climbs the same-side fasciculus cuneatus (arm fibres, lateral) without a synapse." : "The axon enters by the dorsal root and climbs the same-side fasciculus gracilis (leg fibres, medial) without a synapse.", hand(l) ? "fasciculus cuneatus" : "fasciculus gracilis"],
    ["Into the caudal medulla", `It ends in the same-side ${hand(l) ? "cuneate" : "gracile"} nucleus of the caudal medulla: the first synapse.`, "caudal medulla"],
    [`${hand(l) ? "Cuneate" : "Gracile"} nucleus`, `The 2nd-order cell body sits in the ${hand(l) ? "cuneate" : "gracile"} nucleus, on the same side as the stimulus.`, `${hand(l) ? "cuneate" : "gracile"} nucleus`],
    ["Internal arcuate fibres cross", "The 2nd-order axons sweep ventromedially and cross the midline in the caudal medulla: the sensory decussation.", "caudal medulla"],
    ["Medial lemniscus", "The crossed fibres climb the contralateral medial lemniscus through the medulla, pons and midbrain to the thalamus.", "medial lemniscus"],
    ["VPL nucleus of thalamus", "The 3rd-order cell body sits in the ventral posterolateral (VPL) nucleus, opposite the stimulus.", "VPL nucleus"],
    ["Leaving the thalamus", "Thalamocortical axons leave the VPL laterally toward the internal capsule.", "thalamus"],
    ["Internal capsule", "They pass through the internal capsule‹ (posterior limb)›.", "internal capsule"],
    ["Corona radiata to S1", `They fan out through the corona radiata to the postcentral gyrus, ${hand(l) ? "hand area on the lateral surface" : "leg area on the medial surface"}.`, "corona radiata"],
    ["Primary somatosensory cortex", "The signal arrives in S1 (BA 3, 1, 2) of the hemisphere opposite the stimulus.", "S1"],
  ],
};

const strip = (s: string) =>
  s
    .replace(/ · crosses the midline$/, "")
    .replace(/^Branch \d+:\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "");
function shortTitle(caption: string): string {
  const w = strip(caption).split(/\s+/);
  return w.length <= 5 ? w.join(" ") : w.slice(0, 5).join(" ").replace(/[,:;]$/, "");
}

export function beatCopy(slug: string, i: number, beat: Beat, info: InfoSpec | undefined, limb: Limb): BeatCopy {
  const row = COPY[slug]?.(limb)?.[i];
  if (row) return { title: row[0], sentence: row[1], where: row[2] };
  const lines = info?.lines.filter(([k, v]) => v && !/^Neuron$/.test(k)) ?? [];
  const sentence = strip(beat.caption) + (lines.length ? `: ${lines[0][1]}` : "") + ".";
  return { title: shortTitle(beat.caption), sentence: sentence.replace(/\.\.$/, ".") };
}
