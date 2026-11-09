import Link from "next/link";
import { AtlasBrowser } from "@/components/atlas/AtlasBrowser";
import { AtlasModes } from "@/components/atlas/AtlasModes";

export const metadata = { title: "3D atlas" };

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; n?: string; view?: string; add?: string; nb?: string }>;
}) {
  const { s, n, view, add, nb } = await searchParams;
  // wider than the page column: the viewer uses the screen, not a 1040px strip
  return (
    <section className="ml-[calc(50%-min(880px,50vw-12px))] w-[min(1760px,calc(100vw-24px))]">
      <h1 className="sr-only">3D atlas</h1>
      <AtlasModes />
      <AtlasBrowser initialS={s} initialN={n} initialView={view} initialAdd={add} initialNb={nb} />
      <p className="mt-2 pl-28 text-xs text-text-faint">
        3D model and MRI atlases from open sources. <Link href="/about#credits" className="text-text-dim underline-offset-2 hover:underline">Credits and licences</Link>
      </p>
    </section>
  );
}
