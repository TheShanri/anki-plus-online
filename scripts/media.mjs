#!/usr/bin/env node
// Upload every media key referenced by content/<course>/ to the private Storage bucket `course-media`
// (WebP, max 2000 px long side, quality 82). Unchanged files are skipped via content/<course>/.media-manifest.json.
// Content references keys with a .webp extension; the source is the same key (any original extension) under content-build/.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const slug = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "nsci3250";
const dry = process.argv.includes("--dry");
const dir = join(root, "content", slug);
const build = join(root, "content-build");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function keys() {
  const set = new Set();
  const cdir = join(dir, "cards");
  for (const f of readdirSync(cdir).filter((f) => f.endsWith(".json"))) {
    for (const c of JSON.parse(readFileSync(join(cdir, f), "utf8"))) {
      if (c.image) set.add(c.image);
      for (const x of c.extra_images ?? []) set.add(x);
    }
  }
  return [...set].sort();
}
function source(key) {
  const exact = join(build, key);
  if (existsSync(exact)) return exact;
  const base = key.replace(/\.webp$/i, "");
  for (const ext of [".jpg", ".jpeg", ".png", ".heic", ".webp"]) if (existsSync(join(build, base + ext))) return join(build, base + ext);
  return null;
}

const manifestPath = join(dir, ".media-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
if (!dry) {
  const { data: bs } = await sb.storage.listBuckets();
  if (!bs?.some((b) => b.name === "course-media")) {
    const { error } = await sb.storage.createBucket("course-media", { public: false });
    if (error) throw error;
    console.log("created bucket course-media");
  }
}
const all = keys();
let up = 0, skip = 0, missing = [];
let i = 0;
async function one(key) {
  const src = source(key);
  if (!src) { missing.push(key); return; }
  const buf = readFileSync(src);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
  if (manifest[key]?.hash === hash) { skip++; return; }
  if (dry) { up++; return; }
  const out = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { error } = await sb.storage.from("course-media").upload(`${slug}/${key}`, out, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`${key}: ${error.message}`);
  manifest[key] = { hash, bytes: out.length };
  up++;
}
const queue = [...all];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) { await one(queue.shift()); if (++i % 100 === 0) console.log(`${i}/${all.length}`); } }));
if (!dry) writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1));
console.log(`media: ${all.length} referenced, ${up} uploaded${dry ? " (dry)" : ""}, ${skip} unchanged, ${missing.length} missing`);
if (missing.length) { console.log(missing.slice(0, 20).join("\n")); process.exitCode = 1; }
