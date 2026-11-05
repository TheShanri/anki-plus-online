import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { isSupabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/session";

export default async function ProfessorPage() {
  if (isSupabaseConfigured()) {
    const viewer = await getViewer();
    if (!viewer) redirect("/login?next=/professor");
    // RLS is the real gate; this just keeps students out of an empty shell.
    if (!["professor", "ta", "admin"].includes(viewer.role)) redirect("/study");
  }
  return (
    <PageShell title="Professor dashboard" kicker="Staff">
      <div className="grid gap-4 sm:grid-cols-3">
        {["Students", "Active this week", "Avg. time on task"].map((l) => (
          <div key={l} className="panel">
            <p className="label">{l}</p>
            <p className="font-display text-3xl">-</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-text-dim">Per-student progress and time on task will appear here.</p>
    </PageShell>
  );
}
