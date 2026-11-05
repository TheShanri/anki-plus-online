import { PageShell } from "@/components/PageShell";
import { ResetForm } from "./ResetForm";

export default function ResetPage() {
  return (
    <PageShell title="Set a new password" kicker="Password reset">
      <div className="panel max-w-md">
        <ResetForm />
      </div>
    </PageShell>
  );
}
