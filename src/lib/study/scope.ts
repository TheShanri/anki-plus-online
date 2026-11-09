// Study scopes (the `scope` query parameter of /study/run and /api/study/queue). Pure, so it is unit-tested.
export type Scope =
  | { type: "all" }
  | { type: "unit"; slug: string }
  | { type: "topic"; slug: string }
  | { type: "structure"; slug: string }
  | { type: "structures"; slugs: string[] }
  | { type: "tag"; tag: string }
  | { type: "weak" }
  /** brainstem plate cards (bs-plate-<level>-<structure>): one level, one region (midbrain|pons|medulla), or all; practice = only the mastered ones, due or not */
  | { type: "bslevel"; level: string; practice: boolean }
  | { type: "bsregion"; region: string; practice: boolean }
  | { type: "bsall"; practice: boolean };

/** `bslevel:<level>[:practice]` | `bsregion:<region>[:practice]` | `bs:all[:practice]` | `all` | `weak` | `unit:<slug>` | `topic:<slug>` | `structure:<slug>` | `structures:<slug,slug,...>` | `tag:<facet:value>`. */
export function parseScope(s: string | null | undefined): Scope {
  if (!s || s === "all") return { type: "all" };
  if (s === "weak") return { type: "weak" };
  const i = s.indexOf(":");
  if (i < 1) return { type: "all" };
  const t = s.slice(0, i);
  const rest = s.slice(i + 1).trim();
  if (!rest) return { type: "all" };
  if (t === "bslevel" || t === "bsregion" || t === "bs") {
    const [first, flag] = rest.split(":");
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(first)) return { type: "all" };
    const practice = flag === "practice";
    if (t === "bslevel") return { type: "bslevel", level: first, practice };
    if (t === "bsregion") return { type: "bsregion", region: first, practice };
    return first === "all" ? { type: "bsall", practice } : { type: "all" };
  }
  if (t === "unit" || t === "topic" || t === "structure") return { type: t, slug: rest.split(":")[0] };
  if (t === "tag") return { type: "tag", tag: rest.slice(0, 80) };
  if (t === "structures") {
    const slugs = [...new Set(rest.split(",").map((x) => x.trim()).filter((x) => /^[a-z0-9][a-z0-9-]*$/i.test(x)))].slice(0, 200);
    return slugs.length ? { type: "structures", slugs } : { type: "all" };
  }
  return { type: "all" };
}

/** Scopes that pick cards by content rather than by topic: they ignore the topic filter. */
export function isContentScope(s: Scope): boolean {
  return s.type === "structure" || s.type === "structures" || s.type === "tag" || s.type === "bslevel" || s.type === "bsregion" || s.type === "bsall";
}
