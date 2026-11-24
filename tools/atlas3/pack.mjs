// Atlas v3, step 4: quantise and meshopt-compress the raw GLBs of bake.py into public/atlas3/.
// No welding or simplification here: the patch borders must stay exactly where mesh.py put them.
//   node tools/atlas3/pack.mjs
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize, reorder, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, statSync } from "node:fs";

const W = "_atlas/raw/v3";
const OUT = "public/atlas3";
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
for (const name of ["shell", "inner", "hull", "vessels"]) {
  const doc = await io.read(`${W}/${name}.raw.glb`);
  await doc.transform(
    reorder({ encoder: MeshoptEncoder, target: "size" }),
    quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeGeneric: 10, pattern: /^(POSITION|NORMAL|_NORMALB)$/ }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
  await io.write(`${OUT}/${name}.glb`, doc);
  console.log(name, (statSync(`${OUT}/${name}.glb`).size / 1e6).toFixed(2), "MB");
}
