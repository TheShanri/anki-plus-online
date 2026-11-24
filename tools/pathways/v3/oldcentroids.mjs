// Per-side centroids of old-atlas structures (public/atlas, Z-Anatomy frame): the "before" landmarks of the re-hosting warp.
//   node tools/pathways/v3/oldcentroids.mjs id1 id2 ... > out.json
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readFileSync } from "node:fs";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const ix = JSON.parse(readFileSync("public/atlas/index.json", "utf8"));
const out = {};
for (const id of process.argv.slice(2)) {
  const e = ix.structures[id];
  if (!e?.file) continue;
  const doc = await io.read(`public/atlas/${e.file}`);
  const acc = { L: [0, 0, 0, 0], R: [0, 0, 0, 0], all: [0, 0, 0, 0] };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const el = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        const x = M[0] * el[0] + M[4] * el[1] + M[8] * el[2] + M[12];
        const y = M[1] * el[0] + M[5] * el[1] + M[9] * el[2] + M[13];
        const z = M[2] * el[0] + M[6] * el[1] + M[10] * el[2] + M[14];
        for (const k of [x > 0 ? "L" : "R", "all"]) {
          acc[k][0] += x; acc[k][1] += y; acc[k][2] += z; acc[k][3] += 1;
        }
      }
    }
  }
  out[id] = Object.fromEntries(Object.entries(acc).filter(([, a]) => a[3] > 0).map(([k, a]) => [k, [a[0] / a[3], a[1] / a[3], a[2] / a[3]].map((v) => Math.round(v * 1e5) / 1e5)]));
}
console.log(JSON.stringify(out));
