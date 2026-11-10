import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaPath, mediaUrl } from "./media.ts";

test("mediaPath: normal keys map to <course>/<key>", () => {
  assert.equal(mediaPath("nsci3250", ["decks", "lecture-04", "img 31.png"]), "nsci3250/decks/lecture-04/img 31.png");
  assert.equal(mediaPath("nsci3250", ["a.b.c", "x_y-z.jpg"]), "nsci3250/a.b.c/x_y-z.jpg");
});

test("mediaPath: nothing that can climb out of the course folder or the bucket", () => {
  // Next decodes each catch-all segment, so an encoded slash arrives inside one segment ("a/../../x")
  const bad: Array<[string, string[]]> = [
    ["nsci3250", [".."]],
    ["nsci3250", ["."]],
    ["nsci3250", [""]],
    ["nsci3250", ["a/../../other", "x.png"]],
    ["nsci3250", ["..", "..", "bug-reports", "x.png"]],
    ["nsci3250", ["a\\..\\..\\x.png"]],
    ["nsci3250", ["a/b.png"]],
    ["..", ["bug-reports", "x.png"]],
    [".", ["x.png"]],
    ["nsci/3250", ["x.png"]],
    ["nsci3250", ["x.png\u0000"]],
  ];
  for (const [c, k] of bad) assert.equal(mediaPath(c, k), null, JSON.stringify([c, k]));
});

test("mediaUrl and mediaPath agree on every key mediaUrl builds", () => {
  const key = "decks/lecture-04/Figure 2 (left).png";
  const url = mediaUrl("nsci3250", key);
  // "/api/media/<course>/<...key>"
  const segs = url.split("/").slice(4).map(decodeURIComponent);
  assert.equal(mediaPath("nsci3250", segs), `nsci3250/${key}`);
});
