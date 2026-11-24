// Dump the meshes of a GLB (meshopt-compressed and quantised ones too) as world-space triangles, for the Python tools:
//   node tools/atlas3/glbdump.mjs <in.glb> <out.json>
// out: { "<node name>": { "v": [x, y, z, ...], "f": [a, b, c, ...] } } (node world transforms applied, values dequantised)
import { readFileSync, writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const [src, out] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.readBinary(new Uint8Array(readFileSync(src)));
const res = {};
const el = [0, 0, 0];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = node.getWorldMatrix();
  const v = [];
  const f = [];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const base = v.length / 3;
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      const [x, y, z] = el;
      v.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
    }
    const idx = prim.getIndices();
    if (idx) for (let i = 0; i < idx.getCount(); i++) f.push(base + idx.getScalar(i));
    else for (let i = 0; i < pos.getCount(); i++) f.push(base + i);
  }
  let name = node.getName() || mesh.getName();
  while (res[name]) name += "_";
  res[name] = { v: v.map((x) => Math.round(x * 1e6) / 1e6), f };
}
writeFileSync(out, JSON.stringify(res));
console.log(src, "->", out, Object.keys(res).length, "meshes");
