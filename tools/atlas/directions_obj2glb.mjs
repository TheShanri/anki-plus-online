// Converts a Quaternius Farm Animals OBJ (CC0 1.0) to a small flat-shaded GLB for the Directions scene:
// one primitive per material, scaled to 1 unit long (nose at +Z), centred on X/Z, feet on y = 0.
// usage: node tools/atlas/directions_obj2glb.mjs <in.obj> <out.glb>
import fs from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
const [inp, out] = process.argv.slice(2);
const V = [], groups = new Map();
let cur = "default";
for (const line of fs.readFileSync(inp, "utf8").split(/\r?\n/)) {
  const p = line.trim().split(/\s+/);
  if (p[0] === "v") V.push(p.slice(1, 4).map(Number));
  else if (p[0] === "usemtl") cur = p[1];
  else if (p[0] === "f") {
    const idx = p.slice(1).map((s) => parseInt(s.split("/")[0], 10) - 1);
    if (!groups.has(cur)) groups.set(cur, []);
    for (let i = 1; i + 1 < idx.length; i++) groups.get(cur).push([idx[0], idx[i], idx[i + 1]]);
  }
}
const mn = [0, 1, 2].map((i) => Math.min(...V.map((v) => v[i]))), mx = [0, 1, 2].map((i) => Math.max(...V.map((v) => v[i])));
const s = 1 / (mx[2] - mn[2]);
const T = (v) => [(v[0] - (mn[0] + mx[0]) / 2) * s, (v[1] - mn[1]) * s, (v[2] - (mn[2] + mx[2]) / 2) * s];
const doc = new Document();
const buf = doc.createBuffer();
const mesh = doc.createMesh("animal");
for (const [name, tris] of groups) {
  const pos = [], nor = [];
  for (const t of tris) {
    const [a, b, c] = t.map((i) => T(V[i]));
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    for (const q of [a, b, c]) { pos.push(...q); nor.push(...n); }
  }
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buf))
    .setMaterial(doc.createMaterial(name));
  mesh.addPrimitive(prim);
  console.log(name, tris.length, "tris");
}
doc.createScene().addChild(doc.createNode("animal").setMesh(mesh));
await new NodeIO().write(out, doc);
console.log("size", fs.statSync(out).size, "height", (mx[1] - mn[1]) * s, "width", (mx[0] - mn[0]) * s);
