// Dev-only preview of every directional-terms 3D card (not built in production).
import { notFound } from "next/navigation";
import cards from "../../../content/nsci3250/cards/directions-3d.json";
import { DevGrid } from "./DevGrid";

export default function Page({ searchParams }: { searchParams: Promise<{ i?: string; r?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevGrid cards={cards as Array<{ slug: string; answer: string; prompt: string; scene: { subject: "animal" | "human" | "brain"; show: string } }>} params={searchParams} />;
}
