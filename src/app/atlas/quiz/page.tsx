import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { QuizGame, type QuizItem } from "@/components/atlas/QuizGame";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { fetchAll, loadIndex, resolveCourse } from "@/lib/study/server";
import { atlasTargetForSlug } from "@/lib/atlas/catalog";

export const metadata = { title: "Atlas quiz" };
export const dynamic = "force-dynamic";

/** Name-that-structure: a 3D highlight, the student names it. Pool: everything, chosen units, or what they've studied. */
export default async function AtlasQuizPage() {
  const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!sb) return <PageShell title="Atlas quiz" kicker="Atlas"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  if (!user) redirect("/login?next=/atlas/quiz");
  const course = await resolveCourse(sb, user.id, null);
  if (!course) return <PageShell title="Atlas quiz" kicker="Atlas"><p className="text-text-dim">Join a course first.</p></PageShell>;

  const [idx, structs] = await Promise.all([
    loadIndex(sb, user.id, course.id),
    fetchAll<{ id: string; slug: string; canonical_name: string; synonyms: string[] | null; unit_id: string | null; region: string | null }>((a, b) =>
      sb.from("structures").select("id, slug, canonical_name, synonyms, unit_id, region").eq("course_id", course.id).order("slug").range(a, b),
    ),
  ]);
  // studied = at least one of its cards has been answered
  const studied = new Set<string>();
  for (const c of idx.cards) if (c.structure_id && (idx.states.get(c.id)?.reps ?? 0) > 0) studied.add(c.structure_id);
  const units = idx.units.slice().sort((a, b) => a.position - b.position);
  const unitSlug = new Map(units.map((u) => [u.id, u.slug]));

  const items: QuizItem[] = [];
  for (const s of structs) {
    const t = atlasTargetForSlug(s.slug);
    if (!t || !t.ids.length || t.approximate) continue; // only structures the 3D model shows exactly
    items.push({
      slug: s.slug,
      name: s.canonical_name,
      synonyms: s.synonyms ?? [],
      meshIds: t.ids,
      unit: s.unit_id ? unitSlug.get(s.unit_id) ?? null : null,
      region: s.region,
      studied: studied.has(s.id),
    });
  }
  const names = structs.map((s) => ({ slug: s.slug, canonical_name: s.canonical_name, synonyms: s.synonyms ?? [] }));

  return (
    <PageShell title="Name that structure" kicker="Atlas quiz">
      <AtlasModes />
      <QuizGame items={items} names={names} units={units.map((u) => ({ slug: u.slug, title: u.title }))} />
    </PageShell>
  );
}
