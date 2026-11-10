import { Compass, Home } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <PageShell title="Page not found" kicker="404">
      <div className="panel max-w-xl">
        <p className="panel-title font-display text-lg"><Compass aria-hidden />That page is not on the map</p>
        <p className="mt-2 text-text-dim">The link may be old, or the address mistyped. Head back to your dashboard or the course map.</p>
        <div className="toolbar mt-4">
          <Button href="/" variant="primary" icon={Home}>Home</Button>
          <Button href="/course">Course map</Button>
        </div>
      </div>
    </PageShell>
  );
}
