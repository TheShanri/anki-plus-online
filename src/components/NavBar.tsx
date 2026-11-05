import Link from "next/link";
import { getViewer } from "@/lib/session";
import { NavMenu, type NavLinkItem } from "./NavMenu";
import { ThemeCycle } from "./theme/ThemeCycle";

export async function NavBar() {
  const viewer = await getViewer();
  const links: NavLinkItem[] = viewer
    ? [
        { href: "/study", label: "Study" },
        { href: "/course", label: "Course" },
        { href: "/atlas", label: "Atlas" },
        { href: "/settings", label: "Settings" },
      ]
    : [{ href: "/atlas", label: "Atlas" }];
  if (viewer && (viewer.role === "professor" || viewer.role === "ta" || viewer.role === "admin")) links.push({ href: "/staff", label: "Staff" });
  if (viewer?.role === "admin") links.push({ href: "/admin", label: "Admin" });
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
              <Link href="/profile" className="nav-profile">{viewer.displayName || viewer.email}</Link>
              <button className="btn" type="submit">Log out</button>
            </form>
          ) : (
            <div className="nav-user">
              <Link href="/login" className="btn">Log in</Link>
              <Link href="/join" className="btn btn-primary">Join</Link>
            </div>
          )}
        </NavMenu>
      </nav>
    </header>
  );
}
