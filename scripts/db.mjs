#!/usr/bin/env node
// Database helper over the Supabase Management API (needs SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF
// in .env.local). No psql or Docker needed.
//
//   node scripts/db.mjs migrate            apply pending supabase/migrations/*.sql (tracked in app_migrations)
//   node scripts/db.mjs status             list applied / pending migrations
//   node scripts/db.mjs query "<sql>"      run SQL and print rows as JSON
//   node scripts/db.mjs file <path.sql>    run a SQL file
//   node scripts/db.mjs auth-config        apply the auth settings this app expects (see AUTH_CONFIG)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set (in .env.local).");
  process.exit(1);
}
const API = `https://api.supabase.com/v1/projects/${REF}`;

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === "object" && body ? body.message || JSON.stringify(body) : body;
    throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${msg}`);
  }
  return body;
}

export async function sql(query) {
  return api("/database/query", { method: "POST", body: JSON.stringify({ query }) });
}

const MIGRATIONS_DIR = join(root, "supabase", "migrations");

async function ensureTable() {
  await sql(`create table if not exists public.app_migrations (
    name text primary key, applied_at timestamptz not null default now());
    alter table public.app_migrations enable row level security;`);
}

async function applied() {
  await ensureTable();
  const rows = await sql("select name from public.app_migrations order by name");
  return new Set(rows.map((r) => r.name));
}

function files() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

// Settings for this app: no email confirmation (accounts are created confirmed by the server),
// public sign-up off (join only through the course-code flow, which uses the admin API).
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const AUTH_CONFIG = {
  site_url: process.env.AUTH_SITE_URL || SITE,
  uri_allow_list: [
    "http://localhost:3000/**",
    "https://*.vercel.app/**",
    ...(process.env.AUTH_EXTRA_REDIRECTS ? process.env.AUTH_EXTRA_REDIRECTS.split(",") : []),
  ].join(","),
  disable_signup: true,
  mailer_autoconfirm: true,
  password_min_length: 8,
};

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "migrate") {
    const done = await applied();
    const pending = files().filter((f) => !done.has(f));
    if (!pending.length) console.log("Up to date.");
    for (const f of pending) {
      const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      process.stdout.write(`Applying ${f} … `);
      await sql(body);
      await sql(`insert into public.app_migrations (name) values ('${f.replace(/'/g, "''")}')`);
      console.log("ok");
    }
  } else if (cmd === "status") {
    const done = await applied();
    for (const f of files()) console.log(done.has(f) ? "applied " : "pending ", f);
  } else if (cmd === "query") {
    console.log(JSON.stringify(await sql(args.join(" ")), null, 1));
  } else if (cmd === "file") {
    console.log(JSON.stringify(await sql(readFileSync(args[0], "utf8")), null, 1));
  } else if (cmd === "auth-config") {
    await api("/config/auth", { method: "PATCH", body: JSON.stringify(AUTH_CONFIG) });
    const cfg = await api("/config/auth");
    const keys = ["site_url", "uri_allow_list", "disable_signup", "mailer_autoconfirm", "password_min_length", "smtp_host"];
    console.log(Object.fromEntries(keys.map((k) => [k, cfg[k]])));
  } else {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 9).join("\n"));
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
