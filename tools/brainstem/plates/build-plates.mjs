// Builds the brainstem plates: one clean vector drawing per level from the course's Lab 8 blank outline drawings.
//   node tools/brainstem/plates/build-plates.mjs [level ...]      (PLATE_OVERLAYS=<dir> for the verification images)
// Pipeline, all deterministic:
//   1. the blank outline drawing (decks/lab-08-blank-drawings/images) is binarised; the ink is normalised to one stroke
//      weight, fitted to one frame, and vectorised (contour tracing + simplification) into a single path;
//   2. the enclosed regions (connected components of the background between the lines) are vectorised;
//   3. the labelled answer drawing (Lab 8 diagrams, the card images) is registered onto the blank outline
//      (similarity transform, chamfer distance), and every card label box is mapped to a region by containment,
//      by the leader-line tip, or (plate-overrides.json) by a point the source drawing shows;
//   4. overlays: the registered outline on the answer drawing, and the mapped regions on the plate.
// Output: src/data/brainstem-plates/<level>.json, served only through /api/atlas/brainstem/plate/<level> (auth-gated).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { hsv, hueDist, components, dilate, erode, contours, simplify, smooth, pathOf } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(root, "content-build");
const outDir = join(root, "src", "data", "brainstem-plates");
const overlayDir = process.env.PLATE_OVERLAYS || join(here, "overlays");
mkdirSync(outDir, { recursive: true });
mkdirSync(overlayDir, { recursive: true });

const course = JSON.parse(readFileSync(join(root, "src/data/brainstem-course.json"), "utf8"));
const cellMap = existsSync(join(here, "plate-map.json")) ? JSON.parse(readFileSync(join(here, "plate-map.json"), "utf8")) : {};
const levelsData = JSON.parse(readFileSync(join(root, "src/data/brainstem-levels.json"), "utf8"));
const overrides = existsSync(join(here, "plate-overrides.json")) ? JSON.parse(readFileSync(join(here, "plate-overrides.json"), "utf8")) : {};
// answer drawings (card images with label boxes)
const SOURCES = { "pons-caudal": "course-15", "medulla-rostral": "course-16", "medulla-mid": "course-17", "pons-mid": "course-18", "midbrain-ic": "course-19", "midbrain-sc": "course-20" };
// blank outline drawings
const BLANKS = { "midbrain-sc": "s002", "midbrain-ic": "s004", "pons-mid": "s006", "pons-caudal": "s008", "medulla-rostral": "s010", "medulla-mid": "s012", "medulla-caudal": "s014" };
// the portrait blank pages hold their drawing on its side: turn them dorsal-up (checked: registration then reads about 0 degrees)
const ROT = { "pons-caudal": 90, "medulla-rostral": 90 };
const PLATE_W = 1000;
const PAD = 40;
const STROKE = 3.2;

function srcFile(key) {
  const b = join(build, key.replace(/\.webp$/, ""));
  for (const e of [".jpg", ".jpeg", ".png", ".webp"]) if (existsSync(b + e)) return b + e;
  throw new Error("missing " + key);
}

/** Similarity registration of the answer drawing's dark lines onto the blank outline (chamfer distance, coarse to fine). */
function register(blank, bw, bh, ans, aw, ah, skipBoxes) {
  const F = 480;
  const fb = F / Math.max(bw, bh);
  const W = Math.round(bw * fb), H = Math.round(bh * fb);
  const D = new Float32Array(W * H).fill(1e6);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (blank[y * bw + x]) D[Math.min(H - 1, Math.round(y * fb)) * W + Math.min(W - 1, Math.round(x * fb))] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let d = D[i]; if (x > 0) d = Math.min(d, D[i - 1] + 1); if (y > 0) d = Math.min(d, D[i - W] + 1); if (x > 0 && y > 0) d = Math.min(d, D[i - W - 1] + 1.41); if (x < W - 1 && y > 0) d = Math.min(d, D[i - W + 1] + 1.41); D[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let d = D[i]; if (x < W - 1) d = Math.min(d, D[i + 1] + 1); if (y < H - 1) d = Math.min(d, D[i + W] + 1); if (x < W - 1 && y < H - 1) d = Math.min(d, D[i + W + 1] + 1.41); if (x > 0 && y < H - 1) d = Math.min(d, D[i + W - 1] + 1.41); D[i] = d; }
  const dm = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) { const mx = Math.max(ans[i * 3], ans[i * 3 + 1], ans[i * 3 + 2]), mn = Math.min(ans[i * 3], ans[i * 3 + 1], ans[i * 3 + 2]); if (mx < 110 && mx - mn < 70) dm[i] = 1; }
  for (const b of skipBoxes) for (let y = Math.max(0, b.y0 - 6); y < Math.min(ah, b.y1 + 6); y++) for (let x = Math.max(0, b.x0 - 6); x < Math.min(aw, b.x1 + 6); x++) dm[y * aw + x] = 0;
  const cc = components(dm, aw, ah, 8);
  const pts = [];
  for (let y = 0; y < ah; y += 3) for (let x = 0; x < aw; x += 3) { const k = cc.labels[y * aw + x]; if (k && cc.areas[k] > 600) pts.push([x, y]); }
  const ext = (arr) => { const a = [1e9, 1e9, -1e9, -1e9]; for (const p of arr) { a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); a[2] = Math.max(a[2], p[0]); a[3] = Math.max(a[3], p[1]); } return a; };
  const bpts = [];
  for (let y = 0; y < bh; y += 2) for (let x = 0; x < bw; x += 2) if (blank[y * bw + x]) bpts.push([x, y]);
  const be = ext(bpts), ae = ext(pts);
  const aC = [(ae[0] + ae[2]) / 2, (ae[1] + ae[3]) / 2], bC = [(be[0] + be[2]) / 2, (be[1] + be[3]) / 2];
  const cost = (t) => {
    let sum = 0;
    const c = Math.cos(t.th), sn = Math.sin(t.th);
    for (const p of pts) {
      const x = (t.s * (c * (p[0] - aC[0]) - sn * (p[1] - aC[1])) + t.tx) * fb, y = (t.s * (sn * (p[0] - aC[0]) + c * (p[1] - aC[1])) + t.ty) * fb;
      const xi = Math.round(x), yi = Math.round(y);
      sum += xi < 0 || yi < 0 || xi >= W || yi >= H ? 10 : Math.min(D[yi * W + xi], 10);
    }
    return sum / pts.length;
  };
  const sw = ae[2] - ae[0], sh = ae[3] - ae[1];
  let best = { c: 1e9 };
  for (const rot of [0, 90, 180, 270]) {
    const rr = (rot * Math.PI) / 180;
    const rw = Math.abs(Math.cos(rr)) * sw + Math.abs(Math.sin(rr)) * sh, rh = Math.abs(Math.sin(rr)) * sw + Math.abs(Math.cos(rr)) * sh;
    const s0 = Math.sqrt(((be[2] - be[0]) * (be[3] - be[1])) / (rw * rh));
    for (const da of [-6, -3, 0, 3, 6]) for (const ds of [0.85, 0.92, 1, 1.08, 1.16]) for (const dx of [-30, -15, 0, 15, 30]) for (const dy of [-30, -15, 0, 15, 30]) {
      const t = { th: rr + (da * Math.PI) / 180, s: s0 * ds, tx: bC[0] + dx, ty: bC[1] + dy };
      const c = cost(t);
      if (c < best.c) best = { c, ...t };
    }
  }
  let t = { th: best.th, s: best.s, tx: best.tx, ty: best.ty };
  let cur = best.c;
  for (const [ds, dth, dd] of [[0.04, 0.03, 12], [0.02, 0.015, 6], [0.01, 0.007, 3], [0.005, 0.003, 1.5]])
    for (let it = 0; it < 40; it++) {
      let improved = false;
      for (const [k, step] of [["s", t.s * ds], ["th", dth], ["tx", dd], ["ty", dd]])
        for (const sgn of [1, -1]) {
          const u = { ...t, [k]: t[k] + sgn * step };
          const c = cost(u);
          if (c < cur) { cur = c; t = u; improved = true; }
        }
      if (!improved) break;
    }
  const c = Math.cos(t.th), sn = Math.sin(t.th);
  const fwd = ([x, y]) => [t.s * (c * (x - aC[0]) - sn * (y - aC[1])) + t.tx, t.s * (sn * (x - aC[0]) + c * (y - aC[1])) + t.ty];
  const inv = ([X, Y]) => { const u = (X - t.tx) / t.s, v = (Y - t.ty) / t.s; return [c * u + sn * v + aC[0], -sn * u + c * v + aC[1]]; };
  return { cost: cur, fwd, inv, deg: (t.th * 180) / Math.PI, s: t.s };
}

async function buildLevel(level) {
  const img = SOURCES[level] ? course.find((i) => i.id === SOURCES[level]) : null;
  const blankPath = join(build, "decks/lab-08-blank-drawings/images", `${BLANKS[level]}_1.webp`);
  const bl = await sharp(blankPath).rotate(ROT[level] ?? 0, { background: "#fff" }).flatten({ background: "#fff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = bl.info.width, h = bl.info.height, N = w * h;
  let ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.max(bl.data[i * 3], bl.data[i * 3 + 1], bl.data[i * 3 + 2]) < 140) ink[i] = 1;
  const cc = components(ink, w, h, 8);
  const edgeK = new Set();
  for (let x = 0; x < w; x++) { edgeK.add(cc.labels[x]); edgeK.add(cc.labels[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { edgeK.add(cc.labels[y * w]); edgeK.add(cc.labels[y * w + w - 1]); }
  for (let i = 0; i < N; i++) if (ink[i] && (cc.areas[cc.labels[i]] < 60 || edgeK.has(cc.labels[i]))) ink[i] = 0;
  let X0 = w, Y0 = h, X1 = 0, Y1 = 0, area = 0;
  for (let i = 0; i < N; i++) if (ink[i]) { const x = i % w, y = (i / w) | 0; area++; if (x < X0) X0 = x; if (x > X1) X1 = x; if (y < Y0) Y0 = y; if (y > Y1) Y1 = y; }
  const scale = (PLATE_W - 2 * PAD) / (X1 - X0);
  const edgeCount = contours(ink, w, h).reduce((a, l) => a + l.length, 0);
  const thick = (2 * area) / Math.max(1, edgeCount);
  const adjust = Math.round((STROKE / scale - thick) / 2);
  const inkAdj = adjust > 0 ? dilate(ink, w, h, adjust) : adjust < 0 ? erode(ink, w, h, -adjust) : ink;
  const plateH = Math.round((Y1 - Y0) * scale + 2 * PAD);
  const tf = ([x, y]) => [(x - X0) * scale + PAD, (y - Y0) * scale + PAD];

  const closed = dilate(inkAdj, w, h, 2);
  const bg = new Uint8Array(N);
  for (let i = 0; i < N; i++) bg[i] = closed[i] ? 0 : 1;
  const cells = components(bg, w, h, 4);
  // outside = the cell holding the page margin (the largest cell touching the page corners)
  const outside = new Set();
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1]]) outside.add(cells.labels[y * w + x]);
  outside.delete(0);
  const cellOk = (k) => k > 0 && !outside.has(k) && cells.areas[k] >= 0.00007 * N && cells.areas[k] < 0.6 * N;
  if (process.env.PLATE_DEBUG) { const ids = []; for (let k = 1; k <= cells.n; k++) if (cellOk(k)) { const b = cells.bbox[k]; ids.push(k + ':' + cells.areas[k] + '@' + tf([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]).map(Math.round).join(',')); } console.log(level, ids.join(' ')); }
  if (false) { const good = []; for (let k = 1; k <= cells.n; k++) if (cellOk(k)) good.push(cells.areas[k]); console.log('cells', cells.n, 'ok', good.length, 'outside', [...outside], 'N', N, 'areas', good.sort((a,b)=>b-a).slice(0,12).join(',')); }
  const cellAt = (x, y, r = 0) => {
    x = Math.round(x); y = Math.round(y);
    let best = 0, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = cells.labels[yy * w + xx];
      if (!cellOk(k)) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };

  const mapping = [];
  let reg = null, aInfo = null;
  if (img) {
    const an = await sharp(srcFile(img.key)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const aw = an.info.width, ah = an.info.height, AN = aw * ah, ad = an.data;
    aInfo = { aw, ah };
    const boxes = img.labels.map((l) => {
      const s = l.shape;
      if (s.shape === "polygon") {
        const xs = s.points.map((q) => q[0] * aw), ys = s.points.map((q) => q[1] * ah);
        return { l, x0: Math.round(Math.min(...xs)), y0: Math.round(Math.min(...ys)), x1: Math.round(Math.max(...xs)), y1: Math.round(Math.max(...ys)) };
      }
      const bx = Math.round(s.x * aw), by = Math.round(s.y * ah);
      return { l, x0: bx, y0: by, x1: bx + Math.round(s.w * aw), y1: by + Math.round(s.h * ah) };
    });
    reg = register(ink, w, h, ad, aw, ah, boxes);
    // the registered outline lets the labelled answer drawing be read against the blank's cells; the cell numbers per
    // structure live in plate-map.json (read off the numbered overlays, see tools/brainstem/plates/README in the report)
    for (const [slug, ids] of Object.entries(cellMap[level] ?? {})) for (const id of ids) mapping.push({ slug, name: slug, cell: id, how: "plate-map.json" });
    aInfo.boxes = boxes;
  }

  // vectors
  const inkPath = pathOf(contours(inkAdj, w, h).map((l) => smooth(simplify(l, 1.0), 1)), tf);
  const used = new Set(mapping.map((m) => m.cell).filter(Boolean));
  const regions = [];
  for (const k of used) {
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (cells.labels[i] === k) m[i] = 1;
    const cm = dilate(m, w, h, 3 + Math.ceil(STROKE / scale / 2));
    const [x0, y0, x1, y1] = cells.bbox[k];
    regions.push({
      id: `r${k}`,
      slugs: [...new Set(mapping.filter((q) => q.cell === k).map((q) => q.slug))],
      d: pathOf(contours(cm, w, h).map((l) => smooth(simplify(l, 1.1), 1)), tf),
      c: tf([(x0 + x1) / 2, (y0 + y1) / 2]).map((v) => +v.toFixed(1)),
    });
  }
  const plate = { level, viewBox: [0, 0, PLATE_W, plateH], ink: inkPath, regions };
  writeFileSync(join(outDir, `${level}.json`), JSON.stringify(plate));

  // verification overlay 1: the blank outline (green) registered onto the answer drawing, mapped regions (magenta) and the label boxes
  if (img) {
    const { aw, ah } = aInfo;
    const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${aw}" height="${ah}">`];
    const toA = (p) => reg.inv(p);
    const inkLoops = contours(ink, w, h).map((l) => simplify(l, 1.5));
    svg.push(`<path d="${pathOf(inkLoops, toA, 0)}" fill="none" stroke="#0a0" stroke-width="2"/>`);
    for (let k = 1; k <= cells.n; k++) {
      if (!cellOk(k)) continue;
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (cells.labels[i] === k) m[i] = 1;
      const [cx0, cy0, cx1, cy1] = cells.bbox[k];
      const [lx, ly] = toA([(cx0 + cx1) / 2, (cy0 + cy1) / 2]);
      if (process.env.PLATE_NUMBERED) svg.push(`<text x="${lx}" y="${ly}" font-size="34" font-weight="700" fill="#d00" stroke="#fff" stroke-width="5" paint-order="stroke" text-anchor="middle">${k}</text>`);
      svg.push(`<path d="${pathOf(contours(m, w, h).map((l) => simplify(l, 2)), toA, 0)}" fill="${used.has(k) ? "rgba(255,0,200,0.30)" : "none"}" stroke="#f0c" stroke-width="2" fill-rule="evenodd"/>`);
    }
    for (const b of aInfo.boxes) {
      const m = { cell: 1 };
      svg.push(`<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="${m.cell ? "#06c" : "#f00"}" stroke-width="3"/>`);
    }
    svg.push("</svg>");
    await sharp(srcFile(img.key)).composite([{ input: Buffer.from(svg.join("")) }]).jpeg({ quality: 82 }).toFile(join(overlayDir, `${level}.jpg`));
  }
  const plateSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLATE_W} ${plateH}" width="${PLATE_W}" height="${plateH}"><rect width="100%" height="100%" fill="#fff"/>${regions.map((r) => `<path d="${r.d}" fill="rgba(255,0,200,0.18)" fill-rule="evenodd"/>`).join("")}<path d="${inkPath}" fill="#111" fill-rule="evenodd"/></svg>`;
  await sharp(Buffer.from(plateSvg)).jpeg({ quality: 85 }).toFile(join(overlayDir, `${level}-plate.jpg`));
  return {
    level,
    reg: reg ? { cost: +reg.cost.toFixed(2), deg: +reg.deg.toFixed(1), scale: +reg.s.toFixed(3) } : null,
    mapped: [...new Set(mapping.map((m) => m.slug))],
    unmapped: (levelsData.levels.find((l) => l.slug === level)?.structures ?? []).map((q) => q.slug).filter((q) => !mapping.some((m) => m.slug === q)),
    regions: regions.length,
    stroke: { thick: +thick.toFixed(1), adjust },
  };
}

const todo = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BLANKS);
const report = [];
for (const lv of todo) {
  const r = await buildLevel(lv);
  report.push(r);
  console.log(JSON.stringify(r));
}
writeFileSync(join(here, "plates-report.json"), JSON.stringify(report, null, 1));
