import * as THREE from "three";

/* The outlines of a cut: where the clip plane crosses the patch network. Every crossing triangle gives one segment, and
 * that segment separates exactly the two regions of its patch, so these lines are the borders between the cut faces
 * (and the outline of the section), computed from the same triangles that draw them.
 *
 * Cuts are square to an axis, so each part keeps, per axis it has been cut along, its triangles binned by the stretch of
 * that axis they span (2 mm bins, built once, on the first cut along it): a cut then looks only at the triangles of one
 * bin, a millisecond or two, and the outline follows the slider in the same frame as the cut itself. */

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

const STEP = 0.002;
type AxisBins = { lo: number; nb: number; offs: Uint32Array; tris: Uint32Array };
const BINS = new WeakMap<PatchArrays, (AxisBins | undefined)[]>();

/** The triangles of a part binned along one axis (CSR: the triangles of bin k are tris[offs[k] .. offs[k + 1])). */
function axisBins(p: PatchArrays, axis: number): AxisBins {
  let all = BINS.get(p);
  if (!all) {
    all = [];
    BINS.set(p, all);
  }
  const have = all[axis];
  if (have) return have;
  const { pos, index } = p;
  const nt = index.length / 3;
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < pos.length; i += 3) {
    if (pos[i] < lo) lo = pos[i];
    if (pos[i] > hi) hi = pos[i];
  }
  const nb = Math.max(1, Math.floor((hi - lo) / STEP) + 1);
  const b0 = new Uint16Array(nt), b1 = new Uint16Array(nt);
  const offs = new Uint32Array(nb + 1);
  for (let t = 0; t < nt; t++) {
    const a = pos[index[t * 3] * 3 + axis], b = pos[index[t * 3 + 1] * 3 + axis], c = pos[index[t * 3 + 2] * 3 + axis];
    const s = Math.floor((Math.min(a, b, c) - lo) / STEP), e = Math.floor((Math.max(a, b, c) - lo) / STEP);
    b0[t] = s;
    b1[t] = e;
    for (let k = s; k <= e; k++) offs[k + 1]++;
  }
  for (let k = 0; k < nb; k++) offs[k + 1] += offs[k];
  const tris = new Uint32Array(offs[nb]);
  const fill = offs.slice(0, nb);
  for (let t = 0; t < nt; t++) for (let k = b0[t]; k <= b1[t]; k++) tris[fill[k]++] = t;
  const out = { lo, nb, offs, tris };
  all[axis] = out;
  return out;
}

/**
 * Segments where `plane` cuts the triangles whose regions are drawn as a border: one side visible (a cut face) and the
 * two sides of different outline groups. `visible(id)` is the viewer's state. Returns xyz pairs.
 */
export function cutSegments(parts: PatchArrays[], plane: THREE.Plane, visible: (id: number) => boolean, group: (id: number) => number = (id) => id): Float32Array {
  const out: number[] = [];
  const nx = plane.normal.x, ny = plane.normal.y, nz = plane.normal.z, c = plane.constant;
  // square to an axis: only the triangles of the bin the plane passes through
  const axis = Math.abs(nx) > 0.9999 ? 0 : Math.abs(ny) > 0.9999 ? 1 : Math.abs(nz) > 0.9999 ? 2 : -1;
  const at = axis >= 0 ? -c / [nx, ny, nz][axis] : 0;
  const vis = new Map<number, boolean>();
  const isVis = (id: number) => {
    let v = vis.get(id);
    if (v === undefined) vis.set(id, (v = id > 0 && visible(id)));
    return v;
  };
  for (const part of parts) {
    const { pos, index, labels } = part;
    const dist = (i: number) => pos[i * 3] * nx + pos[i * 3 + 1] * ny + pos[i * 3 + 2] * nz + c;
    const seg = (t: number) => {
      const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
      const d0 = dist(i0), d1 = dist(i1), d2 = dist(i2);
      if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) return;
      const a = labels[i0 * 2], b = labels[i0 * 2 + 1];
      const va = isVis(a), vb = isVis(b);
      if (!va && !vb) return;
      // no line between two visible parts of one outline group (capsule and white matter, two gyri across the ribbon)
      if (va && vb && group(a) === group(b)) return;
      let n = 0;
      const pts = [0, 0, 0, 0, 0, 0];
      const edge = (p: number, q: number, dp: number, dq: number) => {
        if (n >= 2 || (dp > 0) === (dq > 0) || dp === dq) return;
        const s = dp / (dp - dq);
        pts[n * 3] = pos[p * 3] + (pos[q * 3] - pos[p * 3]) * s;
        pts[n * 3 + 1] = pos[p * 3 + 1] + (pos[q * 3 + 1] - pos[p * 3 + 1]) * s;
        pts[n * 3 + 2] = pos[p * 3 + 2] + (pos[q * 3 + 2] - pos[p * 3 + 2]) * s;
        n++;
      };
      edge(i0, i1, d0, d1);
      edge(i1, i2, d1, d2);
      edge(i2, i0, d2, d0);
      if (n === 2) out.push(...pts);
    };
    if (axis >= 0) {
      const bins = axisBins(part, axis);
      const k = Math.floor((at - bins.lo) / STEP);
      if (k < 0 || k >= bins.nb) continue;
      for (let j = bins.offs[k]; j < bins.offs[k + 1]; j++) seg(bins.tris[j] * 3);
    } else for (let t = 0; t < index.length; t += 3) seg(t);
  }
  return new Float32Array(out);
}
