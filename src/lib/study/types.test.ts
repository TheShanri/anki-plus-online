import { test } from "node:test";
import assert from "node:assert/strict";
import { promptNounDropped } from "./types.ts";

test("the noun the prompt already says is optional in the answer", () => {
  assert.deepEqual(promptNounDropped("Name the gyrus.", "Precentral gyrus"), ["Precentral"]);
  assert.deepEqual(promptNounDropped("Name the nucleus indicated by the pin.", "Red nucleus"), ["Red"]);
  assert.deepEqual(promptNounDropped("Name the gyrus shown.", "Precentral gyrus"), ["Precentral"]);
  assert.deepEqual(promptNounDropped("Name the plane.", "Sagittal plane"), ["Sagittal"]);
  assert.deepEqual(promptNounDropped("Name the plane shown.", "Coronal plane"), ["Coronal"]);
  assert.deepEqual(promptNounDropped("Name the sulcus.", "Central sulcus"), ["Central"]);
  assert.deepEqual(promptNounDropped("Name the gyrus.", "Cingulate sulcus"), []); // a different noun: nothing added
  assert.deepEqual(promptNounDropped("Name the lobe.", "Temporal lobes"), ["Temporal"]);
});

test("generic prompts add nothing", () => {
  assert.deepEqual(promptNounDropped("Name the structure.", "Precentral gyrus"), []);
  assert.deepEqual(promptNounDropped("Name the term.", "Rostral"), []);
  assert.deepEqual(promptNounDropped("What is this?", "Precentral gyrus"), []);
});
