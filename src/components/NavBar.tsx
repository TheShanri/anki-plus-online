import Link from "next/link";
import { LogIn, LogOut, UserPlus } from "lucide-react";
import { Tooltip } from "./ui/Tooltip";
import { getViewer } from "@/lib/session";
import { NavMenu, type NavLinkItem } from "./NavMenu";
import { ThemeCycle } from "./theme/ThemeCycle";

export async function NavBar() {
  const viewer = await getViewer();
  const links: NavLinkItem[] = viewer
    ? [
        { href: "/study", label: "Study", icon: "study" },
        { href: "/course", label: "Course", icon: "course" },
        { href: "/atlas", label: "Atlas", icon: "atlas" },
        { href: "/settings", label: "Settings", icon: "settings" },
      ]
    : [{ href: "/atlas", label: "Atlas", icon: "atlas" }];
  if (viewer && (viewer.role === "professor" || viewer.role === "ta" || viewer.role === "admin")) links.push({ href: "/staff", label: "Staff", icon: "staff" });
  if (viewer?.role === "admin") links.push({ href: "/admin", label: "Admin", icon: "admin" });
  const who = viewer ? viewer.displayName || viewer.email : "";
  return (
    <header className="nav">
      <nav className="nav-inner" aria-label="Main">
        <Link href="/" className="brand no-underline">
          <span className="brand-mark" aria-hidden>A+</span>
          <span className="brand-name">ANKI+ ONLINE</span>
        </Link>
        <NavMenu links={links}>
          <ThemeCycle />
          {viewer ? (
            <form action="/api/auth/logout" method="post" className="nav-user">
              <Link href="/profile" className="nav-profile" title="Your profile">
                <span className="nav-avatar" aria-hidden>{who.trim().charAt(0).toUpperCase()}</span>
                <span className="nav-profile-name">{who}</span>
              </Link>
              <Tooltip label="Log out">
                <button className="btn btn-ghost btn-icon nav-logout" type="submit" aria-label="Log out">
                  <LogOut aria-hidden />
                  <span className="nav-logout-label">Log out</span>
                </button>
              </Tooltip>
            </form>
          ) : (
            <div className="nav-user">
              <Link href="/login" className="btn btn-ghost"><LogIn aria-hidden />Log in</Link>
              <Link href="/join" className="btn btn-primary"><UserPlus aria-hidden />Join</Link>
            </div>
          )}
        </NavMenu>
      </nav>
    </header>
  );
}
