"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
      });
      if (res.ok) {
        // Only same-site relative paths are accepted as a redirect target.
        const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/study";
        window.location.assign(dest);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed.");
    } catch {
      setError("Network error. Try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="UVM email">
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="you@uvm.edu" required />
      </Field>
      <Field label="Password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" icon={LogIn} loading={busy}>
        {busy ? "Logging in" : "Log in"}
      </Button>
    </form>
  );
}
