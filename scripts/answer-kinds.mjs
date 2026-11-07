#!/usr/bin/env node
// Sets "answer_kind" (structure | direction | plane | region | term | level) on every pin and section card
// and rewrites the GENERIC pin prompts to match. Classification table: scripts/answer-kinds.json.
// Rules (first match wins): cardSlugs > structure concept slug > exact answer table > section/brainstem level
// patterns > Brodmann numbers > lobe/cortex/area patterns > sentence-like junk (term) > structure.
// Usage: node scripts/answer-kinds.mjs [--dry]   (idempotent; custom exam prompts are never touched)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "content", "nsci3250", "cards");
const dry = process.argv.includes("--dry");
const table = JSON.parse(readFileSync(join(root, "scripts", "answer-kinds.json"), "utf8"));
const concept = new Set(JSON.parse(readFileSync(join(root, "content", "nsci3250", "structures.json"), "utf8")).filter((s) => s.concept).map((s) => s.slug));
const exact = new Map();
for (const [kind, list] of Object.entries(table.answers)) for (const a of list) exact.set(a.toLowerCase(), kind);

const NOUN = { structure: "structure", direction: "directional term", plane: "plane", region: "region", term: "term", function: "function", level: "level" };
const FN_LEADER = "Name the function of the part the leader line / label points to.";
const KINDS = "structure|directional term|plane|region|term|function|level";
const GEN = new RegExp("^Name the (" + KINDS + ")\[.]$");
const GEN_LEADER = new RegExp("^Name the (" + KINDS + ") the leader line / label points to\[.]$");

function classify(c) {
  if (table.cardSlugs[c.slug]) return table.cardSlugs[c.slug];
  if (c.kind === "section") return "level";
  const a = c.answer.trim().toLowerCase();
  if (c.structure && table.slugKinds[c.structure]) return table.slugKinds[c.structure];
  if (exact.has(a)) return exact.get(a);
  if (/^(very )?(rostral|caudal|mid)?\s*(medulla|pons|midbrain)\b/i.test(a) && /(rostral|caudal|very|level|decussation)/.test(a)) return "level";
  if (/^pyramids\/motor decussation$/.test(a)) return "level";
  if (/^[\d ,]+$/.test(a)) return "region"; // Brodmann numbers
  if (/\blobes?$/.test(a)) return "region";
  if (/(cortex|^broca's area|^wernicke's area)$/.test(a) && !/tract/.test(a)) return "region";
  if (/ association area$/.test(a) || /^primary (auditory|somatosensory|visual)$/.test(a)) return "region";
  if (a.length > 60 || /[.:;]/.test(a) || /^(the|is|and|of|function|located|in|damage|there|needle|safely) /.test(a)) return "term"; // sentence/fragment junk
  return "structure";
}

const stat = { kinds: {}, changed: {}, files: 0, custom: [] };
const review = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const p = join(dir, f);
  const raw = readFileSync(p, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const trail = /\r?\.$/.test(raw);
  const cards = JSON.parse(raw);
  let dirty = false;
  const out = cards.map((c) => {
    if (c.kind !== "pin" && c.kind !== "section") return c;
    const kind = classify(c);
    stat.kinds[kind] = (stat.kinds[kind] ?? 0) + 1;
    let prompt = c.prompt;
    if (c.kind === "pin") {
      if (!prompt || GEN.test(prompt)) prompt = `Name the ${NOUN[kind]}.`;
      else if (GEN_LEADER.test(prompt) || prompt === FN_LEADER) prompt = kind === "function" ? FN_LEADER : `Name the ${NOUN[kind]} the leader line / label points to.`;
      else if (kind !== "structure") stat.custom.push(`${c.slug} [${kind}] "${prompt}" -> ${c.answer}`);
      if (prompt !== c.prompt) stat.changed[kind] = (stat.changed[kind] ?? 0) + 1;
    }
    // rebuild with answer_kind right after answer, preserving key order
    const n = {};
    for (const [k, v] of Object.entries(c)) {
      if (k === "answer_kind") continue;
      n[k] = k === "prompt" ? prompt : v;
      if (k === "answer") n.answer_kind = kind;
    }
    if (!("answer" in c)) n.answer_kind = kind;
    if (JSON.stringify(n) !== JSON.stringify(c) || Object.keys(n).join() !== Object.keys(c).join()) dirty = true;
    return n;
  });
  if (dirty) {
    stat.files++;
    if (!dry) writeFileSync(p, JSON.stringify(out, null, 1).replace(/\n/g, eol) + (trail ? eol : ""));
  }
}
console.log(dry ? "[dry run]" : "[written]", "files touched:", stat.files);
console.log("answer_kind counts:", stat.kinds);
console.log("generic prompts rewritten per kind:", stat.changed);
if (process.argv.includes("--custom")) console.log(stat.custom.join("\n"));
