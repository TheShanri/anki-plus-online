"use client";
import { ChevronDown } from "lucide-react";
import { cloneElement, isValidElement, useId } from "react";
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Label + control + hint + error. The single child control gets the id and aria wiring. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
}) {
  const id = useId();
  const desc = [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={["field", className].filter(Boolean).join(" ")}>
      <label className="label" htmlFor={id}>{label}</label>
      {isValidElement(children) ? cloneElement(children, { id, "aria-describedby": desc, "aria-invalid": error ? true : undefined }) : children}
      {hint && <p className="field-hint" id={`${id}-h`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-e`} role="alert">{error}</p>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={["input", className].filter(Boolean).join(" ")} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={["input textarea", className].filter(Boolean).join(" ")} {...rest} />;
}

/** Native select (keeps the OS picker and keyboard behaviour) with a themed chevron. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <span className={["select", className].filter(Boolean).join(" ")}>
      <select {...rest}>{children}</select>
      <ChevronDown aria-hidden />
    </span>
  );
}
