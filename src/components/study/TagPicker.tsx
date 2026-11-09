import Link from "next/link";
import { ChevronRight, Tags } from "lucide-react";

export type TagCount = { tag: string; n: number };

const FACETS: Array<{ key: string; title: string }> = [
  { key: "region", title: "Region" },
  { key: "plane", title: "Cut or plane" },
  { key: "modality", title: "System" },
  { key: "theory", title: "Question type" },
  { key: "source", title: "Source" },
  { key: "unit", title: "Unit" },
];

const LABEL: Record<string, string> = {
  "source:anki-deck": "Anki deck",
  "source:lab": "Lab",
  "source:lecture": "Lecture",
  "source:practical": "Practical",
  "source:practice-practical": "Practice practical",
  "source:practice-exam": "Practice exam",
  "source:supplementary": "Supplementary",
  "plane:horizontal": "Horizontal (transverse)",
  "plane:midsagittal": "Midsagittal",
  "unit:u1": "Unit 1",
  "unit:u2": "Unit 2",
  "unit:u3": "Unit 3",
};

function label(tag: string): string {
  if (LABEL[tag]) return LABEL[tag];
  const v = tag.slice(tag.indexOf(":") + 1).replace(/-/g, " ");
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** "Study by tag": pick a region, a cut, a system, a question type or a source and study just those cards. */
export function TagPicker({ tags, course }: { tags: TagCount[]; course?: string }) {
  const by = new Map<string, TagCount[]>();
  for (const t of tags) {
    const f = t.tag.slice(0, Math.max(0, t.tag.indexOf(":")));
    if (!FACETS.some((x) => x.key === f)) continue;
    (by.get(f) ?? by.set(f, []).get(f)!).push(t);
  }
  if (!by.size) return null;
  const href = (tag: string) => `/study/run?scope=${encodeURIComponent(`tag:${tag}`)}${course ? `&course=${course}` : ""}`;
  return (
    <details className="tag-picker" style={{ margin: "0 0 18px" }}>
      <summary className="tag-picker-sum"><ChevronRight aria-hidden className="tag-chev" /><Tags aria-hidden />Study by tag <small>region, cut, system, question type</small></summary>
      <div style={{ display: "grid", gap: 10 }}>
        {FACETS.filter((f) => by.has(f.key)).map((f) => (
          <div key={f.key}>
            <p className="label" style={{ marginBottom: 4 }}>{f.title}</p>
            <div className="chips">
              {by.get(f.key)!.map((t) => (
                <Link key={t.tag} href={href(t.tag)} className="chip tag-link" title={`Study ${t.n} cards`}>
                  {label(t.tag)} <span className="text-text-faint">{t.n}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
