"use client";
// PlateImage: a brainstem level drawn as its atlas plate (illustration only, so the asked region reads clearly) with one
// structure highlighted on both sides. The plate is course material, fetched from the auth-gated
// /api/atlas/brainstem/plate/<level> route and cached for the session (see components/atlas/brainstem/plate).
import { usePlate } from "@/components/atlas/brainstem/plate/usePlate";
import { PlateArt } from "@/components/atlas/brainstem/plate/PlateArt";
import "@/components/atlas/brainstem/brainstem.css";

export interface PlateImageProps {
  level: string;
  /** structure slug whose region(s) are highlighted */
  region?: string | null;
  /** "reveal" shows the highlighted structure's name beside it */
  label?: string | null;
  compact?: boolean;
  className?: string;
  alt?: string;
}

export function PlateImage({ level, region, label, compact, className, alt }: PlateImageProps) {
  const plate = usePlate(level);
  const ready = plate && plate !== "missing" ? plate : null;
  const ratio = ready ? ready.viewBox[2] / ready.viewBox[3] : 4 / 3;
  return (
    <div
      className={`plate-frame${compact ? " plate-compact" : ""}${className ? " " + className : ""}`}
      style={{ aspectRatio: String(ratio), maxWidth: compact ? 260 : `min(var(--pin-max-w, 760px), calc(var(--pin-max-h, 44vh) * ${ratio}))`, width: "100%", margin: "0 auto", position: "relative", borderRadius: "var(--radius-sm)", border: "1px solid var(--panel-border)", overflow: "hidden" }}
      role="img"
      aria-label={alt ?? "Brainstem section"}
    >
      {ready && (
        <div style={{ position: "absolute", inset: 0 }}>
          <PlateArt plate={ready} view="illustration" selected={region ?? null} hot={label ? (region ?? null) : null} callout={!!label} names={label && region ? { [region]: label } : undefined} ariaLabel={alt ?? "Brainstem section"} />
        </div>
      )}
      {plate === "missing" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--text-dim)" }}>Plate unavailable</div>}
    </div>
  );
}
