"use client";
import { RotateCw, TriangleAlert } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell title="Something went wrong" kicker="Error">
      <div className="panel max-w-xl" role="alert">
        <p className="panel-title font-display text-lg"><TriangleAlert aria-hidden />This page could not load</p>
        <p className="mt-2 text-text-dim">Your progress is safe. Try again, and if it keeps happening, use the Feedback button to tell us.</p>
        <div className="toolbar mt-4">
          <Button variant="primary" icon={RotateCw} onClick={reset}>Try again</Button>
          <Button href="/">Home</Button>
        </div>
      </div>
    </PageShell>
  );
}
