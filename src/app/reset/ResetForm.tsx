"use client";

import { useActionState } from "react";
import { setNewPassword } from "./actions";

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, {} as { error?: string });
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="mt-1 text-xs text-text-faint">At least 8 characters.</p>
      </div>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>Save password</button>
    </form>
  );
}
