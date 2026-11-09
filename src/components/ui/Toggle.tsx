"use client";
import { useId } from "react";

/** Switch with an optional label and hint. Controlled. */
export function Toggle({ checked, onChange, label, hint, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: string; hint?: string; disabled?: boolean; className?: string }) {
  const id = useId();
  const sw = (
    <button type="button" role="switch" id={id} className="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />
  );
  if (!label) return sw;
  return (
    <div className={["toggle", className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className="toggle-text">
        <b>{label}</b>
        {hint && <span>{hint}</span>}
      </label>
      {sw}
    </div>
  );
}
