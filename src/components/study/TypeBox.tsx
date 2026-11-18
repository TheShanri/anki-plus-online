"use client";
import { forwardRef, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Typer } from "@/lib/study/typer";
import type { BlindView } from "@/lib/study/trapguard";

export interface TypeBoxProps {
  typer: Typer;
  blind?: BlindView | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** trap level armed right now (0 = none) */
  trapLevel?: number;
  gated?: boolean;
  drifting?: boolean;
  onChange: (value: string) => void;
  onBeforeInput?: (e: React.FormEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  label: string;
}

/** Re-renders its children on every keystroke (engine.keyed) without re-rendering the card around it. */
export function Live({ engine, children }: { engine: { subscribeKeys(fn: () => void): () => void; keyVersion: number }; children: () => ReactNode }) {
  useSyncExternalStore(
    (cb) => engine.subscribeKeys(cb),
    () => engine.keyVersion,
    () => 0,
  );
  return <>{children()}</>;
}

/** The answer box: typed letters (green/red), a caret, then ghost letters. A transparent input sits on top so phones get their keyboard. */
export const TypeBox = forwardRef<HTMLInputElement, TypeBoxProps>(function TypeBox(p, ref) {
  const t = p.typer;
  const v = t.typed;
  const g = v.length && t.state === "match" ? "" : t.ghost();
  const cut = t.chunked && g ? g.indexOf(" ") : -1;
  const first = cut >= 0 ? g.slice(0, cut + 1) : g;
  const later = cut >= 0 ? g.slice(cut + 1) : "";
  const b = p.blind;
  const state = b ? "track" : t.state;
  // a letter just went wrong: a short shake (compositor-only; none with reduced motion, see study.css)
  const boxRef = useRef<HTMLDivElement>(null);
  const prevState = useRef(state);
  useEffect(() => {
    const el = boxRef.current;
    if (el && state === "bad" && prevState.current !== "bad") {
      el.classList.remove("nudge-bad");
      void el.offsetWidth;
      el.classList.add("nudge-bad");
    }
    prevState.current = state;
  }, [state, v]);
  const cls = ["typebox", `state-${state}`, t.done ? "kw-done" : "", p.trapLevel ? `trap-armed trap-l${p.trapLevel}` : "", p.gated ? "gated" : "", p.drifting ? "drifting" : "", p.className ?? ""].filter(Boolean).join(" ");
  return (
    <div ref={boxRef} className={cls} data-state={state} onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {b ? (
        <>
          <span className="t-ok">{b.okText}</span>
          <span className="t-dots">{"•".repeat(b.dots)}</span>
          <span className="caret" />
          <span className="ghost slots">{"_".repeat(b.slots)}</span>
        </>
      ) : (
        <>
          <span className="t-ok">{v.slice(0, t.typedOk)}</span>
          <span className="t-bad">{v.slice(t.typedOk)}</span>
          <span className="caret" />
          <span className="ghost">{first}</span>
          <span className="ghost" style={{ opacity: 0.55 }}>{later}</span>
          {!v.length && !g && <span className="placeholder">{p.placeholder ?? "Type the answer…"}</span>}
        </>
      )}
      <input
        ref={ref}
        className="typebox-input"
        value={v}
        disabled={p.disabled}
        aria-label={p.label}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(e) => p.onChange(e.target.value)}
        onBeforeInput={p.onBeforeInput}
        onKeyDown={p.onKeyDown}
        onFocus={p.onFocus}
      />
    </div>
  );
});
