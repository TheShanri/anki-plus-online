"use client";

import { useActionState } from "react";
import { changePassword, saveProfile, type ProfileState } from "./actions";

type Profile = {
  email: string;
  displayName: string;
  pronouns: string;
  classYear: string;
  major: string;
  minor: string;
  courseId: string;
  courseTitle: string;
  labSection: string;
  labSections: string[];
};

const YEARS = ["First-year", "Sophomore", "Junior", "Senior", "Graduate", "Other"];
const none: ProfileState = {};

export function ProfileForm({ p, mustChange }: { p: Profile; mustChange: boolean }) {
  const [state, action, pending] = useActionState(saveProfile, none);
  const [pw, pwAction, pwPending] = useActionState(changePassword, none);
  const fe = state.fieldErrors ?? {};
  const years = p.classYear && !YEARS.includes(p.classYear) ? [...YEARS, p.classYear] : YEARS;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,28rem)] lg:gap-8">
      <form key={[p.displayName, p.pronouns, p.classYear, p.major, p.minor, p.labSection].join("|")} action={action} className="panel w-full space-y-4">
        <input type="hidden" name="courseId" value={p.courseId} />
        <div>
          <label className="label" htmlFor="email">Email (cannot be changed)</label>
          <input className="input" id="email" value={p.email} readOnly disabled />
        </div>
        <div>
          <label className="label" htmlFor="displayName">Name</label>
          <input className="input" id="displayName" name="displayName" defaultValue={p.displayName} required />
          {fe.displayName && <p className="field-error">{fe.displayName}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pronouns">Pronouns</label>
            <input className="input" id="pronouns" name="pronouns" defaultValue={p.pronouns} />
          </div>
          <div>
            <label className="label" htmlFor="classYear">Class year</label>
            <select className="input" id="classYear" name="classYear" defaultValue={p.classYear}>
              <option value="">Not set</option>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="major">Major</label>
            <input className="input" id="major" name="major" defaultValue={p.major} />
          </div>
          <div>
            <label className="label" htmlFor="minor">Minor</label>
            <input className="input" id="minor" name="minor" defaultValue={p.minor} />
          </div>
        </div>
        {p.courseId && (
          <div>
            <label className="label" htmlFor="labSection">Lab section ({p.courseTitle})</label>
            <select className="input" id="labSection" name="labSection" defaultValue={p.labSection}>
              <option value="">Not set</option>
              {p.labSections.map((s) => <option key={s}>{s}</option>)}
            </select>
            {fe.labSection && <p className="field-error">{fe.labSection}</p>}
          </div>
        )}
        {state.error && <p className="field-error" role="alert">{state.error}</p>}
        {state.ok && <p className="text-sm text-good" role="status">Saved.</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>Save profile</button>
      </form>

      <form action={pwAction} className="panel w-full space-y-4" id="password-form">
        <h2 className="font-display text-lg">Change password</h2>
        {mustChange && (
          <p className="notice">You are using a temporary password. Please choose your own now.</p>
        )}
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="pw-hint" />
          <p id="pw-hint" className="text-xs text-text-dim mt-1">At least 8 characters.</p>
        </div>
        {pw.error && <p className="field-error" role="alert">{pw.error}</p>}
        {pw.ok && <p className="text-sm text-good" role="status">Password changed.</p>}
        <button className="btn" type="submit" disabled={pwPending}>Change password</button>
      </form>
    </div>
  );
}
