import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { loadCourseContent, resolveCourse } from "@/lib/study/server";

export const dynamic = "force-dynamic";

/** Where a card came from, and whether that is the course's own material (the syllabus) or supplementary. */
const SOURCES: Record<string, { label: string; course: boolean }> = {
  apkg: { label: "Course Anki deck", course: true },
  "pdf-labels": { label: "Lab handout", course: true },
  practical: { label: "Past practical", course: true },
  exam: { label: "Practice exam", course: true },
  slides: { label: "Lecture / lab slides", course: true },
  clinical: { label: "Lecture (clinical)", course: true },
  pathways: { label: "Lecture (pathways)", course: true },
  theory: { label: "Supplementary question", course: false },
};

type CardRow = { id: string; slug: string; kind: string; topic_id: string | null; content: Record<string, unknown> | null };

/**
 * GET /api/atlas/structure/<slug>: the atlas info panel for one curriculum structure. Course material (structure
 * lists, the topics and past exams it appears in, its cards) is kept apart from the supplementary background
 * written for the app (explanation, function/lesion/supply facts, etymology). Members of the course only.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb || !user) return NextResponse.json({ signedIn: false }, { status: 401 });
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return NextResponse.json({ error: "No course" }, { status: 404 });
  const [{ data: s }, content] = await Promise.all([
    sb.from("structures").select("id, slug, canonical_name, synonyms, region, info, unit_id").eq("course_id", course.id).eq("slug", slug).maybeSingle(),
    loadCourseContent(sb, course.id),
  ]);
  if (!s) return NextResponse.json({ error: "Not in this course" }, { status: 404 });

  const { data: rows } = await sb.from("cards").select("id, slug, kind, topic_id, content").eq("course_id", course.id).eq("structure_id", s.id).eq("status", "live").order("position").limit(300);
  const cards = (rows ?? []) as CardRow[];
  const ids = cards.map((c) => c.id);
  const { data: states } = ids.length
    ? await sb.from("card_states").select("card_id, reps, state").eq("user_id", user.id).in("card_id", ids.slice(0, 300))
    : { data: [] as Array<{ card_id: string; reps: number; state: number }> };
  const seen = new Set((states ?? []).filter((x) => x.reps > 0).map((x) => x.card_id));

  const topics = new Map(content.topics.map((t) => [t.id, t]));
  const units = new Map(content.units.map((u) => [u.id, u]));
  const byTopic = new Map<string, { title: string; kind: string; count: number }>();
  const out = cards.map((c) => {
    const ct = c.content ?? {};
    const src = (ct.source as { type?: string; ref?: string } | undefined) ?? {};
    const meta = SOURCES[src.type ?? ""] ?? { label: "Course material", course: true };
    const t = c.topic_id ? topics.get(c.topic_id) : undefined;
    if (t) {
      const e = byTopic.get(t.id) ?? { title: t.title, kind: t.kind, count: 0 };
      e.count++;
      byTopic.set(t.id, e);
    }
    return {
      id: c.id,
      kind: c.kind,
      topic: t?.title ?? null,
      prompt: String(ct.prompt ?? ""),
      answer: String(ct.answer ?? ""),
      image: typeof ct.image === "string" ? ct.image : null,
      source: meta.label,
      fromCourse: meta.course,
      ref: src.ref ?? null,
      studied: seen.has(c.id),
    };
  });
  const info = (s.info ?? {}) as {
    latin?: string | null;
    explanation?: string | null;
    facts?: Record<string, string | null>;
    etymology?: { roots?: Array<{ part: string; lang?: string; meaning: string }>; literal?: string; story?: string } | null;
    lists?: Array<{ unit?: number; lab?: string; group?: string; note?: string | null }>;
  };
  const unit = s.unit_id ? units.get(s.unit_id) : undefined;
  return NextResponse.json(
    {
      signedIn: true,
      course: { slug: course.slug },
      slug: s.slug,
      name: s.canonical_name,
      synonyms: s.synonyms ?? [],
      latin: info.latin ?? null,
      unit: unit ? { slug: unit.slug, title: unit.title } : null,
      lists: info.lists ?? [],
      topics: [...byTopic.values()].sort((a, b) => b.count - a.count),
      onPracticals: out.filter((c) => c.source === "Past practical" || c.source === "Practice exam").length,
      cards: out,
      studied: out.filter((c) => c.studied).length,
      supplementary: { explanation: info.explanation ?? null, facts: info.facts ?? {}, etymology: info.etymology ?? null },
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
