import { PageShell } from "@/components/PageShell";
import { confirmToken } from "./actions";

// The token is spent by a button press, not by loading the page: mail scanners (Outlook Safe Links)
// pre-fetch links in emails and would otherwise use up the one-time token before the student clicks.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  return (
    <PageShell title="Confirm" kicker="One more step">
      <div className="panel max-w-md">
        {token_hash ? (
          <form action={confirmToken} className="space-y-4">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type ?? "recovery"} />
            <input type="hidden" name="next" value={next ?? "/reset"} />
            <p className="text-text-dim">
              {type === "recovery" || !type ? "Continue to choose a new password." : "Continue to finish signing in."}
            </p>
            <button className="btn btn-primary" type="submit">Continue</button>
          </form>
        ) : (
          <p className="text-text-dim">This link is incomplete. Request a new reset email from the login page.</p>
        )}
      </div>
    </PageShell>
  );
}
