"use client";
import type { LucideIcon } from "lucide-react";

/** 32 px icon button with a tooltip: "Name (shortcut)". */
export function IconBtn({ icon: Icon, label, keys, onClick, pressed, disabled, className }: { icon: LucideIcon; label: string; keys?: string; onClick: () => void; pressed?: boolean; disabled?: boolean; className?: string }) {
  const tip = keys ? `${label} (${keys})` : label;
  return (
    <button type="button" className={`bs-ib${className ? " " + className : ""}`} title={tip} aria-label={tip} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <Icon size={16} aria-hidden />
    </button>
  );
}

export function shapeStyle(s: import("@/lib/study/types").Shape): React.CSSProperties {
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
  return { left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`, borderRadius: s.shape === "ellipse" ? "50%" : undefined };
}
