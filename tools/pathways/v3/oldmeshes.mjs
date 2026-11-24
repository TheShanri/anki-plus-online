// World-frame triangles of old-atlas structures (public/atlas), for re-hosting: writes one JSON
// {id: {pos: [x,y,z,...], idx: [...]}} to the path given first.   node tools/pathways/v3/oldmeshes.mjs out.json id1 id2 ...
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { readFileSync, writeFileSync } from "node:fs";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const ix = JSON.parse(readFileSync("public/atlas/index.json", "utf8"));
const [outPath, ...ids] = process.argv.slice(2);
const out = {};
for (const id of ids) {
  const e = ix.structures[id];
  if (!e?.file) continue;
  const doc = await io.read(`public/atlas/${e.file}`);
  const pos = [], idx = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const p = prim.getAttribute("POSITION");
      const base = pos.length / 3;
      const el = [0, 0, 0];
      for (let i = 0; i < p.getCount(); i++) {
        p.getElement(i, el);
        pos.push(M[0] * el[0] + M[4] * el[1] + M[8] * el[2] + M[12], M[1] * el[0] + M[5] * el[1] + M[9] * el[2] + M[13], M[2] * el[0] + M[6] * el[1] + M[10] * el[2] + M[14]);
      }
      const ind = prim.getIndices();
      if (ind) for (let i = 0; i < ind.getCount(); i++) idx.push(base + ind.getScalar(i));
      else for (let i = 0; i < p.getCount(); i++) idx.push(base + i);
    }
  }
  out[id] = { pos: pos.map((v) => Math.round(v * 1e6) / 1e6), idx };
}
writeFileSync(outPath, JSON.stringify(out));
console.log("wrote", Object.keys(out).length, "structures to", outPath);
