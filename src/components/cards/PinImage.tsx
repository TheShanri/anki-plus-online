"use client";
// PinImage: a lab photo / slide / section with masks and the asked-about structure marked.
//  - masks (rect / ellipse / polygon, fractions of the image) hide every label of an image-occlusion note;
//  - the target is drawn highlighted; pointer types: mask (the target mask itself), existing (a pin already
//    in the photo: ring it), pin (drop a pin), arrow (point at it);
//  - no layout shift: the frame reserves the image's aspect ratio before it loads;
//  - desktop: click to zoom in/out at the pointer; touch: pinch to zoom, drag to pan (double tap resets).
import { useCallback, useRef, useState } from "react";
import type { PinImageData, Shape } from "@/lib/study/types";
import { resolveMediaSrc } from "./media";

export interface PinImageProps {
  courseSlug: string;
  image: PinImageData;
  /** "prompt": the target mask hides its label. "reveal": the target is shown (label uncovered). */
  mode?: "prompt" | "reveal";
  /** render smaller, no zoom (thumbnails, follow-up context) */
  compact?: boolean;
  className?: string;
  alt?: string;
}

function shapeStyle(s: Shape): React.CSSProperties {
  if (s.shape === "polygon") {
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0 || 0.001;
    const h = Math.max(...ys) - y0 || 0.001;
    return {
      left: `${x0 * 100}%`,
      top: `${y0 * 100}%`,
      width: `${w * 100}%`,
      height: `${h * 100}%`,
      clipPath: `polygon(${s.points.map((p) => `${((p[0] - x0) / w) * 100}% ${((p[1] - y0) / h) * 100}%`).join(",")})`,
    };
  }
  return {
    left: `${s.x * 100}%`,
    top: `${s.y * 100}%`,
    width: `${s.w * 100}%`,
    height: `${s.h * 100}%`,
    borderRadius: s.shape === "ellipse" ? "50%" : undefined,
  };
}

function centerOf(s: Shape): { x: number; y: number } {
  if (s.shape === "polygon") {
    const n = s.points.length || 1;
    return { x: s.points.reduce((a, p) => a + p[0], 0) / n, y: s.points.reduce((a, p) => a + p[1], 0) / n };
  }
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

const MAX_ZOOM = 4;

/** Re-mounts per image so zoom and load state reset without an effect. */
export function PinImage(props: PinImageProps) {
  return <PinImageView key={props.image.key} {...props} />;
}

function PinImageView({ courseSlug, image, mode = "prompt", compact, className, alt }: PinImageProps) {
  const src = resolveMediaSrc(courseSlug, image.key);
  const ratio = image.w && image.h ? image.w / image.h : 4 / 3;
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; s: number; moved: boolean; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const lastTap = useRef(0);

  const clamp = useCallback((v: { s: number; x: number; y: number }) => {
    const el = frame.current;
    if (!el) return v;
    const s = Math.max(1, Math.min(MAX_ZOOM, v.s));
    const w = el.clientWidth;
    const h = el.clientHeight;
    const minX = w - w * s;
    const minY = h - h * s;
    return { s, x: Math.max(minX, Math.min(0, v.x)), y: Math.max(minY, Math.min(0, v.y)) };
  }, []);

  const zoomAt = useCallback(
    (px: number, py: number, to: number) => {
      setView((v) => {
        const s = Math.max(1, Math.min(MAX_ZOOM, to));
        // keep the point under the cursor fixed
        const ix = (px - v.x) / v.s;
        const iy = (py - v.y) / v.s;
        return clamp({ s, x: px - ix * s, y: py - iy * s });
      });
    },
    [clamp],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (compact) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = frame.current!.getBoundingClientRect();
    if (pointers.current.size === 1) {
      gesture.current = { d: 0, s: view.s, moved: false, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, moved: true, sx: (a.x + b.x) / 2 - r.left, sy: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (compact || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const r = frame.current!.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.d > 0) {
        const s = Math.max(1, Math.min(MAX_ZOOM, (g.s * d) / g.d));
        const px = (a.x + b.x) / 2 - r.left;
        const py = (a.y + b.y) / 2 - r.top;
        const ix = (g.sx - g.vx) / g.s;
        const iy = (g.sy - g.vy) / g.s;
        setView(clamp({ s, x: px - ix * s, y: py - iy * s }));
      }
    } else if (view.s > 1) {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      setView(clamp({ s: view.s, x: g.vx + dx, y: g.vy + dy }));
    } else if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 6) {
      g.moved = true;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (compact) return;
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && g && !g.moved) {
      // a click / tap: desktop click toggles zoom at the pointer; touch double-tap does
      const r = frame.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (e.pointerType === "touch") {
        const now = performance.now();
        if (now - lastTap.current < 320) {
          if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
          else zoomAt(px, py, 2.4);
        }
        lastTap.current = now;
      } else if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
      else zoomAt(px, py, 2.4);
    }
    if (pointers.current.size < 2) gesture.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (compact || !(e.ctrlKey || e.metaKey)) return;
    const r = frame.current!.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, view.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  };

  const ptr = image.pointer ?? { type: "mask" as const };
  const target = image.target ?? null;
  const masks = image.masks ?? [];
  const showTargetMask = mode === "prompt" && ptr.type === "mask" && target;
  const t = target ? centerOf(target) : null;
  // other masks hide the rest of an image-occlusion note's labels; the target is separate (below)
  const others = masks.filter((m) => !target || JSON.stringify(m) !== JSON.stringify(target));
  const counterScale = 1 / view.s;

  return (
    <div
      ref={frame}
      className={`pin-frame${compact ? " pin-compact" : ""}${view.s > 1 ? " pin-zoomed" : ""}${className ? " " + className : ""}`}
      style={{ aspectRatio: String(ratio), maxWidth: compact ? undefined : `min(var(--pin-max-w, 760px), calc(var(--pin-max-h, 44vh) * ${ratio}))` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      role="img"
      aria-label={alt ?? "Lab image"}
    >
      <div className="pin-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={(el) => {
            // the image may finish loading before hydration: onLoad would never fire
            if (el && el.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          src={src}
          alt=""
          draggable={false}
          className={loaded ? "pin-img loaded" : "pin-img"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        {others.map((m, i) => (
          <div key={i} className="pin-mask" style={shapeStyle(m)} />
        ))}
        {target && showTargetMask && <div className="pin-mask pin-target" style={shapeStyle(target)} />}
        {target && !showTargetMask && ptr.type === "mask" && <div className="pin-target-ring" style={shapeStyle(target)} />}
        {target && ptr.type === "existing" && <div className="pin-target-ring" style={shapeStyle(target)} />}
        {t && ptr.type === "pin" && (
          <div className="pin-marker" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: `translate(-50%, -100%) scale(${counterScale})`, transformOrigin: "50% 100%" }}>
            <svg viewBox="0 0 24 32" width="22" height="30" aria-hidden>
              <path d="M12 31C12 31 2 18.5 2 11a10 10 0 0 1 20 0c0 7.500-10 20-10 20z" fill="currentColor" stroke="var(--bg)" strokeWidth="1.5" />
              <circle cx="12" cy="11" r="3.5" fill="var(--bg)" />
            </svg>
          </div>
        )}
        {t && ptr.type === "arrow" && (
          <div className="pin-marker pin-arrow" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: `translate(-100%, -50%) scale(${counterScale})`, transformOrigin: "100% 50%" }}>
            <svg viewBox="0 0 44 20" width="44" height="20" aria-hidden>
              <path d="M1 10h34M26 2l10 8-10 8" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      {!loaded && !failed && <div className="pin-skeleton" aria-hidden />}
      {failed && <div className="pin-failed">Image unavailable</div>}
      {ptr.type === "existing" && ptr.color && !compact && <span className="pin-caption">{ptr.color}</span>}
      {!compact && loaded && view.s === 1 && <span className="pin-hint" aria-hidden>click to zoom</span>}
    </div>
  );
}
