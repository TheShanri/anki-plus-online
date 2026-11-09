import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "danger" | "info";

/** Small status label. `solid` fills it; the default is a tinted outline. */
export function Badge({ tone = "neutral", icon: Icon, solid, children, className }: { tone?: BadgeTone; icon?: LucideIcon; solid?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={["badge", className].filter(Boolean).join(" ")} data-tone={tone} data-solid={solid || undefined}>
      {Icon && <Icon aria-hidden />}
      {children}
    </span>
  );
}
