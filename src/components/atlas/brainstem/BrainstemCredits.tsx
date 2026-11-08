import openData from "@/data/brainstem-open.json";

type Open = { id: string; src: string; title: string; credit?: string; license?: string; url?: string };

/** Credit lines for the openly licensed brainstem atlas images (listed once per file). */
export function BrainstemCredits() {
  const seen = new Set<string>();
  const list = (openData as unknown as Open[]).filter((o) => (seen.has(o.src) ? false : (seen.add(o.src), true)));
  if (!list.length) return null;
  return (
    <div>
      <p>The brainstem atlas also uses these openly licensed images (the course images in it stay private to course members).</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {list.map((o) => (
          <li key={o.src}>
            {o.url ? (
              <a href={o.url} target="_blank" rel="noopener noreferrer">
                {o.credit || o.title}
              </a>
            ) : (
              o.credit || o.title
            )}
            {o.license ? `, ${o.license}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
