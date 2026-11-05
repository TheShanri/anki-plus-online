"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinCourse, type JoinState } from "./actions";

const initial: JoinState = { ok: false };

function Field(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input
        className="input"
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        autoComplete={props.autoComplete}
      />
      {props.hint && <p className="mt-1 text-xs text-text-faint">{props.hint}</p>}
      {props.error && <p className="field-error">{props.error}</p>}
    </div>
  );
}

export function JoinForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(joinCourse, initial);
  useEffect(() => {
    if (state.ok) { router.push("/study"); router.refresh(); }
  }, [state.ok, router]);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <Field name="joinCode" label="Course code" required error={fe.joinCode} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="UVM email" type="email" required autoComplete="username" error={fe.email} />
        <Field name="password" label="Password" type="password" required autoComplete="new-password" error={fe.password} />
      </div>
      <Field name="displayName" label="Name" required error={fe.displayName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="pronouns" label="Pronouns" error={fe.pronouns} />
        <Field name="classYear" label="Class year" error={fe.classYear} />
        <Field name="major" label="Major" error={fe.major} />
        <Field name="minor" label="Minor" error={fe.minor} />
      </div>
      <Field name="labSection" label="Lab section" error={fe.labSection} />
      <p className="text-xs text-text-faint">
        Privacy: your instructors can see per-student summaries (time on task, cards reviewed, accuracy).
      </p>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating account..." : "Join course"}
      </button>
    </form>
  );
}
