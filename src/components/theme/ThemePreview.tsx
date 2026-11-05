import { BrainSvg } from "./BrainSvg";
import { THEMES, type ThemeId } from "@/lib/theme/themes";

const CELLS = [0, 1, 0, 2, 3, 1, 0, 4, 2, 3, 5, 3, 1, 2, 4, 3, 5, 4];

/** A miniature card rendered with a theme's own tokens (data-theme re-scopes the CSS variables). */
export function ThemePreview({ id, mode = "light" }: { id: ThemeId; mode?: "light" | "dark" }) {
  return (
    <div className="tp" data-theme={id} data-mode={mode} aria-hidden>
      <div className="tp-scene">{id === "synthwave-cortex" && <BrainSvg glow={false} className="tp-brain" />}</div>
      <div className="tp-bar">
        <span className="tp-mark">A+</span>
        <span className="tp-name">{THEMES[id].name}</span>
      </div>
      <div className="tp-body">
        <p className="tp-title">Study now</p>
        <p className="tp-sub">24 cards due</p>
        <div className="tp-row">
          <span className="tp-btn">Start</span>
          <span className="tp-ghost">Course map</span>
        </div>
        <div className="tp-hm">
          {CELLS.map((c, i) => (
            <i key={i} style={{ background: `var(--hm-l${c})` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
