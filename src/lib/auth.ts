import { z } from "zod";

export const DEFAULT_ALLOWED_DOMAINS = ["uvm.edu"];

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(8, "At least 8 characters").max(128);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const joinSchema = z.object({
  joinCode: z.string().trim().min(3).max(64),
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
  pronouns: z.string().trim().max(40).optional().default(""),
  classYear: z.string().trim().max(20).optional().default(""),
  major: z.string().trim().max(80).optional().default(""),
  minor: z.string().trim().max(80).optional().default(""),
  labSection: z.string().trim().max(40).optional().default(""),
});
export type JoinInput = z.infer<typeof joinSchema>;

/** Allowed domains come from courses.settings.allowed_email_domains (default uvm.edu). Subdomains match too. */
export function emailDomainAllowed(email: string, settings: unknown): boolean {
  const raw = (settings as { allowed_email_domains?: unknown } | null)?.allowed_email_domains;
  const domains =
    Array.isArray(raw) && raw.length
      ? raw.map((d) => String(d).toLowerCase().replace(/^@/, ""))
      : DEFAULT_ALLOWED_DOMAINS;
  const host = email.split("@")[1] ?? "";
  return domains.some((d) => host === d || host.endsWith("." + d));
}
