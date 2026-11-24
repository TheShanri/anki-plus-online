import Link from "next/link";
import { preload } from "react-dom";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { Explore3 } from "@/components/atlas3/Explore3";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { resolveCourse } from "@/lib/study/server";

export const metadata = { title: "3D atlas" };

export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; n?: string; view?: string; cut?: string; cam?: string; side?: string }>;
}) {
  const { s, n, view, cut, cam, side } = await searchParams;
  // start the downloads with the HTML: the structure table and the brain's outside surface
  for (const f of ["/atlas3/index.json", "/atlas3/catalog.json", "/atlas3/shell.glb"]) preload(f, { as: "fetch", crossOrigin: "anonymous" });
  // the course (for the Sections mode's slide images); signed-out or no course just hides that mode
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
      <Explore3 initialS={s} initialN={n} initialView={view} initialCam={cam} initialCut={cut} initialSide={side} courseSlug={courseSlug} />
      <p className="mt-2 text-xs text-text-faint">
        3D model and MRI atlases from open sources.{" "}
        <Link href="/about#credits" className="text-text-dim underline-offset-2 hover:underline">
          Credits and licences
        </Link>
        {" · "}
        <Link href="/atlas/classic" className="text-text-dim underline-offset-2 hover:underline">
          Classic atlas
        </Link>
      </p>
    </section>
  );
}
