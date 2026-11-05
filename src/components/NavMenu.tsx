"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export interface NavLinkItem {
  href: string;
  label: string;
}

/** Nav links with the current page marked, collapsing into a menu on phones. `children` is the account area. */
export function NavMenu({ links, children }: { links: NavLinkItem[]; children?: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(t);
  }, [path]);
  return (
    <>
      <button type="button" className="nav-toggle icon-btn" aria-expanded={open} aria-controls="nav-collapse" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div id="nav-collapse" className="nav-collapse" data-open={open}>
        <div className="nav-links">
          {links.map((l) => {
            const on = path === l.href || path.startsWith(l.href + "/");
            return (
              <Link key={l.href} href={l.href} className="nav-link" aria-current={on ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="nav-account">{children}</div>
      </div>
    </>
  );
}
