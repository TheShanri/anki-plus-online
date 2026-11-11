import type { Beat, InfoSpec } from "../buildPathwayScene";
import SENSORY from "./copy/sensory.json";
import MOTOR from "./copy/motor.json";
import SPECIAL from "./copy/special.json";
import CIRCUITS from "./copy/circuits.json";

/* The words of each beat: a title of five words or fewer, one sentence at the depth of the course slides (beyond-slide detail
 * in ‹ › goes behind the Supplementary gate), and where the signal is (for the side chip). Kept as data in copy/<group>.json:
 *   { "<slug>": { "<limb>" | "*": [[title, sentence, where?], ...one row per beat] } }
 * Beats without a row fall back to the beat model's caption. */

export interface BeatCopy {
  title: string;
  sentence: string;
  where?: string;
}
type Row = [string, string, string?];
type Limb = "hand" | "foot" | "leg";
export const NEXT_PREFIX = "Next:";

const COPY = { ...SENSORY, ...MOTOR, ...SPECIAL, ...CIRCUITS } as unknown as Record<string, Record<string, Row[]>>;

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
  const rows = COPY[slug]?.[limb] ?? COPY[slug]?.["*"];
  const row = rows?.[i];
  if (row) return { title: row[0], sentence: row[1], where: row[2] };
  const lines = info?.lines.filter(([k, v]) => v && !/^Neuron$/.test(k)) ?? [];
  const sentence = strip(beat.caption) + (lines.length ? `: ${lines[0][1]}` : "") + ".";
  return { title: shortTitle(beat.caption), sentence: sentence.replace(/\.\.$/, ".") };
}
/** Every pathway / limb with copy (for the audit in tools/pathways/v3/copycheck.mjs). */
export const COPY_KEYS = Object.keys(COPY);
