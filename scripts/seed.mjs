#!/usr/bin/env node
// Upsert content/<course>/ (units, topics, structures, cards) into Supabase by slug (service role).
// Never deletes rows students may hold state on: cards/structures that vanished from the JSON are retired
// (cards.status = 'retired'; structures keep their row but get info.retired = true).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const slug = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "nsci3250";
const dir = join(root, "content", slug);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const course = must(await sb.from("courses").select("id").eq("slug", slug).maybeSingle(), "course");
if (!course) throw new Error(`no course with slug ${slug}`);
const cid = course.id;
const cj = J(join(dir, "course.json"));

// units
must(await sb.from("units").upsert(cj.units.map((u) => ({ course_id: cid, slug: u.slug, position: u.position, title: u.title, description: u.description ?? null })), { onConflict: "course_id,slug" }), "units");
const units = Object.fromEntries(must(await sb.from("units").select("id,slug").eq("course_id", cid), "units read").map((u) => [u.slug, u.id]));

// topics
must(await sb.from("topics").upsert(cj.topics.map((t) => ({
  course_id: cid, unit_id: units[t.unit], slug: t.slug, kind: t.kind, position: t.position, title: t.title,
  meta: { ...(t.meta ?? {}), number: t.number ?? null, sources: t.sources ?? [] },
})), { onConflict: "course_id,slug" }), "topics");
const topics = Object.fromEntries(must(await sb.from("topics").select("id,slug").eq("course_id", cid), "topics read").map((t) => [t.slug, t.id]));

// structures
const sj = J(join(dir, "structures.json"));
const structRows = sj.map((s) => ({
  course_id: cid, unit_id: units[s.unit], slug: s.slug, canonical_name: s.name,
  synonyms: [...new Set([...(s.synonyms ?? []), ...(s.abbreviations ?? [])])], region: s.region ?? null,
  atlas_ids: s.atlas ?? {},
  info: { ...(s.info ?? {}), abbreviations: s.abbreviations ?? [], lists: s.lists ?? [], laterality: s.laterality ?? null, parent: s.parent ?? null, concept: !!s.concept },
}));
for (const part of chunks(structRows, 200)) must(await sb.from("structures").upsert(part, { onConflict: "course_id,slug" }), "structures");
const structs = Object.fromEntries(must(await sb.from("structures").select("id,slug").eq("course_id", cid), "structures read").map((s) => [s.slug, s.id]));

// cards
const cdir = join(dir, "cards");
const cards = [];
for (const f of readdirSync(cdir).filter((f) => f.endsWith(".json"))) for (const c of J(join(cdir, f))) cards.push(c);
const seen = new Set();
for (const c of cards) { if (seen.has(c.slug)) throw new Error(`duplicate card slug ${c.slug}`); seen.add(c.slug); }
const META = new Set(["slug", "kind", "topic", "structure", "status", "position"]);
const cardRows = cards.map((c) => {
  const content = Object.fromEntries(Object.entries(c).filter(([k]) => !META.has(k)));
  const media = [c.image, ...(c.extra_images ?? [])].filter(Boolean);
  return { course_id: cid, slug: c.slug, kind: c.kind, topic_id: topics[c.topic] ?? null, structure_id: c.structure ? structs[c.structure] ?? null : null,
    position: c.position ?? 0, status: c.status ?? "live", content, media, updated_at: new Date().toISOString() };
});
const bad = cards.filter((c) => !topics[c.topic] || (c.structure && !structs[c.structure]));
if (bad.length) throw new Error(`cards with unknown topic/structure: ${bad.slice(0, 5).map((c) => c.slug).join(", ")}`);
for (const part of chunks(cardRows, 200)) must(await sb.from("cards").upsert(part, { onConflict: "course_id,slug" }), "cards");

// retire what disappeared (never delete)
const existing = must(await sb.from("cards").select("slug,status").eq("course_id", cid).limit(20000), "cards read");
const gone = existing.filter((r) => !seen.has(r.slug) && r.status !== "retired").map((r) => r.slug);
for (const part of chunks(gone, 100)) must(await sb.from("cards").update({ status: "retired" }).eq("course_id", cid).in("slug", part), "retire");

// report
const tById = Object.fromEntries(cj.topics.map((t) => [t.slug, t]));
const tally = {};
for (const c of cards) {
  const u = tById[c.topic]?.unit ?? "?";
  const k = `${u} ${c.topic}`;
  tally[k] ??= {};
  const key = `${c.kind}${c.status === "draft" ? "(draft)" : ""}`;
  tally[k][key] = (tally[k][key] ?? 0) + 1;
}
console.log(`seeded ${slug}: ${cj.units.length} units, ${cj.topics.length} topics, ${sj.length} structures, ${cards.length} cards, ${gone.length} retired`);
for (const k of Object.keys(tally).sort()) console.log(" ", k.padEnd(34), JSON.stringify(tally[k]));
