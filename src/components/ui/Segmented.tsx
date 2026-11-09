"use client";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon; title?: string; disabled?: boolean };

/** Radio group drawn as a segmented control. Arrow keys move the selection; Tab leaves the group.
 * `iconOnly` hides the labels visually (they stay as the accessible name and tooltip). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  iconOnly,
  block,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  /** accessible name of the group */
  label: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
  /** stretch to the full width, options share it equally */
  block?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => {
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    window.requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(next.value)}"]`)?.focus());
  };
  return (
    <div
      ref={box}
      role="radiogroup"
      aria-label={label}
      className={["seg", className].filter(Boolean).join(" ")}
      data-size={size}
      data-block={block || undefined}
      data-icons={iconOnly ? "only" : undefined}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-v={o.value} tabIndex={on ? 0 : -1} disabled={o.disabled} title={o.title ?? (iconOnly ? o.label : undefined)} onClick={() => onChange(o.value)}>
            {Icon && <Icon aria-hidden />}
            <span className={iconOnly ? "sr-only" : undefined}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
