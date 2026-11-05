import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ScaffoldingPanel } from "@/components/study/ScaffoldingPanel";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/study/server";

export const metadata = { title: "How your learning is scaffolded" };
export const dynamic = "force-dynamic";

export default async function ScaffoldingPage() {
  const sb = await createClient();
  if (!sb) return <PageShell title="How your learning is scaffolded" kicker="Settings"><p className="text-text-dim">Supabase is not configured.</p></PageShell>;
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login?next=/settings/scaffolding");
  const { learner } = await loadSettings(sb, data.user.id);
  return (
    <PageShell title="How your learning is scaffolded" kicker="Settings · Advanced">
      <ScaffoldingPanel initial={learner} />
    </PageShell>
  );
}
