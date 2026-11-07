// Shared study types and the normaliser that turns a `cards` row (content JSON per docs/CONTENT_SCHEMA.md)
// into the shape the study UI works with. Tolerant: the content pipeline may store the card JSON either
// flat in `content` or with media in the `media` column.
import type { CardStateRow } from "../fsrs.ts";
import type { LearnerSettings } from "./settings.ts";
import type { TrapSpot } from "./traps.ts";

export type CardKind = "pin" | "theory" | "pathway" | "section" | "clinical" | "mcq" | "type_answer";
export type AnswerFormat = "type" | "keywords" | "tf" | "choice";

export type Shape =
  | { shape: "rect"; x: number; y: number; w: number; h: number }
  | { shape: "ellipse"; x: number; y: number; w: number; h: number }
  | { shape: "polygon"; points: Array<[number, number]> };

export interface PinImageData {
  /** media key (see src/lib/media.ts) or a public path starting with "/" (dev fixtures) */
  key: string;
  w?: number;
  h?: number;
  target?: Shape | null;
  masks?: Shape[];
  pointer?: { type: "mask" | "existing" | "pin" | "arrow"; color?: string };
}

export interface StudyCard {
  id: string;
  slug: string;
  kind: CardKind;
  topicId: string | null;
  structureId: string | null;
  position: number;
  prompt: string;
  vignette?: string;
  answer: string;
  accept: string[];
  requireSide: boolean;
  format: AnswerFormat;
  keywords?: string[][];
  choices?: string[] | null;
  explain?: string | null;
  facet?: string;
  pathway?: string;
  step?: string;
  /** what a pin/section answer is: structure | direction | plane | region | term | level (drives the label above the prompt) */
  answerKind?: string;
  image?: PinImageData;
  followups: string[];
  /** explicit follow-up card slugs (practical exam stems), asked before the structure's theory cards */
  followupCards: string[];
  tags: string[];
}

export interface StructureLite {
  id: string;
  slug: string;
  name: string;
  synonyms: string[];
  region: string | null;
  info: StructureInfo;
}

export interface StructureInfo {
  latin?: string | null;
  etymology?: {
    roots?: Array<{ part: string; lang?: string; meaning: string }>;
    literal?: string | null;
    story?: string | null;
  } | null;
  explanation?: string | null;
  facts?: Record<string, string | null> | null;
  [k: string]: unknown;
}

export interface CardRow {
  id: string;
  slug: string;
  kind: string;
  topic_id: string | null;
  structure_id: string | null;
  position: number;
  content: Record<string, unknown> | null;
  media?: unknown;
}

export interface LadderRow {
  card_id: string;
  step: number;
  clean_streak: number;
  last_clean_at: string | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toShape(v: unknown): Shape | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.shape === "polygon" && Array.isArray(o.points)) return { shape: "polygon", points: o.points as Array<[number, number]> };
  if ((o.shape === "rect" || o.shape === "ellipse") && typeof o.x === "number") {
    return { shape: o.shape, x: o.x, y: o.y as number, w: o.w as number, h: o.h as number };
  }
  return null;
}

/** Normalise one cards row. */
export function toStudyCard(row: CardRow): StudyCard {
  const c = (row.content ?? {}) as Record<string, unknown>;
  const kind = (row.kind as CardKind) ?? "type_answer";
  const fmtRaw = str(c.format);
  const keywords = Array.isArray(c.keywords) ? (c.keywords as unknown[]).map((g) => strs(g)).filter((g) => g.length) : undefined;
  const choices = Array.isArray(c.choices) ? strs(c.choices) : null;
  let format: AnswerFormat = fmtRaw === "keywords" || fmtRaw === "tf" || fmtRaw === "choice" ? (fmtRaw as AnswerFormat) : "type";
  if (format === "keywords" && !(keywords && keywords.length)) format = "type";
  if (format === "choice" && !(choices && choices.length > 1)) format = "type";
  let image: PinImageData | undefined;
  const imgKey = str(c.image);
  if (imgKey) {
    image = {
      key: imgKey,
      w: typeof c.w === "number" ? c.w : undefined,
      h: typeof c.h === "number" ? c.h : undefined,
      target: toShape(c.target),
      masks: Array.isArray(c.masks) ? (c.masks.map(toShape).filter(Boolean) as Shape[]) : [],
      pointer: c.pointer && typeof c.pointer === "object" ? (c.pointer as PinImageData["pointer"]) : { type: "mask" },
    };
  }
  return {
    id: row.id,
    slug: row.slug,
    kind,
    topicId: row.topic_id,
    structureId: row.structure_id,
    position: row.position,
    prompt: str(c.prompt) || (kind === "pin" ? "Name the structure." : ""),
    vignette: str(c.vignette) || undefined,
    answer: str(c.answer) || str(c.name),
    accept: strs(c.accept),
    requireSide: !!c.require_side,
    format,
    keywords,
    choices,
    explain: str(c.explain) || null,
    facet: str(c.facet) || undefined,
    pathway: str(c.pathway) || undefined,
    step: str(c.step) || undefined,
    answerKind: str(c.answer_kind) || undefined,
    image,
    followups: strs(c.followups),
    followupCards: strs(c.followup_cards),
    tags: [...strs(c.tags), ...((c.source as { type?: string } | null)?.type === "practical" ? ["practical"] : [])],
  };
}

export type { CardStateRow };

export type EntrySourceName = "new" | "learning" | "review" | "followup" | "boss";

/** What GET /api/study/queue returns (and the study client consumes). */
export interface StudyPayload {
  course: { id: string; code: string; title: string; slug: string; settings: Record<string, unknown> };
  settings: LearnerSettings;
  serverNow: string;
  scope: string;
  queue: Array<{ cardId: string; source: EntrySourceName }>;
  cards: StudyCard[];
  structures: Record<string, StructureLite>;
  states: Record<string, CardStateRow>;
  ladders: Record<string, LadderRow>;
  traps: Record<string, TrapSpot[]>;
  trapMisses: Record<string, number>;
  notes: Record<string, string>;
  counts: { new: number; learning: number; review: number; newDoneToday: number; reviewsDoneToday: number; newLeft: number; reviewsLeft: number };
  /** canonical structure name / synonym -> slug, to catch "that is a different structure" */
  names: Record<string, string> | null;
  units: Array<{ slug: string; title: string }>;
}

/** A student's own mnemonic (always visible to them). */
export interface OwnMnemonic {
  id: string;
  cardId: string | null;
  structureId: string | null;
  body: string;
  visibility: "private" | "class";
  anonymous: boolean;
  hidden: boolean;
  votes: number;
  reports: number;
}

/** A classmate's shared mnemonic. `author` is null when they chose to stay anonymous (never their identity otherwise). */
export interface SharedMnemonic {
  id: string;
  cardId: string | null;
  structureId: string | null;
  body: string;
  author: string | null;
  votes: number;
  voted: boolean;
  reported: boolean;
}

export interface MnemonicsResponse {
  structure: { id: string; slug: string; name: string } | null;
  mine: OwnMnemonic[];
  shared: SharedMnemonic[];
}
