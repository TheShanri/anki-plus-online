import { test } from "node:test";
import assert from "node:assert/strict";
import { withRoman } from "../../components/atlas/pathways/v3/roman.ts";

test("cranial nerves get their Roman numeral once", () => {
  assert.equal(withRoman("Trigeminal nerve"), "Trigeminal nerve (V)");
  assert.equal(withRoman("Trigeminal nerve (V)"), "Trigeminal nerve (V)");
  assert.equal(withRoman("Cochlear nerve (CN VIII)"), "Cochlear nerve (VIII)");
  assert.equal(withRoman("the olfactory nerve and the optic nerves"), "the olfactory nerve (I) and the optic nerves (II)");
  assert.equal(withRoman("Maxillary nerve (V2)"), "Maxillary nerve (V2)");
  assert.equal(withRoman("sciatic nerve"), "sciatic nerve");
});
