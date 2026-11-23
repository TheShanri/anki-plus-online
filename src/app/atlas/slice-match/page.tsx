import { AtlasModes } from "@/components/atlas/AtlasModes";
import { SliceMatch } from "@/components/atlas/slicematch/SliceMatch";

export const metadata = { title: "Slice match" };

/** An unlabelled MRI section is shown; the student moves the cutting plane on the 3D brain until it matches.
 *  Full width like the tracer, the brainstem atlas and Explore (the MRI and the 3D brain get the room). */
export default function SliceMatchPage() {
  return (
    <section className="relative left-1/2 w-[min(1500px,calc(100vw-24px))] -translate-x-1/2">
      <h1 className="sr-only">Slice match</h1>
      <AtlasModes />
      <SliceMatch />
    </section>
  );
}
