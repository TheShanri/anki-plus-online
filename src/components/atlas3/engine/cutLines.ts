import * as THREE from "three";

/* The outlines of a cut: where the clip plane crosses the patch network. Every crossing triangle gives one segment, and
 * that segment separates exactly the two regions of its patch, so these lines are the borders between the cut faces
 * (and the outline of the section), computed from the same triangles that draw them. */

export interface PatchArrays {
  /** world positions, xyz per vertex */
  pos: Float32Array;
  index: Uint32Array;
  /** (a, b) per vertex */
  labels: Uint16Array;
}

/** World-space copy of a patch geometry (positions de-quantised through the node matrix). */
export function patchArrays(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): PatchArrays {
  const p = geometry.getAttribute("position");
  const pos = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }
  const idx = geometry.getIndex()!;
  const index = idx.array instanceof Uint32Array ? idx.array : Uint32Array.from(idx.array as ArrayLike<number>);
  const la = geometry.getAttribute("_labels");
  const labels = la.array instanceof Uint16Array ? la.array : Uint16Array.from(la.array as ArrayLike<number>);
  return { pos, index, labels };
}

/**
 * Segments where `plane` cuts the triangles whose regions are drawn as a border: one side visible (a cut face) and the
 * two sides different. `visible(id)` is the viewer's state. Returns xyz pairs.
 */
export function cutSegments(parts: PatchArrays[], plane: THREE.Plane, visible: (id: number) => boolean, group: (id: number) => number = (id) => id): Float32Array {
  const out: number[] = [];
  const nx = plane.normal.x, ny = plane.normal.y, nz = plane.normal.z, c = plane.constant;
  for (const { pos, index, labels } of parts) {
    const nv = pos.length / 3;
    const d = new Float32Array(nv);
    for (let i = 0; i < nv; i++) d[i] = pos[i * 3] * nx + pos[i * 3 + 1] * ny + pos[i * 3 + 2] * nz + c;
    for (let t = 0; t < index.length; t += 3) {
      const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
      const d0 = d[i0], d1 = d[i1], d2 = d[i2];
      if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) continue;
      const a = labels[i0 * 2], b = labels[i0 * 2 + 1];
      const va = a > 0 && visible(a), vb = b > 0 && visible(b);
      if (!va && !vb) continue;
      // no line between two visible parts of one outline group (capsule and white matter, two gyri across the ribbon)
      if (va && vb && group(a) === group(b)) continue;
      const pts: number[] = [];
      const edge = (p: number, q: number, dp: number, dq: number) => {
        if ((dp > 0) === (dq > 0) || dp === dq) return;
        const s = dp / (dp - dq);
        pts.push(pos[p * 3] + (pos[q * 3] - pos[p * 3]) * s, pos[p * 3 + 1] + (pos[q * 3 + 1] - pos[p * 3 + 1]) * s, pos[p * 3 + 2] + (pos[q * 3 + 2] - pos[p * 3 + 2]) * s);
      };
      edge(i0, i1, d0, d1);
      edge(i1, i2, d1, d2);
      edge(i2, i0, d2, d0);
      if (pts.length >= 6) out.push(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]);
    }
  }
  return new Float32Array(out);
}
