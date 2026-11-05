"use client";

import { useState } from "react";

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
      <div>
        <label className="label" htmlFor="email">UVM email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
