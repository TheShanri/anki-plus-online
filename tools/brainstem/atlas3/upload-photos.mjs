// Uploads the plate photos (content-build/atlas3/brainstem/*.webp, made by the atlas3 pipeline) to the private
// Storage bucket `course-media` under nsci3250/atlas3/brainstem/. They are course material: served only through the
// auth-gated /api/media route, never from public/. Unchanged files are skipped (photos-manifest.json).
//   node tools/brainstem/atlas3/upload-photos.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const slug = "nsci3250";
const dir = join(root, "content-build", "atlas3", "brainstem");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mp = join(here, "photos-manifest.json");
const manifest = existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : {};
let up = 0, skip = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".webp")).sort()) {
  const key = `atlas3/brainstem/${f}`;
  const buf = readFileSync(join(dir, f));
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
  if (manifest[key]?.hash === hash) { skip++; continue; }
  const { error } = await sb.storage.from("course-media").upload(`${slug}/${key}`, buf, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`${key}: ${error.message}`);
  manifest[key] = { hash, bytes: buf.length };
  up++;
}
writeFileSync(mp, JSON.stringify(manifest, null, 1) + "\n");
console.log(`${up} uploaded, ${skip} unchanged`);
