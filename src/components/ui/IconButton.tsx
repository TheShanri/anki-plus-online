import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Tooltip } from "./Tooltip";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  icon: LucideIcon;
  /** required: the accessible name, also shown as the tooltip */
  label: string;
  variant?: "ghost" | "secondary" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
  active?: boolean;
  side?: "top" | "bottom";
};

/** Icon-only button with a tooltip. */
export function IconButton({ icon: Icon, label, variant = "ghost", size = "md", active, side, className, type = "button", ...rest }: Props) {
  const cls = ["btn", "btn-icon", variant !== "secondary" && `btn-${variant}`, size !== "md" && `btn-${size}`, className].filter(Boolean).join(" ");
  return (
    <Tooltip label={label} side={side}>
      <button type={type} className={cls} aria-label={label} aria-pressed={active} {...rest}>
        <Icon aria-hidden />
      </button>
    </Tooltip>
  );
}
