import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <PageShell title="Log in" kicker="Welcome back">
      <div className="panel max-w-md">
        <LoginForm next={next} />
        <p className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-text-dim [&_a]:inline-flex [&_a]:min-h-10 [&_a]:items-center">
          <Link href="/forgot">Forgot your password?</Link> &middot; <Link href="/join">Join with course code</Link>
        </p>
      </div>
    </PageShell>
  );
}
