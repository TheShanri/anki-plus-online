import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeRefMap, type RefData } from "./ref-map.ts";

const data = JSON.parse(readFileSync(new URL("../../data/brainstem-ref.json", import.meta.url), "utf8")) as RefData;
const ref = makeRefMap(data);

test("every plate level is in the map, rostral to caudal", () => {
  assert.deepEqual(ref.levels.slice(0, 2), ["midbrain-sc", "midbrain-ic"]);
  assert.equal(ref.levels.at(-1), "cervicomedullary");
});

test("the four reference structures the Explore hook-up shows are on the plates, at their hallmark level", () => {
  assert.equal(ref.pickLevel(["medial-longitudinal-fasciculus"]), "pons-caudal");
  assert.equal(ref.pickLevel(["medial-lemniscus"]), "medulla-rostral");
  assert.equal(ref.pickLevel(["abducens-nucleus"]), "pons-caudal");
  assert.equal(ref.pickLevel(["red-nucleus"]), "midbrain-sc");
});

test("the MLF is drawn on every brainstem level (approximate: the course overlay does not outline it)", () => {
  const lv = ref.levelsFor(["medial-longitudinal-fasciculus"]);
  for (const l of ["midbrain-sc", "midbrain-ic", "pons-mid", "pons-caudal", "medulla-rostral", "medulla-mid", "medulla-caudal"]) assert.ok(lv.includes(l), l);
  assert.ok(ref.isApproxAt("medial-longitudinal-fasciculus", "pons-caudal"));
});

test("tracts resolve to the bundle that carries them at each level", () => {
  assert.deepEqual(ref.resolveAt("lateral-corticospinal-tract", "midbrain-sc"), ["cerebral-peduncles"]);
  assert.deepEqual(ref.resolveAt("lateral-corticospinal-tract", "pons-mid"), ["longitudinal-fibers-of-the-pons"]);
  assert.deepEqual(ref.resolveAt("lateral-corticospinal-tract", "medulla-rostral"), ["pyramids"]);
  assert.deepEqual(ref.resolveAt("lateral-corticospinal-tract", "cervicomedullary"), ["lateral-corticospinal-tract"]);
  assert.equal(ref.pickLevel(["lateral-corticospinal-tract"]), "medulla-caudal");
  assert.deepEqual(ref.resolveAt("dorsal-columns", "cervicomedullary"), ["fasciculus-gracilis", "fasciculus-cuneatus"]);
});

test("a structure not on the plates has no level", () => {
  assert.equal(ref.pickLevel(["hippocampus"]), null);
  assert.equal(ref.onPlates("hippocampus"), false);
  assert.deepEqual(ref.levelsFor([]), []);
});

test("a set of structures picks the level that shows most of them", () => {
  assert.equal(ref.pickLevel(["oculomotor-nucleus", "medial-lemniscus"]), "midbrain-sc");
  assert.equal(ref.pickLevel(["medial-lemniscus", "inferior-olivary-nucleus"]), "medulla-rostral");
});
