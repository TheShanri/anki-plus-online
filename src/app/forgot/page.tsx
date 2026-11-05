import { PageShell } from "@/components/PageShell";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPage() {
  return (
    <PageShell title="Forgot password" kicker="Reset by email">
      <div className="panel max-w-md">
        <ForgotForm />
      </div>
    </PageShell>
  );
}
