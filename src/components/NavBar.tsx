import Link from "next/link";
import { getViewer } from "@/lib/session";

const LINKS = [
  { href: "/study", label: "Study" },
  { href: "/course", label: "Course" },
  { href: "/atlas", label: "Atlas" },
  { href: "/settings", label: "Settings" },
];

export async function NavBar() {
  const viewer = await getViewer();
  return (
    <header
      className="sticky top-0 z-10 border-b border-panel-border bg-bg-2"
      style={{ height: "var(--topbar-h)" }}
    >
      <nav className="mx-auto flex h-full max-w-5xl items-center gap-5 px-5">
        <Link href="/" className="font-display text-sm tracking-[0.2em] text-accent">
          ANKI+ ONLINE
        </Link>
        <div className="flex flex-1 items-center gap-4 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-text-dim hover:text-text">
              {l.label}
            </Link>
          ))}
          {viewer && (viewer.role === "professor" || viewer.role === "ta" || viewer.role === "admin") && (
            <Link href="/professor" className="text-text-dim hover:text-text">
              Professor
            </Link>
          )}
        </div>
        {viewer ? (
          <form action="/api/auth/logout" method="post" className="flex items-center gap-3 text-sm">
            <span className="text-text-dim">{viewer.displayName || viewer.email}</span>
            <button className="btn" type="submit">Log out</button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn">Log in</Link>
            <Link href="/join" className="btn btn-primary">Join</Link>
          </div>
        )}
      </nav>
    </header>
  );
}
