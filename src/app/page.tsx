import { HomeDashboard } from "@/components/home/HomeDashboard";
import { Landing } from "@/components/home/Landing";
import { loadActivity, loadCourseView, loadPace, streakOf, todayStr } from "@/lib/home/data";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadUiPrefs } from "@/lib/theme/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  const sb = await createClient();
  if (!viewer || !sb) return <Landing />;
  const [view, days, { prefs }] = await Promise.all([loadCourseView(sb, viewer.id), loadActivity(sb), loadUiPrefs()]);
  const pace = view ? await loadPace(sb, view.course.id) : null;
  const today = todayStr();
  return (
    <HomeDashboard
      name={viewer.displayName}
      view={view}
      days={days}
      today={today}
      streak={streakOf(days, today)}
      pace={pace}
      goal={prefs.dailyGoal}
      showStreaks={view ? view.learner.scaffold.streaks : true}
    />
  );
}
