// Mock lab practical: drawing stations from pin cards and scoring. Pure; the API routes call these.
import { gradeTyped, gradeKeywords, verdictFromKeywords, type ExamSpelling, type Verdict } from "./grade.ts";
import type { StudyCard } from "./types.ts";

export const DEFAULT_STATION_SECONDS = 75;

export interface StationDraw {
  pin: StudyCard;
  followups: StudyCard[];
}

/** Practical-sourced pin cards come first (tag "practical"), then the rest; shuffled inside each group. */
export function drawStations(
  pins: StudyCard[],
  theoryByStructure: Map<string, StudyCard[]>,
  count: number,
  rand: () => number = Math.random,
  bySlug: Map<string, StudyCard> = new Map(),
): StationDraw[] {
  const shuffle = <T>(a: T[]): T[] => {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  };
  const isPractical = (c: StudyCard) => c.tags.includes("practical");
  const seen = new Set<string>();
  const ordered = [...shuffle(pins.filter(isPractical)), ...shuffle(pins.filter((c) => !isPractical(c)))].filter((c) => {
    // one station per structure
    const k = c.structureId ?? c.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return ordered.slice(0, count).map((pin) => {
    // explicit practical stems first, then the structure's theory cards (a pin with no structure has none)
    const explicit = pin.followupCards.map((s) => bySlug.get(s)).filter((c): c is StudyCard => !!c && c.answer !== "");
    if (explicit.length) return { pin, followups: explicit.slice(0, 2) };
    const fu = theoryByStructure.get(pin.structureId ?? "") ?? [];
    const wanted = pin.followups.map((f) => f.split(":").pop());
    const chosen = fu.filter((c) => wanted.includes(c.facet)).slice(0, 2);
    return { pin, followups: chosen.length ? chosen : shuffle(fu).slice(0, 1) };
  });
}

export interface StationAnswer {
  typed: string;
  followups: string[];
}

export interface StationScore {
  nameVerdict: Verdict;
  followupVerdicts: Verdict[];
  points: number;
  max: number;
}

/** Grade one card in exam mode (names: spelling per course setting; keyword free text; choice / tf: exact). */
export function gradeExamCard(card: StudyCard, typed: string, spelling: ExamSpelling, knownNames?: Record<string, string>, ownSlug?: string | null): Verdict {
  if (card.format === "keywords" && card.keywords?.length) {
    return verdictFromKeywords(gradeKeywords(typed, card.keywords), typed);
  }
  return gradeTyped(typed, { answer: card.answer, accept: card.accept, requireSide: card.requireSide }, { mode: "exam", spelling, knownNames, ownSlug });
}

/** A station is worth 1 point for the name plus 1 per follow-up. */
export function scoreStation(draw: StationDraw, a: StationAnswer, spelling: ExamSpelling, knownNames?: Record<string, string>, ownSlug?: string | null): StationScore {
  const nameVerdict = gradeExamCard(draw.pin, a.typed, spelling, knownNames, ownSlug);
  const followupVerdicts = draw.followups.map((c, i) => gradeExamCard(c, a.followups[i] ?? "", spelling));
  const points = nameVerdict.points + followupVerdicts.reduce((s, v) => s + v.points, 0);
  return { nameVerdict, followupVerdicts, points, max: 1 + draw.followups.length };
}

export function readSpelling(v: unknown): ExamSpelling {
  return v === "strict" || v === "normal" || v === "generous" ? v : "generous";
}

/** What the exam client may see: the question and its picture, never the answer. */
export function publicCard(c: StudyCard): StudyCard {
  return { ...c, answer: "", accept: [], keywords: undefined, explain: null, followups: [], choices: c.format === "choice" || c.format === "tf" ? c.choices : null };
}
