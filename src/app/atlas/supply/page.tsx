import Link from "next/link";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { SupplyMap } from "@/components/atlas/supply/SupplyMap";

export const metadata = { title: "Blood supply" };

/** Real arteries with flow direction, the circle of Willis, territories, and a quiz: which artery supplies this? */
export default function SupplyPage() {
  // wider than the page column, like the Explore page: the viewer uses the screen
  return (
    <section className="ml-[calc(50%-min(880px,50vw-12px))] w-[min(1760px,calc(100vw-24px))]">
      <h1 className="sr-only">Blood supply</h1>
      <AtlasModes />
      <SupplyMap />
      <p className="mt-2 text-xs text-text-faint">
        Arteries and brain from the Z-Anatomy model.{" "}
        <Link href="/about#credits" className="text-text-dim underline-offset-2 hover:underline">
          Credits and licences
        </Link>
      </p>
    </section>
  );
}
