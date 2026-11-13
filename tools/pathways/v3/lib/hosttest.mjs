// Shared point-in-host tests (validate.mjs and the mirror repair in build.mjs).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, atlasMeshes, nodeMesh } from "./geom.mjs";
import { Curve } from "./nerves.mjs";
import { partMesh, partMeshMirrored } from "./fibre.mjs";
const DIR = join(ROOT, "public/pathways/v3");
const BODY = existsSync(join(DIR, "body.glb")) ? join(DIR, "body.glb") : join(ROOT, "_atlas/pw3_raw/body.glb");
const THIN_TOL = 0.0005;
export const unflat = (a) => {
  const o = [];
  for (let i = 0; i < a.length; i += 3) o.push([a[i], a[i + 1], a[i + 2]]);
  return o;
};
function polyDist(pts, p) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t));
  }
  return best;
}

const TESTS = new Map();
async function tester(key, geo) {
  const ck = key + (geo[key] ? "#" + JSON.stringify(geo[key]).length : "");
  if (TESTS.has(ck)) return TESTS.get(ck);
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  let t;
  const meshTest = (ms, thin) => ({ fn: (p, tol) => ms.some((m) => m.inside(p)) || ((tol || thin) && ms.some((m) => m.dist(p, 0.002) <= Math.max(tol, thin ? THIN_TOL : 0))), thin });
  if (kind === "a") {
    const ms = await atlasMeshes(id.split("@")[0]);
    const thin = ms.every((m) => Math.min(m.hi[0] - m.lo[0], m.hi[2] - m.lo[2]) < 0.004);
    t = meshTest(ms, thin);
  } else if (kind === "part" || kind === "pr") {
    const [file, node] = id.split("/");
    t = meshTest([kind === "pr" ? await partMeshMirrored(file, node) : await partMesh(file, node)], false);
  } else if (kind === "b") {
    t = meshTest([await nodeMesh(BODY, id)], false);
  } else if (kind === "n") {
    const g = geo[key];
    const c = new Curve(key, unflat(g.pts), g.r);
    t = { fn: (p, tol) => c.contains(p, Math.max(tol, THIN_TOL)), thin: true };
  } else if (kind === "t") {
    const g = geo[key];
    const pts = unflat(g.pts);
    t = { fn: (p, tol) => polyDist(pts, p) <= g.r + Math.max(tol, THIN_TOL), thin: true, synthetic: g.synthetic };
  } else if (kind === "p") {
    const g = geo[key];
    t = { fn: (p, tol) => ((p[0] - g.c[0]) / (g.r[0] + tol)) ** 2 + ((p[1] - g.c[1]) / (g.r[1] + tol)) ** 2 + ((p[2] - g.c[2]) / (g.r[2] + tol)) ** 2 <= 1.0001, thin: false };
  } else throw new Error(`unknown host ${key}`);
  TESTS.set(ck, t);
  return t;
}
export async function inHost(hostKey, p, geo, tol = 0) {
  const keys = hostKey.replace(/^u:/, "").split("|");
  // atlas structures are often two half-meshes that meet at the midline: a point on the seam is tested 0.3 mm to either side
  const probes = Math.abs(p[0]) < 0.0002 ? [p, [p[0] + 0.0003, p[1], p[2]], [p[0] - 0.0003, p[1], p[2]]] : [p];
  for (const k of keys) for (const q of probes) if ((await tester(k, geo)).fn(q, tol)) return true;
  return false;
}

