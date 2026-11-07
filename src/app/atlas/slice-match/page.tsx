import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { SliceMatch } from "@/components/atlas/slicematch/SliceMatch";

export const metadata = { title: "Slice match" };

/** An unlabelled MRI section is shown; the student moves the cutting plane on the 3D brain until it matches. */
export default function SliceMatchPage() {
  return (
    <PageShell title="Slice match" kicker="Atlas">
      <AtlasModes />
      <SliceMatch />
    </PageShell>
  );
}
