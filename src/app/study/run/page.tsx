import { cookies } from "next/headers";
import { RunLoader } from "@/components/study/RunLoader";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { buildStudyPayload, parseScope, resolveCourse } from "@/lib/study/server";
import type { StudyPayload } from "@/lib/study/types";

export const metadata = { title: "Study" };

/** Minutes behind UTC in the course's timezone (UVM), like Date#getTimezoneOffset: the fallback for "today". */
function courseTzOffset(now = new Date()): number {
  const at = (tz: string) => new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime();
  return Math.round((at("UTC") - at("America/New_York")) / 60000);
}

/**
 * The first batch is built here, on the server, so the session starts with the page (no extra round trip after
 * the JavaScript loads). The browser's own timezone comes from the `tzo` cookie RunLoader sets; the first visit
 * uses the course's. If anything fails, RunLoader fetches the batch itself as before.
 */
export default async function RunPage({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string; course?: string }> }) {
  const sp = await searchParams;
  const limit = Number(sp.limit);
  const scope = sp.scope ?? "all";
  let initial: StudyPayload | null = null;
  let tz = courseTzOffset();
  try {
    const c = Number((await cookies()).get("tzo")?.value);
    if (Number.isFinite(c) && Math.abs(c) <= 840) tz = c;
    const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
    if (sb && user) {
      const course = await resolveCourse(sb, user.id, sp.course);
      if (course) initial = await buildStudyPayload(sb, user.id, course, { scope: parseScope(scope), scopeKey: scope, tzOffsetMin: tz, exclude: new Set(), bootstrap: true });
    }
  } catch {
    initial = null;
  }
  return <RunLoader key={`${scope}|${sp.course ?? ""}|${sp.limit ?? ""}`} scope={scope} limit={Number.isFinite(limit) && limit > 0 ? limit : undefined} course={sp.course} initial={initial} />;
}
