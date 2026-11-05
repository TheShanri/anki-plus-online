import { PageShell } from "@/components/PageShell";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <PageShell title="Forgot password" kicker="Reset by email">
      <div className="panel max-w-md">
        <ForgotForm notice={error ? "That link has expired or was already used. Request a new one." : undefined} />
      </div>
    </PageShell>
  );
}
