import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScope, isContentScope } from "./scope.ts";

test("parseScope: the existing scopes are unchanged", () => {
  assert.deepEqual(parseScope(null), { type: "all" });
  assert.deepEqual(parseScope("weak"), { type: "weak" });
  assert.deepEqual(parseScope("unit:u2"), { type: "unit", slug: "u2" });
  assert.deepEqual(parseScope("topic:lab-13"), { type: "topic", slug: "lab-13" });
  assert.deepEqual(parseScope("structure:caudate-nucleus"), { type: "structure", slug: "caudate-nucleus" });
  assert.deepEqual(parseScope("nonsense"), { type: "all" });
  assert.deepEqual(parseScope("unit:"), { type: "all" });
});

test("parseScope: tag scopes keep the facet:value form", () => {
  assert.deepEqual(parseScope("tag:region:brainstem"), { type: "tag", tag: "region:brainstem" });
  assert.deepEqual(parseScope("tag:basal-ganglia"), { type: "tag", tag: "basal-ganglia" });
  assert.deepEqual(parseScope("tag:"), { type: "all" });
});

test("parseScope: structures lists are cleaned and de-duplicated", () => {
  assert.deepEqual(parseScope("structures:a-b,c,a-b, d "), { type: "structures", slugs: ["a-b", "c", "d"] });
  assert.deepEqual(parseScope("structures:bad slug!,;"), { type: "all" });
  assert.deepEqual(parseScope("structures:"), { type: "all" });
});

test("isContentScope", () => {
  assert.equal(isContentScope(parseScope("tag:plane:coronal")), true);
  assert.equal(isContentScope(parseScope("structures:x")), true);
  assert.equal(isContentScope(parseScope("unit:u1")), false);
});

test("parseScope: brainstem plate scopes", () => {
  assert.deepEqual(parseScope("bslevel:pons-mid"), { type: "bslevel", level: "pons-mid", practice: false });
  assert.deepEqual(parseScope("bslevel:pons-mid:practice"), { type: "bslevel", level: "pons-mid", practice: true });
  assert.deepEqual(parseScope("bsregion:medulla"), { type: "bsregion", region: "medulla", practice: false });
  assert.deepEqual(parseScope("bs:all"), { type: "bsall", practice: false });
  assert.deepEqual(parseScope("bs:all:practice"), { type: "bsall", practice: true });
  assert.deepEqual(parseScope("bs:other"), { type: "all" });
  assert.deepEqual(parseScope("bslevel:bad level!"), { type: "all" });
  assert.equal(isContentScope(parseScope("bslevel:pons-mid")), true);
  assert.equal(isContentScope(parseScope("bs:all")), true);
});
