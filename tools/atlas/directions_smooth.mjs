// Smooths the Directions horse (public/atlas/directions/animal.glb, Quaternius CC0, ~700 flat triangles) into an organic
// surface: weld, two rounds of Loop subdivision per primitive (boundaries follow the boundary rule, so the primitives still
// meet), smooth vertex normals. Owner 2026-11-18: "more realistic and less polygonny".
//   node tools/atlas/directions_smooth.mjs <in.glb> <out.glb> [rounds=2]
import fs from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { quantize, meshopt } from "@gltf-transform/functions";

const [inp, out, roundsArg = "2"] = process.argv.slice(2);
const ROUNDS = +roundsArg;
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const src = await io.read(inp);

function weld(posArr, idxArr) {
  const P = [], key = new Map(), remap = [];
  const n = posArr.length / 3;
  for (let i = 0; i < n; i++) {
    const p = [posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]];
    const k = p.map((x) => Math.round(x * 1e5)).join(",");
    if (!key.has(k)) { key.set(k, P.length); P.push(p); }
    remap.push(key.get(k));
  }
  const T = [];
  const idx = idxArr ?? Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < idx.length; i += 3) {
    const t = [remap[idx[i]], remap[idx[i + 1]], remap[idx[i + 2]]];
    if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) T.push(t);
  }
  return { P, T };
}

function loop({ P, T }) {
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const edges = new Map();
  for (const t of T)
    for (let j = 0; j < 3; j++) {
      const a = t[j], b = t[(j + 1) % 3], c = t[(j + 2) % 3];
      const k = ek(a, b);
      if (!edges.has(k)) edges.set(k, { a, b, opp: [] });
      edges.get(k).opp.push(c);
    }
  const nbr = P.map(() => new Set());
  const bnd = P.map(() => []);
  for (const e of edges.values()) {
    nbr[e.a].add(e.b); nbr[e.b].add(e.a);
    if (e.opp.length === 1) { bnd[e.a].push(e.b); bnd[e.b].push(e.a); }
  }
  const NP = P.map((p, i) => {
    if (bnd[i].length >= 2) {
      const [b1, b2] = bnd[i];
      return p.map((x, d) => 0.75 * x + 0.125 * (P[b1][d] + P[b2][d]));
    }
    const ns = [...nbr[i]], n = ns.length;
    if (!n) return p;
    const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
    return p.map((x, d) => (1 - n * beta) * x + beta * ns.reduce((s, q) => s + P[q][d], 0));
  });
  for (const e of edges.values()) {
    const [a, b] = [P[e.a], P[e.b]];
    e.i = NP.length;
    if (e.opp.length === 2) {
      const [c, d] = [P[e.opp[0]], P[e.opp[1]]];
      NP.push(a.map((x, k) => 0.375 * (x + b[k]) + 0.125 * (c[k] + d[k])));
    } else NP.push(a.map((x, k) => 0.5 * (x + b[k])));
  }
  const NT = [];
  for (const [a, b, c] of T) {
    const ab = edges.get(ek(a, b)).i, bc = edges.get(ek(b, c)).i, ca = edges.get(ek(c, a)).i;
    NT.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return { P: NP, T: NT };
}

function normals({ P, T }) {
  const N = P.map(() => [0, 0, 0]);
  for (const [a, b, c] of T) {
    const u = P[b].map((x, k) => x - P[a][k]), w = P[c].map((x, k) => x - P[a][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[i][k] += n[k];
  }
  return N.map((n) => { const l = Math.hypot(...n) || 1; return n.map((x) => x / l); });
}

const doc = new Document();
const buf = doc.createBuffer();
const mesh = doc.createMesh("animal");
for (const m of src.getRoot().listMeshes())
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute("POSITION");
    const arr = [];
    for (let i = 0; i < pos.getCount(); i++) arr.push(...pos.getElement(i, []));
    let g = weld(arr, p.getIndices()?.getArray());
    for (let r = 0; r < ROUNDS; r++) g = loop(g);
    const N = normals(g);
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.P.flat())).setBuffer(buf))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(N.flat())).setBuffer(buf))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.T.flat())).setBuffer(buf))
      .setMaterial(doc.createMaterial(p.getMaterial()?.getName() ?? "body"));
    mesh.addPrimitive(prim);
    console.log(p.getMaterial()?.getName(), "verts", g.P.length, "tris", g.T.length);
  }
doc.createScene().addChild(doc.createNode("animal").setMesh(mesh));
await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder }));
await io.write(out, doc);
console.log(out, fs.statSync(out).size);
