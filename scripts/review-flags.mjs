#!/usr/bin/env node
// Prints open content-review flags (latest verdict per card is "flag" and unresolved) with the card JSON,
// so Claude can fix the content in git.   node scripts/review-flags.mjs [--all]
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: reviews, error } = await db.from("content_reviews").select("id, card_id, verdict, note, created_at, resolved_at").order("created_at", { ascending: false });
if (error) throw error;
const latest = new Map();
for (const r of reviews) if (!latest.has(r.card_id)) latest.set(r.card_id, r);
const flags = [...latest.values()].filter((r) => r.verdict === "flag" && (process.argv.includes("--all") || !r.resolved_at));
if (!flags.length) { console.log("No open flags."); process.exit(0); }

const { data: cards } = await db.from("cards").select("id, slug, kind, content, topics(slug, title)").in("id", flags.map((f) => f.card_id));
const byId = new Map(cards.map((c) => [c.id, c]));
console.log(`${flags.length} open flag(s)\n`);
for (const f of flags) {
  const c = byId.get(f.card_id);
  const t = Array.isArray(c?.topics) ? c.topics[0] : c?.topics;
  console.log(`=== ${c?.slug}  [${c?.kind}]  topic: ${t?.slug ?? "-"} (${t?.title ?? "-"})  flagged ${f.created_at.slice(0, 16)}`);
  console.log(`NOTE: ${f.note}`);
  console.log(JSON.stringify(c?.content, null, 2));
  console.log();
}
