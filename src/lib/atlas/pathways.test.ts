import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// pathways.ts imports the map through the "@/" alias: the build hooks resolve it (and JSON) for node --test
register("../../../tools/pathways/v3/lib/loader-hooks.mjs", import.meta.url);
const { predictLesion, SITE_BY_ID, CASES } = await import("./pathways.ts");
const courses = (await import("../../../content/nsci3250/pathways.json", { with: { type: "json" } })).default as unknown as import("./pathways.ts").CoursePathway[];
const course = new Map(courses.map((c) => [c.slug, c]));
const hitSlugs = (r: ReturnType<typeof predictLesion>) => new Set(r?.hits.map((h) => h.pathway));

test("a cervical hemisection cuts the dorsal spinocerebellar tract (it ascends through the cervical cord to the ICP)", () => {
  const r = predictLesion({ siteId: "cord-hemi", side: "L", cord: "C" }, course);
  assert.ok(hitSlugs(r).has("dsct"));
  const d = r!.hits.find((h) => h.pathway === "dsct")!;
  assert.deepEqual(d.bodySides, ["L"]);
  const t = predictLesion({ siteId: "cord-dsct", side: "R", cord: "C" }, course);
  assert.equal(t?.cord, "C");
  assert.ok(hitSlugs(t).has("dsct"));
});

test("a V1 lesion does not list the lateral geniculate nucleus as cut", () => {
  assert.ok(!SITE_BY_ID.get("vis-v1")!.zones.includes("thal-lgn"));
  const r = predictLesion({ siteId: "vis-v1", side: "R" }, course);
  assert.ok(r!.hits.every((h) => !h.stretch.zones?.includes("thal-lgn")));
  assert.ok(hitSlugs(r).has("visual"));
});

test("the basis pontis carries corticobulbar fibres: contralateral tongue / lower face loss", () => {
  const r = predictLesion({ siteId: "pons-basis", side: "L" }, course);
  const cb = r!.hits.find((h) => h.pathway === "corticobulbar");
  assert.ok(cb, "corticobulbar hit");
  assert.deepEqual(cb!.bodySides, ["R"]);
  assert.ok(hitSlugs(r).has("lcst"));
});

test("a posterior spinal artery lesion is one-sided; the bilateral vignette uses both arteries", () => {
  const one = predictLesion({ siteId: "cord-psa", side: "L", cord: "T" }, course);
  assert.equal(one!.side, "L");
  const dc = one!.hits.find((h) => h.pathway === "dcml")!;
  assert.deepEqual(dc.bodySides, ["L"]);
  assert.ok(one!.effects.every((e) => e.sides.length === 1 && e.sides[0] === "L"));
  assert.ok(!/Strength and pain\/temperature preserved\.$/.test(one!.effects[0].text));
  const both = predictLesion({ siteId: "cord-psa-both", side: "L", cord: "T" }, course);
  assert.equal(both!.side, "both");
  for (const c of Object.values(CASES)) assert.notEqual(c.site === "cord-psa" && !c.side, true, "a bilateral case on the one-sided site");
});

test("the syrinx 'cape' is only for a cervical lesion", () => {
  const c = predictLesion({ siteId: "cord-central", side: "L", cord: "C" }, course);
  const t = predictLesion({ siteId: "cord-central", side: "L", cord: "T" }, course);
  assert.equal(c!.effects.length, 1);
  assert.equal(t!.effects.length, 1);
  assert.match(c!.effects[0].text, /cape/);
  assert.doesNotMatch(t!.effects[0].text, /cape/);
});
