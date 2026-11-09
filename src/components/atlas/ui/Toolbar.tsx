"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./atlas-ui.css";

/** Name plus shortcut, shown in the tooltip and read by screen readers. */
export const tipText = (name: string, key?: string) => (key ? `${name} (${key})` : name);

export function IconBtn({
  icon,
  label,
  keys,
  on,
  onClick,
  disabled,
  text,
  below,
  radio,
  className,
}: {
  icon?: ReactNode;
  label: string;
  keys?: string;
  on?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Small mono text next to the icon. */
  text?: string;
  below?: boolean;
  radio?: boolean;
  className?: string;
}) {
  const t = tipText(label, keys);
  return (
    <button
      type="button"
      role={radio ? "radio" : undefined}
      aria-label={t}
      aria-pressed={radio ? undefined : on}
      aria-checked={radio ? !!on : undefined}
      data-tip={t}
      data-on={on ? "true" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`atl-btn ${below ? "atl-below" : ""} ${className ?? ""}`}
    >
      {icon}
      {text && <span className="atl-lbl">{text}</span>}
    </button>
  );
}

export const Divider = () => <span className="atl-div" aria-hidden="true" />;

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="atl-grp" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Popover menu anchored under (or over) its trigger; closes on outside click or Escape. */
export function Popover({
  trigger,
  children,
  up = true,
  align = "left",
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  up?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className="atl-pop atl-card-in" style={{ [up ? "bottom" : "top"]: "calc(100% + 6px)", [align]: 0 }} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ label, keys, on, onClick }: { label: string; keys?: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={!!on} className="atl-item" onClick={onClick}>
      <span>{label}</span>
      {keys && <kbd>{keys}</kbd>}
    </button>
  );
}

/** Small segmented control (3D / MRI, MRI views). Radios with icons and tooltips. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  below,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; icon?: ReactNode; text?: string; keys?: string; /** greyed: not available for this selection (stays clickable) */ dim?: boolean; /** tooltip override, e.g. "Not in the MRI atlas" */ note?: string }[];
  label: string;
  below?: boolean;
}) {
  return (
    <div className="atl-seg" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <IconBtn key={it.id} radio below={below} on={value === it.id} icon={it.icon} text={it.text} label={it.note ?? it.label} keys={it.keys} className={it.dim ? "atl-dim" : undefined} onClick={() => onChange(it.id)} />
      ))}
    </div>
  );
}
