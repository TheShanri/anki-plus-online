"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    const supabase = createClient();
    // Always show the same message so the form does not reveal which emails have accounts.
    await supabase?.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
    setSent(true);
    setBusy(false);
  }

  if (sent) return <p className="text-text-dim">If that email has an account, a reset link is on its way.</p>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">UVM email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>Send reset link</button>
    </form>
  );
}
