import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { BrainstemAtlas } from "@/components/atlas/brainstem/BrainstemAtlas";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { resolveCourse } from "@/lib/study/server";

export const metadata = { title: "Brainstem atlas" };
export const dynamic = "force-dynamic";

/** Brainstem in transverse sections, level by level: course images, histology, gross, cartoon and MRI. */
export default async function BrainstemAtlasPage() {
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Brainstem atlas" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/brainstem");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Brainstem atlas" kicker="Atlas"><p className="text-text-dim">Join a course first.</p></PageShell>;
  return (
    <PageShell title="Brainstem atlas" kicker="Atlas">
      <AtlasModes />
      <BrainstemAtlas courseSlug={course.slug} />
    </PageShell>
  );
}
