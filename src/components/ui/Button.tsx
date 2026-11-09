import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/** The class string for a button, for places that need a bare `<a>` or `<summary>` to look like one. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return ["btn", variant !== "secondary" && `btn-${variant}`, size !== "md" && `btn-${size}`, extra].filter(Boolean).join(" ");
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** leading icon, e.g. `icon={Play}` */
  icon?: LucideIcon;
  /** trailing icon, e.g. an arrow */
  iconRight?: LucideIcon;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
};
type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & { href?: undefined };
type AsLink = Common & { href: string; prefetch?: boolean; target?: string; rel?: string; "aria-label"?: string; title?: string };

/** One button for the whole app. Pass `href` and it renders a Next link with the same look. */
export function Button(props: AsButton | AsLink) {
  const { variant = "secondary", size = "md", icon: Icon, iconRight: IconR, loading, className, children } = props;
  const cls = buttonClass(variant, size, className);
  const inner = (
    <>
      {loading ? <Loader2 className="btn-spin" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {children != null && children !== false && <span className="btn-label">{children}</span>}
      {IconR && <IconR aria-hidden />}
    </>
  );
  if (props.href !== undefined) {
    const { href, prefetch, target, rel } = props;
    return (
      <Link href={href} prefetch={prefetch} target={target} rel={rel} className={cls} aria-label={props["aria-label"]} title={props.title}>
        {inner}
      </Link>
    );
  }
  const { variant: _v, size: _s, icon: _i, iconRight: _r, loading: _l, className: _c, children: _ch, type = "button", disabled, ...rest } = props as AsButton;
  void [_v, _s, _i, _r, _l, _c, _ch];
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
}
