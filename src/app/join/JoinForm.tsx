"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinCourse, lookupCourse, type CourseLookup, type JoinState } from "./actions";

const initial: JoinState = { ok: false };
const YEARS = ["First-year", "Sophomore", "Junior", "Senior", "Graduate", "Other"];

function Field(props: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input
        className="input"
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <p className="mt-1 text-xs text-text-faint">{props.hint}</p>}
      {props.error && <p className="field-error">{props.error}</p>}
    </div>
  );
}

export function JoinForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(joinCourse, initial);
  const [step, setStep] = useState(1);
  const [course, setCourse] = useState<Extract<CourseLookup, { ok: true }> | null>(null);
  const [localErr, setLocalErr] = useState<Record<string, string>>({});
  const [checking, startCheck] = useTransition();
  const [v, setV] = useState<Record<string, string>>({
    joinCode: "", email: "", password: "", displayName: "", pronouns: "", classYear: "", major: "", minor: "", labSection: "",
  });
  const set = (k: string) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    if (state.ok) { router.push("/study"); router.refresh(); }
  }, [state.ok, router]);

  // Server-side field errors send the student back to the step that owns the field.
  useEffect(() => {
    const fe = state.fieldErrors;
    if (!fe) return;
    if (fe.joinCode) setStep(1);
    else if (fe.email || fe.password) setStep(2);
    else setStep(3);
  }, [state.fieldErrors]);

  const fe = { ...(state.fieldErrors ?? {}), ...localErr };

  function toStep2() {
    startCheck(async () => {
      const r = await lookupCourse(v.joinCode);
      if (!r.ok) return setLocalErr({ joinCode: r.error });
      setCourse(r);
      setLocalErr({});
      setStep(2);
    });
  }
  function toStep3() {
    const e: Record<string, string> = {};
    const domain = v.email.split("@")[1]?.toLowerCase() ?? "";
    if (!v.email.includes("@")) e.email = "Enter your school email";
    else if (course && !course.domains.some((d) => domain === d || domain.endsWith("." + d)))
      e.email = `Use your @${course.domains[0]} email`;
    if (v.password.length < 8) e.password = "At least 8 characters";
    setLocalErr(e);
    if (!Object.keys(e).length) setStep(3);
  }
  function submitGuard(ev: React.FormEvent<HTMLFormElement>) {
    const e: Record<string, string> = {};
    if (!v.displayName.trim()) e.displayName = "Required";
    if (course?.labSections.length && !v.labSection) e.labSection = "Choose your lab section";
    setLocalErr(e);
    if (Object.keys(e).length) ev.preventDefault();
  }

  return (
    <form action={action} onSubmit={submitGuard} className="space-y-4">
      {/* Every value is always posted; steps only toggle visibility. */}
      <div hidden={step !== 1} className="space-y-4">
        <Field name="joinCode" label="Course code" value={v.joinCode} onChange={set("joinCode")} error={fe.joinCode}
          hint="Your professor shares this code." />
        <button className="btn btn-primary" type="button" disabled={checking || v.joinCode.trim().length < 3} onClick={toStep2}>
          {checking ? "Checking..." : "Continue"}
        </button>
      </div>

      <div hidden={step !== 2} className="space-y-4">
        {course && <p className="text-sm text-text-dim">Joining <b className="text-text">{course.title}</b></p>}
        <Field name="email" label="UVM email" type="email" autoComplete="username" value={v.email} onChange={set("email")} error={fe.email}
          hint="This is your username." />
        <Field name="password" label="Password" type="password" autoComplete="new-password" value={v.password} onChange={set("password")} error={fe.password}
          hint="At least 8 characters." />
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={() => setStep(1)}>Back</button>
          <button className="btn btn-primary" type="button" onClick={toStep3}>Continue</button>
        </div>
      </div>

      <div hidden={step !== 3} className="space-y-4">
        <Field name="displayName" label="Name" autoComplete="name" value={v.displayName} onChange={set("displayName")} error={fe.displayName} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="pronouns" label="Pronouns (optional)" value={v.pronouns} onChange={set("pronouns")} />
          <div>
            <label className="label" htmlFor="classYear">Class year (optional)</label>
            <select className="input" id="classYear" name="classYear" value={v.classYear} onChange={(e) => set("classYear")(e.target.value)}>
              <option value="">-</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <Field name="major" label="Major (optional)" value={v.major} onChange={set("major")} />
          <Field name="minor" label="Minor (optional)" value={v.minor} onChange={set("minor")} />
        </div>
        <div>
          <label className="label" htmlFor="labSection">Lab section</label>
          <select className="input" id="labSection" name="labSection" value={v.labSection} onChange={(e) => set("labSection")(e.target.value)}>
            <option value="">Choose...</option>
            {(course?.labSections ?? []).map((s) => <option key={s}>{s}</option>)}
          </select>
          {fe.labSection && <p className="field-error">{fe.labSection}</p>}
        </div>
        <p className="rounded-card-sm border border-panel-border p-3 text-sm text-text-dim">
          A note on privacy: your instructors see a summary for each student (time spent, cards reviewed, accuracy).
          They do not see your individual answers. Class-wide patterns are shown anonymously.
        </p>
        {state.error && <p className="field-error" role="alert">{state.error}</p>}
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={() => setStep(2)}>Back</button>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </button>
        </div>
      </div>
    </form>
  );
}
