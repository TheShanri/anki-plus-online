// Every card in the course content, typed the way students mistype: no letter may turn green unless an accepted form
// (or, on a free-text card, one of its own words) really starts that way. Owner 2026-11-21: "why does T work here if it
// starts with an M... do a deep review of the type check and make sure nothing like this happens".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Typer } from "./typer.ts";
import { answerVariants, decorativeKeys } from "./variants.ts";
import { keywordTrack, vocabularyOf } from "./answerstyle.ts";
import { toStudyCard } from "./types.ts";
import { canonStr } from "./text.ts";

const DIR = join(process.cwd(), "content/nsci3250/cards");
type Raw = Record<string, unknown> & { slug: string; kind?: string; status?: string };

function cards(): Raw[] {
  const out: Raw[] = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    let a: unknown;
    try {
      a = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    } catch {
      continue;
    }
    if (Array.isArray(a)) for (const c of a as Raw[]) if (c && c.slug && c.status !== "retired" && c.status !== "draft") out.push(c);
  }
  return out;
}

/** What the box paints green (TypeBox): exactly the letters before typedOk; a neutral stretch after them is plain. */
const green = (t: Typer) => t.typedOk;

function typerFor(answer: string, accept: string[], requireSide: boolean, kw?: { groups: string[][]; vocab: Set<string> }) {
  const t = new Typer({ variants: answerVariants(answer, accept, { requireSide, max: 96 }), decorative: decorativeKeys(answer, accept, { requireSide, max: 96 }), mode: "grade", now: 0 });
  if (kw) t.lenient = (v) => keywordTrack(v, kw.groups, kw.vocab);
  return t;
}

test("no false green on any course card (first letters, a wrong second letter, junk after the answer)", () => {
  const bad: string[] = [];
  let checked = 0;
  for (const raw of cards()) {
    const c = toStudyCard({ id: raw.slug, slug: raw.slug, kind: raw.kind ?? "type_answer", topic_id: null, structure_id: null, position: 0, content: raw });
    if (c.format === "choice" || c.format === "tf") continue;
    const jobs: { answer: string; accept: string[]; kw?: { groups: string[][]; vocab: Set<string> } }[] = [];
    if (c.parts?.length) for (const p of c.parts) jobs.push({ answer: p.text, accept: [] });
    else jobs.push({ answer: c.answer, accept: c.accept, kw: c.keywords?.length ? { groups: c.keywords, vocab: vocabularyOf(c) } : undefined });
    for (const j of jobs) {
      if (!j.answer.trim()) continue;
      checked++;
      const forms = [j.answer, ...j.accept].map((s) => canonStr(s)).filter(Boolean);
      const words = j.kw ? [...j.kw.vocab].filter((w) => w.length > 1) : [];
      const starts = new Set([...forms, ...(j.kw ? j.kw.groups.flat().map((s) => canonStr(s)) : []), ...words].map((f) => f[0]));
      const t = typerFor(j.answer, j.accept, !!c.requireSide, j.kw);
      // 1. a first letter no accepted form (or own word) starts with
      for (const ch of "abcdefghijklmnopqrstuvwxyz") {
        if (starts.has(ch)) continue;
        t.set(ch, 1);
        if (green(t) > 0) bad.push(`${raw.slug}: "${ch}" green for "${j.answer}"`);
      }
      // 2. a right first letter, then a wrong one
      for (const f of forms) {
        if (f.length < 3 || j.kw) continue;
        const wrong = "qxzjvk".split("").find((x) => !forms.some((g) => g.startsWith(f[0] + x)));
        if (!wrong) continue;
        t.set(f[0] + wrong, 2);
        if (green(t) > 1) bad.push(`${raw.slug}: "${f[0] + wrong}" all green for "${j.answer}"`);
      }
      // 3. junk run on after a full answer
      if (!j.kw) {
        const typed = j.answer + "qzx";
        t.set(typed, 3);
        if (green(t) >= typed.length) bad.push(`${raw.slug}: junk after "${j.answer}" all green`);
      }
    }
  }
  assert.ok(checked > 1000, `only ${checked} answers checked`);
  assert.deepEqual(bad.slice(0, 40), [], `${bad.length} false greens`);
});

test("a partial article is plain, not green ('T' on Metencephalon)", () => {
  const t = typerFor("Metencephalon", [], false);
  for (const v of ["t", "T", "th", "the"]) {
    t.set(v, 1);
    assert.equal(t.typedOk, 0, v);
    assert.notEqual(t.state, "track", v);
  }
  t.set("the m", 2);
  assert.equal(t.state, "track");
});

test("a free-text card: 't' that only starts a connective is plain, a card word's start is green", () => {
  const groups = [["metencephalon", "pons"]];
  const c = { answer: "Metencephalon", accept: [], keywords: groups };
  const t = typerFor(c.answer, c.accept, false, { groups, vocab: vocabularyOf(c) });
  t.set("t", 1);
  assert.equal(t.typedOk, 0);
  t.set("p", 2);
  assert.equal(Number(t.typedOk), 1);
  assert.notEqual(String(t.state), "bad");
});
