import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyObject, clampState, ownKey } from "./clean.ts";

test("clampState: a long app state is stored, not a 500 (the old JSON-text cut threw)", () => {
  const state = { route: "/study/run", theme: "synthwave", card: "x".repeat(7000) };
  // the old code: JSON.parse(JSON.stringify(state).slice(0, 6000)) throws on any state longer than 6000 characters
  assert.throws(() => JSON.parse(JSON.stringify(state).slice(0, 6000)));
  const out = clampState(state);
  assert.ok(JSON.stringify(out).length <= 6000);
  assert.equal(out.route, "/study/run");
  assert.equal(out.theme, "synthwave");
  assert.equal(out.truncated, true);
  assert.equal(out.card, undefined);
  // short states pass through unchanged; anything not an object is {}
  assert.deepEqual(clampState({ a: 1, b: [1, 2] }), { a: 1, b: [1, 2] });
  assert.deepEqual(clampState(null), {});
  assert.deepEqual(clampState([1, 2]), {});
  assert.deepEqual(clampState("x"), {});
});

test("ownKey: inherited names are not feedback types", () => {
  const types = { bug: "Bug", other: "Other" };
  assert.equal(ownKey(types, "bug", "other"), "bug");
  for (const raw of ["toString", "constructor", "__proto__", "hasOwnProperty", 3, null]) assert.equal(ownKey(types, raw, "other"), "other");
});

test("bodyObject: a JSON body of null or an array is an empty object", () => {
  assert.deepEqual(bodyObject(null), {});
  assert.deepEqual(bodyObject([1]), {});
  assert.deepEqual(bodyObject({ a: 1 }), { a: 1 });
});
