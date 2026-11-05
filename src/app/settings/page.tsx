import { PageShell } from "@/components/PageShell";
import { SettingsForm } from "@/components/home/SettingsForm";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/study/server";
import { STUDY_DEFAULTS, SCAFFOLD_DEFAULTS, TYPING_DEFAULTS } from "@/lib/study/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = await createClient();
  let retention = STUDY_DEFAULTS.retention;
  let mnemonics = SCAFFOLD_DEFAULTS.mnemonics;
  let typing = TYPING_DEFAULTS.enabled;
  if (sb) {
    const user = await getAuthUser();
    if (user) {
      const { learner } = await loadSettings(sb, user.id);
      retention = learner.study.retention;
      mnemonics = learner.scaffold.mnemonics;
      typing = learner.typing.enabled;
    }
  }
  return (
    <PageShell title="Settings" kicker="Account">
      <SettingsForm retention={retention} mnemonics={mnemonics} typingEnabled={typing} />
    </PageShell>
  );
}
