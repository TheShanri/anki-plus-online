import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { AtlasModes } from "@/components/atlas/AtlasModes";
import { MemoryMap } from "@/components/atlas/memory/MemoryMap";
import { getAuthUser } from "@/lib/supabase/server";

export const metadata = { title: "My memory map" };
export const dynamic = "force-dynamic";

/** Every structure coloured by how well this student knows it, from their own FSRS card states. */
export default async function MemoryPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/atlas/memory");
  return (
    <PageShell title="My memory map" kicker="Atlas">
      <AtlasModes />
      <MemoryMap />
    </PageShell>
  );
}
