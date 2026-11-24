// Quantise + meshopt-compress one GLB:  node tools/atlas3/pack_one.mjs <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize, reorder, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { statSync } from "node:fs";

const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
await doc.transform(reorder({ encoder: MeshoptEncoder, target: "size" }), quantize({ quantizePosition: 16, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(dst, doc);
console.log(dst, (statSync(dst).size / 1e6).toFixed(2), "MB");
