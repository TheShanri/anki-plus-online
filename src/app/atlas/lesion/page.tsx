import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { LesionLab } from "@/components/atlas/pathways/LesionLab";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { fetchAll, resolveCourse } from "@/lib/study/server";
import type { ClinicalCard, CoursePathway } from "@/lib/atlas/pathways";
import coursePathways from "../../../../content/nsci3250/pathways.json";

export const metadata = { title: "Lesion lab" };
export const dynamic = "force-dynamic";

/** Place a lesion and see which pathways it cuts and the predicted deficits; or read a case and find the lesion. */
export default async function LesionPage({ searchParams }: { searchParams: Promise<{ site?: string; side?: string; cord?: string; mode?: string }> }) {
  const sp = await searchParams;
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Lesion lab" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/lesion");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Lesion lab" kicker="Atlas"><p className="text-text-dim">Join a course first.</p></PageShell>;

  const rows = await fetchAll<{ slug: string; content: Record<string, unknown> }>((a, b) =>
    sb.from("cards").select("slug, content").eq("course_id", course.id).eq("kind", "clinical").eq("status", "live").order("position").range(a, b),
  );
  const clinical: ClinicalCard[] = rows
    .filter((r) => typeof r.content.vignette === "string")
    .map((r) => ({ slug: r.slug, vignette: String(r.content.vignette), prompt: String(r.content.prompt ?? ""), answer: String(r.content.answer ?? "") }));

  return (
    <PageShell title="Lesion lab" kicker="Atlas">
      <AtlasModes />
      <LesionLab courses={coursePathways as unknown as CoursePathway[]} clinical={clinical} initial={sp} />
    </PageShell>
  );
}
