// Symmetry by construction: the beats listed in spec/mirror.mjs get a RIGHT side that is the mirror image (x -> -x) of the
// LEFT side. Samples that fall outside their host on the other side (the atlas meshes are not perfectly symmetric) are
// moved the shortest distance into the host (at most 3 mm) and counted in the returned note.
import { MIRROR } from "../spec/mirror.mjs";
import { unflat, inHost } from "./hosttest.mjs";

const flipFlat = (a) => a.map((v, i) => (i % 3 === 0 ? -v : v));
const flipP = (p) => [-p[0], p[1], p[2]];
// side-specific host keys swap with the other side: n:Name.l#3 <-> n:Name.r#3, t:/p:name-L <-> name-R (also name-L-123 style)
const swapKey0 = (k) => k.replace(/^(n:.*)\.([lr])#/, (_, a, c) => `${a}.${c === "l" ? "r" : "l"}#`).replace(/^([tp]:.*?)-([LR])(?=$|-)/, (_, a, c) => `${a}-${c === "L" ? "R" : "L"}`);
let GEO = {};
const swapKey = (k) => {
  const k2 = swapKey0(k).replace(/^(b:.*)_([LR])$/, (_, a, c) => `${a}_${c === "L" ? "R" : "L"}`);
  const cand = [k2, k2.replace(/-R-(\d)/, "-R--$1"), k2.replace(/-L--(\d)/, "-L-$1"), k2.replace(/-L-(\d)/, "-L--$1"), k2.replace(/-R--(\d)/, "-R-$1")];
  return cand.find((c) => !/^[ntp]:/.test(c) || GEO[c]) ?? (MISSING.push(k2), k2);
};
const MISSING = [];
const swapHost = (h) => (h.startsWith("u:") ? "u:" : "") + h.replace(/^u:/, "").split("|").map(swapKey).join("|");
function mirrorBeat(b) {
  const c = JSON.parse(JSON.stringify(b));
  for (const f of c.f ?? []) {
    f.pts = flipFlat(f.pts);
    f.seg = f.seg.map(([i, h]) => [i, swapHost(h)]);
    // a visual-field tag names a side too: the mirror of the left field's Meyer's loop carries the RIGHT field (it was
    // left "leftUpper", so the right field's loop was drawn in the left field's blue, 2026-11-22)
    if (typeof f.tag === "string") f.tag = f.tag.replace(/^(left|right)/, (w) => (w === "left" ? "right" : "left"));
  }
  for (const m of [c.soma, c.syn, c.start]) if (m?.host) m.host = swapKey(m.host);
  for (const m of [c.soma, c.syn, c.start]) if (m?.p) m.p = flipP(m.p);
  if (c.cross?.p) c.cross.p = flipP(c.cross.p);
  for (const s of c.stops ?? []) if (s.key?.endsWith("@L")) s.key = s.key.slice(0, -1) + "R";
  return c;
}
const DIRS = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) { const l = Math.hypot(a, b, c); DIRS.push([a / l, b / l, c / l]); }
async function pull(p, host, geo, tol) {
  if (await inHost(host, p, geo, tol)) return p;
  for (const r of [0.0003, 0.0006, 0.001, 0.0015, 0.002, 0.003])
    for (const d of DIRS) {
      const q = [p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r];
      if (await inHost(host, q, geo, tol)) return q;
    }
  return p;
}
export async function applyMirror(d, key) {
  const idx = MIRROR[key];
  if (!idx?.length) return "";
  let moved = 0, worst = 0;
  GEO = d.geo;
  MISSING.length = 0;
  for (const i of idx) {
    const b = d.beats[i];
    if (!b?.L) continue;
    const m = mirrorBeat(b.L);
    if (MISSING.length) return `mirror ${key}: beat ${i} SKIPPED, no counterpart host for ${MISSING.join(", ")}`;
    for (const f of m.f) {
      const pts = unflat(f.pts);
      for (let k = 0; k < pts.length; k++) {
        let s = 0;
        while (s + 1 < f.seg.length && f.seg[s + 1][0] <= k) s++;
        const prev = s > 0 && f.seg[s][0] === k ? f.seg[s - 1][1] : null;
        if ((await inHost(f.seg[s][1], pts[k], d.geo)) || (prev && (await inHost(prev, pts[k], d.geo)))) continue;
        const q = await pull(pts[k], f.seg[s][1], d.geo, 0);
        const dd = Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1], q[2] - pts[k][2]);
        if (dd) { f.pts[k * 3] = q[0]; f.pts[k * 3 + 1] = q[1]; f.pts[k * 3 + 2] = q[2]; moved++; worst = Math.max(worst, dd); }
      }
    }
    for (const mk of [m.soma, m.syn, m.start]) if (mk) {
      const tol = mk.host.startsWith("n:") || mk.host.startsWith("t:") ? 0.0005 : 0.0003;
      const q = await pull(mk.p, mk.host, d.geo, tol);
      if (q !== mk.p) { moved++; mk.p = q; }
    }
    b.R = m;
  }
  return `mirror ${key}: beats ${idx.join(",")} right = left mirrored; ${moved} samples nudged into their host (max ${(worst * 1000).toFixed(1)} mm)`;
}
