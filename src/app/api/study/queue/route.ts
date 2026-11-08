import { NextResponse, type NextRequest } from "next/server";
import { authed, bad } from "@/lib/study/api";
import { buildStudyPayload, parseScope, resolveCourse } from "@/lib/study/server";

export const dynamic = "force-dynamic";

/** GET /api/study/queue?scope=all|unit:<slug>|topic:<slug>|weak&course=<id|code>&tz=<minutes>&exclude=a,b&bootstrap=1 */
export async function GET(req: NextRequest) {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const p = req.nextUrl.searchParams;
  const course = await resolveCourse(sb, userId, p.get("course"));
  if (!course) return bad("No course", 404);
  const scopeKey = p.get("scope") ?? "all";
  const tz = Number(p.get("tz") ?? 0);
  const exclude = new Set((p.get("exclude") ?? "").split(",").filter(Boolean));
  try {
    const payload = await buildStudyPayload(sb, userId, course, {
      scope: parseScope(scopeKey),
      scopeKey,
      tzOffsetMin: Number.isFinite(tz) ? tz : 0,
      exclude,
      bootstrap: p.get("bootstrap") === "1",
      extraNew: Number(p.get("more") ?? 0) || 0,
    });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not build the queue", 500);
  }
}
