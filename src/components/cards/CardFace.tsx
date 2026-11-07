"use client";
// CardFace: the question side of any card kind. Shared by the study screen, the practical, and the admin review tool.
import type { StudyCard } from "@/lib/study/types";
import { PinImage } from "./PinImage";

export interface CardFaceProps {
  card: StudyCard;
  courseSlug: string;
  /** show the target uncovered (after answering) */
  revealed?: boolean;
  /** smaller image for follow-up context / thumbnails */
  compact?: boolean;
  /** image of the parent pin card to show above a theory follow-up */
  contextImage?: StudyCard["image"];
  /** extra label above the prompt (e.g. the structure name for a follow-up) */
  heading?: string;
  /** the caller shows the image itself (side-by-side layouts) */
  hideImage?: boolean;
}

const KIND_LABEL: Record<string, string> = {
  pin: "Pin the structure",
  theory: "Theory",
  pathway: "Pathway",
  section: "Section & level",
  clinical: "Clinical",
  mcq: "Question",
  type_answer: "Question",
};

/** Pin cards are not all structures: some labels are directional terms, planes, regions or concepts. */
const PIN_LABEL: Record<string, string> = {
  structure: "Pin the structure",
  direction: "Directional term",
  plane: "Plane",
  region: "Region",
  term: "Term",
  function: "Function",
  space: "Space",
  level: "Level",
};

export function kindLabel(card: StudyCard): string {
  if (card.kind === "pin") return PIN_LABEL[card.answerKind ?? "structure"] ?? KIND_LABEL.pin;
  return KIND_LABEL[card.kind] ?? "Card";
}

export function CardFace({ card, courseSlug, revealed, compact, contextImage, heading, hideImage }: CardFaceProps) {
  const image = hideImage ? undefined : card.image ?? contextImage;
  return (
    <div className="card-face">
      <p className="card-kind">{kindLabel(card)}{card.facet ? ` · ${card.facet.replace(/_/g, " ")}` : ""}</p>
      {image && (
        <PinImage
          courseSlug={courseSlug}
          image={image}
          mode={revealed ? "reveal" : "prompt"}
          compact={compact || (!card.image && !!contextImage)}
          alt={card.prompt || "Lab image"}
        />
      )}
      {heading && <p className="card-heading">{heading}</p>}
      {card.vignette && <p className="card-vignette">{card.vignette}</p>}
      <p className="card-prompt">{card.prompt}</p>
    </div>
  );
}
