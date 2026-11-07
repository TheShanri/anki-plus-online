// Bakes public/atlas/gross.glb: the surface structures (cortical gyri, cerebellum, brainstem) as one file,
// one named node per structure id, with a cavity-shading COLOR_0 (sulci dark) baked per vertex.
// usage: NODE_PATH=<dir with @gltf-transform/* + meshoptimizer> node tools/atlas/build_gross.cjs
const fs = require("fs");
const path = require("path");
const { NodeIO, Document } = require("@gltf-transform/core");
const { EXTMeshoptCompression, KHRMeshQuantization } = require("@gltf-transform/extensions");
const { weld, meshopt } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");

const root = path.resolve(__dirname, "../..");
const idx = JSON.parse(fs.readFileSync(path.join(root, "public/atlas/index.json"), "utf8"));
const LOBES = new Set(["frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe", "limbic-lobe", "insula"]);
const BS = new Set(["medulla-oblongata", "pons", "midbrain"]);
const keep = Object.values(idx.structures).filter((s) => {
  if (!s.file) return false;
  if (s.region === "cerebellum") return true;
  if (BS.has(s.id)) return true;
  if (s.region !== "cerebrum" || !LOBES.has(s.parent)) return false;
  if (s.id === "hippocampus") return false;
  if (/sulc|fis-|fissure/.test(s.id) && !/gyr|pole|plane|lobule|cuneus/.test(s.id)) return false;
  return true;
});

function cavity(pos, ind) {
  const n = pos.length / 3;
  const nbr = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < ind.length; i += 3) {
    const a = ind[i], b = ind[i + 1], c = ind[i + 2];
    nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  }
  const nrm = new Float32Array(n * 3);
  for (let i = 0; i < ind.length; i += 3) {
    const [a, b, c] = [ind[i] * 3, ind[i + 1] * 3, ind[i + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nrm[k] += x; nrm[k + 1] += y; nrm[k + 2] += z; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }
  // signed curvature proxy: >0 where the neighbours lie outside the tangent plane (a groove)
  let cur = new Float32Array(n);
  for (let pass = 0; pass < 1; pass++) {
    for (let i = 0; i < n; i++) {
      const s = nbr[i]; if (!s.size) continue;
      let mx = 0, my = 0, mz = 0, el = 0;
      for (const j of s) { mx += pos[j * 3]; my += pos[j * 3 + 1]; mz += pos[j * 3 + 2]; el += Math.hypot(pos[j * 3] - pos[i * 3], pos[j * 3 + 1] - pos[i * 3 + 1], pos[j * 3 + 2] - pos[i * 3 + 2]); }
      const k = s.size; mx /= k; my /= k; mz /= k; el /= k;
      cur[i] = (((mx - pos[i * 3]) * nrm[i * 3] + (my - pos[i * 3 + 1]) * nrm[i * 3 + 1] + (mz - pos[i * 3 + 2]) * nrm[i * 3 + 2]) / (el || 1));
    }
  }
  // smooth the proxy over the 1-ring twice so it reads as grooves instead of noise
  for (let it = 0; it < 2; it++) {
    const nx = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = cur[i], c = 1; for (const j of nbr[i]) { s += cur[j]; c++; } nx[i] = s / c; }
    cur = nx;
  }
  return cur;
}

(async () => {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const out = new Document();
  const buf = out.createBuffer();
  const scene = out.createScene("gross");
  const mat = out.createMaterial("tissue");
  let total = 0;
  const stats = [];
  for (const s of keep) {
    const src = await io.read(path.join(root, "public/atlas", s.file));
    await src.transform(weld({ tolerance: 0.00002 }));
    const holder = out.createNode(s.id);
    holder.setExtras({ r: s.region });
    for (const m of src.getRoot().listMeshes()) {
      const mesh = out.createMesh(s.id);
      for (const p of m.listPrimitives()) {
        const posA = p.getAttribute("POSITION"); const indA = p.getIndices();
        const pos = new Float32Array(posA.getCount() * 3);
        const e = [0, 0, 0];
        for (let i = 0; i < posA.getCount(); i++) { posA.getElement(i, e); pos.set(e, i * 3); }
        // local space only: node transforms below keep world placement (uniform scale assumed)
        const ind = indA ? indA.getArray() : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        const cur = cavity(pos, ind);
        let mean = 0; for (const v of cur) mean += v; mean /= cur.length;
        const col = new Uint8Array(cur.length * 4);
        for (let i = 0; i < cur.length; i++) {
          const g = Math.min(1, Math.max(0.38, 1 - 5.0 * Math.max(0, cur[i] - mean * 0.5)));
          const b = Math.round(g * 255);
          col[i * 4] = b; col[i * 4 + 1] = b; col[i * 4 + 2] = b; col[i * 4 + 3] = 255;
        }
        const np = out.createPrimitive().setMaterial(mat);
        np.setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(pos).setBuffer(buf));
        const nA = p.getAttribute("NORMAL");
        if (nA) { const na = new Float32Array(nA.getCount() * 3); for (let i = 0; i < nA.getCount(); i++) { nA.getElement(i, e); na.set(e, i * 3); } np.setAttribute("NORMAL", out.createAccessor().setType("VEC3").setArray(na).setBuffer(buf)); }
        np.setAttribute("COLOR_0", out.createAccessor().setType("VEC4").setArray(col).setNormalized(true).setBuffer(buf));
        np.setIndices(out.createAccessor().setType("SCALAR").setArray(ind instanceof Uint32Array ? ind : Uint32Array.from(ind)).setBuffer(buf));
        mesh.addPrimitive(np);
      }
      // carry the source node's transform (mesh may sit under a scaled/translated node)
      const srcNode = src.getRoot().listNodes().find((n) => n.getMesh() === m);
      const node = out.createNode(s.id + "_m").setMesh(mesh);
      if (srcNode) {
        const w = srcNode.getWorldMatrix();
        node.setMatrix(w);
      }
      holder.addChild(node);
    }
    scene.addChild(holder);
    stats.push(s.id);
  }
  await out.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const o = path.join(root, "public/atlas/gross.glb");
  await io.write(o, out);
  console.log("gross.glb", fs.statSync(o).size, "bytes,", stats.length, "structures");
})();
