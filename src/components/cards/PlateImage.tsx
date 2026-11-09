"use client";
// PlateImage: a brainstem level drawn as a clean vector plate (see src/lib/brainstem/plates.ts) with one structure
// highlighted. The drawing stays on screen for the whole card; only the asked region is tinted. The plate is
// course material, fetched from the auth-gated /api/atlas/brainstem/plate/<level> route (cached for the session).
import { useEffect, useState } from "react";

export interface PlateData {
  level: string;
  viewBox: [number, number, number, number];
  ink: string;
  regions: Array<{ id: string; slugs: string[]; d: string; c: [number, number] }>;
}

const cache = new Map<string, PlateData | "missing">();
const inflight = new Map<string, Promise<void>>();

export function loadPlate(level: string): Promise<void> {
  if (cache.has(level)) return Promise.resolve();
  let p = inflight.get(level);
  if (!p) {
    p = fetch(`/api/atlas/brainstem/plate/${encodeURIComponent(level)}`)
      .then(async (r) => {
        cache.set(level, r.ok ? ((await r.json()) as PlateData) : "missing");
      })
      .catch(() => {
        cache.set(level, "missing");
      })
      .finally(() => inflight.delete(level));
    inflight.set(level, p);
  }
  return p;
}
export function cachedPlate(level: string): PlateData | "missing" | null {
  return cache.get(level) ?? null;
}

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
  const [, tick] = useState(0);
  useEffect(() => {
    if (cache.has(level)) return;
    let alive = true;
    loadPlate(level).then(() => alive && tick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [level]);
  const plate = cachedPlate(level);
  const ratio = plate && plate !== "missing" ? plate.viewBox[2] / plate.viewBox[3] : 4 / 3;
  return (
    <div
      className={`plate-frame${compact ? " plate-compact" : ""}${className ? " " + className : ""}`}
      style={{ aspectRatio: String(ratio), maxWidth: compact ? 260 : `min(var(--pin-max-w, 760px), calc(var(--pin-max-h, 44vh) * ${ratio}))`, width: "100%", margin: "0 auto", position: "relative", borderRadius: "var(--radius-sm)", border: "1px solid var(--panel-border)", background: "var(--bg-2)", overflow: "hidden" }}
      role="img"
      aria-label={alt ?? "Brainstem section"}
    >
      {plate && plate !== "missing" && (
        <svg viewBox={plate.viewBox.join(" ")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
          {plate.regions
            .filter((r) => region && r.slugs.includes(region))
            .map((r) => (
              <path key={r.id} d={r.d} fill="var(--accent)" fillOpacity={0.42} stroke="var(--accent)" strokeWidth={3} fillRule="evenodd" />
            ))}
          <path d={plate.ink} fill="var(--text)" fillRule="evenodd" />
          {label &&
            plate.regions
              .filter((r) => region && r.slugs.includes(region))
              .slice(0, 1)
              .map((r) => (
                <text key={r.id} x={r.c[0]} y={Math.max(30, r.c[1] - 28)} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--text)" stroke="var(--bg)" strokeWidth={7} paintOrder="stroke">
                  {label}
                </text>
              ))}
        </svg>
      )}
      {plate === "missing" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--text-dim)" }}>Plate unavailable</div>}
    </div>
  );
}
