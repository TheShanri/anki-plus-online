import { NextResponse } from "next/server";
import { authed, bad } from "@/lib/study/api";
import { fetchAll, loadIndex, resolveCourse } from "@/lib/study/server";
import { computeStrength } from "./compute";

export const dynamic = "force-dynamic";

/** GET /api/atlas/strength: how well the signed-in student knows each structure (FSRS state of its cards, via RLS). */
export async function GET() {
  const a = await authed();
  if (!a.ok) return a.res;
  const { sb, userId } = a.ctx;
  const course = await resolveCourse(sb, userId, null);
  if (!course) return bad("No course", 404);
  try {
    const [idx, structs] = await Promise.all([
      loadIndex(sb, userId, course.id),
      fetchAll<{ id: string; slug: string; canonical_name: string }>((x, y) =>
        sb.from("structures").select("id, slug, canonical_name").eq("course_id", course.id).order("slug").range(x, y),
      ),
    ]);
    const now = new Date();
    return NextResponse.json(
      { generatedAt: now.toISOString(), course: course.code, structures: computeStrength(idx, structs, now) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not compute strength", 500);
  }
}
