"use client";

import { useState } from "react";
import { MailCheck, Send } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

export function ForgotForm({ notice }: { notice?: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setSent(true);
    setBusy(false);
  }

  if (sent)
    return (
      <p className="flex items-start gap-2 text-text-dim">
        <MailCheck size={18} className="mt-0.5 shrink-0 text-accent-2" aria-hidden />
        <span>If that email has an account, a reset link is on its way. It works on any device and expires after an hour.</span>
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && <p className="field-error" role="alert">{notice}</p>}
      <Field label="UVM email">
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="you@uvm.edu" required />
      </Field>
      <Button type="submit" variant="primary" icon={Send} loading={busy}>Send reset link</Button>
    </form>
  );
}
