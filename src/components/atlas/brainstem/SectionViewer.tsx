"use client";
// One section image with zoom/pan (same interaction model as the study PinImage) and label overlays.
import { useCallback, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { resolveMediaSrc } from "@/components/cards/media";
import { colorOf, type BsImage } from "./data";
import { IconBtn, shapeStyle } from "./ui";

export type LabelMode = "labels" | "quiz" | "clean";
export type QuizResult = "right" | "wrong";
const MAX_ZOOM = 5;

export function imageSrc(im: BsImage, courseSlug: string): string {
  return im.source === "course" ? resolveMediaSrc(courseSlug, im.key ?? "") : (im.src ?? "");
}

type ViewerProps = {
  image: BsImage;
  courseSlug: string;
  mode: LabelMode;
  hoverSlug: string | null;
  onHover: (slug: string | null) => void;
  results: Record<number, QuizResult>;
  active: number | null;
  onActivate: (i: number) => void;
};

export function SectionViewer(props: ViewerProps) {
  // re-mount per image so zoom and load state reset without an effect
  return <Viewer key={props.image.id} {...props} />;
}

function anchorOf(s: BsImage["labels"][number]["shape"]): { x: number; y: number } {
  if (s.shape === "polygon") return { x: s.points[0][0], y: s.points[0][1] };
  return { x: s.x + s.w / 2, y: s.y };
}

function Viewer({ image, courseSlug, mode, hoverSlug, onHover, results, active, onActivate }: ViewerProps) {
  const ratio = image.w && image.h ? image.w / image.h : 4 / 3;
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; s: number; moved: boolean; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const lastTap = useRef(0);

  const clamp = useCallback((v: { s: number; x: number; y: number }) => {
    const el = frame.current;
    if (!el) return v;
    const s = Math.max(1, Math.min(MAX_ZOOM, v.s));
    const w = el.clientWidth;
    const h = el.clientHeight;
    return { s, x: Math.max(w - w * s, Math.min(0, v.x)), y: Math.max(h - h * s, Math.min(0, v.y)) };
  }, []);
  const zoomAt = useCallback(
    (px: number, py: number, to: number) => {
      setView((v) => {
        const s = Math.max(1, Math.min(MAX_ZOOM, to));
        const ix = (px - v.x) / v.s;
        const iy = (py - v.y) / v.s;
        return clamp({ s, x: px - ix * s, y: py - iy * s });
      });
    },
    [clamp],
  );
  const zoomCentre = (f: number) => {
    const el = frame.current;
    if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, view.s * f);
  };

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = frame.current!.getBoundingClientRect();
    if (pointers.current.size === 1) gesture.current = { d: 0, s: view.s, moved: false, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, moved: true, sx: (a.x + b.x) / 2 - r.left, sy: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y };
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const r = frame.current!.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.d > 0) {
        const s = Math.max(1, Math.min(MAX_ZOOM, (g.s * d) / g.d));
        const ix = (g.sx - g.vx) / g.s;
        const iy = (g.sy - g.vy) / g.s;
        setView(clamp({ s, x: (a.x + b.x) / 2 - r.left - ix * s, y: (a.y + b.y) / 2 - r.top - iy * s }));
      }
    } else if (view.s > 1) {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      setView(clamp({ s: view.s, x: g.vx + dx, y: g.vy + dy }));
    } else if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 6) g.moved = true;
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && g && !g.moved) {
      const r = frame.current!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const toggle = () => (view.s > 1 ? setView({ s: 1, x: 0, y: 0 }) : zoomAt(px, py, 2.4));
      if (e.pointerType === "touch") {
        const now = performance.now();
        if (now - lastTap.current < 320) toggle();
        lastTap.current = now;
      } else toggle();
    }
    if (pointers.current.size < 2) gesture.current = null;
  };
  const wheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const r = frame.current!.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, view.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const src = imageSrc(image, courseSlug);
  const labels = image.labels;
  const showBoxes = mode === "labels" && labels.length > 0;
  const tipLabel = showBoxes && tip !== null ? labels[tip] : null;
  const tipAt = tipLabel ? anchorOf(tipLabel.shape) : null;
  return (
    <div
      ref={frame}
      className={`bs-frame${view.s > 1 ? " bs-zoomed" : ""}`}
      style={{ aspectRatio: String(ratio), maxWidth: `min(100%, calc(var(--bs-max-h, 66vh) * ${ratio}))` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onWheel={wheel}
      role="img"
      aria-label={image.title}
    >
      {!loaded && !failed && <div className="bs-skel" aria-hidden />}
      <div className="bs-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={(el) => {
            if (!el || !el.complete) return;
            if (el.naturalWidth > 0 && !loaded) setLoaded(true);
            else if (el.naturalWidth === 0 && el.currentSrc && !failed) setFailed(true);
          }}
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={loaded ? "bs-img bs-loaded" : "bs-img"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        {showBoxes &&
          labels.map((l, i) => {
            const hot = hoverSlug !== null && l.slug === hoverSlug;
            return (
              <div
                key={i}
                className={`bs-box${hot ? " bs-hot" : hoverSlug && !hot ? " bs-dim" : ""}`}
                style={{ ...shapeStyle(l.shape), ["--bs-c" as string]: colorOf(l.slug) }}
                onPointerDown={stop}
                onPointerUp={stop}
                onPointerEnter={() => {
                  setTip(i);
                  onHover(l.slug);
                }}
                onPointerLeave={() => {
                  setTip(null);
                  onHover(null);
                }}
              />
            );
          })}
        {tipLabel && tipAt && (
          <div className="bs-tip" style={{ left: `${tipAt.x * 100}%`, top: `${tipAt.y * 100}%`, transform: `translate(-50%, -105%) scale(${1 / view.s})`, transformOrigin: "50% 100%" }}>
            {tipLabel.name}
          </div>
        )}
        {mode === "quiz" &&
          labels.map((l, i) => (
            <button
              key={i}
              type="button"
              aria-label={results[i] ? l.name : `Covered label ${i + 1}`}
              title={results[i] ? l.name : undefined}
              className={`bs-mask${results[i] ? " bs-" + results[i] : ""}${active === i ? " bs-active" : ""}`}
              style={shapeStyle(l.shape)}
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={() => onActivate(i)}
            />
          ))}
      </div>
      {failed && <div className="absolute inset-0 flex items-center justify-center text-sm text-text-dim">Image unavailable</div>}
      <div className="bs-tools" onPointerDown={stop} onPointerUp={stop}>
        <IconBtn icon={ZoomIn} label="Zoom in" onClick={() => zoomCentre(1.5)} disabled={view.s >= MAX_ZOOM} />
        <IconBtn icon={ZoomOut} label="Zoom out" onClick={() => zoomCentre(1 / 1.5)} disabled={view.s <= 1} />
        <IconBtn icon={Maximize2} label="Reset view" onClick={() => setView({ s: 1, x: 0, y: 0 })} disabled={view.s === 1} />
      </div>
    </div>
  );
}
