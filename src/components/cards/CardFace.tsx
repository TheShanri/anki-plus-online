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

export function CardFace({ card, courseSlug, revealed, compact, contextImage, heading }: CardFaceProps) {
  const image = card.image ?? contextImage;
  return (
    <div className="card-face">
      <p className="card-kind">{KIND_LABEL[card.kind] ?? "Card"}{card.facet ? ` · ${card.facet.replace(/_/g, " ")}` : ""}</p>
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
