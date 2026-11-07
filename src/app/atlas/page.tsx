import Link from "next/link";
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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link className="btn btn-primary" href="/atlas/quiz">Play: name that structure</Link>
        <span className="text-sm text-text-dim">A structure lights up in 3D; you name it. All of them, by unit, or only the ones you have studied.</span>
      </div>
      <AtlasBrowser initialS={s} initialN={n} initialView={view} initialAdd={add} initialNb={nb} />
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg tracking-wide">Credits and licence</h2>
        <AtlasAttribution />
      </section>
    </PageShell>
  );
}
