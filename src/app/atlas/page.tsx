import Link from "next/link";
import { preload } from "react-dom";
import { AtlasBrowser } from "@/components/atlas/AtlasBrowser";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { resolveCourse } from "@/lib/study/server";
import { ATLAS_INDEX_URL } from "@/lib/atlas";

export const metadata = { title: "3D atlas" };

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; n?: string; view?: string; add?: string; nb?: string; cut?: string; cam?: string }>;
}) {
  const { s, n, view, add, nb, cut, cam } = await searchParams;
  // start the big downloads with the HTML, before the viewer's script even runs (the brain used to appear seconds later)
  for (const f of [ATLAS_INDEX_URL, "/atlas/context.glb", "/atlas/gross.glb"]) preload(f, { as: "fetch", crossOrigin: "anonymous" });
  // the course (for the "Sections" view's slide images); signed-out or no course just hides that view's images
  let courseSlug: string | undefined;
  try {
    const [sb, user] = await Promise.all([createClient(), getAuthUser()]);
    if (sb && user) courseSlug = (await resolveCourse(sb, user.id, null))?.slug;
  } catch {
    /* the atlas works without it */
  }
  // wider than the page column: the viewer uses the screen, not a 1040px strip
  return (
    <section className="ml-[calc(50%-min(880px,50vw-12px))] w-[min(1760px,calc(100vw-24px))]">
      <h1 className="sr-only">3D atlas</h1>
      <AtlasModes />
      <AtlasBrowser initialS={s} initialN={n} initialView={view} initialAdd={add} initialNb={nb} initialCut={cut} initialCam={cam} courseSlug={courseSlug} />
      <p className="mt-2 pl-28 text-xs text-text-faint">
        3D model and MRI atlases from open sources. <Link href="/about#credits" className="text-text-dim underline-offset-2 hover:underline">Credits and licences</Link>
      </p>
    </section>
  );
}
