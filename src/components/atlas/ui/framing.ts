import * as THREE from "three";

const _m = new THREE.Matrix4();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Camera distance from the box centre along `dir` so the whole box fits a perspective view of the given aspect.
 * Exact per-corner fit (not a bounding sphere), so the framing follows the canvas shape and leaves no big empty margins.
 */
export function fitDistance(box: THREE.Box3, dir: THREE.Vector3, fovDeg: number, aspect: number, margin = 1.06): number {
  const c = box.getCenter(_e);
  _m.lookAt(_b.copy(dir).normalize(), _p.set(0, 0, 0), UP);
  _r.setFromMatrixColumn(_m, 0);
  _u.setFromMatrixColumn(_m, 1);
  _b.setFromMatrixColumn(_m, 2);
  const tv = Math.tan((fovDeg * Math.PI) / 360);
  const th = tv * Math.max(0.2, aspect);
  let d = 0;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    const x = Math.abs(_p.dot(_r));
    const y = Math.abs(_p.dot(_u));
    const z = _p.dot(_b);
    d = Math.max(d, z + x / th, z + y / tv);
  }
  return d * margin;
}

/**
 * The region the camera should frame: the whole brain when nothing is selected (or the selection is large), otherwise
 * the target grown to keep some context around it. Returns a fresh box inside/around the brain box.
 */
export function frameBox(brain: THREE.Box3, target: THREE.Box3 | null): THREE.Box3 {
  if (!target || target.isEmpty()) return brain.clone();
  const bs = brain.getSize(new THREE.Vector3());
  const ts = target.getSize(new THREE.Vector3());
  const tc = target.getCenter(new THREE.Vector3());
  const big = Math.max(ts.x / bs.x, ts.y / bs.y, ts.z / bs.z);
  if (big > 0.6) return brain.clone();
  // context: at least 76% of the brain around the centre on every axis, or 1.7x the target, whichever is larger
  const half = new THREE.Vector3(
    Math.max(ts.x * 0.85, bs.x * 0.38),
    Math.max(ts.y * 0.85, bs.y * 0.38),
    Math.max(ts.z * 0.85, bs.z * 0.38),
  );
  const out = new THREE.Box3(tc.clone().sub(half), tc.clone().add(half));
  return out;
}
