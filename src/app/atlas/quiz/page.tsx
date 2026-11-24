import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { QuizGame, type QuizItem } from "@/components/atlas/QuizGame";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { fetchAll, loadIndex, resolveCourse } from "@/lib/study/server";
import catalog3 from "../../../../public/atlas3/catalog.json";

/** course structures too broad to "name" from a highlight (the whole cortex, every gyrus, the brain ...) */
const QUIZ_SKIP = new Set(["gyrus", "sulcus", "cortical-ribbon", "cerebral-cortex", "allocortex", "paleocortex", "archicortex", "white-matter", "cerebrospinal-fluid",
  "ventricular-system", "brain", "telencephalon", "prosencephalon", "rhombencephalon", "metencephalon", "commissural-fibers", "projection-fibers",
  "association-fibers", "cerebellar-cortex", "deep-cerebellar-nuclei", "cranial-nerves", "cerebrum", "brainstem", "cerebellum"]);
type Cat3 = { slug: string; ids: number[]; sulcus?: number; area?: number; extra?: boolean; concept?: boolean };
/** what the v3 atlas lights for a course structure, as comparable keys (two structures with the same keys look alike) */
const HIGHLIGHT = new Map<string, string[]>();
for (const it of (catalog3 as { items: Cat3[] }).items) {
  if (it.extra || it.concept || QUIZ_SKIP.has(it.slug)) continue;
  const keys = it.ids.length ? it.ids.map(String) : it.sulcus !== undefined ? [`sulcus:${it.sulcus}`] : it.area !== undefined ? [`area:${it.area}`] : [];
  if (keys.length) HIGHLIGHT.set(it.slug, keys);
}

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
    const hl = HIGHLIGHT.get(s.slug);
    if (!hl) continue; // only structures the 3D atlas shows
    items.push({
      slug: s.slug,
      name: s.canonical_name,
      synonyms: s.synonyms ?? [],
      meshIds: hl,
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
