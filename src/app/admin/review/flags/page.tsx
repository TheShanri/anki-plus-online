import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ResolveButton } from "@/components/admin/ResolveButton";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function FlagsPage() {
  await requireAdmin("/admin/review/flags");
  const db = createAdminClient()!;
  const supabase = (await createClient())!;
  const { data: latest } = await supabase.rpc("review_latest");
  const open = ((latest ?? []) as { card_id: string; verdict: string; note: string | null; created_at: string; resolved_at: string | null; review_id: string }[])
    .filter((r) => r.verdict === "flag" && !r.resolved_at);
  const ids = open.map((r) => r.card_id);
  const { data: cards } = ids.length
    ? await db.from("cards").select("id, slug, kind, topic_id, topics(id, title), content").in("id", ids)
    : { data: [] };
  const byId = new Map((cards ?? []).map((c) => [c.id, c]));
  return (
    <PageShell title="Open flags" kicker="Content review">
      <p className="mb-4 text-sm text-text-dim"><Link href="/admin/review">All modules</Link> · {open.length} open</p>
      {open.length === 0 && <p className="panel text-text-dim">No open flags.</p>}
      <ul className="space-y-3">
        {open.map((r) => {
          const c = byId.get(r.card_id);
          const t = c && (Array.isArray(c.topics) ? c.topics[0] : c.topics);
          const content = (c?.content ?? {}) as { prompt?: string; answer?: string };
          return (
            <li key={r.review_id} className="panel text-sm">
              <p className="font-mono text-xs text-text-faint">{c?.slug} · {c?.kind} · {t ? <Link href={`/admin/review/${t.id}?filter=flagged`}>{t.title}</Link> : "no topic"}</p>
              <p className="mt-1">{content.prompt} <b>→ {content.answer}</b></p>
              <p className="mt-2 text-again">Note: {r.note}</p>
              <div className="mt-2"><ResolveButton reviewId={r.review_id} /></div>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
