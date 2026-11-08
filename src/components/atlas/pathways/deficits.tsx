import { Activity, Brain, Compass, Crosshair, Dumbbell, Ear, Eye, Fingerprint, Flower2, HeartPulse, Smile, Thermometer, Accessibility } from "lucide-react";
import type { ComponentType } from "react";

/* One icon per kind of deficit, the same everywhere (lesion lab rows, step panel, legend). */

export type DeficitKind = "touch" | "proprio" | "pain" | "motor" | "face" | "vision" | "hearing" | "balance" | "coord" | "autonomic" | "smell" | "mind" | "other";

export const DEFICITS: Record<DeficitKind, { label: string; Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }> }> = {
  touch: { label: "Fine touch, vibration", Icon: Fingerprint },
  proprio: { label: "Joint position (proprioception)", Icon: Accessibility },
  pain: { label: "Pain, temperature", Icon: Thermometer },
  motor: { label: "Weakness, paralysis", Icon: Dumbbell },
  face: { label: "Face", Icon: Smile },
  vision: { label: "Vision", Icon: Eye },
  hearing: { label: "Hearing", Icon: Ear },
  balance: { label: "Balance", Icon: Compass },
  coord: { label: "Coordination", Icon: Crosshair },
  autonomic: { label: "Autonomic", Icon: HeartPulse },
  smell: { label: "Smell", Icon: Flower2 },
  mind: { label: "Memory, emotion", Icon: Brain },
  other: { label: "Other", Icon: Activity },
};

const RULES: [DeficitKind, RegExp][] = [
  ["pain", /pain|temperature|itch|crude touch|thermal|nocicep/],
  ["touch", /vibration|fine touch|discriminative|two-point|\btouch\b|pressure/],
  ["proprio", /proprioception|joint.position|position sense|conscious proprio/],
  ["vision", /vision|visual|field|hemianop|quadrant|blind|sight|retina/],
  ["hearing", /hearing|auditory|deaf/],
  ["balance", /balance|vestibul|vertigo|nystagmus/],
  ["coord", /incoordination|ataxia|coordination|intention tremor|cerebell|dysmetria|unconscious proprio/],
  ["face", /\bface\b|facial|jaw|mastication|chew|corneal|tongue|swallow/],
  ["motor", /weak|paraly|paresis|plegia|spastic|motor|movement|voluntary|muscle|reflex|rigid|tremor|bradykin|ballism|chorea/],
  ["autonomic", /autonomic|sympath|parasympath|horner|pupil|bladder|salivat|heart/],
  ["smell", /smell|olfact|anosmia/],
  ["mind", /memory|emotion|learning|reward|fear|amnesia|limbic/],
];

/** Kinds of deficit named in a piece of text, most specific first. Never empty. */
export function deficitKinds(text: string): DeficitKind[] {
  const t = text.toLowerCase();
  const out: DeficitKind[] = [];
  for (const [k, re] of RULES) if (re.test(t) && !out.includes(k)) out.push(k);
  if (!out.length) out.push("other");
  return out;
}

export function DeficitIcons({ text, size = 15 }: { text: string; size?: number }) {
  const kinds = deficitKinds(text);
  return (
    <span className="inline-flex flex-none items-center gap-0.5 text-text-dim" title={kinds.map((k) => DEFICITS[k].label).join(", ")}>
      {kinds.slice(0, 3).map((k) => {
        const I = DEFICITS[k].Icon;
        return <I key={k} size={size} aria-hidden />;
      })}
    </span>
  );
}

/** The key to the icons: shown once, collapsed, on both pages. */
export function DeficitLegend({ kinds }: { kinds?: DeficitKind[] }) {
  const list = (kinds ?? (Object.keys(DEFICITS) as DeficitKind[])).filter((k) => k !== "other");
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-dim sm:grid-cols-3">
      {list.map((k) => {
        const I = DEFICITS[k].Icon;
        return (
          <li key={k} className="flex items-center gap-1.5">
            <I size={14} aria-hidden />
            {DEFICITS[k].label}
          </li>
        );
      })}
    </ul>
  );
}
