"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** The recovery link carries a session; the browser client picks it up, then the user sets a new password. */
export function ResetForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createClient();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!supabase) return;
    if (password.length < 8) return setError("At least 8 characters.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError("Could not set the password. The link may have expired; request a new one.");
      setBusy(false);
      return;
    }
    router.push("/study");
    router.refresh();
  }

  if (!ready) return <p className="text-text-dim">Open this page from the link in your reset email.</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" required />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>Save password</button>
    </form>
  );
}
