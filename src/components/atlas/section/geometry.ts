import * as THREE from "three";

/**
 * One float geometry in world space from a loaded (possibly quantised) group: positions are normalised integers plus a
 * node scale and offset, so the node matrices are baked in.
 */
export function bakeGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const gs: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.geometry.getAttribute("position");
    const f = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) {
      f[i * 3] = src.getX(i);
      f[i * 3 + 1] = src.getY(i);
      f[i * 3 + 2] = src.getZ(i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(f, 3));
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    gs.push(g.applyMatrix4(m.matrixWorld));
  });
  const out = gs[0] ?? null;
  out?.computeVertexNormals();
  return out;
}

/** World-space triangle soup of a mesh (cached per geometry + matrix), for plane intersections. */
const soupCache = new WeakMap<THREE.BufferGeometry, { key: string; tri: Float32Array }>();
function soup(m: THREE.Mesh): Float32Array {
  m.updateWorldMatrix(true, false);
  const key = m.matrixWorld.elements.join(",");
  const hit = soupCache.get(m.geometry);
  if (hit && hit.key === key) return hit.tri;
  const pos = m.geometry.getAttribute("position");
  const idx = m.geometry.index;
  const n = idx ? idx.count : pos.count;
  const tri = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const k = idx ? idx.getX(i) : i;
    v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
    tri[i * 3] = v.x;
    tri[i * 3 + 1] = v.y;
    tri[i * 3 + 2] = v.z;
  }
  soupCache.set(m.geometry, { key, tri });
  return tri;
}

/**
 * The outline of a mesh's cut: every triangle edge crossing `pl` gives one segment on the plane, kept only where the
 * other planes keep it (three.js convention: dot(n, p) + c >= 0 is kept). Returns flat xyz pairs.
 */
export function planeSection(m: THREE.Mesh, pl: THREE.Plane, others: THREE.Plane[], out: number[]) {
  const t = soup(m);
  const nx = pl.normal.x, ny = pl.normal.y, nz = pl.normal.z, c = pl.constant;
  const p = [0, 0, 0, 0, 0, 0];
  const keep = (x: number, y: number, z: number) => others.every((o) => o.normal.x * x + o.normal.y * y + o.normal.z * z + o.constant >= 0);
  for (let i = 0; i < t.length; i += 9) {
    const d0 = nx * t[i] + ny * t[i + 1] + nz * t[i + 2] + c;
    const d1 = nx * t[i + 3] + ny * t[i + 4] + nz * t[i + 5] + c;
    const d2 = nx * t[i + 6] + ny * t[i + 7] + nz * t[i + 8] + c;
    if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) continue;
    let k = 0;
    const ds = [d0, d1, d2];
    for (let e = 0; e < 3 && k < 6; e++) {
      const a = e, b = (e + 1) % 3;
      const da = ds[a], db = ds[b];
      if ((da < 0) === (db < 0) || da === db) continue;
      const s = da / (da - db);
      p[k++] = t[i + a * 3] + (t[i + b * 3] - t[i + a * 3]) * s;
      p[k++] = t[i + a * 3 + 1] + (t[i + b * 3 + 1] - t[i + a * 3 + 1]) * s;
      p[k++] = t[i + a * 3 + 2] + (t[i + b * 3 + 2] - t[i + a * 3 + 2]) * s;
    }
    if (k < 6) continue;
    if (others.length && !keep((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2)) continue;
    out.push(p[0], p[1], p[2], p[3], p[4], p[5]);
  }
}
