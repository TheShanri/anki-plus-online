"use client";
// Multi-box answers: one TypeBox per part, stacked, with a "1 of 3" label and the chip of what the box has narrowed to.
import type { Current, StudyEngine } from "@/lib/study/engine";
import { TypeBox } from "./TypeBox";

export function PartInputs({
  engine,
  c,
  refs,
  onKeys,
}: {
  engine: StudyEngine;
  c: Current;
  refs: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onKeys: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const m = c.multi;
  if (!m) return null;
  const n = m.count;
  return (
    <div className="part-inputs" role="group" aria-label={`${n} separate answers`}>
      <p className="part-rule">{n} separate answers{m.ordered ? ", in this order" : ", in any order"}</p>
      {m.boxes.map((t, i) => {
        const chip = m.chip(i);
        const live = i === m.active;
        return (
          <div key={i} className={`part-row${live ? " active" : ""}`}>
            <div className="part-head">
              <span className="part-label">{i + 1} of {n}</span>
              {chip && <span className={`part-chip ${chip.kind}`} aria-live="polite">{chip.kind === "done" ? "✓ " : chip.kind === "one" ? "→ " : ""}{chip.text}</span>}
            </div>
            <TypeBox
              ref={(el) => {
                refs.current[i] = el;
              }}
              typer={t}
              label={`Answer ${i + 1} of ${n}`}
              blind={live ? c.guard?.blindView() ?? null : null}
              trapLevel={live ? c.guard?.armedLevel ?? 0 : 0}
              gated={live ? c.guard?.gateActive(engine.deps.now()) ?? false : false}
              drifting={engine.drift > 0}
              placeholder={c.isFirstLook ? "Know it? Type it" : "Type one of the answers…"}
              onChange={(v) => engine.inputBox(i, v)}
              onBeforeInput={(e) => {
                if (engine.gateBlocks()) e.preventDefault();
              }}
              onKeyDown={(e) => onKeys(i, e)}
              onFocus={() => engine.focusBox(i)}
            />
          </div>
        );
      })}
    </div>
  );
}
