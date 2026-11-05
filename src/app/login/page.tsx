import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <PageShell title="Log in" kicker="Welcome back">
      <div className="panel max-w-md">
        <LoginForm next={next} />
        <p className="mt-4 text-sm text-text-dim">
          <Link href="/forgot">Forgot your password?</Link> &middot; <Link href="/join">Join with course code</Link>
        </p>
      </div>
    </PageShell>
  );
}
