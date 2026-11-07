import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { SupplyMap } from "@/components/atlas/supply/SupplyMap";

export const metadata = { title: "Blood supply" };

/** Structures coloured by arterial territory, with a quiz: which artery supplies this? */
export default function SupplyPage() {
  return (
    <PageShell title="Blood supply" kicker="Atlas">
      <AtlasModes />
      <SupplyMap />
    </PageShell>
  );
}
