import { cookies } from "next/headers";
import { RunLoader } from "@/components/study/RunLoader";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { buildStudyPayload, earlierUnfinished, loadIndex, parseScope, resolveCourse } from "@/lib/study/server";
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
export default async function RunPage({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string; course?: string; more?: string }> }) {
  const sp = await searchParams;
  const limit = Number(sp.limit);
  const scope = sp.scope ?? "all";
  let initial: StudyPayload | null = null;
  let warn: { title: string; scope: string; seenPct: number } | null = null;
  let tz = courseTzOffset();
  try {
    const c = Number((await cookies()).get("tzo")?.value);
    if (Number.isFinite(c) && Math.abs(c) <= 840) tz = c;
    const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
    if (sb && user) {
      const course = await resolveCourse(sb, user.id, sp.course);
      if (course) {
        const sc = parseScope(scope);
        const [payload, idx] = await Promise.all([
          buildStudyPayload(sb, user.id, course, { scope: sc, scopeKey: scope, tzOffsetMin: tz, exclude: new Set(), bootstrap: true, extraNew: Number(sp.more) || 0 }),
          (sc.type === "topic" || sc.type === "unit") && !sp.more ? loadIndex(sb, user.id, course.id) : Promise.resolve(null),
        ]);
        initial = payload;
        warn = idx ? earlierUnfinished(idx, sc) : null;
      }
    }
  } catch {
    initial = null;
  }
  const loader = <RunLoader key={`${scope}|${sp.course ?? ""}|${sp.limit ?? ""}|${sp.more ?? ""}`} scope={scope} more={Number(sp.more) || 0} limit={Number.isFinite(limit) && limit > 0 ? limit : undefined} course={sp.course} initial={initial} />;
  if (!warn) return loader;
  const q = new URLSearchParams({ scope: warn.scope });
  if (sp.course) q.set("course", sp.course);
  return (
    <>
      <div className="banner" role="status" style={{ marginBottom: 12 }}>
        <span>
          Heads-up: <b>{warn.title}</b> comes before this section and is only {warn.seenPct}% seen. The course builds on it, so it usually
          makes sense to finish it first. You can carry on here too.
        </span>
        <span className="btn-row">
          <a className="btn btn-primary" href={`/study/run?${q}`}>Study {warn.title.length > 32 ? "that section" : warn.title} first</a>
        </span>
      </div>
      {loader}
    </>
  );
}
