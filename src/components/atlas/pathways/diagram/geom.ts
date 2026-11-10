export type P = [number, number];
const f = (n: number) => Math.round(n * 10) / 10;

/** Catmull-Rom spline through the points, as a cubic Bezier path. */
export function spline(pts: P[], closed = false): string {
  const n = pts.length;
  if (n < 2) return "";
  const g = (i: number): P => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + "Z" : d;
}

/** A closed, left-right symmetric outline from its right half (first and last point on the midline). */
export const sym = (half: P[]): string => spline([...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P)], true);

export interface Linked {
  d: string;
  end: { x: number; y: number; a: number };
}
/** A flowing line through the points: vertical tangents for mostly vertical hops, horizontal ones otherwise. */
export function link(pts: P[]): Linked {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  let end = { x: pts[0][0], y: pts[0][1], a: 90 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    let c1: P;
    let c2: P;
    if (Math.abs(dy) >= 0.55 * Math.abs(dx)) {
      c1 = [x0, y0 + dy * 0.5];
      c2 = [x1, y1 - dy * 0.5];
    } else {
      c1 = [x0 + dx * 0.5, y0];
      c2 = [x1 - dx * 0.5, y1];
    }
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(x1)} ${f(y1)}`;
    const ax = x1 - c2[0];
    const ay = y1 - c2[1];
    end = { x: x1, y: y1, a: (Math.atan2(ay || 0.001, ax) * 180) / Math.PI };
  }
  return { d, end };
}

/** Straight segments with rounded corners: for the circuit diagrams. */
export function elbow(pts: P[], r = 8): Linked {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a: P = [x - ((x - px) / l1) * rr, y - ((y - py) / l1) * rr];
    const b: P = [x + ((nx - x) / l2) * rr, y + ((ny - y) / l2) * rr];
    d += `L${f(a[0])} ${f(a[1])}Q${f(x)} ${f(y)} ${f(b[0])} ${f(b[1])}`;
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  d += `L${f(last[0])} ${f(last[1])}`;
  return { d, end: { x: last[0], y: last[1], a: (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) / Math.PI } };
}
