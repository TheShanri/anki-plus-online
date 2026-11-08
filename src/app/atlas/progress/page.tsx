import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { TrophyRoom } from "@/components/achievements/TrophyRoom";
import { buildPayload } from "@/lib/achievements/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { resolveCourse } from "@/lib/study/server";

export const metadata = { title: "Atlas trophy room" };
export const dynamic = "force-dynamic";

/** Rank, streak, daily goal, achievements, per-mode progress and the structure collection. */
export default async function AtlasProgressPage() {
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Trophy room" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/progress");
  const course = await resolveCourse(sb, user.id, null);
  const payload = await buildPayload(sb, user.id, course?.id ?? null, { full: true });
  return (
    <PageShell title="Trophy room" kicker="Atlas">
      <AtlasModes />
      <TrophyRoom initial={payload} />
    </PageShell>
  );
}
