#!/usr/bin/env node
// Moderation of shared student mnemonics (service role).
//   node scripts/mnemonics.mjs reports            reported mnemonics with report counts
//   node scripts/mnemonics.mjs hide <id>          hide from classmates (the author still sees it, marked hidden)
//   node scripts/mnemonics.mjs unhide <id>
//   node scripts/mnemonics.mjs show <id>          print one, including the author (even when anonymous)
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [cmd, id] = process.argv.slice(2);
const must = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

if (cmd === "reports") {
  const reps = must(await sb.from("mnemonic_reports").select("mnemonic_id, reason, created_at").order("created_at", { ascending: false }).limit(500));
  const by = new Map();
  for (const r of reps) {
    const e = by.get(r.mnemonic_id) ?? { n: 0, reasons: [] };
    e.n++;
    if (r.reason) e.reasons.push(r.reason);
    by.set(r.mnemonic_id, e);
  }
  const rows = by.size ? must(await sb.from("mnemonics").select("id, body, hidden").in("id", [...by.keys()])) : [];
  for (const m of rows) {
    const e = by.get(m.id);
    console.log(`${m.id}  reports=${e.n}${m.hidden ? "  HIDDEN" : ""}\n  "${m.body}"${e.reasons.length ? `\n  reasons: ${e.reasons.join(" | ")}` : ""}`);
  }
  if (!rows.length) console.log("no reported mnemonics");
} else if ((cmd === "hide" || cmd === "unhide") && id) {
  must(await sb.from("mnemonics").update({ hidden: cmd === "hide" }).eq("id", id));
  console.log(`${cmd === "hide" ? "hidden" : "visible again"}: ${id}`);
} else if (cmd === "show" && id) {
  console.log(JSON.stringify(must(await sb.from("mnemonics").select("*, profiles(display_name, email)").eq("id", id).maybeSingle()), null, 2));
} else {
  console.log("usage: node scripts/mnemonics.mjs reports | hide <id> | unhide <id> | show <id>");
}
