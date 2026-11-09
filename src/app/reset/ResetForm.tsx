"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { setNewPassword } from "./actions";

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, {} as { error?: string });
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <Button type="submit" variant="primary" icon={KeyRound} loading={pending}>Save password</Button>
    </form>
  );
}
