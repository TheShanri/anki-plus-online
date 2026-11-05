// Admin-only preview of a card: how the student sees it, then the answer, accept list, follow-ups and source.
// NOTE: the engine agent's shared renderers (src/components/cards/PinImage etc.) did not exist yet when this
// was written, so this renders image + masks itself. Swap in the shared renderer when it lands.
import { mediaUrl } from "@/lib/media";

type Shape = { shape?: string; x?: number; y?: number; w?: number; h?: number; points?: number[][] };
export type ReviewCard = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  content: Record<string, unknown>;
  structure: string | null;
};

const pct = (n: number | undefined) => `${((n ?? 0) * 100).toFixed(2)}%`;

function ShapeBox({ s, tone }: { s: Shape; tone: "mask" | "target" }) {
  const style: React.CSSProperties =
    tone === "mask"
      ? { background: "var(--bg)", border: "1px solid var(--panel-border)" }
      : { border: "3px solid var(--accent)", boxShadow: "0 0 0 2px var(--bg)" };
  if (s.shape === "polygon" && s.points?.length) {
    const pts = s.points.map(([x, y]) => `${x * 100},${y * 100}`).join(" ");
    return (
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={pts} fill={tone === "mask" ? "var(--bg)" : "none"} stroke={tone === "mask" ? "var(--panel-border)" : "var(--accent)"} strokeWidth={tone === "mask" ? 0.3 : 0.8} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  return <div className="absolute" style={{ left: pct(s.x), top: pct(s.y), width: pct(s.w), height: pct(s.h), ...style }} />;
}

export function CardPreview({ card, courseSlug }: { card: ReviewCard; courseSlug: string }) {
  const c = card.content;
  const image = typeof c.image === "string" ? c.image : null;
  const target = c.target as Shape | undefined;
  const masks = Array.isArray(c.masks) ? (c.masks as Shape[]) : [];
  const accept = Array.isArray(c.accept) ? (c.accept as string[]) : [];
  const followups = (Array.isArray(c.followups) ? c.followups : []) as unknown[];
  const keywords = Array.isArray(c.keywords) ? (c.keywords as string[][]) : [];
  const source = c.source as { type?: string; ref?: string } | string | undefined;
  const pointer = c.pointer as { type?: string; color?: string } | undefined;

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-text-faint">
        {card.kind} · {card.slug} · {card.status}{card.structure ? ` · ${card.structure}` : ""}
      </p>

      {typeof c.vignette === "string" && <p className="panel">{c.vignette}</p>}
      {image && (
        <div className="relative inline-block max-w-full overflow-hidden rounded-card-sm border border-panel-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(courseSlug, image)} alt="Card image" className="block max-h-[60vh] max-w-full" />
          {masks.map((m, i) => <ShapeBox key={i} s={m} tone="mask" />)}
          {target && <ShapeBox s={target} tone="target" />}
        </div>
      )}
      {pointer?.type === "existing" && <p className="text-xs text-text-dim">Pointer already in the photo{pointer.color ? ` (${pointer.color})` : ""}.</p>}
      <p className="text-lg">{typeof c.prompt === "string" ? c.prompt : <span className="text-text-faint">(no prompt)</span>}</p>

      <div className="panel space-y-2 text-sm" style={{ borderColor: "var(--good)" }}>
        <p><span className="label inline">Answer</span> <b>{String(c.answer ?? "(none)")}</b></p>
        {accept.length > 0 && <p><span className="label inline">Also accepted</span> {accept.join(" · ")}</p>}
        {keywords.length > 0 && (
          <p><span className="label inline">Keyword groups</span> {keywords.map((g) => `[${g.join(" / ")}]`).join(" ")}</p>
        )}
        {c.require_side === true && <p className="text-text-dim">Side (left/right) required.</p>}
        {typeof c.explain === "string" && <p><span className="label inline">Explain</span> {c.explain}</p>}
        {followups.length > 0 && (
          <p><span className="label inline">Follow-ups</span> {followups.map((f) => (typeof f === "string" ? f : JSON.stringify(f))).join(" · ")}</p>
        )}
        {source && (
          <p className="text-text-dim"><span className="label inline">Source</span> {typeof source === "string" ? source : `${source.type ?? ""} ${source.ref ?? ""}`}</p>
        )}
      </div>

      <details className="text-xs text-text-faint">
        <summary className="cursor-pointer">Raw JSON</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-card-sm bg-bg-2 p-3">{JSON.stringify(c, null, 2)}</pre>
      </details>
    </div>
  );
}
