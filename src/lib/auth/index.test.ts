import { test } from "node:test";
import assert from "node:assert/strict";
import { joinCodeKey, newJoinCode, safeNext } from "./index.ts";

test("safeNext: same-site paths pass", () => {
  assert.equal(safeNext("/study"), "/study");
  assert.equal(safeNext("/study/run?scope=unit:u1#x"), "/study/run?scope=unit:u1#x");
  assert.equal(safeNext(null), "/study");
  assert.equal(safeNext("", "/reset"), "/reset");
});

test("safeNext: nothing that a browser resolves to another origin", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "\\\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "https://evil.com", "evil.com", "/%5Cevil.com\u0000"]) {
    assert.equal(safeNext(bad), "/study", JSON.stringify(bad));
    // and whatever comes back stays on the site when a browser resolves it
    assert.equal(new URL(safeNext(bad), "https://anatomy.example").origin, "https://anatomy.example");
  }
});

test("joinCodeKey: case-insensitive, and LIKE wildcards are plain characters", () => {
  assert.equal(joinCodeKey("  neuro-2l94 "), "NEURO-2L94");
  // the key is compared with = (never LIKE), so these can only match a code that literally contains them
  assert.equal(joinCodeKey("%%%"), "%%%");
  assert.equal(joinCodeKey("a*_"), "A*_");
});

test("newJoinCode: two independent parts (the suffix is not a copy of the prefix)", () => {
  let repeats = 0;
  for (let i = 0; i < 200; i++) {
    const code = newJoinCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{3}$/);
    if (code.slice(0, 3) === code.slice(6)) repeats++;
  }
  // independent random parts collide with probability 32^-3 per code
  assert.ok(repeats <= 1, `suffix equal to the prefix's first 3 letters in ${repeats}/200 codes`);
});
