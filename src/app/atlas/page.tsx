import { PageShell } from "@/components/PageShell";
import { AtlasAttribution } from "@/components/atlas/AtlasAttribution";
import { AtlasBrowser } from "@/components/atlas/AtlasBrowser";

export const metadata = { title: "3D atlas" };

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; n?: string; view?: string; add?: string; nb?: string }>;
}) {
  const { s, n, view, add, nb } = await searchParams;
  return (
    <PageShell title="3D atlas" kicker="Atlas">
      <AtlasBrowser initialS={s} initialN={n} initialView={view} initialAdd={add} initialNb={nb} />
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg tracking-wide">Credits and licence</h2>
        <AtlasAttribution />
      </section>
    </PageShell>
  );
}
