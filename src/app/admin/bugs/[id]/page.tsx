import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { BugStatus } from "@/components/admin/BugStatus";
import { requireAdmin } from "@/lib/auth/guard";
import type { LogEntry } from "@/lib/bugs/logger";
import { createAdminClient } from "@/lib/supabase/admin";

function Logs({ title, entries, base }: { title: string; entries: LogEntry[]; base: number }) {
  return (
    <section className="panel mb-4">
      <h2 className="mb-2 font-display text-base">{title} ({entries.length})</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-text-dim">Nothing recorded.</p>
      ) : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-card-sm bg-bg-2 p-3 text-xs">
          {entries.map((e) => `${((e.t - base) / 1000).toFixed(1).padStart(7)}s  ${e.k.padEnd(9)} ${e.m}${e.d !== undefined ? "  " + JSON.stringify(e.d) : ""}`).join("\n")}
        </pre>
      )}
    </section>
  );
}

export default async function BugDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/bugs/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdminClient()!;
  const { data: b } = await db.from("bug_reports").select("*, profiles(display_name, email)").eq("id", id).maybeSingle();
  if (!b) notFound();
  let shotUrl: string | null = null;
  if (b.screenshot_path) {
    const { data } = await db.storage.from("bug-reports").createSignedUrl(b.screenshot_path, 600);
    shotUrl = data?.signedUrl ?? null;
  }
  const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
  const before = (b.logs_before ?? []) as LogEntry[];
  const after = (b.logs_after ?? []) as LogEntry[];
  const base = before.length ? before[before.length - 1].t : new Date(b.created_at).getTime();
  return (
    <PageShell title="Bug report" kicker={new Date(b.created_at).toLocaleString()}>
      <p className="mb-4 text-sm"><Link href="/admin/bugs">All reports</Link></p>
      <div className="panel mb-4 space-y-1 text-sm">
        <p className="text-lg">{b.description || "(no description)"}</p>
        <p className="text-text-dim">{b.route} · {p ? `${p.display_name} (${p.email})` : "anonymous"} · {b.status}</p>
        <p className="font-mono text-xs text-text-faint">{b.id}</p>
        <BugStatus id={b.id} status={b.status} note={b.resolved_note ?? ""} />
      </div>
      {shotUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shotUrl} alt="Screenshot at the time of the report" className="mb-4 max-w-full rounded-card-sm border border-panel-border" />
      )}
      <section className="panel mb-4">
        <h2 className="mb-2 font-display text-base">App state</h2>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(b.app_state, null, 2)}</pre>
      </section>
      <Logs title="Before the report (time relative to the report)" entries={before} base={base} />
      <Logs title="After the report" entries={after} base={base} />
    </PageShell>
  );
}
