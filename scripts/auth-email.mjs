#!/usr/bin/env node
// Sets the password-recovery email (subject + body) through the Supabase Management API.
// The link goes to /auth/confirm with the hashed token, so it works on any device (no PKCE verifier).
//   node scripts/auth-email.mjs
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const { SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: REF } = process.env;
if (!TOKEN || !REF) throw new Error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF are required.");

const LINK = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset";

// Plain, calm, readable as text; minimal inline styling only.
const body = `<div style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.6; color: #1d1d1d; max-width: 520px;">
<p>Hello,</p>
<p>Someone asked to reset the password for your ANKI PLUS Online account. If that was you, this link lets you choose a new one:</p>
<p><a href="${LINK}" style="color: #154734; font-weight: bold;">Choose a new password</a></p>
<p>If the button does not work, copy this address into your browser:<br>
<span style="font-size: 13px; word-break: break-all;">${LINK}</span></p>
<p>The link works on any device and stays valid for one hour. If you did not ask for this, you can ignore the email; your password has not changed.</p>
<p>ANKI PLUS Online</p>
</div>`;

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    mailer_subjects_recovery: "Reset your ANKI PLUS Online password",
    mailer_templates_recovery_content: body,
  }),
});
console.log(res.status, res.ok ? "recovery template updated" : await res.text());
