// Mannequin-style modesty for the Directions human (owner 2026-11-18): flattens the genital region of the Z-Anatomy skin to a
// smooth front surface, then rebuilds normals and re-compresses.  usage: node tools/atlas/directions_modest.mjs <glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { dequantize, quantize, meshopt, normals } from "@gltf-transform/functions";
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const file = process.argv[2];
const d = await io.read(file);
await d.transform(dequantize());
const n = d.getRoot().listNodes()[0];
const M = n.getWorldMatrix();
const a = n.getMesh().listPrimitives()[0].getAttribute("POSITION");
// world <-> local (uniform scale + translation in this node)
const s = Math.hypot(M[0], M[1], M[2]);
const t = [M[12], M[13], M[14]];
const xc = 0.015;
const cap = (y) => 0.04 + Math.min(1, Math.max(0, (y - 0.68) / 0.18)) * 0.042; // the front surface over the pubis / perineum
let moved = 0;
const e = [];
for (let i = 0; i < a.getCount(); i++) {
  a.getElement(i, e);
  const w = [e[0] * s + t[0], e[1] * s + t[1], e[2] * s + t[2]];
  const dx = Math.abs(w[0] - xc);
  if (w[1] < 0.66 || w[1] > 0.87 || dx > 0.065) continue;
  const fall = Math.min(1, Math.max(0, (0.065 - dx) / 0.02)); // blend out toward the groin
  const z = cap(w[1]);
  if (w[2] > z) {
    w[2] = w[2] + (z - w[2]) * fall;
    a.setElement(i, [(w[0] - t[0]) / s, (w[1] - t[1]) / s, (w[2] - t[2]) / s]);
    moved++;
  }
}
await d.transform(normals({ overwrite: true }), quantize(), meshopt({ encoder: MeshoptEncoder }));
await io.write(file, d);
console.log("moved", moved);
