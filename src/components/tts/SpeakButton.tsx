"use client";
import { useEffect, useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { speak, stop } from "@/lib/tts/player";
import "./tts.css";

/** A small speaker button: plays the pre-generated clip for `text` (falls back quietly to the browser voice). */
export function SpeakButton({ text, className = "", label = "Hear it" }: { text: string; className?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  useEffect(() => () => stop(), []);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`speak-btn ${className}`}
      aria-label={`${label}: ${text}`}
      title={label}
      data-state={state}
      onClick={(e) => {
        e.stopPropagation();
        if (state === "playing") stop();
        else void speak(text, setState);
      }}
    >
      {state === "loading" ? <Loader2 size={15} aria-hidden /> : <Volume2 size={15} aria-hidden />}
    </button>
  );
}
