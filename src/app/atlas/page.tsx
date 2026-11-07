import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { AtlasBrowser } from "@/components/atlas/AtlasBrowser";
import { AtlasModes } from "@/components/atlas/AtlasModes";

export const metadata = { title: "3D atlas" };

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; n?: string; view?: string; add?: string; nb?: string }>;
}) {
  const { s, n, view, add, nb } = await searchParams;
  return (
    <PageShell title="3D atlas" kicker="Atlas">
      <AtlasModes />
      <AtlasBrowser initialS={s} initialN={n} initialView={view} initialAdd={add} initialNb={nb} />
      <p className="mt-6 text-xs text-text-faint">
        3D model and MRI atlases from open sources. <Link href="/about#credits" className="text-text-dim underline-offset-2 hover:underline">Credits and licences</Link>
      </p>
    </PageShell>
  );
}
