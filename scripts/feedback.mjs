#!/usr/bin/env node
// Reads the feedback inbox with the service role.
//   node scripts/feedback.mjs list [new|seen|resolved|all] [type]
//   node scripts/feedback.mjs show <id-or-prefix>        prints it with both log buffers, saves the screenshot
//   node scripts/feedback.mjs mark <id-or-prefix> <new|seen|resolved> [note]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [cmd = "list", arg, arg2, ...rest] = process.argv.slice(2);
const who = (r) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles);

async function find(prefix) {
  const { data, error } = await db.from("feedback").select("*, profiles(display_name, email)").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data.find((r) => r.id === prefix || r.id.startsWith(prefix));
}

if (cmd === "list") {
  const status = arg ?? "new";
  let q = db.from("feedback").select("id, created_at, status, type, route, message, card_slug, screenshot_path, profiles(display_name)").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  if (arg2) q = q.eq("type", arg2);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) console.log(`No ${status} feedback.`);
  for (const f of data) {
    console.log(`${f.id.slice(0, 8)}  ${f.created_at.slice(0, 16)}  ${f.status.padEnd(8)} ${f.type.padEnd(6)} ${f.route}${f.card_slug ? ` [card ${f.card_slug}]` : ""}  (${who(f)?.display_name ?? "anonymous"})  ${f.message ?? ""}${f.screenshot_path ? "  (screenshot)" : ""}`);
  }
} else if (cmd === "show" && arg) {
  const f = await find(arg);
  if (!f) { console.error("No such feedback."); process.exit(1); }
  const fmt = (l) => `  ${new Date(l.t).toISOString().slice(11, 23)} ${String(l.k).padEnd(9)} ${l.m}${l.d !== undefined ? " " + JSON.stringify(l.d) : ""}`;
  console.log(`Feedback ${f.id}\n${f.created_at}  type=${f.type}  status=${f.status}  route=${f.route}`);
  console.log(`From: ${who(f)?.email ?? "anonymous"}`);
  if (f.card_slug) console.log(`Card: ${f.card_slug} (${f.card_id})`);
  console.log(`Message: ${f.message ?? "(none)"}`);
  if (f.admin_note) console.log(`Admin note: ${f.admin_note}`);
  console.log(`App state: ${JSON.stringify(f.app_state)}`);
  if (f.logs_before.length || f.logs_after.length) {
    console.log(`\n--- logs before (${f.logs_before.length}) ---\n${f.logs_before.map(fmt).join("\n")}`);
    console.log(`\n--- logs after (${f.logs_after.length}) ---\n${f.logs_after.map(fmt).join("\n")}`);
  }
  if (f.screenshot_path) {
    const { data, error } = await db.storage.from("bug-reports").download(f.screenshot_path);
    if (error) console.log(`\nScreenshot download failed: ${error.message}`);
    else {
      const dir = join(tmpdir(), "anki-feedback");
      mkdirSync(dir, { recursive: true });
      const out = join(dir, f.screenshot_path);
      writeFileSync(out, Buffer.from(await data.arrayBuffer()));
      console.log(`\nScreenshot saved: ${out}`);
    }
  }
} else if (cmd === "mark" && arg && ["new", "seen", "resolved"].includes(arg2)) {
  const f = await find(arg);
  if (!f) { console.error("No such feedback."); process.exit(1); }
  const patch = { status: arg2 };
  if (rest.length) patch.admin_note = rest.join(" ");
  const { error } = await db.from("feedback").update(patch).eq("id", f.id);
  if (error) throw error;
  console.log(`${f.id.slice(0, 8)} -> ${arg2}`);
} else {
  console.error("usage: node scripts/feedback.mjs list [status] [type] | show <id> | mark <id> <status> [note]");
  process.exit(1);
}
