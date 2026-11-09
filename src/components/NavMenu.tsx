"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Brain, GraduationCap, Map as MapIcon, Menu, Settings, ShieldCheck, Users, X, type LucideIcon } from "lucide-react";
import { OPEN_ATLAS_EVENT, studySessionOpen } from "@/lib/atlas/events";

export interface NavLinkItem {
  href: string;
  label: string;
  /** a key of NAV_ICONS (icons are looked up here because components cannot cross the server/client boundary) */
  icon?: keyof typeof NAV_ICONS;
}

const NAV_ICONS: Record<string, LucideIcon> = { study: GraduationCap, course: MapIcon, atlas: Brain, settings: Settings, staff: Users, admin: ShieldCheck, home: BookOpen };

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
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      <div id="nav-collapse" className="nav-collapse" data-open={open}>
        <div className="nav-links">
          {links.map((l) => {
            const on = path === l.href || path.startsWith(l.href + "/");
            const Icon = l.icon ? NAV_ICONS[l.icon] : null;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="nav-link"
                aria-current={on ? "page" : undefined}
                onClick={(e) => {
                  // during a study session the atlas opens over the cards instead of leaving them
                  if (l.href === "/atlas" && studySessionOpen() && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    setOpen(false);
                    window.dispatchEvent(new Event(OPEN_ATLAS_EVENT));
                  }
                }}
              >
                {Icon && <Icon aria-hidden />}
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
