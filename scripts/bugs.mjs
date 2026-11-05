#!/usr/bin/env node
// Reads bug reports with the service role (for Claude to fix bugs later).
//   node scripts/bugs.mjs list [open|fixed|dismissed|all]
//   node scripts/bugs.mjs show <id-or-prefix>     prints the report + both log buffers, saves the screenshot and prints its path
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [cmd = "list", arg] = process.argv.slice(2);

if (cmd === "list") {
  let q = db.from("bug_reports").select("id, created_at, status, route, description, screenshot_path, profiles(display_name)").order("created_at", { ascending: false }).limit(100);
  const status = arg ?? "open";
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) console.log(`No ${status} bug reports.`);
  for (const b of data) {
    const who = (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles)?.display_name ?? "anonymous";
    console.log(`${b.id.slice(0, 8)}  ${b.created_at.slice(0, 16)}  ${b.status.padEnd(9)} ${b.route}  [${who}]  ${b.description ?? ""}${b.screenshot_path ? "  (screenshot)" : ""}`);
  }
} else if (cmd === "show" && arg) {
  const { data: all, error } = await db.from("bug_reports").select("*, profiles(display_name, email)").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const b = all.find((r) => r.id === arg || r.id.startsWith(arg));
  if (!b) { console.error("No such report."); process.exit(1); }
  const fmt = (l) => `  ${new Date(l.t).toISOString().slice(11, 23)} ${String(l.k).padEnd(9)} ${l.m}${l.d !== undefined ? " " + JSON.stringify(l.d) : ""}`;
  console.log(`Report ${b.id}\n${b.created_at}  status=${b.status}  route=${b.route}`);
  console.log(`User: ${(Array.isArray(b.profiles) ? b.profiles[0] : b.profiles)?.email ?? "anonymous"}`);
  console.log(`Description: ${b.description ?? "(none)"}`);
  console.log(`App state: ${JSON.stringify(b.app_state)}`);
  console.log(`\n--- logs before (${b.logs_before.length}) ---\n${b.logs_before.map(fmt).join("\n")}`);
  console.log(`\n--- logs after (${b.logs_after.length}) ---\n${b.logs_after.map(fmt).join("\n")}`);
  if (b.screenshot_path) {
    const { data, error: e2 } = await db.storage.from("bug-reports").download(b.screenshot_path);
    if (e2) console.log(`\nScreenshot download failed: ${e2.message}`);
    else {
      const dir = join(tmpdir(), "anki-bugs");
      mkdirSync(dir, { recursive: true });
      const out = join(dir, b.screenshot_path);
      writeFileSync(out, Buffer.from(await data.arrayBuffer()));
      console.log(`\nScreenshot saved: ${out}`);
    }
  } else console.log("\n(no screenshot)");
} else {
  console.error("usage: node scripts/bugs.mjs list [status] | show <id>");
  process.exit(1);
}
