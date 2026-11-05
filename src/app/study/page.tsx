import { PageShell } from "@/components/PageShell";

export default function StudyPage() {
  return (
    <PageShell title="Today's queue" kicker="Study">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["New", "0", "var(--new-c)"],
          ["Learning", "0", "var(--learn-c)"],
          ["Due", "0", "var(--review-c)"],
        ].map(([label, n, color]) => (
          <div key={label} className="panel">
            <p className="label">{label}</p>
            <p className="font-display text-4xl" style={{ color }}>{n}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-text-dim">The type-the-answer review session will live here.</p>
    </PageShell>
  );
}
