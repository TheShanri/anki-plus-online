// Every text the app speaks, as JSON (read by ttslib.source_texts): each live card's answer exactly as the study
// page shows it (the app's own toStudyCard: plane answers without "plane", answer styles) and every structure name.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toStudyCard } from "../../src/lib/study/types.ts";

const dir = join(import.meta.dirname, "../../content/nsci3250");
const META = new Set(["slug", "kind", "topic", "structure", "status", "position"]);
const out = new Set<string>();
for (const f of readdirSync(join(dir, "cards")).filter((f) => f.endsWith(".json"))) {
  for (const c of JSON.parse(readFileSync(join(dir, "cards", f), "utf8")) as Record<string, unknown>[]) {
    if ((c.status ?? "live") !== "live") continue;
    const content = Object.fromEntries(Object.entries(c).filter(([k]) => !META.has(k)));
    const card = toStudyCard({ id: String(c.slug), slug: String(c.slug), kind: String(c.kind), topic_id: null, structure_id: null, position: Number(c.position ?? 0), content, media: [] } as never);
    const a = card.answer.trim();
    if (a) out.add(a);
    const raw = String(c.answer ?? "").trim();
    if (raw) out.add(raw);
  }
}
for (const s of JSON.parse(readFileSync(join(dir, "structures.json"), "utf8")) as { name?: string }[]) if (s.name?.trim()) out.add(s.name.trim());
process.stdout.write(JSON.stringify([...out]));
