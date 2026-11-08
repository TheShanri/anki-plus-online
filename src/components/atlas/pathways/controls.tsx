"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/* Compact controls for the atlas: 32 px icon buttons with a tooltip (name + shortcut), segmented groups, collapsible panels. */

export function Tip({ label, keys, children, side = "top" }: { label: string; keys?: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-sm border border-panel-border bg-panel-solid px-2 py-1 text-xs text-text opacity-0 shadow transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
      >
        {label}
        {keys && <span className="kbd ml-1.5">{keys}</span>}
      </span>
    </span>
  );
}

export function IconButton({
  label,
  keys,
  icon,
  onClick,
  pressed,
  disabled,
  tone,
  tip = "top",
  size = 32,
}: {
  label: string;
  keys?: string;
  icon: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  tone?: "primary";
  tip?: "top" | "bottom";
  size?: number;
}) {
  return (
    <Tip label={label} keys={keys} side={tip}>
      <button
        type="button"
        aria-label={keys ? `${label} (${keys})` : label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        style={{ width: size, height: size }}
        className={`inline-flex flex-none items-center justify-center rounded-sm border text-text transition-colors disabled:opacity-35 ${
          pressed || tone === "primary" ? "border-accent bg-accent/20 text-text" : "border-panel-border bg-panel-solid/80 hover:bg-bg-3"
        }`}
      >
        {icon}
      </button>
    </Tip>
  );
}

export interface SegOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  tip?: string;
  keys?: string;
  /** Tint of the selected segment (e.g. a side colour). */
  color?: string;
}
/** A joined group of options. `iconOnly` hides the text under 480 px or always. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  big,
  iconOnly,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  label: string;
  big?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-sm border border-panel-border">
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <Tip key={o.id} label={o.tip ?? o.label} keys={o.keys}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              style={on && o.color ? { background: `color-mix(in srgb, ${o.color} 32%, transparent)`, boxShadow: `inset 0 -3px 0 ${o.color}` } : undefined}
              className={`inline-flex items-center justify-center gap-1.5 text-text transition-colors ${big ? "h-11 min-w-[58px] px-3 text-sm font-semibold" : "h-8 min-w-8 px-2 text-xs"} ${i > 0 ? "border-l border-panel-border" : ""} ${on ? (o.color ? "" : "bg-accent/25") : "bg-panel-solid/80 hover:bg-bg-3 text-text-dim"}`}
            >
              {o.icon}
              {!iconOnly && <span className={big ? "" : "max-[420px]:hidden"}>{o.label}</span>}
            </button>
          </Tip>
        );
      })}
    </div>
  );
}

export function Collapsible({ title, icon, defaultOpen = true, badge, children }: { title: string; icon?: ReactNode; defaultOpen?: boolean; badge?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-sm border border-panel-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-text">
        {icon}
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown size={16} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden />
      </button>
      {open && <div className="border-t border-panel-border px-3 py-2">{children}</div>}
    </section>
  );
}

/** A tiny body silhouette (head, trunk, two arms, two legs) used as an icon for the side control. `fill` = which half is solid. */
export function BodyIcon({ fill, size = 20 }: { fill: "L" | "R" | "both"; size?: number }) {
  // viewed from the front: the patient's left is on the viewer's right
  const half = (side: "L" | "R") => (fill === "both" || fill === side ? "currentColor" : "none");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <circle cx="12" cy="4.2" r="2.4" fill={fill === "both" ? "currentColor" : "none"} />
      <path d="M12 8 H7.2 Q6 8 5.8 9.4 L5 15 H7 L7.6 11 H8.6 L8.6 23 H12 Z" fill={half("R")} />
      <path d="M12 8 H16.8 Q18 8 18.2 9.4 L19 15 H17 L16.4 11 H15.4 L15.4 23 H12 Z" fill={half("L")} />
      <path d="M12 8 V23" strokeDasharray="1.6 1.6" opacity="0.7" />
    </svg>
  );
}
