// OBJ (v / f only; "v x y z r g b" adds COLOR_0) -> meshopt-compressed GLB with smooth vertex normals.  usage: node tools/atlas/obj2glb_normals.mjs <in.obj> <out.glb> <name>
import fs from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import { quantize, meshopt, weld } from "@gltf-transform/functions";
const [inp, out, name = "mesh"] = process.argv.slice(2);
const V = [], C = [], F = [];
for (const l of fs.readFileSync(inp, "utf8").split(/\r?\n/)) {
  const p = l.trim().split(/\s+/);
  if (p[0] === "v") { V.push(...p.slice(1, 4).map(Number)); if (p.length >= 7) C.push(...p.slice(4, 7).map(Number)); }
  else if (p[0] === "f") F.push(...p.slice(1, 4).map((s) => parseInt(s, 10) - 1));
}
const N = new Float32Array(V.length);
for (let i = 0; i < F.length; i += 3) {
  const [a, b, c] = [F[i] * 3, F[i + 1] * 3, F[i + 2] * 3];
  const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], w = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const k of [a, b, c]) for (let j = 0; j < 3; j++) N[k + j] += n[j];
}
for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
const doc = new Document();
const buf = doc.createBuffer();
const prim = doc.createPrimitive()
  .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(V)).setBuffer(buf))
  .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(N).setBuffer(buf))
  .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(F)).setBuffer(buf));
if (C.length === V.length) prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(C)).setBuffer(buf));
doc.createScene().addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
await MeshoptEncoder.ready;
await doc.transform(weld(), quantize(), meshopt({ encoder: MeshoptEncoder }));
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder }).write(out, doc);
console.log(out, fs.statSync(out).size);
