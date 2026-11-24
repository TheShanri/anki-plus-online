import { test } from "node:test";
import assert from "node:assert/strict";
import { alsoAccepted } from "./variants.ts";

test("alsoAccepted: synonyms and the other direction term, never spelling forms of the answer", () => {
  assert.deepEqual(alsoAccepted("Pituitary gland", ["hypophysis", "pituitary"]), ["hypophysis"]);
  assert.deepEqual(alsoAccepted("Caudal", ["posterior", "caudal or posterior"]), ["posterior"]);
  assert.deepEqual(alsoAccepted("CN III", ["III", "3", "cranial nerve III", "Oculomotor nerve (CN III)"]), []);
  assert.deepEqual(alsoAccepted("Grey matter", ["gray matter", "the grey matter"]), []);
  assert.deepEqual(alsoAccepted("Coronal plane", ["coronal", "frontal", "frontal plane"]), ["frontal"]);
  // names the "also called" line already shows are not repeated
  assert.deepEqual(alsoAccepted("Midbrain", ["mesencephalon", "tectum"], ["Mesencephalon"]), ["tectum"]);
});
