"use client";
import { use } from "react";
import { PinImage } from "@/components/cards/PinImage";

export function DevGrid({ cards, params }: { cards: Array<{ slug: string; answer: string; prompt: string; scene: { subject: "animal" | "human" | "brain"; show: string } }>; params: Promise<{ i?: string; r?: string }> }) {
  const p = use(params);
  const from = Number(p.i ?? 0);
  const list = cards.slice(from, from + 6);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 12 }}>
      {list.map((c) => (
        <div key={c.slug}>
          <p style={{ fontSize: 12, margin: "0 0 4px" }}>{c.slug} — {c.answer}</p>
          <PinImage courseSlug="nsci3250" image={{ key: c.slug, scene: { ...c.scene, label: c.answer } }} mode={p.r ? "reveal" : "prompt"} />
        </div>
      ))}
    </div>
  );
}
