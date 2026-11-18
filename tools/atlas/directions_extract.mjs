// Builds public/atlas/directions/human.glb: the Z-Anatomy skin node of public/pathways/v3/body.glb (CC BY-SA 4.0), alone.
// usage: node tools/atlas/directions_extract.mjs <in.glb> <out.glb> <keepNodeName>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
const [inp, out, keep] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(inp);
for (const n of doc.getRoot().listNodes()) if (n.getName() !== keep) n.dispose();
for (const m of doc.getRoot().listMeshes()) if (!m.listParents().some((p) => p.propertyType === "Node")) m.dispose();
const { prune } = await import("@gltf-transform/functions").catch(() => ({ prune: null }));
if (prune) await doc.transform(prune());
await io.write(out, doc);
for (const n of doc.getRoot().listNodes()) { const p = n.getMesh()?.listPrimitives()[0]; const a = p?.getAttribute("POSITION"); console.log(n.getName(), a?.getCount(), JSON.stringify(n.getTranslation()), JSON.stringify(n.getScale()), a && JSON.stringify(a.getMinNormalized([]) ), a && JSON.stringify(a.getMaxNormalized([]))); }
