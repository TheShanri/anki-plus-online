// Audit: how every card in content/<course>/cards is answered after src/lib/study/answerstyle.ts.
// Usage: node tools/audit-answer-style.mts [course=nsci3250] [--list]
import { readdirSync, readFileSync } from "node:fs";
import { answerStyle } from "../src/lib/study/answerstyle.ts";

const course = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "nsci3250";
const list = process.argv.includes("--list");
const dir = `content/${course}/cards/`;
const before: Record<string, number> = {};
const after: Record<string, number> = {};
const free: string[] = [];
const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);
for (const f of readdirSync(dir)) {
  const j = JSON.parse(readFileSync(dir + f, "utf8"));
  const cards = Array.isArray(j) ? j : j.cards ?? [];
  for (const c of cards) {
    const parts = Array.isArray(c.parts) && c.parts.length >= 2;
    const kw = Array.isArray(c.keywords) && c.keywords.length > 0;
    const fmt = c.format === "keywords" && !kw ? "type" : c.format ?? "type";
    const b = fmt === "keywords" && !parts ? "free text" : fmt === "tf" ? "true/false" : fmt === "choice" ? "choice" : parts ? "type-out, parts" : "type-out";
    bump(before, b);
    if (b !== "free text") { bump(after, b); continue; }
    const s = answerStyle({ answer: c.answer ?? "", accept: c.accept ?? [], keywords: c.keywords });
    bump(after, s.style === "term" ? "type-out (from keywords)" : s.style === "parts" ? "type-out, parts (from keywords)" : "free text");
    if (s.style === "free") free.push(`${c.slug} | ${s.why} | ${c.answer}`);
  }
}
console.log("before", before);
console.log("after ", after);
if (list) for (const l of free) console.log(l);
