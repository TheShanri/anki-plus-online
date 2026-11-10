import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { PathwayTracer } from "@/components/atlas/pathways/PathwayTracer";
import { Tracer3 } from "@/components/atlas/pathways/v3/Tracer3";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { fetchAll, resolveCourse } from "@/lib/study/server";
import type { CoursePathway, PathwayCard } from "@/lib/atlas/pathways";
import coursePathways from "../../../../content/nsci3250/pathways.json";

export const metadata = { title: "Pathway tracer" };
export const dynamic = "force-dynamic";

/** Pick a pathway and watch its neurons light up in order in the 3D brain: 1st, 2nd, 3rd order, with the decussation marked. */
export default async function PathwaysPage({ searchParams }: { searchParams: Promise<{ p?: string; side?: string; step?: string; limb?: string; v?: string }> }) {
  const sp = await searchParams;
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Pathway tracer" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/pathways");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Pathway tracer" kicker="Atlas"><p className="text-text-dim">Join a course first.</p></PageShell>;

  const [rows, topics] = await Promise.all([
    fetchAll<{ slug: string; topic_id: string | null; content: Record<string, unknown> }>((a, b) =>
      sb.from("cards").select("slug, topic_id, content").eq("course_id", course.id).eq("kind", "pathway").eq("status", "live").order("position").range(a, b),
    ),
    fetchAll<{ id: string; slug: string }>((a, b) => sb.from("topics").select("id, slug").eq("course_id", course.id).range(a, b)),
  ]);
  const topicSlug = new Map(topics.map((t) => [t.id, t.slug]));
  const cards: PathwayCard[] = rows.map((r) => ({
    slug: r.slug,
    pathway: (r.content.pathway as string) ?? null,
    step: (r.content.step as string) ?? null,
    prompt: String(r.content.prompt ?? ""),
    answer: String(r.content.answer ?? ""),
    topic: r.topic_id ? topicSlug.get(r.topic_id) ?? null : null,
  }));

  return (
    <section className="relative left-1/2 w-[min(1760px,calc(100vw-24px))] -translate-x-1/2">
      <h1 className="sr-only">Pathway tracer</h1>
      <AtlasModes />
      {sp.v === "3" ? (
        <Tracer3 courses={coursePathways as unknown as CoursePathway[]} cards={cards} courseSlug={course.slug} initial={sp} />
      ) : (
        <PathwayTracer courses={coursePathways as unknown as CoursePathway[]} cards={cards} initial={sp} />
      )}
    </section>
  );
}
