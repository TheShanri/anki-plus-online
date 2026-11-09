import type { ReactNode } from "react";

/** CSS-only tooltip: shows on hover and keyboard focus of anything inside. Keep the label short (a word or two).
 * The wrapped control still needs its own accessible name; this is a visual hint. */
export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="tip" data-tip={label} data-side={side}>
      {children}
    </span>
  );
}
