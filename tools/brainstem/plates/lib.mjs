// Small raster helpers for the plate pipeline: masks, connected components, morphology, contour tracing, simplification.
// Everything is deterministic and runs on plain typed arrays (no native dependencies beyond sharp for decoding).

export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
}
export const hueDist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Connected components. conn 4 or 8. Returns { labels: Int32Array (0 = background), n, areas[] , bbox[] } . */
export function components(mask, w, h, conn = 4) {
  const labels = new Int32Array(w * h);
  const areas = [0];
  const bbox = [null];
  let n = 0;
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || labels[i]) continue;
    n++;
    let sp = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[sp++] = i;
    labels[i] = n;
    while (sp) {
      const p = stack[--sp];
      area++;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const push = (q) => { if (mask[q] && !labels[q]) { labels[q] = n; stack[sp++] = q; } };
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
      if (conn === 8) {
        if (x > 0 && y > 0) push(p - w - 1);
        if (x < w - 1 && y > 0) push(p - w + 1);
        if (x > 0 && y < h - 1) push(p + w - 1);
        if (x < w - 1 && y < h - 1) push(p + w + 1);
      }
    }
    areas.push(area);
    bbox.push([x0, y0, x1, y1]);
  }
  return { labels, n, areas, bbox };
}

/** Square dilation by r pixels (separable). */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) { if (mask[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
  }
  return out;
}
export function erode(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

/** Closed outlines (outer loops and holes) of a binary mask, as arrays of [x, y] pixel-corner points. */
export function contours(mask, w, h) {
  const W = w + 1;
  const next = new Map(); // start key -> array of end keys (directed edges, inside on the right)
  const add = (x0, y0, x1, y1) => {
    const k = y0 * W + x0;
    const e = y1 * W + x1;
    const a = next.get(k);
    if (a) a.push(e); else next.set(k, [e]);
  };
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  const loops = [];
  for (const [start, list] of next) {
    while (list.length) {
      const pts = [];
      let cur = start;
      let e = list.pop();
      pts.push(cur);
      let prev = cur;
      cur = e;
      let guard = 0;
      while (cur !== start && guard++ < 5e6) {
        pts.push(cur);
        const l = next.get(cur);
        if (!l || !l.length) break;
        let pick = l.length - 1;
        if (l.length > 1) {
          // at a pinch point keep turning the same way, so touching corners do not merge loops
          const px = prev % W, py = (prev / W) | 0, cx = cur % W, cy = (cur / W) | 0;
          const dx = cx - px, dy = cy - py;
          for (let i = 0; i < l.length; i++) {
            const nx = l[i] % W - cx, ny = ((l[i] / W) | 0) - cy;
            if (dx * ny - dy * nx > 0) pick = i; // prefer turning right in screen coordinates
          }
        }
        const nx = l.splice(pick, 1)[0];
        prev = cur;
        cur = nx;
      }
      if (pts.length >= 4) loops.push(pts.map((k) => [k % W, (k / W) | 0]));
    }
  }
  return loops;
}

export function simplify(pts, eps) {
  // Douglas-Peucker on a closed loop (split at the two farthest points)
  if (pts.length < 8) return pts;
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < pts.length; i += Math.max(1, (pts.length / 40) | 0))
    for (let j = i + 1; j < pts.length; j += Math.max(1, (pts.length / 40) | 0)) {
      const d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d > best) { best = d; a = i; b = j; }
    }
  const part = (lo, hi) => {
    const out = [];
    const rec = (i, j) => {
      let md = 0, mi = -1;
      const [x1, y1] = pts[i % pts.length], [x2, y2] = pts[j % pts.length];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      for (let k = i + 1; k < j; k++) {
        const [x, y] = pts[k % pts.length];
        const d = Math.abs(dy * (x - x1) - dx * (y - y1)) / L;
        if (d > md) { md = d; mi = k; }
      }
      if (md > eps && mi >= 0) { rec(i, mi); out.push(pts[mi % pts.length]); rec(mi, j); }
    };
    out.push(pts[lo % pts.length]);
    rec(lo, hi);
    return out;
  };
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const first = part(lo, hi);
  const second = part(hi, lo + pts.length);
  return [...first, ...second];
}

/** Chaikin corner cutting on a closed loop. */
export function smooth(pts, passes = 2) {
  let p = pts;
  for (let s = 0; s < passes; s++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
      q.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    p = q;
  }
  return p;
}

export function pathOf(loops, tf, digits = 1) {
  const f = (v) => +v.toFixed(digits);
  return loops
    .map((l) => "M" + l.map((p) => { const [x, y] = tf(p); return `${f(x)} ${f(y)}`; }).join("L") + "Z")
    .join("");
}
