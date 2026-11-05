import { PageShell } from "@/components/PageShell";

const UNITS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4"];

export default function CoursePage() {
  return (
    <PageShell title="Course map" kicker="Course">
      <div className="grid gap-4 sm:grid-cols-2">
        {UNITS.map((u) => (
          <div key={u} className="panel">
            <h2 className="font-display text-lg">{u}</h2>
            <p className="mt-1 text-sm text-text-dim">Topics and progress will appear here.</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
