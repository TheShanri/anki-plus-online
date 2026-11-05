import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ReviewRunner, type Verdict } from "@/components/admin/ReviewRunner";
import type { ReviewCard } from "@/components/admin/CardPreview";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewTopic({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ filter?: string; card?: string }>;
}) {
  const { topic: topicId } = await params;
  const { filter } = await searchParams;
  await requireAdmin(`/admin/review/${topicId}`);
  if (!/^[0-9a-f-]{36}$/.test(topicId)) notFound();
  const db = createAdminClient()!;
  const supabase = (await createClient())!;

  const { data: topic } = await db.from("topics").select("id, title, course_id, courses(code), units(title)").eq("id", topicId).maybeSingle();
  if (!topic) notFound();
  const [cards, latest] = await Promise.all([
    db.from("cards").select("id, slug, kind, status, content, position, structures(canonical_name)").eq("topic_id", topicId).neq("status", "retired").order("position").order("slug"),
    supabase.rpc("review_latest"),
  ]);
  const ids = new Set((cards.data ?? []).map((c) => c.id));
  const initial: Record<string, Verdict> = {};
  for (const r of (latest.data ?? []) as { card_id: string; verdict: "good" | "flag"; note: string | null; resolved_at: string | null }[]) {
    if (ids.has(r.card_id)) initial[r.card_id] = { verdict: r.verdict, note: r.note };
  }
  const list: ReviewCard[] = (cards.data ?? []).map((c) => {
    const s = Array.isArray(c.structures) ? c.structures[0] : c.structures;
    return { id: c.id, slug: c.slug, kind: c.kind, status: c.status, content: (c.content ?? {}) as Record<string, unknown>, structure: s?.canonical_name ?? null };
  });
  const course = Array.isArray(topic.courses) ? topic.courses[0] : topic.courses;
  const unit = Array.isArray(topic.units) ? topic.units[0] : topic.units;
  // Content JSON references media under the course slug (docs/CONTENT_SCHEMA.md): "NSCI3250A" -> "nsci3250".
  const courseSlug = String(course?.code ?? "").toLowerCase().replace(/[a-z]$/, "");

  return (
    <PageShell title={topic.title} kicker={`${unit?.title ?? "Review"}`}>
      <p className="mb-4 text-sm text-text-dim">
        <Link href="/admin/review">All modules</Link> · keys: G good, F flag, arrows or J/K to move.
      </p>
      <ReviewRunner
        cards={list}
        initial={initial}
        courseSlug={courseSlug}
        topicTitle={topic.title}
        initialFilter={filter === "flagged" || filter === "all" ? filter : "unreviewed"}
      />
    </PageShell>
  );
}
