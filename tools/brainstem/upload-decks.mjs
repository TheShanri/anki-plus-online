// Uploads the deck pages listed in deck-keys.json to the private Storage bucket `course-media` (same recipe as
// scripts/media.mjs: WebP, max 2000 px, quality 82; unchanged files are skipped via deck-media-manifest.json).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const slug = "nsci3250";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const keys = JSON.parse(readFileSync(join(here, "deck-keys.json"), "utf8"));
const mp = join(here, "deck-media-manifest.json");
const manifest = existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : {};
let up = 0, skip = 0;
for (const key of keys) {
  const file = join(root, "content-build", key);
  if (!existsSync(file)) { console.log("missing", key); continue; }
  const buf = readFileSync(file);
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
  if (manifest[key]?.hash === hash) { skip++; continue; }
  const out = await sharp(buf).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const { error } = await sb.storage.from("course-media").upload(`${slug}/${key}`, out, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`${key}: ${error.message}`);
  manifest[key] = { hash, bytes: out.length };
  up++;
}
writeFileSync(mp, JSON.stringify(manifest, null, 1));
console.log(`${keys.length} keys, ${up} uploaded, ${skip} unchanged`);
