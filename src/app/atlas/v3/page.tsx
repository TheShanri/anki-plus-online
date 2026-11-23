import { AtlasModes } from "@/components/atlas/AtlasModes";
import { Explore3 } from "@/components/atlas3/Explore3";

export const metadata = { title: "3D atlas (new)" };

export default async function AtlasV3Page({ searchParams }: { searchParams: Promise<{ s?: string; cam?: string; cut?: string; side?: string }> }) {
  const { s, cam, cut, side } = await searchParams;
  return (
    <section className="ml-[calc(50%-min(880px,50vw-12px))] w-[min(1760px,calc(100vw-24px))]">
      <h1 className="sr-only">3D atlas</h1>
      <AtlasModes />
      <Explore3 initialS={s} initialCam={cam} initialCut={cut} initialSide={side} />
    </section>
  );
}
