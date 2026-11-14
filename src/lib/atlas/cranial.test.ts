import { test } from "node:test";
import assert from "node:assert/strict";
import { withCranialNumeral } from "./cranial.ts";

test("cranial nerve names carry their Roman numeral", () => {
  assert.equal(withCranialNumeral("Oculomotor nerve (III)"), "Oculomotor nerve (III)");
  assert.equal(withCranialNumeral("Oculomotor nerve"), "Oculomotor nerve (III)");
  assert.equal(withCranialNumeral("Ophthalmic nerve"), "Ophthalmic nerve (V1)");
  assert.equal(withCranialNumeral("Meningeal branch of maxillary nerve"), "Meningeal branch of maxillary nerve (V2)");
  assert.equal(withCranialNumeral("Nerve to mylohyoid muscle"), "Nerve to mylohyoid muscle (V3)");
  assert.equal(withCranialNumeral("Sensory root of trigeminal nerve"), "Sensory root of trigeminal nerve (V)");
  assert.equal(withCranialNumeral("Cochlear nerve"), "Cochlear nerve (VIII)");
  assert.equal(withCranialNumeral("Accessory nucleus of oculomotor nerve"), "Accessory nucleus of oculomotor nerve (III)");
  assert.equal(withCranialNumeral("Nucleus of accessory nerve"), "Nucleus of accessory nerve (XI)");
  assert.equal(withCranialNumeral("Posterior nucleus of vagus nerve"), "Posterior nucleus of vagus nerve (X)");
  assert.equal(withCranialNumeral("Thalamus"), "Thalamus");
  assert.equal(withCranialNumeral("Optic chiasm"), "Optic chiasm");
  assert.equal(withCranialNumeral("Posterior root of spinal nerve"), "Posterior root of spinal nerve");
});
