"use client";
// One style pane: thumbnails (several images), the section viewer or the MRI slice, credit line, quiz bar.
import { useEffect, useRef, useState } from "react";
import { Check, Eye, Lock } from "lucide-react";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import { imageSrc, SectionViewer, type LabelMode, type QuizResult } from "./SectionViewer";
import { MriPane } from "./MriPane";
import { imagesFor, matches, type BsLevel, type StyleId } from "./data";

export interface PaneProps {
  level: BsLevel;
  style: StyleId;
  index: number;
  onIndex: (i: number) => void;
  courseSlug: string;
  mode: LabelMode;
  hoverSlug: string | null;
  onHover: (s: string | null) => void;
  /** quiz results per image id */
  results: Record<string, Record<number, QuizResult>>;
  onResult: (imageId: string, idx: number, r: QuizResult, slug: string | null) => void;
}

export function Pane({ level, style, index, onIndex, courseSlug, mode, hoverSlug, onHover, results, onResult }: PaneProps) {
  const images = imagesFor(level.slug, style);
  const image = images[Math.min(index, images.length - 1)];
  const [active, setActive] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [shake, setShake] = useState(false);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const gate = useSupplementaryGate("brainstem");
  const { open: gateOpen, lock } = gate;
  const extraRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gateOpen) return;
    const down = (e: PointerEvent) => {
      if (extraRef.current && !extraRef.current.contains(e.target as Node)) lock();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [gateOpen, lock]);

  // a new image or mode clears the active label (derived during render, not in an effect)
  const resetKey = `${image?.id}|${mode}`;
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    setActive(null);
    setText("");
    setNote("");
  }
  useEffect(() => {
    if (active !== null) input.current?.focus();
  }, [active]);

  if (style === "mri") return <MriPane level={level} hoverSlug={hoverSlug} onHover={onHover} />;
  if (!image) return <div className="panel text-sm text-text-dim">No {style} image for this level yet.</div>;
  // labels the course never names (read off open images) are supplementary and stay locked until asked for
  const extra = image.source === "open" ? image.labels.filter((l) => !l.slug) : [];
  const shownImage = extra.length && !gateOpen ? { ...image, labels: image.labels.filter((l) => l.slug) } : image;

  const res = results[image.id] ?? {};
  const label = active !== null ? shownImage.labels[active] : null;
  const done = Object.keys(res).length;
  const nLabels = shownImage.labels.length;
  const right = Object.values(res).filter((r) => r === "right").length;
  const baked = image.source === "open" && image.labelsBaked;
  const check = () => {
    if (!label || active === null || !text.trim()) return;
    if (matches(text, label)) {
      onResult(image.id, active, "right", label.slug);
      setNote(`Correct: ${label.name}`);
      setActive(null);
      setText("");
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 300);
    }
  };
  const reveal = () => {
    if (!label || active === null) return;
    onResult(image.id, active, "wrong", label.slug);
    setNote(`It was: ${label.name}`);
    setActive(null);
    setText("");
  };

  return (
    <div className="min-w-0">
      {images.length > 1 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Images at this level">
          {images.map((im, i) => (
            <button key={im.id} type="button" role="listitem" className="bs-thumb" aria-current={im === image ? "true" : undefined} aria-label={im.title} title={im.title} onClick={() => onIndex(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc(im, courseSlug)} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
      <SectionViewer image={shownImage} courseSlug={courseSlug} mode={mode} hoverSlug={hoverSlug} onHover={onHover} results={res} active={active} onActivate={(i) => setActive(i)} />
      <div className="mt-1.5 text-xs text-text-dim">
        <span className="text-text">{image.title}</span>
        {image.source === "course" ? " · course material" : image.credit ? ` · ${image.short ?? image.credit}` : ""}
        {image.license && image.source === "open" && <span> · {image.license}</span>}
      </div>
      {extra.length > 0 && mode !== "clean" && (
        <div ref={extraRef} className="mt-2">
          {gate.asking ? (
            <SupplementaryHeadsUp what="Labelling this image beyond the course lists" onConfirm={gate.confirm} onCancel={gate.cancel} />
          ) : gateOpen ? (
            <p className="text-xs text-accent-2">Showing {extra.length} extra labels from the open image. Not in your slides. Click away to lock.</p>
          ) : (
            <button type="button" onClick={gate.request} className="inline-flex items-center gap-1.5 rounded-sm border border-dashed border-panel-border px-2 py-1 text-xs text-text-faint opacity-80 hover:border-panel-border-hi hover:text-text-dim" title="Beyond your syllabus and slides: click to peek">
              <Lock size={12} aria-hidden /> {extra.length} extra labels · supplementary
            </button>
          )}
        </div>
      )}
      {mode === "labels" && shownImage.labels.length === 0 && <p className="mt-1 text-xs text-text-dim">{baked ? "This image carries its own printed labels." : "No label boxes for this image."}</p>}
      {mode === "quiz" && shownImage.labels.length === 0 && <p className="mt-1 text-xs text-text-dim">Quiz needs label boxes, and this image has none. Try another image or the Labels mode.</p>}
      {mode === "quiz" && shownImage.labels.length > 0 && (
        <div className="mt-2 rounded-card border border-panel-border bg-panel p-2.5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
            <span>
              {done}/{nLabels} answered, {right} right
            </span>
            {done === nLabels && <span className="text-good">Section complete</span>}
          </div>
          {label ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="input min-w-0 flex-1"
                style={shake ? { borderColor: "var(--again)" } : undefined}
                placeholder="Name the covered label"
                aria-label="Name the covered label"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="bs-ib" title="Check (Enter)" aria-label="Check answer">
                <Check size={16} aria-hidden />
              </button>
              <button type="button" className="bs-ib" title="Reveal the name" aria-label="Reveal the name" onClick={reveal}>
                <Eye size={16} aria-hidden />
              </button>
            </form>
          ) : (
            <p className="text-xs text-text-dim" role="status">{note || "Click a covered label, then type its name (or reveal it)."}</p>
          )}
        </div>
      )}
    </div>
  );
}
