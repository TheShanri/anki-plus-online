"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface PickerGroup {
  title: string;
  items: { slug: string; name: string; hint?: string }[];
}
export interface PickerHandle {
  open: () => void;
}

/** A pathway picker: one button showing the current pathway, a popover with search and groups (ascending, descending, special …). */
export const PathwayPicker = forwardRef<PickerHandle, { groups: PickerGroup[]; value: string; onChange: (slug: string) => void }>(function PathwayPicker({ groups, value, onChange }, ref) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  const current = groups.flatMap((g) => g.items).find((i) => i.slug === value);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => words.every((w) => `${i.name} ${i.hint ?? ""} ${g.title}`.toLowerCase().includes(w))) }))
      .filter((g) => g.items.length);
  }, [groups, q]);
  const flat = shown.flatMap((g) => g.items);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const choose = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={root} className="relative min-w-[220px] flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border border-panel-border bg-panel-solid px-3 text-left text-sm text-text hover:bg-bg-3"
      >
        <span className="min-w-0 flex-1 truncate font-semibold">{current?.name ?? "Pick a pathway"}</span>
        <ChevronDown size={16} aria-hidden className="flex-none text-text-dim" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-[min(420px,calc(100vw-32px))] rounded-sm border border-panel-border bg-panel-solid shadow-lg">
          <div className="flex items-center gap-2 border-b border-panel-border px-2.5">
            <Search size={15} aria-hidden className="flex-none text-text-dim" />
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHi((h) => Math.min(flat.length - 1, h + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHi((h) => Math.max(0, h - 1));
                } else if (e.key === "Enter" && flat[hi]) {
                  e.preventDefault();
                  choose(flat[hi].slug);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search pathways: touch, motor, visual, trigeminal…"
              aria-label="Search pathways"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div role="listbox" aria-label="Pathways" className="max-h-[min(60vh,420px)] overflow-auto py-1">
            {shown.length === 0 && <p className="px-3 py-2 text-sm text-text-dim">No pathway matches.</p>}
            {shown.map((g) => (
              <div key={g.title}>
                <p className="px-3 pb-0.5 pt-2 font-mono text-[10px] uppercase tracking-wider text-text-faint">{g.title}</p>
                {g.items.map((i) => {
                  const idx = flat.indexOf(i);
                  return (
                    <button
                      key={i.slug}
                      type="button"
                      role="option"
                      aria-selected={i.slug === value}
                      onClick={() => choose(i.slug)}
                      onMouseEnter={() => setHi(idx)}
                      className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${i.slug === value ? "bg-accent/15 text-text" : idx === hi && q ? "bg-bg-3 text-text" : "text-text-dim hover:bg-bg-3"}`}
                    >
                      <span className="min-w-0 flex-1">{i.name}</span>
                      {i.hint && <span className="flex-none text-xs text-text-faint">{i.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
