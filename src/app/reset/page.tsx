import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { getViewer } from "@/lib/session";
import { ResetForm } from "./ResetForm";

export default async function ResetPage() {
  const viewer = await getViewer();
  return (
    <PageShell title="Set a new password" kicker="Password reset">
      <div className="panel max-w-md">
        {viewer ? (
          <ResetForm />
        ) : (
          <p className="text-text-dim">
            Open this page from the link in your reset email, or <Link href="/forgot">request a new one</Link>.
          </p>
        )}
      </div>
    </PageShell>
  );
}
