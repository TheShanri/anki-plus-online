import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BugsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("/admin/bugs");
  const { status } = await searchParams;
  const db = createAdminClient()!;
  let q = db
    .from("bug_reports")
    .select("id, created_at, route, description, status, screenshot_path, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "open" || status === "fixed" || status === "dismissed") q = q.eq("status", status);
  const { data } = await q;
  return (
    <PageShell title="Bug reports" kicker="Owner">
      <div className="mb-4 flex flex-wrap gap-2">
        {[undefined, "open", "fixed", "dismissed"].map((s) => (
          <Link key={s ?? "all"} href={s ? `/admin/bugs?status=${s}` : "/admin/bugs"} className={`btn ${status === s ? "btn-primary" : ""}`}>{s ?? "all"}</Link>
        ))}
        <Link href="/admin" className="btn">Admin</Link>
      </div>
      {!data?.length && <p className="panel text-text-dim">No reports.</p>}
      <ul className="space-y-2">
        {(data ?? []).map((b) => {
          const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
          return (
            <li key={b.id} className="panel text-sm">
              <Link href={`/admin/bugs/${b.id}`}>{b.description || "(no description)"}</Link>
              <p className="text-text-faint">
                {new Date(b.created_at).toLocaleString()} · {b.route} · {p?.display_name ?? "anonymous"} · {b.status}{b.screenshot_path ? " · screenshot" : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
