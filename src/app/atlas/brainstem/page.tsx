import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { BrainstemAtlas } from "@/components/atlas/brainstem/BrainstemAtlas";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { resolveCourse } from "@/lib/study/server";
import { loadBrainstemMastery } from "@/lib/brainstem/mastery-server";
import { BRAINSTEM_REGIONS } from "@/lib/study/mastery";
import { getPlate } from "@/lib/brainstem/plates";

export const metadata = { title: "Brainstem atlas" };
export const dynamic = "force-dynamic";

/** The brainstem level by level: one clean plate per level, and the mastery path through them. */
export default async function BrainstemAtlasPage({ searchParams }: { searchParams: Promise<{ level?: string; view?: string }> }) {
  const { level, view } = await searchParams;
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Brainstem atlas" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/brainstem");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Brainstem atlas" kicker="Atlas"><p className="text-text-dim">Join a course first.</p></PageShell>;
  const mastery = await loadBrainstemMastery(sb, user.id, course.id);
  // levels that have a plate (with mapped regions): the 8 course levels; the isthmus (not a course level) has none
  const plateLevels = Object.keys(BRAINSTEM_REGIONS).filter((l) => (getPlate(l)?.regions.length ?? 0) > 0);
  return (
    <PageShell title="Brainstem atlas" kicker="Atlas">
      <AtlasModes />
      <BrainstemAtlas courseSlug={course.slug} mastery={mastery} plateLevels={plateLevels} initialLevel={level && /^[a-z0-9-]+$/.test(level) ? level : undefined} initialView={view === "3d" ? "3d" : undefined} />
    </PageShell>
  );
}
